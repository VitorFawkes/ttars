/**
 * persona_v2.ts — Orquestrador do Persona Agent v2 (Playbook Conversacional).
 *
 * Parte do Marco 2b. Chamado pelo guard no runPersonaAgent quando
 * agent.playbook_enabled=true. Se lançar exceção, o guard cai pro v1
 * automaticamente (fail-safe).
 *
 * Etapas:
 *   1. Carrega configs v2 do agente em paralelo (moments, signals, examples, scoring).
 *   2. Calcula score atual pra injetar no prompt como <qualification_status>.
 *   3. Detecta momento atual (híbrido: determinístico + LLM do backoffice).
 *   4. Monta prompt XML via buildPromptV2.
 *   5. Chama LLM (SEM tool-calling nesta v2.0 — tools ficam pra v2.1).
 *   6. Retorna resposta + metadata pra caller persistir em ai_conversation_turns.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  loadPlaybookMoments,
  loadPlaybookSilentSignals,
  loadPlaybookFewShotExamples,
  loadScoringRulesForPlaybook,
  resolveSlotPriority,
  type PlaybookMoment,
  type IdentityConfig,
  type VoiceConfig,
  type BoundariesConfig,
  type ListeningConfig,
} from "./playbook_loader.ts";
import { detectMoment, type MomentDetectionContext } from "./moment_detector.ts";
import { buildPromptV2 } from "./prompt_builder_v2.ts";
import { evaluateSubjectiveRules } from "./subjective_evaluator.ts";
import { detectFactsToOmit } from "./fact_omission_detector.ts";

// ---------------------------------------------------------------------------
// Types (alinhados com index.ts — evitamos import circular definindo o mínimo)
// ---------------------------------------------------------------------------

interface AgentV2Config {
  id: string;
  org_id: string;
  nome: string;
  modelo: string;
  temperature: number;
  max_tokens: number;
  playbook_enabled: boolean;
  identity_config: IdentityConfig | null;
  voice_config: VoiceConfig | null;
  boundaries_config: BoundariesConfig | null;
  listening_config: ListeningConfig | null;
  pipeline_models?: Record<string, { model?: string; temperature?: number; max_tokens?: number }> | null;
  handoff_actions?: {
    book_meeting?: {
      enabled?: boolean;
      responsavel_id?: string | null;
      tipo?: 'reuniao' | 'reuniao_video' | 'reuniao_presencial' | 'reuniao_telefone';
      duracao_minutos?: number;
      titulo_template?: string;
      mensagem_confirmacao_template?: string;
    } | null;
  } | null;
}

interface BusinessV2Config {
  company_name?: string;
  company_description?: string;
  methodology_text?: string;
}

interface CtxV2 {
  is_primeiro_contato: boolean;
  contact_name: string;
  contact_name_known: boolean;
  contact_role: string;
  card_id: string | null;
  card_titulo: string | null;
  pipeline_stage_id: string | null;
  ai_resumo: string;
  ai_contexto: string;
  form_data: Record<string, string>;
  historico_compacto: string;
  lead_replied_now: boolean;
  turn_count: number;
  last_moment_key: string | null;
  last_lead_message: string | null;
  /** Necessário pra contar quantos turns assistant já passaram no current_moment
   *  (usado quando anchor_text está dividido em steps via "---" + delivery_mode=wait_for_reply). */
  conversation_id?: string | null;
}

interface BackofficeV2Output {
  ai_resumo: string;
  ai_contexto: string;
  detected_role: string;
  current_moment_key?: string | null;
  moment_transition_reason?: string | null;
}

export interface PersonaV2Result {
  response: string;
  inputTokens: number;
  outputTokens: number;
  /**
   * true quando o texto veio de um path determinístico (anchor literal, short_closing).
   * O caller deve evitar passar esse texto por LLMs que possam reescrever (validator/formatter
   * em modo "rewriter"): admin já curou as palavras na UI.
   */
  was_literal: boolean;
  v2Metadata: {
    current_moment_key: string;
    qualification_score_at_turn: number | null;
    moment_detection_method: 'deterministic' | 'llm' | 'fallback' | 'manual';
    moment_transition_reason: string;
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function runPersonaAgent_v2(
  supabase: SupabaseClient,
  agent: AgentV2Config,
  ctx: CtxV2,
  backoffice: BackofficeV2Output,
  business: BusinessV2Config | null,
  userMessage: string,
  qualificationSignals: Record<string, string>,
  callLLM: (
    model: string, temp: number, maxTok: number,
    systemPrompt: string, userMsg: string,
  ) => Promise<{ response: string; inputTokens: number; outputTokens: number }>,
): Promise<PersonaV2Result> {

  // 0. Fechamento social curto: lead mandou só agradecimento ou despedida.
  // Detector determinístico (regex ancorado pra mensagem INTEIRA — evita
  // falso-positivo do tipo "ok pode ser quinta" matchar como "ok"). Aplica
  // em todos os modos (literal, faithful, free) porque é resposta social
  // independente da fase. Não chama LLM, não roda tools, não muda moment.
  const closing = detectShortClosing(userMessage);
  if (closing) {
    const firstName = ctx.contact_name_known
      ? ctx.contact_name.trim().split(/\s+/)[0]
      : '';
    const response = renderClosingResponse(closing, firstName);
    console.log(JSON.stringify({
      event: 'short_closing_response',
      agent_id: agent.id,
      type: closing,
      user_message: userMessage.slice(0, 60),
    }));
    return {
      response,
      inputTokens: 0,
      outputTokens: response.length / 4 | 0,
      was_literal: true,
      v2Metadata: {
        current_moment_key: ctx.last_moment_key ?? 'short_closing',
        qualification_score_at_turn: null,
        moment_detection_method: 'deterministic',
        moment_transition_reason: `short_closing:${closing}`,
      },
    };
  }

  // 1. Carrega configs v2 em paralelo
  const [moments, silentSignals, fewShotExamples, scoringRules] = await Promise.all([
    loadPlaybookMoments(supabase, agent.id),
    loadPlaybookSilentSignals(supabase, agent.id),
    loadPlaybookFewShotExamples(supabase, agent.id),
    loadScoringRulesForPlaybook(supabase, agent.id),
  ]);

  if (moments.length === 0) {
    throw new Error(`persona_v2: agent ${agent.id} playbook_enabled=true mas nenhum momento configurado`);
  }

  // 2. Calcula score via RPC existente + avaliação ai_subjective (Marco 3.1)
  const scoreInfo = await calculateCurrentScore(
    supabase, agent.id, ctx, qualificationSignals,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    scoringRules as any, agent.nome,
  );

  // 2a. Score MONOTÔNICO: persiste max(score_anterior, score_atual). O subjective
  // evaluator é instável (chama LLM a cada turn) e pode reavaliar e dar nota
  // menor por mudança de contexto. Score de qualificação não deve cair sem
  // motivo deterministico. Bug observado em prod 28/04: score saltou 20 → 0 → 5.
  // Disqualified hard-stop ainda zera (caso "orçamento até 50k" — comportamento
  // intencional).
  if (ctx.conversation_id && scoreInfo.score !== null && !scoreInfo.disqualified) {
    try {
      const { data: prevTurns } = await supabase
        .from('ai_conversation_turns')
        .select('qualification_score_at_turn')
        .eq('conversation_id', ctx.conversation_id)
        .not('qualification_score_at_turn', 'is', null)
        .order('qualification_score_at_turn', { ascending: false })
        .limit(1);
      const prevMax = (prevTurns?.[0] as { qualification_score_at_turn?: number } | undefined)?.qualification_score_at_turn ?? 0;
      const effectiveScore = Math.max(scoreInfo.score, prevMax);
      if (effectiveScore > scoreInfo.score) {
        console.log(JSON.stringify({
          event: 'score_monotonic_floor',
          calculated: scoreInfo.score,
          prev_max: prevMax,
          effective: effectiveScore,
        }));
        scoreInfo.score = effectiveScore;
        scoreInfo.qualificado = scoreInfo.threshold !== null && effectiveScore >= scoreInfo.threshold;
      }
    } catch (err) {
      console.warn('[persona_v2] monotonic score lookup failed:', err);
    }
  }

  // 3. Detecta momento atual (híbrido: determinístico + LLM)
  const detCtx: MomentDetectionContext = {
    is_primeiro_contato: ctx.is_primeiro_contato,
    lead_replied_now: ctx.lead_replied_now,
    last_lead_message: ctx.last_lead_message,
    last_moment_key: ctx.last_moment_key,
    turn_count: ctx.turn_count,
    qualification_score_current: scoreInfo.score,
  };

  // 3a. Step-lock pra fases sequenciais (wait_for_reply + anchor com "---").
  // Se a fase anterior ainda tem passos por mandar, segura nela em vez de
  // deixar o detector pular pra próxima fase quando o lead respondeu.
  // Sem isso, a Estela ia da abertura (passo 1) direto pra sondagem no
  // segundo turn — pulava o passo 2 da abertura inteiro.
  let detected: ReturnType<typeof detectMoment>;
  let lockedStepIndex: number | null = null;
  if (ctx.last_moment_key && ctx.conversation_id) {
    const lastMoment = moments.find(m => m.moment_key === ctx.last_moment_key);
    if (
      lastMoment
      && lastMoment.delivery_mode === 'wait_for_reply'
      && typeof lastMoment.anchor_text === 'string'
      && /\n\s*-{3,}\s*\n/.test(lastMoment.anchor_text)
    ) {
      const totalSteps = lastMoment.anchor_text.split(/\n\s*-{3,}\s*\n/).filter(s => s.trim()).length;
      try {
        const { count } = await supabase
          .from('ai_conversation_turns')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', ctx.conversation_id)
          .eq('role', 'assistant')
          .eq('current_moment_key', lastMoment.moment_key);
        const sent = count ?? 0;
        if (sent < totalSteps) {
          detected = { moment: lastMoment, method: 'deterministic', reason: 'wait_for_reply_steps_pending' };
          lockedStepIndex = sent;
        }
      } catch (err) {
        console.warn('[persona_v2] step-lock count failed:', err);
      }
    }
  }
  // @ts-expect-error definido condicionalmente acima
  if (!detected) {
    detected = detectMoment({
      moments,
      ctx: detCtx,
      backofficeSuggestion: backoffice.current_moment_key ?? null,
    });
  }

  // 3b. Gate de slots CRÍTICOS: se há slots de priority='critical' (ou required=true
  // legado) em moments anteriores que ainda não foram preenchidos, força ficar.
  // Slots 'preferred' e 'nice_to_have' não entram no gate — eles permitem atalho
  // quando score atingiu. Lead que disse "Caribe" (+30 > 25) só vai pro Desfecho
  // se TAMBÉM já tem data/destino/convidados/orçamento (slots críticos).
  //
  // Critério "preenchido": crm_field_key tem valor em form_data OU qualificationSignals.
  // Slots sem crm_field_key não entram no gate (sem como saber se coletou).
  type CriticalSlotPending = { momentKey: string; momentDisplayOrder: number; slotLabel: string; crmFieldKey: string };
  const criticalPending: CriticalSlotPending[] = [];
  for (const m of moments) {
    if ((m.kind ?? 'flow') !== 'flow') continue;
    const slots = m.discovery_config?.slots ?? [];
    for (const s of slots) {
      const prio = resolveSlotPriority(s);
      if (prio !== 'critical') continue;
      if (!s.crm_field_key) continue;
      const filled = (ctx.form_data[s.crm_field_key] && String(ctx.form_data[s.crm_field_key]).trim())
        || (qualificationSignals[s.crm_field_key] && String(qualificationSignals[s.crm_field_key]).trim());
      if (!filled) {
        criticalPending.push({
          momentKey: m.moment_key,
          momentDisplayOrder: m.display_order,
          slotLabel: s.label,
          crmFieldKey: s.crm_field_key,
        });
      }
    }
  }
  const requiredPending = criticalPending; // alias pra reduzir diff abaixo

  // Se há slots required pendentes E o detector apontou pra moment POSTERIOR
  // ao primeiro moment com pendência, override pra esse moment. Mantém a
  // sondagem aberta até completar.
  if (requiredPending.length > 0) {
    const firstPending = requiredPending.reduce((min, p) =>
      p.momentDisplayOrder < min.momentDisplayOrder ? p : min,
    );
    if (detected.moment.display_order > firstPending.momentDisplayOrder) {
      const targetMoment = moments.find(m => m.moment_key === firstPending.momentKey);
      if (targetMoment) {
        console.log(JSON.stringify({
          event: 'moment_gated_by_required_slots',
          original_moment: detected.moment.moment_key,
          override_to: targetMoment.moment_key,
          pending_slots: requiredPending.map(p => `${p.momentKey}.${p.slotLabel}`),
        }));
        detected = {
          moment: targetMoment,
          method: 'deterministic',
          reason: `required_slots_pending:${requiredPending.length}`,
        };
        // Reset step lock — entramos num moment diferente do last_moment.
        lockedStepIndex = null;
      }
    }
  }

  // Log estruturado pra observabilidade (cai em Supabase Functions Logs)
  console.log(JSON.stringify({
    event: 'moment_detected',
    agent_id: agent.id,
    conversation_card_id: ctx.card_id,
    moment_key: detected.moment.moment_key,
    method: detected.method,
    reason: detected.reason,
    last_moment_key: ctx.last_moment_key,
    score_at_turn: scoreInfo.score,
    backoffice_suggestion: backoffice.current_moment_key ?? null,
  }));

  // 4. Calcula missingFields pro <qualification_status>
  const missingFields: string[] = [];
  for (const m of moments) {
    for (const f of (m.collects_fields ?? [])) {
      if (!ctx.form_data[f] && !qualificationSignals[f] && !missingFields.includes(f)) {
        missingFields.push(f);
      }
    }
  }

  // 5. Resolve config de book_meeting (busca nome do responsável + horários disponíveis).
  // Pré-buscar slots aqui evita o LLM precisar chamar check_calendar pra propor o
  // primeiro horário — vai com 3-5 opções já formatadas. Tool ainda fica disponível
  // pra checar slots ALTERNATIVOS quando o lead propor outro dia/hora.
  const bookCfg = agent.handoff_actions?.book_meeting ?? null;
  let bookMeetingForPrompt: Parameters<typeof buildPromptV2>[0]['bookMeeting'] = null;
  if (bookCfg?.enabled === true) {
    let responsavelName: string | null = null;
    if (bookCfg.responsavel_id) {
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('nome')
        .eq('id', bookCfg.responsavel_id)
        .maybeSingle();
      responsavelName = (profileRow as { nome?: string | null } | null)?.nome ?? null;
    }

    // Pré-busca os próximos slots disponíveis (próximos 14 dias) — usa a mesma
    // RPC que a tool check_calendar usa, garantindo consistência. Se falhar,
    // segue sem slots pré-carregados (LLM ainda pode chamar a tool).
    let availableSlots: Array<{ date: string; time: string; weekday: string }> = [];
    if (bookCfg.responsavel_id) {
      try {
        // Config de janela vinda da UI. Defaults seguros se não setado.
        const sched = (bookCfg as unknown as { scheduling?: {
          skip_today?: boolean;
          business_days_ahead?: number;
          slots_per_day?: number;
          min_hours_between_slots?: number;
        } | null }).scheduling ?? null;
        const skipToday = sched?.skip_today ?? true;
        const businessDaysAhead = Math.max(1, Math.min(15, sched?.business_days_ahead ?? 6));
        const slotsPerDay = Math.max(1, Math.min(6, sched?.slots_per_day ?? 2));
        const minHoursBetweenSlots = Math.max(0, Math.min(8, sched?.min_hours_between_slots ?? 2));

        // Calcula data de início: hoje OU próximo dia útil (sex→seg).
        const today = new Date();
        const startDay = new Date(today);
        if (skipToday) {
          startDay.setDate(startDay.getDate() + 1);
        }
        while (startDay.getDay() === 0 || startDay.getDay() === 6) {
          startDay.setDate(startDay.getDate() + 1);
        }
        const dateFrom = startDay.toISOString().slice(0, 10);
        // Janela em dias corridos = businessDaysAhead × ~1.5 pra cobrir fim de semana
        const dateTo = new Date(startDay.getTime() + Math.ceil(businessDaysAhead * 1.5) * 24 * 60 * 60 * 1000)
          .toISOString().slice(0, 10);
        const { data: cal } = await supabase.rpc('agent_check_calendar', {
          p_owner_id: bookCfg.responsavel_id,
          p_date_from: dateFrom,
          p_date_to: dateTo,
          p_org_id: agent.org_id,
        });
        const slotsRaw = (cal as { available_slots?: Array<{ date: string; time: string; weekday: string }> } | null)?.available_slots ?? [];

        // Seleção balanceada respeitando config: N horários por dia, espaçados ≥X horas, M dias.
        const byDay = new Map<string, Array<{ date: string; time: string; weekday: string }>>();
        for (const s of slotsRaw) {
          const list = byDay.get(s.date) ?? [];
          list.push(s);
          byDay.set(s.date, list);
        }
        const days = [...byDay.keys()].sort().slice(0, businessDaysAhead);
        const balanced: Array<{ date: string; time: string; weekday: string }> = [];
        for (const day of days) {
          const daySlots = byDay.get(day) ?? [];
          if (daySlots.length === 0) continue;
          const picked: typeof daySlots = [daySlots[0]];
          for (let i = 1; i < daySlots.length && picked.length < slotsPerDay; i++) {
            const last = picked[picked.length - 1];
            const lastH = parseInt(last.time.split(':')[0], 10) + parseInt(last.time.split(':')[1], 10) / 60;
            const candH = parseInt(daySlots[i].time.split(':')[0], 10) + parseInt(daySlots[i].time.split(':')[1], 10) / 60;
            if (candH - lastH >= minHoursBetweenSlots) picked.push(daySlots[i]);
          }
          balanced.push(...picked);
        }
        availableSlots = balanced;
      } catch (err) {
        console.warn('[persona_v2] pré-busca de slots falhou:', err);
      }
    }

    bookMeetingForPrompt = {
      enabled: true,
      responsavel_name: responsavelName,
      tipo: bookCfg.tipo ?? 'reuniao_video',
      duracao_minutos: bookCfg.duracao_minutos ?? 60,
      titulo_template: bookCfg.titulo_template ?? 'Reunião com {contact_name}',
      mensagem_confirmacao_template: bookCfg.mensagem_confirmacao_template ??
        'Perfeito! Marquei {responsavel_first_name} pra falar com vocês {data} às {hora}.',
      available_slots: availableSlots,
    };
  }

  // 5b. Step sequencial em fases wait_for_reply.
  // Permite que o admin separe o anchor_text com "---" pra mandar uma
  // mensagem por turn até esgotar a sequência. Conta quantos turns assistant
  // já existem com este moment_key — esse número vira o índice do próximo step.
  let currentMomentStepIndex = lockedStepIndex ?? 0;
  const cur = detected.moment;
  const usesSteps = cur.delivery_mode === 'wait_for_reply'
    && typeof cur.anchor_text === 'string'
    && /\n\s*-{3,}\s*\n/.test(cur.anchor_text);
  if (usesSteps && lockedStepIndex === null && ctx.conversation_id) {
    try {
      const { count } = await supabase
        .from('ai_conversation_turns')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', ctx.conversation_id)
        .eq('role', 'assistant')
        .eq('current_moment_key', cur.moment_key);
      currentMomentStepIndex = count ?? 0;
    } catch (err) {
      console.warn('[persona_v2] step_index count failed:', err);
    }
  }

  // 5b.1. Skip split quando cliente já mandou tudo (FIX 07/05/2026).
  // Sintoma: cliente envia "Oi sou o Vitor, queremos casar no Caribe em
  // Janeiro 2028 com 30 pessoas e 100k" no T1 — mesmo assim a Estela cumpre
  // o ritual de 2 turnos do anchor (cumprimento → pitch). Forçar 2 turnos
  // queima rapport quando lead chegou pré-qualificado.
  // Estratégia: se `usesSteps && stepIndex < totalSteps - 1 && form_data já
  // tem >=3 dos 4 campos críticos`, salta pro último step da abertura. Isso
  // mantém o segundo turno (pitch) sem perder o cumprimento, e libera a
  // sondagem mais rápido. Mantém literal puro e determinístico.
  //
  // GUARDA (FIX 08/05): nunca pular step em primeiro contato. Mesmo que o
  // Data Agent tenha alucinado e populado form_data com algum valor genérico
  // ("vim do site" não tem fato pra extrair), o step 1 da abertura é a
  // apresentação dela — pular significa cliente nunca ouvir "Aqui é a Estela".
  if (!ctx.is_primeiro_contato && usesSteps && currentMomentStepIndex < (() => {
    const totalSteps = (cur.anchor_text ?? '').split(/\n\s*-{3,}\s*\n/).filter(s => s.trim().length > 0).length;
    return totalSteps - 1;
  })()) {
    const criticalKeys = [
      'ww_destino', 'ww_data_casamento', 'ww_num_convidados',
      'ww_orcamento_faixa', 'ww_orcamento_total',
      'destino', 'data_casamento', 'num_convidados', 'orcamento_total',
      'mkt_destino', 'mkt_pretende_viajar_quando',
    ];
    const formData = ctx.form_data ?? {};
    const filled = new Set<string>();
    for (const k of criticalKeys) {
      const v = formData[k];
      if (v != null && String(v).trim().length > 0) {
        const normalized = k
          .replace(/^ww_(sdr_)?/, '')
          .replace(/^mkt_/, '')
          .replace(/_faixa$|_total$|_casamento$/, '')
          .replace(/^pretende_viajar_quando$/, 'data');
        filled.add(normalized);
      }
    }
    if (filled.size >= 3) {
      const totalSteps = (cur.anchor_text ?? '').split(/\n\s*-{3,}\s*\n/).filter(s => s.trim().length > 0).length;
      const newIndex = Math.max(totalSteps - 1, currentMomentStepIndex);
      if (newIndex !== currentMomentStepIndex) {
        console.log(`[persona_v2] skip_split: cliente já forneceu ${filled.size} campos críticos (${[...filled].join(',')}), pulando step ${currentMomentStepIndex}→${newIndex}`);
        currentMomentStepIndex = newIndex;
      }
    }
  }

  // 5c. Detecção determinística de fatos do anchor que o lead já mencionou.
  // SÓ roda em modo `faithful` — modo `literal` foi REMOVIDO desta detecção
  // em 08/05/2026.
  //
  // Por quê: em literal o admin curou o texto palavra-por-palavra. O detector
  // (mini-LLM) tem ~15-20% taxa de falso-positivo em extração de substring
  // (Yang 2025, vLLM HaluGate dez/2025). Quando classifica errado um termo
  // de marca como "lead já mencionou" (ex: "Destination Wedding"), o
  // renderLiteralResponse fazia text.split(trecho).join('') cego, deletando
  // a string do meio da frase e quebrando gramática ("produtora de da
  // América Latina"). Antipattern reconhecido em NLG safety 2025.
  //
  // Em literal, premissa é: admin sabe o que escreveu, não fazer cirurgia.
  // Repetição ocasional de info que o lead já mencionou é trade-off aceitável
  // pra garantir gramática íntegra. Em modo `faithful` (10% leeway) o
  // detector ainda vale — LLM pode adaptar sem mutilar.
  let trechosAOmitir: string[] = [];
  let leadResumo = '';
  const shouldDetectOmissions = cur.message_mode === 'faithful'
    && cur.anchor_text
    && cur.anchor_text.trim().length > 0
    && ctx.historico_compacto.includes('[lead]:');

  if (shouldDetectOmissions) {
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (openaiKey) {
      // Extrai só as últimas mensagens do lead do historico_compacto
      // (formato: "[lead]: texto\n[owner]: texto\n[lead]: texto").
      const leadMessages = ctx.historico_compacto
        .split('\n')
        .filter(l => l.startsWith('[lead]:'))
        .map(l => l.replace(/^\[lead\]:\s*/, '').trim())
        .filter(l => l.length > 0)
        .slice(-8); // últimas 8 mensagens do lead

      // Quando wait_for_reply + steps: passa só o STEP atual (não o anchor inteiro).
      let anchorForCheck = cur.anchor_text!;
      if (usesSteps) {
        const allSteps = cur.anchor_text!.split(/\n\s*-{3,}\s*\n/).map(s => s.trim()).filter(s => s.length > 0);
        anchorForCheck = allSteps[Math.min(currentMomentStepIndex, allSteps.length - 1)] ?? cur.anchor_text!;
      }

      try {
        const omRes = await detectFactsToOmit({
          anchorText: anchorForCheck,
          leadMessages,
          openaiApiKey: openaiKey,
        });
        trechosAOmitir = omRes.trechos_a_omitir;
        leadResumo = omRes.resumo_do_que_lead_disse;
        console.log(JSON.stringify({
          event: 'fact_omission_detected',
          agent_id: agent.id,
          moment_key: cur.moment_key,
          trechos_count: trechosAOmitir.length,
          tokens: omRes.tokens,
          elapsed_ms: omRes.elapsed_ms,
        }));
      } catch (err) {
        console.warn('[persona_v2] fact_omission_detector failed:', err);
      }
    }
  }

  // 6. Monta o prompt
  const prompt = buildPromptV2({
    agentName: agent.nome,
    companyName: business?.company_name ?? '',
    identity: agent.identity_config,
    voice: agent.voice_config,
    boundaries: agent.boundaries_config,
    listening: agent.listening_config,
    moments,
    currentMoment: detected.moment,
    currentMomentMethod: detected.method,
    silentSignals,
    fewShotExamples,
    scoringRules,
    scoreInfo: { ...scoreInfo, missingFields },
    ctx: {
      is_primeiro_contato: ctx.is_primeiro_contato,
      contact_name: ctx.contact_name,
      contact_name_known: ctx.contact_name_known,
      contact_role: ctx.contact_role,
      card_id: ctx.card_id,
      card_titulo: ctx.card_titulo,
      pipeline_stage_id: ctx.pipeline_stage_id,
      ai_resumo: backoffice.ai_resumo || ctx.ai_resumo,
      ai_contexto: backoffice.ai_contexto || ctx.ai_contexto,
      form_data: ctx.form_data,
      qualificationSignals,
      historico_compacto: ctx.historico_compacto,
      last_moment_key: ctx.last_moment_key,
      current_moment_step_index: currentMomentStepIndex,
      lead_already_mentioned_excerpts: trechosAOmitir,
      lead_summary: leadResumo,
    },
    userMessage,
    companyDescription: business?.methodology_text ?? business?.company_description,
    bookMeeting: bookMeetingForPrompt,
  });

  // 6. Modo TEXTO LITERAL: bypass total do LLM. Output determinístico do anchor.
  //
  // Decisão simples: literal = literal. Sem heurísticas tentando "adivinhar"
  // quando deve cair no LLM — heurísticas geram falso-positivo e quebram o
  // caso comum (ex: lead respondendo saudação com "Bem e você?" tem "?",
  // qualquer detector ingenuamente marca como off-script).
  //
  // Se admin gravou em modo literal, é porque quer controle total. Se a
  // fase precisa adaptar tom ou responder pergunta off-script, admin escolhe
  // 'faithful' (até 10% adaptação) ou 'free' (livre).
  //
  // Cobre automaticamente:
  //   - substituições de variáveis ({contact_name}, {responsavel_first_name}, etc)
  //   - smart-replace de saudação ("Olá"→"Boa noite") quando lead saudou assim
  //   - step certo quando wait_for_reply + "---"
  //   - omissão de trechos pré-detectados pelo fact_omission_detector
  if (cur.message_mode === 'literal') {
    const literalResponse = renderLiteralResponse({
      moment: cur,
      stepIndex: currentMomentStepIndex,
      usesSteps,
      contactNameKnown: ctx.contact_name_known,
      contactName: ctx.contact_name,
      agentName: agent.nome,
      companyName: business?.company_name ?? '',
      bookMeeting: bookMeetingForPrompt,
      historicoCompacto: ctx.historico_compacto,
      lastLeadMessage: userMessage,
      omitExcerpts: trechosAOmitir,
    });
    return {
      response: literalResponse,
      inputTokens: 0,
      outputTokens: literalResponse.length / 4 | 0,
      was_literal: true,
      v2Metadata: {
        current_moment_key: detected.moment.moment_key,
        qualification_score_at_turn: scoreInfo.score,
        moment_detection_method: detected.method,
        moment_transition_reason: backoffice.moment_transition_reason || detected.reason || 'literal_bypass',
      },
    };
  }

  // 6b. Outros modos (faithful, free): chama LLM normalmente.
  const personaModel = agent.pipeline_models?.main?.model || agent.modelo;
  const personaTemp = agent.pipeline_models?.main?.temperature ?? agent.temperature;
  const personaMaxTok = agent.pipeline_models?.main?.max_tokens ?? agent.max_tokens;

  let { response, inputTokens, outputTokens } = await callLLM(
    personaModel, personaTemp, personaMaxTok,
    prompt, userMessage,
  );

  // 6c. Enforcement de literal_phrases (frases obrigatórias palavra-por-palavra).
  // Mecanismo: depois da resposta, normalizar e checar se cada frase aparece. Se
  // alguma faltar (parafraseou ou omitiu), regen 1x com instrução reforçada.
  // Padrão Salesforce/HubSpot: ~80% das vezes LLM acerta de primeira; regen pega
  // mais 15%. Restante 5% loga e segue (não bloqueia turno do lead).
  // Pula a checagem se: (a) sem literal_phrases configuradas; (b) trechosAOmitir
  // cobre todos (lead já mencionou, então omitir é OK); (c) wait_for_reply +
  // step não-final — frases pertencem ao step final, não fazem sentido cobrar
  // em steps intermediários.
  const _totalStepsLP = usesSteps
    ? (cur.anchor_text ?? '').split(/\n\s*-{3,}\s*\n/).filter(s => s.trim().length > 0).length
    : 1;
  const _isLastStepLP = !usesSteps || currentMomentStepIndex >= _totalStepsLP - 1;
  const literalPhrases = _isLastStepLP
    ? ((cur as { literal_phrases?: string[] }).literal_phrases ?? [])
        .filter(p => typeof p === 'string' && p.trim().length > 0)
    : [];
  if (literalPhrases.length > 0) {
    const missingAfterFirst = checkMissingLiteralPhrases(response, literalPhrases, trechosAOmitir);
    if (missingAfterFirst.length > 0) {
      console.warn(`[persona_v2] literal_phrases missing after first pass: ${JSON.stringify(missingAfterFirst)} — regenerating once`);
      const regenInstruction = `${userMessage}

[INSTRUÇÃO CRÍTICA DO SISTEMA — sua resposta anterior omitiu/parafraseou frases obrigatórias. Reescreva a resposta encaixando NATURALMENTE estas frases EXATAS, palavra por palavra:
${missingAfterFirst.map(p => `  - "${p}"`).join('\n')}
Mantenha o tom e o resto do conteúdo, mas garanta que as frases acima apareçam idênticas.]`;
      try {
        const regen = await callLLM(personaModel, personaTemp, personaMaxTok, prompt, regenInstruction);
        const stillMissing = checkMissingLiteralPhrases(regen.response, literalPhrases, trechosAOmitir);
        if (stillMissing.length === 0) {
          response = regen.response;
          inputTokens += regen.inputTokens;
          outputTokens += regen.outputTokens;
        } else {
          console.warn(`[persona_v2] literal_phrases STILL missing after regen: ${JSON.stringify(stillMissing)} — keeping first response, logging gap`);
          // Prefere regen se ela cobriu MAIS frases (mesmo que não todas)
          if (stillMissing.length < missingAfterFirst.length) {
            response = regen.response;
            inputTokens += regen.inputTokens;
            outputTokens += regen.outputTokens;
          }
        }
      } catch (regenErr) {
        console.warn('[persona_v2] literal_phrases regen failed:', regenErr);
      }
    }
  }

  return {
    response,
    inputTokens,
    outputTokens,
    was_literal: false,
    v2Metadata: {
      current_moment_key: detected.moment.moment_key,
      qualification_score_at_turn: scoreInfo.score,
      moment_detection_method: detected.method,
      moment_transition_reason: backoffice.moment_transition_reason || detected.reason,
    },
  };
}

/**
 * Verifica quais literal_phrases NÃO aparecem na resposta (com tolerância a
 * pontuação, espaços, case e a omissões legítimas via lead_already_mentioned).
 *
 * Algoritmo: normaliza ambos (lowercase, sem acentos, sem pontuação não-letra,
 * espaços colapsados) e faz substring match. Tolerância suficiente pra detectar
 * "ganhamos prêmio Vogue 2024" copiado certo mesmo com vírgula extra, mas pega
 * paráfrase tipo "temos prêmios reconhecidos".
 *
 * Frases que estão dentro de trechosAOmitir não contam como faltando — o lead
 * já mencionou, omitir é correto.
 */
function checkMissingLiteralPhrases(
  response: string,
  literalPhrases: string[],
  trechosAOmitir: string[],
): string[] {
  const normalize = (s: string): string =>
    s.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const normResponse = normalize(response);
  // Heurística allowedToOmit via fact_omission_detector REMOVIDA (FIX 08/05):
  // era permissiva demais — se lead mencionou substring do literal (ex: "wedding"
  // dentro de "destination wedding desde 2012 e 5 prêmios..."), marcava literal
  // INTEIRO como "OK omitir". Regen nunca disparava em casos legítimos.
  // literal_phrases é compromisso explícito do admin — sempre cobrar.
  const missing: string[] = [];
  for (const phrase of literalPhrases) {
    const normPhrase = normalize(phrase);
    if (!normPhrase) continue;
    if (!normResponse.includes(normPhrase)) {
      missing.push(phrase);
    }
  }
  return missing;
}

// ---------------------------------------------------------------------------
// Helper: detectShortClosing — lead mandou só agradecimento/despedida?
// Regex ANCORADA pra mensagem inteira normalizada — não pega "ok pode ser
// quinta" porque a mensagem inteira não bate.
// ---------------------------------------------------------------------------

type ClosingType = 'thanks' | 'farewell';

function detectShortClosing(userMessage: string): ClosingType | null {
  if (!userMessage) return null;
  // Normaliza: lowercase, remove acentos, tira pontuação no fim, trim
  const normalized = userMessage
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[!.?]+$/g, '')
    .trim();
  if (normalized.length === 0 || normalized.length > 40) return null;

  // Agradecimento — mensagem inteira é só isso
  if (/^(obrigad[oa](ao|s)?|brigad[oa]|valeu|vlw|tmj|gratid[aã]o|agrade[cç]o|muit[oa] obrigad[oa]|obrigad[oa] mesmo)$/.test(normalized)) {
    return 'thanks';
  }

  // Despedida
  if (/^(tchau|ate logo|ate mais|ate breve|ate depois|ate ja|falou|fui|abracos?|um abraco|bjs|beijos?)$/.test(normalized)) {
    return 'farewell';
  }

  return null;
}

function renderClosingResponse(type: ClosingType, firstName: string): string {
  const name = firstName ? `, ${firstName}` : '';
  if (type === 'thanks') {
    return `Imagina${name}! Qualquer coisa estou por aqui.`;
  }
  // farewell
  return `Até logo${name}!`;
}

// ---------------------------------------------------------------------------
// Helper: render LITERAL response (bypass do LLM)
// ---------------------------------------------------------------------------

interface RenderLiteralInput {
  moment: PlaybookMoment;
  stepIndex: number;
  usesSteps: boolean;
  contactNameKnown: boolean;
  contactName: string;
  agentName: string;
  companyName: string;
  bookMeeting: Parameters<typeof buildPromptV2>[0]['bookMeeting'];
  historicoCompacto: string;
  /**
   * Mensagem inteira do lead deste turno (já combinada pelo buffer caso sejam
   * múltiplas msgs em sequência). Necessário porque o histórico_compacto perde
   * continuação multi-linha — quando lead manda "Oi Estela" + "Me chamo Vitor"
   * em sequência, o buffer combina como "Oi Estela\nMe chamo Vitor" e o
   * histórico só prefixa a primeira linha com [lead]:. Detectores de eco
   * social e name reveal precisam ver o texto completo.
   */
  lastLeadMessage: string;
  omitExcerpts: string[];
}

function renderLiteralResponse(input: RenderLiteralInput): string {
  const { moment, stepIndex, usesSteps, contactNameKnown, contactName,
          agentName, companyName, bookMeeting, historicoCompacto,
          lastLeadMessage, omitExcerpts } = input;

  if (!moment.anchor_text) return '';

  // 1. Pega o step certo se for wait_for_reply + "---"
  let text = moment.anchor_text;
  if (usesSteps) {
    const steps = text.split(/\n\s*-{3,}\s*\n/).map(s => s.trim()).filter(s => s.length > 0);
    text = steps[Math.min(stepIndex, steps.length - 1)] ?? text;
  }

  // 2. Aplica omissões (trechos que o lead já antecipou)
  for (const trecho of omitExcerpts) {
    text = text.split(trecho).join('').replace(/\s{2,}/g, ' ').trim();
  }

  // 2.5. Eco determinístico de pergunta social (FIX 07/05/2026, atualizado 08/05).
  // Em modo literal o LLM nunca é chamado, então a diretiva
  // `<detected_social_question>` injetada em renderListeningBlock fica órfã.
  // Resultado observado: cliente diz "Oi tudo bem?" e Estela responde "Olá,
  // tudo bem? Aqui é a Estela!" — ignorando a pergunta social do cliente.
  // Solução: prepend determinístico de uma frase de eco curto antes do anchor
  // quando regex bate na última msg do lead. Sem LLM, sem variabilidade.
  //
  // FIX 08/05: usar `lastLeadMessage` (passado direto, já combinado pelo buffer)
  // em vez de parsear historicoCompacto. Quando o buffer combina múltiplas
  // msgs ("Oi Estela\nMe chamo Vitor"), o histórico só prefixa [lead]: na
  // primeira linha, e a continuação ficava invisível pro detector.
  const _lastLeadMsg = (lastLeadMessage || '').trim();
  const _hasSocialQuestion = /\b(e\s+voc[eê]\??|td\s+bem\??|tudo\s+bem\??|como\s+vai\??|como\s+(voc[eê]\s+)?est[áa]\??|tudo\s+(bom|certo|joia)\??)\b/i.test(_lastLeadMsg.toLowerCase());
  // Só prepend se o anchor não começa já com "tudo bem" ou "tudo ótimo" — evita duplicar quando admin já escreveu eco no anchor.
  const _anchorAlreadyEchoes = /^(tudo\s+(bem|ótimo|otimo|bom|certo)|td\s+bem)/i.test(text.trim());
  if (_hasSocialQuestion && !_anchorAlreadyEchoes) {
    text = 'Tudo ótimo por aqui, obrigada!\n\n' + text;
  }

  // 2.6. Prepend determinístico de "Prazer, Nome" quando lead se identifica
  // (FIX 08/05/2026). Mesmo padrão do eco social: em modo literal o LLM
  // nunca é chamado e a diretiva injetada em renderListeningBlock fica órfã.
  // Sem isso: lead diz "Me chamo Vitor" e Estela ignora o nome no step 2 da
  // abertura, soa robotizada.
  // Detector regex idêntico ao de prompt_builder_v2:299 — captura "sou o X",
  // "me chamo Z", "aqui é o Y", etc. Só prepend se anchor não começa já com
  // saudação personalizada (Prazer/Legal/Oi <nome>) — evita duplicação.
  const _nameRevealMatch = _lastLeadMsg.match(/\b(?:sou\s+o|sou\s+a|aqui\s+[ée]\s+o|aqui\s+[ée]\s+a|meu\s+nome\s+[ée]|me\s+chamo|pode\s+me\s+chamar\s+de)\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]{1,30}(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]{1,30})?)/i);
  if (_nameRevealMatch) {
    const _detectedName = _nameRevealMatch[1].split(/\s+/)[0];
    const _anchorAlreadyGreets = new RegExp(`^(prazer|legal\\s+te\\s+conhecer|oi)[,\\s]*${_detectedName}\\b`, 'i').test(text.trim());
    if (!_anchorAlreadyGreets) {
      text = `Prazer, ${_detectedName}.\n\n` + text;
    }
  }

  // 3. Substitui variáveis
  const subs: Record<string, string> = {
    '{contact_name}': contactNameKnown ? contactName : '',
    '{agent_name}': agentName,
    '{company_name}': companyName,
  };
  if (bookMeeting?.responsavel_name) {
    subs['{responsavel_name}'] = bookMeeting.responsavel_name;
    subs['{responsavel_first_name}'] = bookMeeting.responsavel_name.trim().split(/\s+/)[0];
  }
  // Saudação detectada da última msg do lead (boa noite/tarde/dia)
  // FIX 08/05: usar lastLeadMessage direto (já combinada pelo buffer) — mesmo
  // motivo do fix do eco social acima.
  let detectedGreeting: string | null = null;
  if (_lastLeadMsg) {
    const head = _lastLeadMsg.toLowerCase().slice(0, 30);
    if (/\bboa\s+noite\b/.test(head)) detectedGreeting = 'Boa noite';
    else if (/\bboa\s+tarde\b/.test(head)) detectedGreeting = 'Boa tarde';
    else if (/\bbom\s+dia\b/.test(head)) detectedGreeting = 'Bom dia';
  }
  subs['{saudacao}'] = detectedGreeting ?? 'Olá';
  // Saudação por horário SP
  const sp = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const hr = sp.getHours();
  subs['{saudacao_horario}'] = hr >= 5 && hr < 12 ? 'Bom dia' : hr >= 12 && hr < 18 ? 'Boa tarde' : 'Boa noite';

  // Smart-replace de "Olá|Oi" no início se lead deu saudação contextual
  if (detectedGreeting) {
    text = text.replace(/(^|\n)(Olá|Oi)([\s,!])/i, `$1${detectedGreeting}$3`);
  }

  // Aplica substituições
  for (const [token, value] of Object.entries(subs)) {
    text = text.split(token).join(value);
  }

  // 4. Cleanup de pontuação após substituições vazias
  text = text
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/,\s*([.!?])/g, '$1')
    .replace(/([,.!?;:])\1+/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .trim();

  return text;
}

// ---------------------------------------------------------------------------
// Score helper
// ---------------------------------------------------------------------------

async function calculateCurrentScore(
  supabase: SupabaseClient,
  agentId: string,
  ctx: CtxV2,
  qualificationSignals: Record<string, string>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scoringRules?: any[],
  agentName?: string,
): Promise<{
  enabled: boolean;
  score: number | null;
  threshold: number | null;
  qualificado: boolean | null;
  disqualified?: boolean;
  breakdown?: Array<Record<string, unknown>>;
}> {
  const inputs: Record<string, unknown> = { ...ctx.form_data, ...qualificationSignals };

  // Pré-processa regras ai_subjective via LLM (Marco 3.1)
  const subjectiveResults: Record<string, boolean> = {};
  if (scoringRules && scoringRules.length > 0) {
    const subj = scoringRules.filter((r) => r.condition_type === 'ai_subjective');
    if (subj.length > 0) {
      const openaiKey = Deno.env.get('OPENAI_API_KEY');
      if (openaiKey) {
        try {
          const evalRes = await evaluateSubjectiveRules({
            rules: subj,
            historico_compacto: ctx.historico_compacto,
            ai_resumo: ctx.ai_resumo,
            ai_contexto: ctx.ai_contexto,
            form_data: ctx.form_data,
            agentName: agentName ?? '',
            openaiApiKey: openaiKey,
          });
          Object.assign(subjectiveResults, evalRes.resolved);
          console.log(JSON.stringify({
            event: 'subjective_evaluated',
            agent_id: agentId, rules_count: subj.length,
            resolved: evalRes.resolved, tokens: evalRes.tokens,
            elapsed_ms: evalRes.elapsed_ms,
          }));
        } catch (err) {
          console.warn('[persona_v2] subjective eval failed:', err);
        }
      }
    }
  }

  try {
    const { data, error } = await supabase.rpc('calculate_agent_qualification_score', {
      p_agent_id: agentId,
      p_inputs: inputs,
    });
    if (error) {
      console.warn('[persona_v2] calculate_agent_qualification_score error:', error);
      return { enabled: false, score: null, threshold: null, qualificado: null };
    }

    // Aplica regras ai_subjective resolvidas (não são conhecidas pela RPC)
    let score = Number(data?.score ?? 0);
    let disqualified = Boolean(data?.disqualified ?? false);
    const breakdown = Array.isArray(data?.breakdown) ? [...data.breakdown] : [];

    if (scoringRules) {
      for (const r of scoringRules) {
        if (r.condition_type !== 'ai_subjective') continue;
        if (subjectiveResults[r.id] !== true) continue;
        if (r.rule_type === 'disqualify') {
          disqualified = true;
        } else {
          score += Number(r.weight ?? 0);
          breakdown.push({
            dimension: r.dimension,
            label: r.label ?? r.dimension,
            weight: r.weight ?? 0,
            rule_id: r.id,
            rule_type: r.rule_type ?? 'qualify',
            source: 'ai_subjective',
          });
        }
      }
    }

    const threshold = Number(data?.threshold ?? 0);
    return {
      enabled: Boolean(data?.enabled),
      score,
      threshold,
      qualificado: disqualified ? false : score >= threshold,
      disqualified,
      breakdown,
    };
  } catch (err) {
    console.warn('[persona_v2] score calculation failed:', err);
    return { enabled: false, score: null, threshold: null, qualificado: null };
  }
}
