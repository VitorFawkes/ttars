// Monta o prompt único do single-agent (Patricia).
//
// Diferenças vs prompt_builder_v2.ts da Estela:
//   - TODOS os momentos visíveis em uma tabela (não só o "detectado")
//   - Modos literal/faithful/free como HINTS textuais (não short-circuit)
//   - Sem rendering condicional por modo (LLM decide)
//   - Sem fact_omission_detector (LLM percebe via histórico que lead já mencionou X)
//   - Output schema reminder no fim
//
// Output: { system: string, user: string } pra montar `messages` da OpenAI.

import type {
  BoundariesConfig,
  IdentityConfig,
  ListeningConfig,
  PlaybookFewShotExample,
  PlaybookMoment,
  PlaybookSilentSignal,
  SchedulingConfig,
  ScoringRule,
  VoiceConfig,
} from "./playbook_loader.ts";
import { resolveMomentParts } from "./playbook_loader.ts";
import { resolveAgentPlaceholders, resolvePlaceholdersDeep, type ResolverContext } from "./placeholder_resolver.ts";
import { getDefaultsForAgent, type AgentDefaults } from "./defaults/index.ts";
import type { CognitiveAuditConfigFromDB } from "./defaults/patricia_diff_cognitivo.ts";

export interface BuildSinglePromptInput {
  agent: {
    id: string;
    nome: string;
    identity_config: IdentityConfig | null;
    voice_config: VoiceConfig | null;
    boundaries_config: BoundariesConfig | null;
    listening_config: ListeningConfig | null;
    scheduling_config?: SchedulingConfig | null;
    /**
     * Instruções extras do admin (per-agente). Sub-campos consumidos hoje:
     *   - context: orientação que vai no bloco <context_rules> antes do playbook.
     *   - data_update: regras de gravação de campos do card (conversão de moeda etc).
     * Outros sub-campos (validator, formatting) são consumidos por outros módulos.
     */
    prompts_extra?: {
      context?: string | null;
      data_update?: string | null;
      validator?: string | null;
      formatting?: string | null;
    } | null;
    /**
     * Override por agente das descrições das tools que vão pro prompt.
     * Chave = nome da tool (ex "request_handoff"). Valor = texto que substitui
     * o default (DEFAULT_TOOL_DESCRIPTIONS). Vazio/undefined → usa default.
     */
    tool_descriptions?: Record<string, string> | null;
    /**
     * Cérebro analítico estruturado (UI v3). Substitui prompts_extra.context
     * (texto livre legacy). 5 sub-rotinas configuráveis: detect_contradictions,
     * detect_pending_promises, detect_unanswered_questions, detect_pitch_saturation,
     * audit_viability. Cada uma: { enabled, instruction, ...params }. Quando
     * presente e tem rotinas habilitadas, monta <context_rules> a partir
     * disso. Quando ausente/vazio, fallback pro prompts_extra.context.
     */
    cognitive_audit_config?: Record<string, unknown> | null;
    /**
     * Regras estruturadas de gravação de dados no CRM (UI v3). Substitui
     * prompts_extra.data_update (texto livre legacy). Array de
     * { key, title, instruction, enabled, order }. Quando tem itens
     * habilitados, monta <data_update_rules> com cada um como parágrafo
     * numerado. Vazio = fallback pro texto legado.
     */
    data_update_rules?: Array<{
      key?: string;
      title?: string;
      instruction?: string;
      enabled?: boolean;
      order?: number;
    }> | null;
  };
  business: {
    company_name?: string | null;
    company_description?: string | null;
    methodology_text?: string | null;
    process_steps?: unknown[];
    secondary_contact_role_name?: string | null;
    /** Nome completo da Wedding Planner que recebe handoff (resolvido do
     *  ai_agents.wedding_planner_profile_id pelo router antes de chamar buildSinglePrompt). */
    wedding_planner_name?: string | null;
    /** Nome curto (primeiro+segundo nome) pra conversa íntima. */
    wedding_planner_short?: string | null;
    /** Faixa de honorário da assessoria já formatada (ex: "R$ 4 mil a R$ 18 mil"). */
    honorario_faixa?: string | null;
    /** Stats da empresa em texto curto (ex: "Desde 2012, mais de 650 casamentos..."). */
    empresa_stats?: string | null;
    /** Regiões da rede própria em texto formatado (ex: "Caribe (Cancún, Punta Cana), Maldivas..."). */
    network_regions?: string | null;
    /** Categorias canônicas de destino do CRM (ex: "Caribe / Maldivas / Nordeste / Mendoza / Europa / Outro"). */
    destination_categories?: string | null;
    /** Política de material/brochura (texto explicando se tem ou não tem material pra enviar). */
    brochure_policy?: string | null;
  } | null;
  moments: PlaybookMoment[];
  silentSignals: PlaybookSilentSignal[];
  fewShotExamples: PlaybookFewShotExample[];
  scoringRules: ScoringRule[];
  scoringThreshold: number;
  conversationState: {
    historico_compacto: string;
    last_lead_message: string | null;
    last_moment_key: string | null;
    /**
     * Em moments com delivery_mode=wait_for_reply e anchor_text_parts com 2+
     * elementos, este step indica qual parte enviar no turno atual. Quando o
     * último moment terminou (lead respondeu à última parte), o router avança
     * step+1 ANTES de chamar o LLM. Default 0 (primeiro bloco).
     */
    moment_step: number;
    turn_count: number;
    is_primeiro_contato: boolean;
    contact_name: string | null;
    card_titulo: string | null;
    ai_resumo: string | null;
    ai_contexto: string | null;
    card_form_data: Record<string, unknown> | null;
    /**
     * Quando o router pré-decide o momento (ex: trigger determinístico de
     * desfecho ao fim da sondagem), envia o slug aqui. O turn_policy força
     * o LLM a usar esse momento — sem chance de "esquecer" de fechar.
     * null = LLM decide normalmente.
     */
    forced_moment_key?: string | null;
    /**
     * Resultado da RPC calculate_agent_qualification_score, chamada pelo
     * router antes do LLM quando os dados estão coletados. Quando presente,
     * é renderizado como contexto autoritativo no prompt.
     */
    qualification_result?: {
      score: number;
      qualificado: boolean;
      breakdown?: unknown;
    } | null;
    /**
     * Lista de 3 dias/horários propostos pra reunião com a Wedding Planner.
     * Buscada pelo router quando o trigger determinístico identifica
     * desfecho_qualificado. LLM apresenta esses horários verbatim no
     * último turno da conversa.
     */
    proposed_slots?: Array<{ date: string; time: string; weekday: string }> | null;
    /**
     * Resultados de tools executadas no MESMO turn anterior (agentic loop).
     * Quando o LLM chama uma tool e queremos que ele use o resultado pra
     * gerar a resposta, o router executa, popula isto e re-chama o LLM.
     * Hoje só `check_calendar` usa esse caminho.
     */
    tool_results?: Record<string, unknown> | null;
    /**
     * Fix 1.3 (2026-05-24) — Intenção do lead detectada pelo LLM no turn ANTERIOR
     * (via self_analysis.lead_intent). Router usa pra:
     *   - early-exit do avanço mecânico de moment_step (se "pronto_pra_fechar"
     *     no moment abertura, libera pro LLM escolher próximo)
     *   - injetar instrução em turn_policy ("não despeje pitch genérico em quem
     *     já demonstrou intenção alta")
     */
    last_lead_intent?: "explorando" | "qualificando" | "objetando" | "pronto_pra_fechar" | null;
    /**
     * Fix 1.4 (2026-05-24) — Contradição detectada pelo LLM no turn ANTERIOR
     * (via self_analysis.contradicao_detectada). Quando presente, turn_policy
     * injeta instrução OBRIGATÓRIA de devolver os dois polos antes de qualquer
     * outra coisa.
     */
    contradicao_detectada?: { campos?: string[]; descricao?: string } | null;
  };
  availableTools: string[];
}

export function buildSinglePrompt(input: BuildSinglePromptInput): {
  system: string;
  user: string;
} {
  const {
    agent,
    business,
    moments: rawMoments,
    silentSignals: rawSignals,
    fewShotExamples: rawExamples,
    scoringRules: rawScoringRules,
    scoringThreshold,
    conversationState,
    availableTools,
  } = input;

  // Resolver placeholders dinâmicos em textos editáveis pelo admin + defaults
  // curados. Idempotente: texto sem placeholder passa intocado. Histórico
  // do lead e mensagens persistidas NÃO são tocadas (só configs).
  const resolverCtx: ResolverContext = {
    agent_name: agent.nome,
    company_name: business?.company_name ?? null,
    contact_name: conversationState.contact_name ?? null,
    wedding_planner_name: business?.wedding_planner_name ?? null,
    wedding_planner_short: business?.wedding_planner_short ?? null,
    honorario_faixa: business?.honorario_faixa ?? null,
    empresa_stats: business?.empresa_stats ?? null,
    network_regions: business?.network_regions ?? null,
    destination_categories: business?.destination_categories ?? null,
    brochure_policy: business?.brochure_policy ?? null,
  };

  const identity = resolvePlaceholdersDeep(agent.identity_config || {}, resolverCtx);
  const voice = resolvePlaceholdersDeep(agent.voice_config || {}, resolverCtx);
  const boundaries = resolvePlaceholdersDeep(agent.boundaries_config || {}, resolverCtx);
  const listening = resolvePlaceholdersDeep(agent.listening_config || {}, resolverCtx);
  const resolvedBusiness = business ? resolvePlaceholdersDeep(business, resolverCtx) : null;
  const moments = rawMoments.map((m) => resolvePlaceholdersDeep(m, resolverCtx));
  const silentSignals = rawSignals.map((s) => resolvePlaceholdersDeep(s, resolverCtx));
  const fewShotExamples = rawExamples.map((e) => resolvePlaceholdersDeep(e, resolverCtx));
  const scoringRules = rawScoringRules.map((r) => resolvePlaceholdersDeep(r, resolverCtx));

  // Defaults curados por agente (texto monolítico do prompt + funções builder).
  // Quando o agente tem defaults curados (hoje: só Patricia), substituem o
  // que viria de configs fragmentadas no banco. Mantém prompt-first.
  // Para outros agentes single_agent_v2 futuros, defaults é null e mantém
  // o comportamento de ler do banco (compatibilidade).
  const defaults = getDefaultsForAgent(agent.id);

  // -------- Header / identity ---------------------------------------------
  const headerBlock = renderHeader(agent.nome, identity, resolvedBusiness);

  // -------- Principles ----------------------------------------------------
  // Com defaults curados: texto monolítico vem do código (defaults.principles_text),
  // com placeholders resolvidos pelo resolverCtx (ex: {wedding_planner_name}).
  // Sem defaults: lê do banco (identity.principles array → fallback principles_text).
  const principlesBlock = renderPrinciples(identity, defaults, resolverCtx);

  // -------- Agent schedule (fonte única de verdade da agenda) -------------
  // Lido de ai_agents.scheduling_config; injetado em linguagem natural pro LLM
  // ler sem confabular janela. Elimina drift entre config do banco e texto
  // que o admin escreveria manualmente em principles_text.
  const agentScheduleBlock = renderAgentSchedule(agent.scheduling_config);

  // -------- Cérebro analítico (DIFF COGNITIVO) ----------------------------
  // Com defaults curados: buildDiffCognitivo lê toggles + params do banco
  // (cognitive_audit_config.audit_viability.zones/currency_rates) e gera
  // texto monolítico do código (admin não edita instruções, só toggles + números).
  // Sem defaults: comportamento antigo (struct → renderiza routines).
  const contextRulesBlock = renderCognitiveAudit(
    agent.cognitive_audit_config,
    defaults,
    resolverCtx,
  );

  // -------- Data update rules ---------------------------------------------
  // Com defaults curados: texto monolítico do código (defaults.data_update_rules_text).
  // Sem defaults: lê do banco (data_update_rules array → fallback prompts_extra.data_update).
  const dataUpdateRulesBlock = renderDataUpdateRules(
    agent.data_update_rules,
    defaults,
    resolverCtx,
  );

  // -------- Voice ---------------------------------------------------------
  const voiceBlock = renderVoice(voice);

  // -------- Boundaries ----------------------------------------------------
  // Com defaults curados: buildBoundaries lê brand_active + competitors do banco
  // e renderiza Grupo A (admin) + Grupo B (design da IA, hardcoded).
  // Sem defaults: comportamento antigo (by_category novo → fallback library_active legacy).
  const boundariesBlock = renderBoundaries(boundaries, defaults, resolverCtx);

  // -------- Listening -----------------------------------------------------
  const listeningBlock = renderListening(listening);

  // -------- Playbook (TODOS os momentos) ----------------------------------
  const playbookBlock = renderPlaybook(moments, conversationState);

  // -------- Silent signals ------------------------------------------------
  const silentSignalsBlock = renderSilentSignals(silentSignals);

  // -------- Qualification (regras como referência) ------------------------
  const qualificationBlock = renderQualification(scoringRules, scoringThreshold);

  // -------- Few-shot examples ---------------------------------------------
  const examplesBlock = renderFewShots(fewShotExamples);

  // -------- Conversation state --------------------------------------------
  const stateBlock = renderConversationState(conversationState);

  // -------- Qualification result (contexto autoritativo do router) ---------
  // Quando o router rodou a RPC determinística antes do LLM, este bloco
  // entrega o resultado já calculado. LLM não precisa (e não deve) chamar
  // calculate_qualification_score novamente.
  const qualificationResultBlock = renderQualificationResult(conversationState.qualification_result);

  // -------- Proposed slots (3 horários pra reunião) -----------------------
  // Quando o trigger determinístico identifica desfecho_qualificado, o
  // router pré-busca 3 horários e injeta aqui. LLM apresenta verbatim.
  const proposedSlotsBlock = renderProposedSlots(conversationState.proposed_slots);

  // -------- Tool results (agentic loop curto) -----------------------------
  // Quando o router executou uma tool e está re-chamando o LLM pra usar o
  // resultado, popula este bloco com a saída da tool. Hoje cobre só
  // check_calendar — a Patricia usa o retorno pra responder ao lead.
  const toolResultsBlock = renderToolResults(conversationState.tool_results);

  // -------- Turn policy (regra do bloco ativo nesse turno) ----------------
  const turnPolicyBlock = renderTurnPolicy(moments, conversationState);

  // -------- Tools available -----------------------------------------------
  const toolsBlock = renderTools(availableTools, agent.tool_descriptions);

  // -------- Output schema reminder ----------------------------------------
  const schemaReminder = renderSchemaReminder();

  // Ordem otimizada pra atenção do LLM (revisão Opus 4.7 + paper Lost in the Middle):
  //   1-3   Identidade carregada de verdade (atenção alta - primacy):
  //         identity → principles → agent_schedule
  //   4-5   Como falar / linhas vermelhas: voice → boundaries
  //   6     Playbook (mais pesado) sai do meio do prompt — atenção alta
  //   7     Listening (sinais ativos)
  //   8-11  Estado e contexto autoritativos do turn: state → qualification_result
  //         → proposed_slots → tool_results
  //   12-14 Silent signals + qualification (referência) + examples (suporte)
  //   15-17 Comando final pra executar: turn_policy → tools → output_format
  //         (zona de recency forte, perto da geração do output)
  const system = [
    headerBlock,
    principlesBlock,
    agentScheduleBlock,
    voiceBlock,
    boundariesBlock,
    dataUpdateRulesBlock,
    contextRulesBlock,
    playbookBlock,
    listeningBlock,
    stateBlock,
    qualificationResultBlock,
    proposedSlotsBlock,
    toolResultsBlock,
    silentSignalsBlock,
    qualificationBlock,
    examplesBlock,
    turnPolicyBlock,
    toolsBlock,
    schemaReminder,
  ]
    .filter(Boolean)
    .join("\n\n");

  // User message é a última mensagem do lead (ou placeholder se não houver)
  const user = conversationState.last_lead_message ||
    "(Lead não enviou mensagem ainda — você está iniciando a conversa.)";

  return { system, user };
}

// ============================================================================
// Renderers
// ============================================================================

function renderHeader(
  agentName: string,
  identity: IdentityConfig,
  business: BuildSinglePromptInput["business"],
): string {
  const role = identity.role_custom || identity.role || "atendente";
  const mission = identity.mission_one_liner || "";
  const companyDesc =
    identity.company_description_override ||
    business?.company_description ||
    "";

  let methodology = business?.methodology_text || "";
  if (business?.process_steps && Array.isArray(business.process_steps) && business.process_steps.length > 0) {
    const steps = (business.process_steps as string[])
      .map((s, i) => `${i + 1}. ${s}`)
      .join("\n");
    methodology += methodology ? `\n\nNosso processo:\n${steps}` : `Nosso processo:\n${steps}`;
  }

  return `<identity>
Você é ${agentName}, ${role} da ${business?.company_name || ""}.

Missão: ${mission}

${companyDesc}

${methodology}
</identity>`;
}

/**
 * Renderiza o bloco <principles> do prompt — "como eu penso" do agente.
 *
 * Estratégia (decidida em 2026-05-21):
 * - Agente com defaults curados (Patricia): texto monolítico vem do código
 *   (defaults.principles_text). Garante coerência narrativa.
 * - Agente sem defaults curados: lê do banco — formato preferido `principles[]`
 *   (array da UI v3); fallback `principles_text` (texto legado).
 *
 * Posicionado entre <identity> e <agent_schedule> pra maximizar primacy.
 */
function renderPrinciples(
  identity: IdentityConfig | null | undefined,
  defaults: AgentDefaults | null,
  ctx: ResolverContext,
): string {
  // Defaults curados ganham: texto monolítico do código com placeholders resolvidos
  if (defaults) {
    const text = resolveAgentPlaceholders(defaults.principles_text, ctx).trim();
    if (!text) return "";
    return `<principles>
${text}
</principles>`;
  }

  // Sem defaults: comportamento antigo (banco)
  if (!identity) return "";

  const arr = Array.isArray(identity.principles) ? identity.principles : null;
  if (arr && arr.length > 0) {
    const enabled = arr
      .filter((p) => p?.enabled === true)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (enabled.length === 0) return "";

    const lines: string[] = [];
    enabled.forEach((p, idx) => {
      const title = (p.title || "").trim();
      const body = (p.body || "").trim();
      if (!title && !body) return;
      const num = idx + 1;
      if (title && body) {
        lines.push(`${num}. **${title}** — ${body}`);
      } else if (title) {
        lines.push(`${num}. **${title}**`);
      } else {
        lines.push(`${num}. ${body}`);
      }
    });

    if (lines.length === 0) return "";
    return `<principles>
${lines.join("\n\n")}
</principles>`;
  }

  // Fallback: formato legado (texto livre)
  const text = identity.principles_text;
  if (!text || !text.trim()) return "";
  return `<principles>
${text.trim()}
</principles>`;
}

/**
 * Renderiza instruções extras editáveis pelo admin (per-agente) como bloco
 * com tag XML configurável (data_update_rules, context_rules, etc).
 * Vazio = string vazia (filtrada pelo .filter(Boolean) no array final).
 */
function renderExtraRules(tag: string, text: string | null | undefined): string {
  if (!text || !text.trim()) return "";
  return `<${tag}>
${text.trim()}
</${tag}>`;
}

/**
 * Renderiza <data_update_rules> — regras de gravação de campos do card.
 *
 * Com defaults curados (Patricia): texto monolítico do código.
 * Sem defaults: lê do banco — array `data_update_rules[]` (UI v3) → fallback
 * texto legado de `prompts_extra.data_update`.
 *
 * FUTURO: parte dessas regras vira código de validação no validator
 * (especialmente normalização numérica + conversão de moeda).
 */
function renderDataUpdateRules(
  rules: Array<{ key?: string; title?: string; instruction?: string; enabled?: boolean; order?: number }> | null | undefined,
  defaults: AgentDefaults | null,
  ctx: ResolverContext,
): string {
  // Defaults curados ganham — placeholders resolvidos
  if (defaults) {
    const text = resolveAgentPlaceholders(defaults.data_update_rules_text, ctx).trim();
    if (!text) return "";
    return `<data_update_rules>
${text}
</data_update_rules>`;
  }

  // Sem defaults: comportamento antigo
  const arr = Array.isArray(rules) ? rules : [];
  const enabled = arr
    .filter((r) => r?.enabled === true)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  if (enabled.length > 0) {
    const lines = enabled.map((r, idx) => {
      const title = (r.title || '').trim();
      const instruction = (r.instruction || '').trim();
      const num = idx + 1;
      if (title && instruction) return `${num}. **${title}** — ${instruction}`;
      if (title) return `${num}. **${title}**`;
      return `${num}. ${instruction}`;
    }).filter((s) => s.length > 0);

    if (lines.length > 0) {
      return `<data_update_rules>
${lines.join('\n\n')}
</data_update_rules>`;
    }
  }
  return '';
}

/**
 * Renderiza <context_rules> — cérebro analítico (DIFF COGNITIVO).
 *
 * Com defaults curados (Patricia): chama defaults.buildDiffCognitivo(config),
 * que monta texto monolítico do código respeitando toggles do banco (5 routines
 * ON/OFF) + params editáveis de audit_viability (zones, currency_rates).
 *
 * Sem defaults: comportamento antigo — struct → renderiza routines com
 * instructions e params editáveis pelo admin (incluindo textarea de "instrução"
 * por routine, que viola feedback_no_raw_prompts_in_ui mas é o legado).
 */
function renderCognitiveAudit(
  config: Record<string, unknown> | null | undefined,
  defaults: AgentDefaults | null,
  ctx: ResolverContext,
): string {
  // Defaults curados ganham — placeholders resolvidos
  if (defaults) {
    const rawText = defaults.buildDiffCognitivo(
      (config ?? null) as CognitiveAuditConfigFromDB | null,
    );
    const text = resolveAgentPlaceholders(rawText, ctx).trim();
    if (!text) return "";
    return `<context_rules>
${text}
</context_rules>`;
  }

  // Sem defaults: comportamento antigo (mantém pra outros agentes single_agent_v2 futuros)
  return renderCognitiveAuditLegacy(config);
}

/**
 * Implementação legada de renderCognitiveAudit — mantida pra agentes
 * single_agent_v2 sem defaults curados. Será removida quando todos os agentes
 * tiverem defaults no código.
 */
function renderCognitiveAuditLegacy(
  config: Record<string, unknown> | null | undefined,
): string {
  const cfg = (config || {}) as Record<string, { enabled?: boolean; instruction?: string; [k: string]: unknown }>;
  const keys = [
    'detect_contradictions',
    'detect_pending_promises',
    'detect_unanswered_questions',
    'detect_pitch_saturation',
    'audit_viability',
  ];

  const DEFAULTS: Record<string, { label: string; instruction: string }> = {
    detect_contradictions: {
      label: 'CONTRADIÇÕES DO LEAD',
      instruction:
        'Compare a última mensagem do lead com tudo que ele disse antes na MESMA conversa. Se há contradição factual relevante (clima vs destino, orçamento vs expectativa, presença de família, data passada vs futura), registre em `contradicao_detectada` como objeto { campos: [...], descricao: "..." }. Se não há, omita o campo.',
    },
    detect_pending_promises: {
      label: 'PROMESSAS PENDENTES',
      instruction:
        'Identifique a última promessa explícita que você fez e ainda não cumpriu ("vou verificar", "confirmo por email", "vou ver agenda"). Registre em `pendencias_patricia` como string curta. Se não há promessa pendente, omita o campo.',
    },
    detect_unanswered_questions: {
      label: 'PEDIDOS NÃO RESPONDIDOS',
      instruction:
        'Liste até 3 perguntas que o lead fez nos últimos 3 turnos dele que você ainda não respondeu diretamente. Registre em `perguntas_pendentes`.',
    },
    detect_pitch_saturation: {
      label: 'SATURAÇÃO DE PITCH',
      instruction:
        'Releia seus 5 últimos turnos. Conte ocorrências de oferta do pitch principal. Se >= 2 nos últimos 5 turnos, marque `pitch_saturado = true`.',
    },
    audit_viability: {
      label: 'AUDITORIA DE VIABILIDADE',
      instruction:
        'Quando temos orçamento e número de convidados, converta moeda estrangeira se necessário, calcule valor_por_convidado = orçamento / convidados, e classifique nas zonas configuradas. Use o resultado pra decidir próxima ação.',
    },
  };

  const blocks: string[] = [];
  let idx = 1;
  for (const key of keys) {
    const routine = cfg[key];
    if (!routine || routine.enabled !== true) continue;

    const def = DEFAULTS[key];
    const instruction = (routine.instruction && typeof routine.instruction === 'string' && routine.instruction.trim())
      ? routine.instruction.trim()
      : def.instruction;

    const lines = [`${idx}. ${def.label} — ${instruction}`];

    // Sub-params estruturados
    if (key === 'detect_pitch_saturation') {
      const keywords = Array.isArray(routine.pitch_keywords) ? routine.pitch_keywords : [];
      const win = typeof routine.window_turns === 'number' ? routine.window_turns : 5;
      const thr = typeof routine.threshold === 'number' ? routine.threshold : 2;
      if (keywords.length > 0) {
        lines.push(`   - Frases que contam como pitch: ${keywords.map((k) => `"${k}"`).join(', ')}`);
      }
      lines.push(`   - Janela: últimos ${win} turnos do agente. Threshold: ${thr} ocorrência(s).`);
    }

    if (key === 'audit_viability') {
      const budgetField = (routine.budget_field as string | undefined) ?? '';
      const guestsField = (routine.guests_field as string | undefined) ?? '';
      const zones = Array.isArray(routine.zones) ? routine.zones as Array<{ max_per_guest_brl?: number; label?: string; action?: string }> : [];
      const rates = Array.isArray(routine.currency_rates) ? routine.currency_rates as Array<{ from?: string; to_brl?: number }> : [];
      if (budgetField && guestsField) {
        lines.push(`   - Campos: orçamento=\`${budgetField}\`, convidados=\`${guestsField}\``);
      }
      if (rates.length > 0) {
        lines.push(`   - Cotações: ${rates.map((r) => `1 ${r.from} ≈ R$ ${r.to_brl}`).join(', ')}`);
      }
      if (zones.length > 0) {
        const sorted = [...zones].sort((a, b) => (a.max_per_guest_brl ?? 0) - (b.max_per_guest_brl ?? 0));
        lines.push(`   - Zonas (R$/convidado):`);
        sorted.forEach((z) => {
          lines.push(`     • até R$ ${z.max_per_guest_brl}/conv → \`${z.label}\` → ${z.action}`);
        });
      }
    }

    blocks.push(lines.join('\n'));
    idx++;
  }

  if (blocks.length > 0) {
    return `<context_rules>
${blocks.join('\n\n')}
</context_rules>`;
  }

  // Sem routines configuradas e sem defaults curados → bloco vazio.
  // (Suporte ao prompts_extra.context como fallback foi removido em 2026-05-21
  // junto com a eliminação do duplo prompt da Patricia.)
  return '';
}

/**
 * Renderiza a agenda real da agente lendo de scheduling_config (fonte única).
 * Em linguagem natural pra o LLM consumir sem precisar interpretar JSON.
 *
 * Elimina drift: se admin muda config no banco, LLM vê nova janela
 * automaticamente — não depende de admin sincronizar texto manualmente.
 */
function renderAgentSchedule(config: SchedulingConfig | null | undefined): string {
  if (!config) return "";
  const lines: string[] = [];

  // Dias úteis vs fim de semana
  if (config.skip_weekends === false) {
    lines.push("- Dias atendidos: segunda a domingo (incluindo fins de semana)");
  } else {
    lines.push("- Dias atendidos: segunda a sexta (sábado e domingo bloqueados)");
  }

  // Janelas — prioriza available_windows; cai pra available_hours como fallback
  if (config.available_windows && config.available_windows.length > 0) {
    const w = config.available_windows.map((win) => `${win.from}–${win.to}`).join(" e ");
    lines.push(`- Janelas de atendimento: ${w}`);
  } else if (config.available_hours && config.available_hours.length > 0) {
    lines.push(`- Horários disponíveis: ${config.available_hours.join(", ")}`);
  }

  // Duração da reunião
  if (config.slot_duration_minutes) {
    lines.push(`- Duração de cada reunião: ${config.slot_duration_minutes} minutos`);
  }

  // Antecedência mínima
  if (config.skip_today !== false) {
    lines.push("- Antecedência mínima: amanhã (não agenda pra hoje)");
  }

  if (lines.length === 0) return "";

  return `<agent_schedule>
Sua agenda real (use como fonte ÚNICA de verdade — nunca afirme janela diferente do que está aqui):
${lines.join("\n")}

Quando o casal pedir horário fora dessa janela, trate como escolha comercial da marca, não como incapacidade pessoal. NUNCA confabule disponibilidade que não está nessa lista.
</agent_schedule>`;
}

function renderVoice(voice: VoiceConfig): string {
  const toneTags = voice.tone_tags?.join(", ") || "";
  const rules = voice.rules || voice.custom_rules || [];
  const typicalPhrases = voice.typical_phrases || [];
  const forbiddenPhrases = voice.forbidden_phrases || [];

  let regionalisms = "";
  if (voice.regionalisms) {
    const r = voice.regionalisms;
    const parts: string[] = [];
    if (r.uses_a_gente) parts.push('Use "a gente" sempre, nunca "nós"');
    if (r.uses_voces_casal) parts.push('Use "vocês" pra falar com o casal');
    if (r.uses_gerundio === false) parts.push("Evite gerúndio (estou fazendo → faço)");
    if (r.casual_tu_mano === false) parts.push('Não use "tu", "mano", "cara"');
    if (parts.length) regionalisms = parts.map((p) => `- ${p}`).join("\n");
  }

  let emojiRule = "";
  if (voice.emoji_policy === "never") {
    emojiRule = "- ZERO emoji em qualquer mensagem";
  } else if (voice.emoji_policy === "after_rapport") {
    emojiRule = "- Zero emoji na PRIMEIRA mensagem (antes de estabelecer rapport). Depois, máx 1 por mensagem.";
  }

  return `<voice>
Tom: ${toneTags}
Formalidade (1=informal, 5=formal): ${voice.formality ?? 3}

Regras de tom:
${rules.map((r) => `- ${r}`).join("\n")}
${regionalisms ? "\n" + regionalisms : ""}
${emojiRule ? "\n" + emojiRule : ""}

Frases típicas (use natural, não force):
${typicalPhrases.map((p) => `- "${p}"`).join("\n")}

Frases proibidas (NUNCA usar):
${forbiddenPhrases.map((p) => `- "${p}"`).join("\n")}
</voice>`;
}

// Biblioteca de descrições padrão das boundaries — usada quando o admin
// NÃO customizou o texto. Mantém paridade com versões anteriores do prompt.
// Quando o admin edita item.custom_text via UI, esse override prevalece.
const LIBRARY_DESCRIPTIONS: Record<string, string> = {
  never_price: "NUNCA fale preço ou valor do serviço — apenas a especialista humana fala isso na reunião",
  never_transfer_explicit: "NUNCA diga 'vou passar', 'vou transferir', 'outra pessoa vai te atender' — handoff é invisível",
  never_ai_mention: "NUNCA mencione IA, robô, modelo, prompt, agente, chatbot, sistema, bastidores, automação",
  never_invent: "NUNCA dê informação sobre destino, política, prazo ou pacote sem ter chamado search_knowledge_base",
  never_cliche: "NUNCA use clichês: 'casamento dos sonhos', 'experiência premium', 'deixe conosco', 'transformamos sonhos em realidade'",
  never_emoji_first: "ZERO emoji na primeira mensagem (rapport ainda não estabelecido)",
  never_dash_separator: "ZERO travessões (—) ou hífens longos como separador de frases. Use vírgula, ponto, reticências",
  never_promise_deadline: "NUNCA prometa prazo específico (vou te responder em X minutos, etc)",
  never_negotiate_writing: "NUNCA negocie por escrito — negociação é só com a especialista humana",
  never_mention_competitor: "NUNCA mencione concorrente por nome",
  never_justify_question: "NUNCA justifique excessivamente uma pergunta (\"perdão por perguntar mas...\")",
  never_blame_customer: "NUNCA culpe o cliente por algo (mesmo se ele errou)",
  never_repeat_info: "NUNCA repita informação que o lead já deu",
  never_repeat_words: "NUNCA repita as mesmas palavras 2 turnos seguidos",
  never_ask_known_data: "NUNCA pergunte dado que já está no card (form_data)",
  never_assume_in_question: "NUNCA assuma resposta na pergunta ('vocês querem casar no Caribe ou nas Maldivas?' assume região)",
  never_stack_questions: "NUNCA empilhe perguntas sobre temas DIFERENTES na mesma mensagem. Pode fazer 2 perguntas COMPLEMENTARES sobre o mesmo tema.",
};

/**
 * Resolve o texto final de um item da biblioteca pra ir no prompt.
 *
 * Ordem de prioridade:
 * 1. custom_text (override do admin via UI)
 * 2. LIBRARY_DESCRIPTIONS[library_id] (texto padrão hardcoded — mantém paridade
 *    com versões anteriores)
 * 3. text (label da biblioteca, ex "Nunca falar preço")
 * 4. fallback genérico
 */
function resolveBoundaryText(item: {
  text?: string;
  custom_text?: string;
  library_id?: string;
}): string {
  if (item.custom_text && item.custom_text.trim()) return item.custom_text.trim();
  if (item.library_id && LIBRARY_DESCRIPTIONS[item.library_id]) {
    return LIBRARY_DESCRIPTIONS[item.library_id];
  }
  return (item.text || "").trim() || "(boundary sem texto)";
}

function renderBoundaries(
  boundaries: BoundariesConfig,
  defaults: AgentDefaults | null,
  ctx: ResolverContext,
): string {
  // Defaults curados (Patricia): renderiza Grupo A (admin escolhe via brand_active)
  // + Grupo B (design da IA, hardcoded). Placeholders resolvidos (ex: {honorario_faixa}).
  if (defaults) {
    const brandActive = (boundaries as unknown as { brand_active?: string[] }).brand_active;
    const competitors = (boundaries as unknown as { competitors_to_avoid?: string[] }).competitors_to_avoid;
    const rawText = defaults.buildBoundaries(brandActive, competitors);
    const text = resolveAgentPlaceholders(rawText, ctx).trim();
    if (!text) return "";
    return `<boundaries>
${text}
</boundaries>`;
  }

  // Sem defaults: comportamento antigo (by_category novo → fallback library_active legacy)
  const byCategory = boundaries.by_category as
    | Record<string, Array<{ text?: string; description?: string; enabled?: boolean; library_id?: string; custom_text?: string }>>
    | undefined;

  if (byCategory && Object.keys(byCategory).length > 0) {
    const categorias = Object.entries(byCategory)
      .map(([cat, items]) => {
        const enabledItems = (items || []).filter((it) => it?.enabled === true);
        if (enabledItems.length === 0) return null;
        const lines = enabledItems.map((it) => `- ${resolveBoundaryText(it)}`);
        return `## ${cat}\n${lines.join("\n")}`;
      })
      .filter((s): s is string => !!s);

    if (categorias.length === 0) {
      return `<boundaries>\n(Nenhuma linha vermelha ativa.)\n</boundaries>`;
    }
    return `<boundaries>\n${categorias.join("\n\n")}\n</boundaries>`;
  }

  // ── Fallback: legacy ────────────────────────────────────────────────
  const libraryActive = boundaries.library_active || [];
  const custom = boundaries.custom || [];
  const customByCat = boundaries.custom_by_category || {};

  const libRules = libraryActive
    .map((id) => LIBRARY_DESCRIPTIONS[id] || `(boundary desconhecida: ${id})`)
    .map((d) => `- ${d}`)
    .join("\n");

  const customByCatRules = Object.entries(customByCat)
    .map(([cat, rules]) =>
      `## ${cat}:\n${(rules as string[]).map((r) => `- ${r}`).join("\n")}`
    )
    .join("\n\n");

  return `<boundaries>
## Regras Absolutas (linha vermelha)
${libRules}

${custom.length ? `## Regras Custom\n${custom.map((c) => `- ${c}`).join("\n")}` : ""}

${customByCatRules}
</boundaries>`;
}

function renderListening(listening: ListeningConfig): string {
  const parts: string[] = [];

  if (listening.echo_social_questions) {
    parts.push(
      "- Se o lead fizer pergunta social ('e você?', 'tudo bem?'), responda BREVEMENTE antes de seguir o roteiro. Ignorar = falha de educação básica.",
    );
  }
  if (listening.acknowledge_observations) {
    parts.push(
      "- Se o lead fizer observação espontânea (algo fora do funil), reconheça em 1 frase antes de continuar.",
    );
  }
  if (listening.handle_message_bursts) {
    parts.push(
      "- Se o lead mandar 3+ mensagens curtas seguidas, leia TODAS antes de responder. Não responda só a última.",
    );
  }
  if (listening.never_ignore_lead) {
    parts.push(
      "- Se o lead trouxe novidade não pedida (ex: revelou nome, data, destino), reconheça antes de avançar.",
    );
  }

  if (listening.examples?.length) {
    parts.push("\nExemplos de escuta ativa:");
    listening.examples.forEach((ex) => parts.push(`  - ${ex}`));
  }

  if (parts.length === 0) return "";

  return `<listening>
Você responde de forma humana, não como formulário sequencial.
${parts.join("\n")}
</listening>`;
}

function renderPlaybook(
  moments: PlaybookMoment[],
  state?: BuildSinglePromptInput["conversationState"],
): string {
  // Quando o moment ativo é wait_for_reply sequenciado, mascara os blocos
  // futuros do moment atual no playbook geral. O LLM continua sabendo que
  // existem N blocos, mas só vê o conteúdo do bloco ativo aqui (também
  // detalhado no <turn_policy>). Sem isso, o modo literal copia todos os
  // blocos de uma vez. Outros moments seguem renderizados por completo.
  const activeKey = state?.last_moment_key ?? null;
  const activeStep = state?.moment_step ?? 0;
  if (moments.length === 0) {
    return `<playbook>
(Nenhum momento configurado. Aja com base na identity, voice, boundaries.)
</playbook>`;
  }

  const modeHint: Record<string, string> = {
    literal:
      "⚠️ LITERAL: copie o anchor_text PALAVRA-POR-PALAVRA. Admin curou cada caractere. Não mude estilo, tom, emoji, ordem.",
    faithful:
      "📌 FAITHFUL: o anchor é guia semântico (~90% cobertura). Mantenha estrutura e frases-chave, adapte tom se necessário pra soar natural.",
    free:
      "🎯 FREE: o anchor é inspiração. Capture a essência mas use suas próprias palavras, respeitando red_lines.",
  };

  const triggerDesc = (m: PlaybookMoment): string => {
    if (m.trigger_type === "primeiro_contato") return "primeiro contato (lead nunca conversou antes)";
    if (m.trigger_type === "lead_respondeu") return "lead respondeu (qualquer mensagem após abertura)";
    if (m.trigger_type === "always") return "sempre (fallback final)";
    if (m.trigger_type === "manual") return "manual (decisão sua)";
    if (m.trigger_type === "keyword") {
      const kws = (m.trigger_config as { keywords?: string[] })?.keywords || [];
      return `keyword (${kws.slice(0, 8).join(", ")}${kws.length > 8 ? ", …" : ""})`;
    }
    if (m.trigger_type === "score_threshold") {
      const cfg = m.trigger_config as { value?: number; operator?: string };
      return `score ${cfg.operator || ">="} ${cfg.value || "?"}`;
    }
    return m.trigger_type;
  };

  const renderOne = (m: PlaybookMoment, idx: number): string => {
    const lines: string[] = [];
    lines.push(`### ${idx + 1}. ${m.moment_label} (\`${m.moment_key}\`)`);
    lines.push(`- **Quando aplicar:** ${triggerDesc(m)}`);
    lines.push(`- **Tipo:** ${m.kind === "flow" ? "FLOW (fase do funil, sequencial)" : "PLAY (jogada situacional, interrompe pra atender e volta)"}`);
    if (m.intent) lines.push(`- **Intenção:** ${m.intent}`);
    lines.push(`- **Modo:** ${modeHint[m.message_mode] || m.message_mode}`);
    const parts = resolveMomentParts(m);
    const isSequencedWait = m.delivery_mode === "wait_for_reply" && parts.length > 1;
    const isActiveMoment = activeKey === m.moment_key;
    if (isSequencedWait) {
      lines.push(`- **Sequência de blocos** (${parts.length} blocos, um por rodada de envio — espera resposta do lead entre cada):`);
      parts.forEach((p, i) => {
        // Quando é o moment ATIVO, mascara blocos diferentes do ativo pra
        // evitar que o LLM copie conteúdo futuro de uma vez. O bloco ativo
        // continua visível aqui E também no <turn_policy>.
        if (isActiveMoment && i !== activeStep) {
          lines.push(`  - **Bloco ${i + 1} de ${parts.length}:** (texto mascarado — virá em turno futuro quando o router avançar pra este bloco)`);
        } else {
          lines.push(`  - **Bloco ${i + 1} de ${parts.length}:**${isActiveMoment && i === activeStep ? " ← VOCÊ ESTÁ AQUI NESTE TURNO" : ""}`);
          lines.push("    ```");
          p.split("\n").forEach((line) => lines.push(`    ${line}`));
          lines.push("    ```");
        }
      });
    } else if (m.anchor_text) {
      lines.push(`- **Anchor text:**`);
      lines.push("  ```");
      m.anchor_text.split("\n").forEach((line) => lines.push(`  ${line}`));
      lines.push("  ```");
    }
    if (m.must_cover?.length) {
      lines.push(`- **Pontos a cobrir (must_cover):**`);
      m.must_cover.forEach((p) => lines.push(`  - ${p}`));
    }
    if (m.literal_phrases?.length) {
      lines.push(`- **Frases obrigatórias (literal_phrases):**`);
      m.literal_phrases.forEach((p) => lines.push(`  - "${p}"`));
    }
    if (m.red_lines?.length) {
      lines.push(`- **Red lines (NUNCA fazer):**`);
      m.red_lines.forEach((r) => lines.push(`  - ${r}`));
    }
    if (m.collects_fields?.length) {
      lines.push(`- **Coleta os campos:** ${m.collects_fields.join(", ")}`);
    }
    if (m.discovery_config?.slots?.length) {
      lines.push(`- **Slots de descoberta:**`);
      m.discovery_config.slots.forEach((s) => {
        lines.push(`  - \`${s.crm_field_key}\` ${s.required ? "(obrigatório)" : "(opcional)"}: ${s.label}`);
        if (s.questions?.length) {
          lines.push(`    Perguntas exemplo: ${s.questions.map((q) => `"${q}"`).join(" | ")}`);
        }
      });
    }
    if (m.delivery_mode === "wait_for_reply") {
      lines.push(`- **Entrega:** UMA mensagem só, espera lead responder antes de seguir.`);
    }
    return lines.join("\n");
  };

  const flow = moments.filter((m) => m.kind === "flow");
  const play = moments.filter((m) => m.kind === "play");

  let block = `<playbook>
Você tem ${moments.length} momentos. Decida QUAL aplicar AGORA com base no estado da conversa, gatilhos abaixo e raciocínio próprio.

## FLOW (fases sequenciais do funil — siga ordem natural)

${flow.map((m, i) => renderOne(m, i)).join("\n\n")}

`;

  if (play.length) {
    block += `## PLAY (jogadas situacionais — interrompem o flow quando gatilho bate)

${play.map((m, i) => renderOne(m, i)).join("\n\n")}

`;
  }

  block += `## REGRAS DE TRANSIÇÃO

- Não mude de momento por impulso. Se está em FLOW, fica até completar slots críticos.
- PLAY interrompe FLOW quando gatilho bate (ex: lead pergunta preço → objecao_preco). Depois do PLAY, volta pro FLOW que estava.
- Em momento LITERAL, copie o anchor sem mudar. Em FAITHFUL, mantenha estrutura. Em FREE, gere natural respeitando red_lines.
- Se não tiver certeza qual aplicar, escolha o último FLOW conhecido OU o flow mais recente que faça sentido.
</playbook>`;

  return block;
}

function renderSilentSignals(signals: PlaybookSilentSignal[]): string {
  if (signals.length === 0) return "";

  return `<silent_signals>
Sinais que você detecta em SILÊNCIO (registra no card via card_patch, NUNCA comenta na conversa):

${signals.map((s, i) => {
    const lines: string[] = [];
    lines.push(`${i + 1}. **${s.signal_label}** (\`${s.signal_key}\` → \`${s.crm_field_key}\`)`);
    lines.push(`   - Como detectar: ${s.detection_hint}`);
    if (s.how_to_use) lines.push(`   - Como usar: ${s.how_to_use}`);
    return lines.join("\n");
  }).join("\n\n")}
</silent_signals>`;
}

function renderQualification(rules: ScoringRule[], threshold: number): string {
  if (rules.length === 0) {
    return `<qualification>
Não há regras de scoring configuradas. Decida qualificação por feeling, baseando-se em sinais como destino mainstream/exótico, tamanho do convite, sinais de poder aquisitivo.
</qualification>`;
  }

  const qualify = rules.filter((r) => r.rule_type === "qualify");
  const disqualify = rules.filter((r) => r.rule_type === "disqualify");
  const bonus = rules.filter((r) => r.rule_type === "bonus");

  const renderRule = (r: ScoringRule): string => {
    const cv = r.condition_value as Record<string, unknown>;
    let desc = r.label || r.dimension;
    if (cv.formula === "value_per_guest") {
      const min = cv.min as number | null;
      const max = cv.max as number | null;
      if (max == null) desc = `Valor por convidado >= R$ ${min}`;
      else desc = `Valor por convidado entre R$ ${min} e R$ ${max}`;
    } else if (cv.formula === "budget_below") {
      desc = `Orçamento total < R$ ${cv.value}`;
    } else if (cv.formula === "budget_above") {
      desc = `Orçamento total > R$ ${cv.value}`;
    } else if (cv.question) {
      desc = `${desc}: ${(cv.question as string).substring(0, 200)}`;
    }
    return `- (${r.weight > 0 ? "+" : ""}${r.weight}) ${desc}`;
  };

  return `<qualification>
Threshold pra qualificar: **${threshold} pontos**.

## Como funciona
Você NÃO calcula a nota. Quando precisar saber se o casal qualifica, chame a tool **calculate_qualification_score** com os campos do card (\`form_data\`). O servidor aplica fórmulas determinísticas e retorna \`{score, breakdown, qualificado}\`.

## Regras (referência — NÃO calcule sozinho)

### Pontos pra qualificar:
${qualify.map(renderRule).join("\n")}

${bonus.length ? `### Bônus:\n${bonus.map(renderRule).join("\n")}\n` : ""}
${disqualify.length ? `### Desqualifica (peso 0 mas marca como red flag):\n${disqualify.map(renderRule).join("\n")}\n` : ""}

## Quando chamar a tool
- Ao final da Sondagem (já tem destino + data + convidados + investimento)
- Quando lead revela info nova que muda score (ex: confirma viagem internacional recente, família ajuda)
- Antes de decidir entre desfecho_qualificado vs desfecho_nao_qualificado
</qualification>`;
}

function renderFewShots(examples: PlaybookFewShotExample[]): string {
  if (examples.length === 0) return "";

  return `<examples>
Exemplos curados pelo admin (referência de tom + estrutura — não copiar literal):

${examples.slice(0, 5).map((ex, i) => {
    return `### Exemplo ${i + 1}${ex.related_moment_key ? ` (momento: ${ex.related_moment_key})` : ""}
Lead: "${ex.lead_message}"
Você: "${ex.agent_response}"
${ex.context_note ? `Contexto: ${ex.context_note}` : ""}`;
  }).join("\n\n")}
</examples>`;
}

function renderConversationState(
  state: BuildSinglePromptInput["conversationState"],
): string {
  const formDataLines: string[] = [];
  if (state.card_form_data) {
    Object.entries(state.card_form_data)
      .filter(([_, v]) => v != null && v !== "" && v !== false)
      .slice(0, 30)
      .forEach(([k, v]) => {
        formDataLines.push(`  - ${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
      });
  }

  return `<conversation_state>
- **Turno:** ${state.turn_count}${state.is_primeiro_contato ? " (PRIMEIRO CONTATO)" : ""}
- **Contato (lead):** ${state.contact_name || "(nome ainda não revelado)"}
- **Card:** ${state.card_titulo || "(sem título)"}
- **Último momento:** ${state.last_moment_key || "(nenhum)"}

## Resumo IA (atualizado pelo turno anterior)
${state.ai_resumo || "(vazio — primeiro contato ou conversa nova)"}

## Contexto IA (atualizado pelo turno anterior)
${state.ai_contexto || "(vazio)"}

## Dados estruturados do card (form_data)
${formDataLines.length > 0 ? formDataLines.join("\n") : "(card sem campos preenchidos ainda)"}

## Histórico compacto da conversa
${state.historico_compacto || "(sem histórico — primeiro contato)"}
</conversation_state>`;
}

/**
 * Renderiza o resultado da RPC de scoring quando o router chamou determinístico
 * antes do LLM. Quando presente, o LLM tem o score já calculado como
 * contexto autoritativo — NÃO precisa (nem deve) chamar a tool de novo.
 */
function renderQualificationResult(
  result: BuildSinglePromptInput["conversationState"]["qualification_result"] | undefined,
): string {
  if (!result) return "";
  const status = result.qualificado ? "✅ QUALIFICOU" : "❌ NÃO QUALIFICOU";
  const breakdownStr = result.breakdown
    ? `\n\n## Breakdown\n\`\`\`json\n${JSON.stringify(result.breakdown, null, 2)}\n\`\`\``
    : "";
  return `<qualification_result>
🎯 SCORE JÁ CALCULADO PELO ROUTER (use como contexto autoritativo, NÃO chame a tool de novo)

- **Status:** ${status}
- **Score:** ${result.score}${breakdownStr}

Este resultado é referência determinística e cobre 95% dos casos. EXCEÇÃO única: quando seus princípios (especialmente "faço a conta de viabilidade antes de qualificar") indicarem inviabilidade econômica clara que o score técnico não captura (ex: valor por convidado < R$ 800 após conversão de moeda), o caráter sobrepõe o score — vá para desfecho_nao_qualificado mesmo que aqui apareça \`QUALIFICOU\`. O \`turn_policy\` abaixo te diz qual momento usar.
</qualification_result>`;
}

/**
 * Renderiza os 3 horários propostos quando o router decidiu desfecho_qualificado.
 * LLM deve apresentar verbatim na mensagem final, oferecendo escolha ao casal.
 */
/**
 * Agrupa slots pelo dia (weekday + date), preservando ordem cronológica.
 * Ex: [qui 14/05 10:00, qui 14/05 14:00, sex 15/05 10:00] →
 *     [{weekday: qui, date: 14/05, times: [10:00, 14:00]},
 *      {weekday: sex, date: 15/05, times: [10:00]}]
 */
type GroupedSlot = { weekday: string; date: string; times: string[] };

function groupSlotsByDay(
  slots: Array<{ date: string; time: string; weekday: string }>,
): GroupedSlot[] {
  const map = new Map<string, GroupedSlot>();
  for (const s of slots) {
    const key = `${s.weekday}|${s.date}`;
    const g = map.get(key);
    if (g) g.times.push(s.time);
    else map.set(key, { weekday: s.weekday, date: s.date, times: [s.time] });
  }
  return Array.from(map.values());
}

/**
 * Formata uma lista de horários com bold WhatsApp + conector natural.
 * ["10:00"] → "*10:00*"
 * ["10:00", "14:00"] → "*10:00* ou *14:00*"
 * ["10:00", "14:00", "16:00"] → "*10:00*, *14:00* ou *16:00*"
 */
function formatGroupedTimes(times: string[]): string {
  const bold = times.map((t) => `*${t}*`);
  if (bold.length <= 1) return bold[0] || "";
  if (bold.length === 2) return `${bold[0]} ou ${bold[1]}`;
  const last = bold[bold.length - 1];
  return `${bold.slice(0, -1).join(", ")} ou ${last}`;
}

/**
 * Renderiza slots agrupados por dia. Retorna duas formas:
 *   - asList: linhas separadas pra bullet/numbered list
 *   - asInline: frase única pra substituir placeholder em anchor_text
 *
 * Exemplo (3 horários em 2 dias):
 *   asList:
 *     - "*qui 14/05* às *10:00*, *14:00* ou *16:00*"
 *     - "*sex 15/05* às *10:00*, *14:00* ou *16:00*"
 *   asInline:
 *     "*qui 14/05* às *10:00*, *14:00* ou *16:00* ou *sex 15/05* às *10:00*, *14:00* ou *16:00*"
 */
function formatSlotsGrouped(
  slots: Array<{ date: string; time: string; weekday: string }>,
): { asList: string[]; asInline: string } {
  const groups = groupSlotsByDay(slots);
  const asList = groups.map((g) =>
    `*${g.weekday} ${g.date}* às ${formatGroupedTimes(g.times)}`
  );
  let asInline: string;
  if (asList.length === 0) {
    asInline = "";
  } else if (asList.length === 1) {
    asInline = asList[0];
  } else if (asList.length === 2) {
    asInline = `${asList[0]} ou ${asList[1]}`;
  } else {
    const last = asList[asList.length - 1];
    asInline = `${asList.slice(0, -1).join(", ")} ou ${last}`;
  }
  return { asList, asInline };
}

/**
 * Renderiza resultados de tools executadas pelo router antes desta chamada
 * do LLM (agentic loop curto). Quando presente, o LLM DEVE basear sua
 * resposta nesses resultados, sem inventar.
 *
 * Hoje cobre check_calendar (negociação de data fora dos slots iniciais).
 */
function renderToolResults(
  results: BuildSinglePromptInput["conversationState"]["tool_results"] | undefined,
): string {
  if (!results || Object.keys(results).length === 0) return "";
  const lines: string[] = [];
  for (const [toolName, payload] of Object.entries(results)) {
    if (toolName === "check_calendar") {
      const r = payload as { slots_disponiveis?: Array<{ date: string; time: string; weekday: string }>; note?: string | null };
      const slots = r.slots_disponiveis || [];
      const note = r.note || null;
      lines.push(`📅 **check_calendar** retornou:`);
      if (slots.length === 0) {
        lines.push(`- Nenhum horário disponível na data/range solicitado.`);
        if (note) lines.push(`- Motivo: ${note}`);
        lines.push(`- ⚠️ Explique honestamente ao lead (use o motivo acima) e ofereça outra data próxima. NÃO re-ofereça os mesmos slots originais de \`<proposed_slots>\`.`);
      } else {
        lines.push(`- Horários DISPONÍVEIS na agenda da Wedding Planner agora (fonte de verdade — não invente fora dessa lista):`);
        const { asList } = formatSlotsGrouped(slots);
        for (const line of asList) {
          lines.push(`  - ${line}`);
        }
        if (note) lines.push(`- Observação do sistema: ${note}`);
        lines.push(`- Use essa lista como verdade da agenda. Responda ao lead com naturalidade — pode apresentar, pode dizer que um horário específico não tem (oferecendo os próximos), pode confirmar diretamente o que ele aceitou. NÃO invente horários fora dessa lista, NÃO repita ela inteira se você já mostrou antes. Quando o lead confirmar um horário, chame \`confirm_meeting_slot\` com date+time correspondente.`);
      }
    } else {
      // Outras tools: render genérico
      lines.push(`📦 **${toolName}** retornou: \`${JSON.stringify(payload)}\``);
    }
  }
  return `<tool_results>
🛠️ Resultados de tools que o router já executou ANTES desta resposta. Use estes dados como fonte de verdade.

${lines.join("\n")}
</tool_results>`;
}

function renderProposedSlots(
  slots: BuildSinglePromptInput["conversationState"]["proposed_slots"] | undefined,
): string {
  if (!slots || slots.length === 0) return "";
  // Formato bold WhatsApp: *texto* (asterisco simples). WhatsApp não renderiza
  // Markdown **texto**. Padronizar aqui evita LLM ter que traduzir formato.
  // Slots agrupados por dia: quando há vários horários no mesmo dia, sai
  // como "*qui 14/05* às *10:00*, *14:00* ou *16:00*" (não repete o dia).
  const { asList } = formatSlotsGrouped(slots);
  const lines = asList.map((line, i) => `  ${i + 1}. ${line}`).join("\n");
  return `<proposed_slots>
📅 HORÁRIOS DA WEDDING PLANNER (pré-buscados pelo router, use verbatim)

${lines}

Apresente os horários ao casal EXATAMENTE no formato agrupado acima — quando há vários horários no mesmo dia (ex: "*qui 14/05* às *10:00*, *14:00* ou *16:00*"), NÃO repita o dia da semana e a data várias vezes. NÃO invente outras opções. NÃO mude o formato dos dias/horários — mesmo pra lead premium, **mantenha "qua 27/05 às 09:00", NÃO escreva "quarta-feira, dia 27 de maio, às 09h00"**. O formato compacto é decisão de marca, não cabe reformatar. Os asteriscos simples (\`*texto*\`) são a sintaxe de bold do WhatsApp — preserve EXATAMENTE assim, sem dobrar pra \`**\` e sem remover. Se o casal pedir alternativa, chame \`check_calendar\` em vez de repetir os mesmos horários.
</proposed_slots>`;
}

/**
 * Bloco que diz ao LLM qual é o "bloco ativo" deste turno e como se comportar
 * frente aos blocos seguintes (caso o momento atual seja sequenciado wait_for_reply).
 *
 * O router pré-calcula `moment_step` antes de chamar o LLM:
 *   - 0 = primeiro bloco do moment OU moment não-sequenciado
 *   - N = está retornando ao mesmo moment depois do lead responder; envie o N-ésimo bloco
 *
 * O LLM continua livre para mudar de moment (escolher current_moment_key diferente
 * do last_moment_key). Nesse caso o router reseta o step para 0 automaticamente.
 *
 * **Forced moment** (novo): quando o router pré-decide um momento via trigger
 * determinístico (ex: desfecho_qualificado ao fim da sondagem), `forced_moment_key`
 * sobrescreve a escolha do LLM. Útil pra garantir que conversas terminem com
 * proposta concreta de reunião, e não em "deu pra entender o cenário".
 */
function renderTurnPolicy(
  moments: PlaybookMoment[],
  state: BuildSinglePromptInput["conversationState"],
): string {
  // Fix 1.4 (2026-05-24) — Contradição detectada no turn ANTERIOR: instrução obrigatória de devolver
  //
  // Quando self_analysis.contradicao_detectada do turn anterior populou, o LLM
  // PRECISA ecoar os dois polos antes de qualquer outra coisa. Se ignorar,
  // validator (rule responder_contradicao_do_lead) bloqueia → fallback dispara.
  // Instrução vai como PREFIXO do turn_policy pra garantir prioridade na atenção.
  const contrad = state.contradicao_detectada;
  let contradicaoPrefix = "";
  if (contrad && (contrad.descricao || (contrad.campos && contrad.campos.length > 0))) {
    const camposStr = (contrad.campos || []).join(" ↔ ");
    contradicaoPrefix = `🚨 CONTRADIÇÃO DETECTADA NO TURN ANTERIOR — AÇÃO OBRIGATÓRIA NESTE TURN

Você (Patricia) detectou no turn anterior, via self_analysis, que o lead deu informações contraditórias:
${camposStr ? `- Campos em conflito: ${camposStr}` : ""}
${contrad.descricao ? `- Descrição: ${contrad.descricao}` : ""}

ANTES de qualquer outra ação neste turn (mesmo se o moment é forçado), VOCÊ DEVE:
1. Devolver os DOIS polos da contradição com clareza ("Vocês mencionaram X e também Y, faz sentido querer os dois?")
2. Fazer pergunta aberta de desambiguação ("Qual dos dois é o que pesa mais pra vocês?")
3. SÓ DEPOIS continuar fluxo normal (sondagem, agendamento, etc.)

Se ignorar a contradição, o validator vai bloquear sua mensagem (regra responder_contradicao_do_lead).

`;
  }

  // Fix 1.3 (2026-05-24) — Lead pronto pra fechar mas sem dados mínimos: sondagem focada
  //
  // Quando lead_intent="pronto_pra_fechar" do turn anterior + não há forced_moment_key
  // (trigger determinístico não disparou porque faltam críticos), o LLM deve
  // PULAR pitch genérico (bloco 2 abertura) e ir direto pra sondagem mínima.
  // Cobre cenário Renata observado em 23/05.
  const isReadyToClose = state.last_lead_intent === "pronto_pra_fechar";
  const noForcedMoment = !state.forced_moment_key;
  let readyToClosePrefix = "";
  if (isReadyToClose && noForcedMoment) {
    readyToClosePrefix = `🎯 LEAD COM ALTA INTENÇÃO DE FECHAR — SONDAGEM MÍNIMA E DIRETA

Você detectou no turn anterior que o lead está pronto pra marcar (pediu reunião, horário ou agenda explicitamente; disse "já vi tudo de vocês" + intenção de fechar). MAS ainda faltam dados mínimos pra confirmar viabilidade econômica (destino, convidados, orçamento).

NESTE TURN:
- NÃO repita apresentação institucional da Welcome (ano, prêmios, "desde 2012"). Lead já viu.
- NÃO use "O que é o casamento pra vocês? Como vocês imaginam?". Lead já decidiu marcar.
- VÁ DIRETO: peça os 2-3 dados essenciais de forma natural e curta. Ex: "Antes de confirmar com a Ana, me ajuda com 2 coisas rápidas: quantos convidados vocês imaginam e qual destino tá no radar?".
- Quando tiver orçamento + convidados, o router vai disparar viabilidade e decidir qualificar ou desqualificar honestamente.

`;
  }

  const prefix = contradicaoPrefix + readyToClosePrefix;

  // -------- Forced moment (trigger determinístico do router) --------------
  // Tem prioridade sobre last_moment_key. LLM DEVE usar esse momento.
  const forcedKey = state.forced_moment_key;
  if (forcedKey) {
    const forced = moments.find((m) => m.moment_key === forcedKey);
    if (forced) {
      const parts = resolveMomentParts(forced);
      let baseText = parts[0] || forced.anchor_text || "";
      // Substitui placeholder {slots_disponiveis} pela frase com horários
      // agrupados por dia. Quando há vários horários no mesmo dia, sai
      // "*qui 14/05* às *10:00*, *14:00* ou *16:00*" sem repetir o dia.
      // Múltiplos dias são unidos com " ou ": "... ou *sex 15/05* às *10:00*, *14:00* ou *16:00*".
      if (baseText.includes("{slots_disponiveis}") && state.proposed_slots && state.proposed_slots.length > 0) {
        const { asInline } = formatSlotsGrouped(state.proposed_slots);
        baseText = baseText.replaceAll("{slots_disponiveis}", asInline);
      }
      const isLiteral = forced.message_mode === "literal";
      const isFaithful = forced.message_mode === "faithful";
      const modeNote = isLiteral
        ? "Modo LITERAL: copie verbatim. Cada palavra foi curada."
        : isFaithful
        ? "Modo FAITHFUL: até 10% pode trocar pra fluir, estrutura e perguntas idênticas."
        : "Modo FREE: capture a essência com suas palavras, mas mantenha estrutura.";

      return `<turn_policy>
${prefix}🎯 ESTRATÉGIA DESTE TURNO — MOMENTO FORÇADO PELO ROUTER

O router já decidiu por você: o momento deste turno é **\`${forced.moment_key}\`** (${forced.moment_label}).
Isso aconteceu porque o estado da conversa (dados coletados + score calculado) bate exatamente com a condição deste momento. Não há ambiguidade.

═══ TEXTO-BASE DO MOMENTO ═══
${baseText}
═══ FIM DO TEXTO-BASE ═══

⛔ REGRAS:
- ${modeNote}
- Marque \`current_moment_key\` = "${forced.moment_key}".
- NÃO chame a tool \`calculate_qualification_score\` — o router já calculou e o resultado está em \`<qualification_result>\`.
${state.proposed_slots && state.proposed_slots.length > 0
  ? `- Apresente TODOS os ${state.proposed_slots.length} horários de \`<proposed_slots>\` verbatim e peça pro casal escolher um. Cada slot tem date+time exatos — não omita nenhum.
- ⚠️ AGENDAMENTO: quando o casal escolher/aceitar um dos horários, a ÚNICA tool válida é \`confirm_meeting_slot\` com { date, time } da escolha exata. NUNCA use \`create_task\` pra agendar reunião com a Wedding Planner — \`create_task\` é só pra tarefas internas administrativas.
- Sem chamar a tool, a reunião NÃO entra na agenda real da Wedding Planner — só você sabe. Sempre chame a tool ao confirmar.
- 🔄 NEGOCIAÇÃO DE DATA: se o casal pedir uma data ou horário FORA dos slots de \`<proposed_slots>\` (ex: 'tem dia 17?', 'antes de quinta?', 'na semana que vem?', 'manhã do dia 20?'), CHAME a tool \`check_calendar\` com a data/range que o casal pediu. NÃO repita os mesmos slots originais. NÃO diga 'vou checar' sem chamar a tool. Apresente os slots retornados pela tool. Se vier vazio, leia o \`note\` e explique honestamente (ex: 'esse dia cai num domingo e a Wedding Planner não atende — quer que eu veja na segunda 18/05?').`
  : ""}
${forced.must_cover && forced.must_cover.length > 0
  ? `- Cubra todos os pontos de \`must_cover\` do momento.`
  : ""}
${forced.literal_phrases && forced.literal_phrases.length > 0
  ? `- Inclua TODAS as literal_phrases do momento integralmente.`
  : ""}

🔀 EXCEÇÃO única — se o lead acabou de mandar uma objeção FORTE ou pedido explícito que contradiz o momento forçado (ex: "não quero marcar reunião, só quero saber preço"), você pode escolher outro \`current_moment_key\` correspondente (ex: \`objecao_preco\`). Mas em conversa normal, NÃO desvie.
</turn_policy>`;
    }
  }

  const lastKey = state.last_moment_key;
  const step = state.moment_step ?? 0;

  if (!lastKey) {
    return `<turn_policy>
${prefix}🎯 ESTRATÉGIA DESTE TURNO

Você está iniciando a conversa OU não havia momento anterior. Escolha o moment de FLOW apropriado (geralmente o primeiro: abertura). Use o Bloco 1 dele se houver sequência.
</turn_policy>`;
  }

  const moment = moments.find((m) => m.moment_key === lastKey);
  if (!moment) {
    return `<turn_policy>
${prefix}🎯 ESTRATÉGIA DESTE TURNO

Último moment registrado ("${lastKey}") não está mais disponível no playbook. Reescolha o moment correto pelo estado da conversa.
</turn_policy>`;
  }

  const parts = resolveMomentParts(moment);
  const isSequencedWait = moment.delivery_mode === "wait_for_reply" && parts.length > 1;

  if (!isSequencedWait) {
    return `<turn_policy>
${prefix}🎯 ESTRATÉGIA DESTE TURNO

Último moment: \`${moment.moment_key}\` (${moment.delivery_mode || "all_at_once"})

Esse moment NÃO tem blocos sequenciais. Você pode mudar de moment livremente se o estado pedir, ou continuar nele se a conversa ainda demanda. Decida pelo contexto.
</turn_policy>`;
  }

  const inRange = step >= 0 && step < parts.length;
  const activeIdx = inRange ? step : 0;
  const isLast = activeIdx === parts.length - 1;
  const isLiteral = moment.message_mode === "literal";
  const isFaithful = moment.message_mode === "faithful";

  return `<turn_policy>
${prefix}🎯 ESTRATÉGIA DESTE TURNO — REGRAS DURAS, NÃO OPCIONAIS

Você está no moment \`${moment.moment_key}\` (${moment.moment_label}), **Bloco ${activeIdx + 1} de ${parts.length}**.

═══ TEXTO-BASE DO BLOCO ATIVO ═══
${parts[activeIdx]}
═══ FIM DO TEXTO-BASE ═══

⛔ REGRA #1 — UM BLOCO POR TURNO (INVIOLÁVEL):
- O array \`messages\` DEVE conter **exatamente 1 elemento** neste turno.
- Esse 1 elemento cobre **APENAS o Bloco ${activeIdx + 1}**. Não pode conter conteúdo dos Blocos ${activeIdx + 2 <= parts.length ? activeIdx + 2 : "—"}${parts.length > activeIdx + 2 ? `, ${activeIdx + 3}` : ""}${parts.length > activeIdx + 3 ? ", …" : ""}.
- Se você sentir vontade de "completar a apresentação" ou "avançar a conversa", PARE. O router vai chamar você de novo no próximo turno e enviar o Bloco ${activeIdx + 2 <= parts.length ? activeIdx + 2 : "(próximo do flow)"} naturalmente.

⛔ REGRA #2 — REAGIR AO LEAD SEM ANTECIPAR:
- Pode adicionar uma frase curta de reação à última mensagem do lead (ex: "Tudo bem também, Vitor.") **DENTRO da mesma mensagem** que cobre o Bloco ${activeIdx + 1}.
- NÃO crie um array \`messages\` com 2 elementos (um pra reação + outro pro bloco). Funde tudo numa mensagem só.

⛔ REGRA #3 — NÃO TRUNCAR O BLOCO:
${isLiteral
  ? `- Modo LITERAL: copie o texto-base **palavra por palavra**. Se o bloco contém múltiplas perguntas (ex: "X? E Y?"), envie TODAS — nunca corte a segunda. Admin curou cada caractere.`
  : isFaithful
  ? `- Modo FAITHFUL: até 10% das palavras podem trocar pra fluir, mas estrutura, ordem e número de perguntas ficam idênticos ao texto-base.`
  : `- Modo FREE: capture a essência. Se o texto-base tem múltiplas perguntas, mantenha todas mesmo adaptando.`}
${moment.literal_phrases && moment.literal_phrases.length > 0
  ? `- Atenção: as literal_phrases do moment (frases obrigatórias) DEVEM aparecer integralmente. Não omita nenhuma.`
  : ""}

✅ APÓS O TURNO:
- Marque \`current_moment_key\` = "${moment.moment_key}".
${isLast
  ? `- Este é o ÚLTIMO bloco. Próximo turno será de outro moment do flow.`
  : `- Router avança automaticamente para o Bloco ${activeIdx + 2} no próximo turno.`}

🔀 EXCEÇÃO (mudança de moment):
- Se o lead trouxe objeção, pergunta nova, ou mudou de assunto totalmente, você PODE escolher outro \`current_moment_key\` (ex: \`objecao_preco\`). Aí o router reseta a contagem. Mas SE você continuar em \`${moment.moment_key}\`, então as Regras #1, #2 e #3 acima são obrigatórias.
</turn_policy>`;
}

/**
 * Descrições padrão das tools built-in. Mantém paridade com versões
 * anteriores. Quando o agente define `tool_descriptions[tool_name]`, esse
 * override prevalece sobre o texto aqui.
 */
export const DEFAULT_TOOL_DESCRIPTIONS: Record<string, string> = {
  calculate_qualification_score:
    "Aplica fórmulas determinísticas de scoring. Args: { fields: { destino, valor_total, num_convidados, ...} }. Retorna { score, breakdown, qualificado }. Use ao fim da sondagem. NOTA: se o contexto já exibe <qualification_result>, esta tool NÃO é necessária — use o valor do contexto.",
  search_knowledge_base:
    "Busca na base de conhecimento (FAQ, destinos, processo Welcome). Args: { query: string }. Retorna { results: [...] }. Use quando lead pergunta algo factual.",
  check_calendar:
    "Verifica horários DISPONÍVEIS na agenda real da Wedding Planner. Use quando o lead pedir uma data ou horário diferente dos que estão em <proposed_slots> (ex: 'tem dia 17?', 'consegue antes de quinta?', 'manhã do dia 20?', 'na semana que vem?'). Args (todos OPCIONAIS): { data_inicio: 'DD/MM' ou 'DD/MM/YYYY' (default = amanhã), data_fim: idem (default = data_inicio + janela configurada), quantidade: int 1-15 (default 6) }. Retorna { slots_disponiveis: [{date, time, weekday}], note?: string }. Se `slots_disponiveis` vier vazio, leia `note` pra entender o motivo (final de semana, range fora da janela, tudo ocupado) e explique honestamente ao lead. NUNCA invente horários — sempre chame esta tool antes de oferecer outra data.",
  confirm_meeting_slot:
    "[OBRIGATÓRIA SEMPRE QUE COMBINAR REUNIÃO] CRIA a reunião na agenda real da Wedding Planner. SEMPRE chame esta tool (NÃO chame `create_task` pra isso!) quando você combinar QUALQUER data e hora com o casal — seja um dos 3 horários de <proposed_slots>, seja uma data que o lead sugeriu por conta própria, seja ajuste em cima de uma sugestão. Regra simples: se você falar 'fica reservado/marcado/agendado', VOCÊ DEVE ter chamado esta tool no mesmo turno. Nunca deixe confirmação verbal sem agendamento real. Args: { date: 'DD/MM/YYYY', time: 'HH:MM' } — use EXATAMENTE a data e hora combinadas. Retorna { reuniao_id, status }. Se retornar erro de conflito, peça pro casal escolher outro horário. Esta é a ÚNICA forma de a reunião realmente entrar na agenda da Wedding Planner.",
  request_handoff:
    "Pede transferência pra humano (handoff_actions roda automaticamente). Args: { motivo: string }. Use em loop_incompreensao, alta_intencao_bloqueada, pedido_humano explícito.",
  update_contact:
    "Atualiza dados do contato. Args: { contato_id, nome?, email?, data_nascimento? }. NUNCA atualize telefone.",
  assign_tag:
    "Aplica tag no card. Args: { card_id, tag_name, color? }. Use em sinais indiretos, momentos especiais, desfechos.",
  create_task:
    "Cria TAREFA genérica do CRM (lembrete interno, follow-up administrativo). Args: { titulo, descricao, data_inicio, assignee_id, tipo }. NÃO use pra reunião com a Wedding Planner — pra isso use `confirm_meeting_slot`.",
};

function resolveToolDescription(
  tool: string,
  overrides?: Record<string, string> | null,
): string {
  const o = overrides?.[tool]?.trim();
  if (o) return o;
  return DEFAULT_TOOL_DESCRIPTIONS[tool] || "(sem descrição)";
}

function renderTools(
  tools: string[],
  overrides?: Record<string, string> | null,
): string {
  if (tools.length === 0) return "";

  return `<tools_available>
Tools que você pode chamar (no campo \`tool_calls\` do output JSON):

${tools.map((t) => `- **${t}**: ${resolveToolDescription(t, overrides)}`).join("\n")}

## Quando NÃO chamar tool
- Em mensagem trivial (cumprimento, reconhecimento curto)
- Se você já tem a informação no \`<conversation_state>\` ou \`<silent_signals>\`
- Se a tool não é necessária pra responder
</tools_available>`;
}

function renderSchemaReminder(): string {
  return `<self_analysis_protocol>
ANTES de gerar messages, você DEVE preencher honestamente o bloco \`self_analysis\` do output. Esses campos guiam o validator. Mentir aqui não te salva — o validator pode comparar com o histórico e te corrigir.

PASSO A PASSO (rode esse raciocínio internamente, depois preencha):

1. **contradicao_detectada**: olhe TUDO que o lead disse na conversa. Há conflito factual entre declarações dele? Use julgamento real:
   - "Frio + Mendoza/Patagônia/Europa central no inverno" → NÃO é contradição (Mendoza é fria; Patagônia é fria).
   - "Frio + Trancoso/Caribe/Punta Cana/Maldivas" → É contradição (são quentes o ano todo).
   - "Casamento íntimo/intimista + 150 convidados" → É contradição.
   - "Família ajuda + estamos sozinhos no investimento" → É contradição.
   - Se há contradição real, preencha { campos: [...], descricao: "..." }. Senão, null.

2. **pitch_saturado_self + pitch_count_recent**: conte ofertas REAIS de slot suas nos últimos 5 turns. "Marcar uma reunião por vídeo" no contexto da abertura NÃO conta. "Vocês podem qua 20/05 às 10h?" CONTA. "Qual desses horários funciona?" depois de já ter ofertado CONTA também (re-pitch). Se count >= 2 → saturado=true.

3. **inviabilidade_calc + valor_por_convidado_brl**:
   - Se tem ww_orcamento_faixa E ww_num_convidados em BRL: calcule. Converta moeda estrangeira ANTES (1 EUR ≈ R$ 6, 1 USD ≈ R$ 5).
   - < R$ 800/conv → "abaixo_minimo_resistente"
   - R$ 800-1200/conv → "fronteira_defensiva"
   - ≥ R$ 1200 → null (fluxo normal)
   - Faltam dados → null
   - SEMPRE preencha valor_por_convidado_brl quando dá pra calcular.

4. **pendencia_resolver**: você prometeu retornar em turn anterior? ("deixa eu verificar", "vou confirmar", "te chamo de volta"). Se sim E não cumpriu, preencha a frase. Senão null.

5. **sinais_defensivos_lead**: lead deu sinais de estar testando você com número defensivo? (orçamento baixo + destino premium + grupo grande, OU hesitação ao falar valor, OU "tô com vergonha"). Só TRUE se há evidência. Senão FALSE.

6. **pergunta_lead_nao_respondida**: olhe a ÚLTIMA mensagem do lead. Ele fez uma pergunta factual (algo terminado em "?", ou frase com verbo interrogativo)? Sua mensagem candidata RESPONDE essa pergunta?
   - Se ele perguntou "quanto custa?" e você só pulou pra "vocês têm destino em mente?" sem mencionar valor → preencha com "quanto custa".
   - Se ele perguntou "vocês cobram?" e você desviou → preencha.
   - Se a pergunta é AMBÍGUA (ex: "quanto custa" sem objeto claro), CLARIFICAR conta como responder: "do casamento todo ou do nosso honorário?" → preencha null. Mas pular pra outro tema sem clarificar → preencha com a pergunta.
   - Se ele não fez pergunta, ou você está respondendo, → null.

REGRA DE OURO: seja HONESTO. Se a self_analysis aponta inviabilidade, contradição, ou que você pulou a pergunta do lead, ALINHE suas messages com isso — não tente esconder. O validator compara o que você preencheu com o que mandou e te corrige se houver dissonância. MENTIR no self_analysis te denuncia mais que ser honesto e ajustar.
</self_analysis_protocol>

<output_format>
Retorne JSON ESTRITO conforme schema:

\`\`\`json
{
  "messages": [{ "type": "text", "content": "..." }],
  "card_patch": { /* campos a atualizar no card, ou {} */ },
  "contact_patch": { /* nome, email, data_nascimento, ou {} */ },
  "current_moment_key": "abertura | sondagem | objecao_preco | ... | null",
  "tool_calls": [{ "tool_name": "...", "args": {...} }],
  "internal_reasoning": "Por que escolhi esse momento, quais sinais observei..."
}
\`\`\`

REGRAS:
- \`messages\`: 1-3 mensagens, cada uma <1024 chars, sem travessões.
- \`card_patch\`: SEMPRE inclua os campos do CRM que o lead acabou de revelar nesta rodada (chaves \`ww_*\`, \`crm_field_key\` dos slots de descoberta). Ex: se o lead disse "Argentina" pra pergunta de viagem internacional, inclua \`{"ww_sdr_perfil_viagem_internacional": "Argentina"}\` (ou \`true\` se aceitável boolean). Se o lead disse "não temos ajuda da família", inclua \`{"ww_sdr_ajuda_familia": false}\`. Esquecer de salvar quebra a qualificação determinística do router.
- \`contact_patch\`: vazio ({}) se nada mudar; só nome, email, data_nascimento.
- \`current_moment_key\`: slug do momento detectado, ou null.
- \`tool_calls\`: vazio ([]) na maioria dos turnos.
- \`internal_reasoning\`: 1-3 frases pra log/auditoria. Não vai pro WhatsApp.
</output_format>`;
}
