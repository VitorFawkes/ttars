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
        const today = new Date();
        const dateFrom = today.toISOString().slice(0, 10);
        const dateTo = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const { data: cal } = await supabase.rpc('agent_check_calendar', {
          p_owner_id: bookCfg.responsavel_id,
          p_date_from: dateFrom,
          p_date_to: dateTo,
        });
        const slotsRaw = (cal as { available_slots?: Array<{ date: string; time: string; weekday: string }> } | null)?.available_slots ?? [];
        // Pega no máximo 8 — LLM escolhe os 2-3 melhores
        availableSlots = slotsRaw.slice(0, 8);
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

  // 5c. Detecção determinística de fatos do anchor que o lead já mencionou.
  // SÓ roda em modos literal/faithful (modo 'free' não precisa — agente já
  // adapta). E só roda quando há mensagens prévias do lead pra analisar.
  // Esse pedaço transforma a "instrução fuzzy" do prompt anterior em decisão
  // determinística — antes o LLM principal precisava lembrar de checar
  // histórico (~70% confiabilidade). Agora ele recebe a lista pronta (~95%).
  let trechosAOmitir: string[] = [];
  let leadResumo = '';
  const shouldDetectOmissions = (cur.message_mode === 'literal' || cur.message_mode === 'faithful')
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

  // 6. Modo TEXTO LITERAL: bypass do LLM por padrão, MAS com escape pra
  // perguntas off-script. Pesquisa de 3 especialistas Opus convergiu:
  //
  // - Bypass total resolve o bug de paráfrase/corte de pergunta (LLM só
  //   acerta ~60-70% com instrução fuzzy; bypass = 100%).
  // - Mas tem um furo: se lead manda "Boa noite, vocês trabalham com
  //   casamento no Brasil?", literal puro IGNORA a pergunta e só envia
  //   o anchor. Lead se sente robô (47% taxa de abandono em UX studies).
  //
  // Solução: detectar pergunta off-script via heurística determinística
  // (regex). Se detectada, fallback pra diretriz fiel SÓ nesse turno:
  // o LLM lê a pergunta + responde curto + ainda usa anchor como base.
  //
  // Saudação contextual ("boa noite" → trocar "Olá" no anchor) já é
  // determinística no renderLiteralResponse — funciona em ambos branches.
  if (cur.message_mode === 'literal') {
    const offScript = detectOffScriptQuestion(userMessage, cur.anchor_text ?? '');
    if (!offScript) {
      // Caminho normal: bypass do LLM. Output determinístico do anchor.
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
        omitExcerpts: trechosAOmitir,
      });
      return {
        response: literalResponse,
        inputTokens: 0,
        outputTokens: literalResponse.length / 4 | 0,
        v2Metadata: {
          current_moment_key: detected.moment.moment_key,
          qualification_score_at_turn: scoreInfo.score,
          moment_detection_method: detected.method,
          moment_transition_reason: backoffice.moment_transition_reason || detected.reason || 'literal_bypass',
        },
      };
    }
    // Off-script detectada — segue pro LLM com instrução de comportamento
    // híbrido: reconhece a pergunta + mantém anchor como base. Não retorna
    // aqui; cai no fluxo normal abaixo (callLLM com prompt original do
    // modo literal — tem instrução pra responder antes de redirecionar).
    console.log(JSON.stringify({
      event: 'literal_off_script_fallback',
      agent_id: agent.id,
      moment_key: cur.moment_key,
      user_message: userMessage.slice(0, 120),
    }));
  }

  // 6b. Outros modos (faithful, free): chama LLM normalmente.
  const personaModel = agent.pipeline_models?.main?.model || agent.modelo;
  const personaTemp = agent.pipeline_models?.main?.temperature ?? agent.temperature;
  const personaMaxTok = agent.pipeline_models?.main?.max_tokens ?? agent.max_tokens;

  const { response, inputTokens, outputTokens } = await callLLM(
    personaModel, personaTemp, personaMaxTok,
    prompt, userMessage,
  );

  return {
    response,
    inputTokens,
    outputTokens,
    v2Metadata: {
      current_moment_key: detected.moment.moment_key,
      qualification_score_at_turn: scoreInfo.score,
      moment_detection_method: detected.method,
      moment_transition_reason: backoffice.moment_transition_reason || detected.reason,
    },
  };
}

// ---------------------------------------------------------------------------
// Helper: detectOffScriptQuestion — heurística determinística pra decidir se
// o lead fez pergunta que NÃO está coberta pelo anchor literal. Usa regex e
// overlap de palavras-chave; sem chamada LLM (zero custo, zero latência).
//
// Retorna true quando:
//   1. Mensagem do lead tem indicador de pergunta (?, "vocês", "qual", etc), E
//   2. Mensagem tem ≥2 palavras significativas com pouca/nenhuma sobreposição
//      com palavras significativas do anchor (lead falou de tema novo).
//
// Conservador por design — quando em dúvida, retorna false (segue literal puro).
// ---------------------------------------------------------------------------

const STOP_WORDS_PT = new Set([
  'sobre', 'esse', 'essa', 'isso', 'aqui', 'tudo', 'então', 'depois', 'antes',
  'porque', 'pode', 'estão', 'estou', 'estar', 'tenho', 'pra', 'para',
  'tipo', 'mais', 'menos', 'muito', 'pouco', 'agora', 'certo',
  'outro', 'outra', 'gente', 'sendo', 'sido', 'sido', 'também', 'tambem',
  'gostaria', 'queria', 'falar', 'saber', 'pensar', 'mesmo',
]);

const QUESTION_INDICATORS_PT = /\b(vocês|voces|trabalham|fazem|qual|como|quando|onde|quanto|tem|atendem|aceitam|conseguem|funciona|tipo|quanto)\b/i;

function detectOffScriptQuestion(userMessage: string, anchorText: string): boolean {
  if (!userMessage || !anchorText) return false;
  const msg = userMessage.toLowerCase().trim();
  if (msg.length < 5) return false; // muito curto pra ser pergunta substantiva

  const hasQuestionMark = msg.includes('?');
  const hasIndicator = QUESTION_INDICATORS_PT.test(msg);
  if (!hasQuestionMark && !hasIndicator) return false;

  // Palavras significativas (4+ chars, não-stopword)
  const extract = (s: string) => (s.toLowerCase().match(/\b[a-záéíóúâêôãõç]{4,}\b/g) || [])
    .filter(w => !STOP_WORDS_PT.has(w));

  const userWords = new Set(extract(msg));
  const anchorWords = new Set(extract(anchorText));

  if (userWords.size < 2) return false;

  // Overlap: quantas palavras do user também estão no anchor
  let overlap = 0;
  for (const w of userWords) {
    if (anchorWords.has(w)) overlap += 1;
  }
  // Se overlap baixo (<2 palavras em comum), tema é novo
  return overlap < 2;
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
  omitExcerpts: string[];
}

function renderLiteralResponse(input: RenderLiteralInput): string {
  const { moment, stepIndex, usesSteps, contactNameKnown, contactName,
          agentName, companyName, bookMeeting, historicoCompacto, omitExcerpts } = input;

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
  const leadLines = historicoCompacto.split('\n').filter(l => l.startsWith('[lead]:'));
  const lastLead = leadLines.length > 0 ? leadLines[leadLines.length - 1].replace(/^\[lead\]:\s*/, '').trim() : '';
  let detectedGreeting: string | null = null;
  if (lastLead) {
    const head = lastLead.toLowerCase().slice(0, 30);
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
