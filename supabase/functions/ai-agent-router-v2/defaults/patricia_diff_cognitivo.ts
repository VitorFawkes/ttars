// DIFF COGNITIVO da Patricia — 5 auditorias internas rodadas a cada turno.
//
// Fonte: escrito pelo Vitor. Originalmente vivia em ai_agents.prompts_extra.context.
// Movido pra código em 2026-05-21. O agente Claude anterior fragmentou em 5
// routines com textarea de "instrução" cada (cognitive_audit_config no banco),
// quebrando coerência. Aqui restaura como texto coeso COM controle real do admin
// (toggle ON/OFF por routine — admin desliga, código omite do prompt).
//
// O ADMIN CONTROLA via UI:
//   - Toggle ON/OFF por routine (5 toggles): admin escolhe quais rodam
//   - Zonas de viabilidade (números R$/conv + label): admin edita números
//   - Cotações de moeda (chips EUR/USD/etc → R$): admin edita
//
// O ADMIN NÃO EDITA (decisões de prompt engineering):
//   - Texto da instrução de cada routine
//   - Classificação de momentos / sinais indiretos (parte fixa do bloco)

/**
 * Routines disponíveis. Toggle por routine vem de
 * ai_agents.cognitive_audit_config[key].enabled (boolean).
 */
export type RoutineKey =
  | 'detect_contradictions'
  | 'detect_pending_promises'
  | 'detect_unanswered_questions'
  | 'detect_pitch_saturation'
  | 'audit_viability';

/**
 * Textos das 5 auditorias. Cada uma renderizada apenas se toggle = true no banco.
 * audit_viability tem placeholders {ZONAS} e {COTACOES} resolvidos com params do banco.
 */
const ROUTINE_TEXTS: Record<RoutineKey, string> = {
  detect_pending_promises:
    `PROMESSAS PENDENTES — qual a última promessa explícita que a Patricia fez e ainda não cumpriu? ("vou verificar", "confirmo por email", "vou ver agenda"). Registre em \`pendencias_patricia\` como string curta. Se não há promessa pendente, omita o campo. **IGNORE mensagens marcadas com \`[SISTEMA—FALLBACK]\` no histórico — são frases de emergência do meu motor (disparadas quando uma resposta minha foi bloqueada), NÃO promessas que eu fiz. Considerar essas como promessa pendente cria loop fatal de bloqueio.**`,
  detect_contradictions:
    `CONTRADIÇÕES DO LEAD — comparando a última mensagem do lead com tudo que ele disse antes na MESMA conversa, identifique se há contradição factual relevante (clima vs destino, orçamento vs expectativa, presença de família vs declarado antes, data passada vs futura). Registre em \`contradicao_detectada\` como objeto \`{ campos: [...], descricao: "..." }\`. Se não há, omita.`,
  detect_unanswered_questions:
    `PEDIDOS NÃO RESPONDIDOS — o que o lead perguntou nos últimos 3 turnos dele que a Patricia ainda não respondeu diretamente? Lista até 3 em \`perguntas_pendentes\`.`,
  audit_viability:
    `AUDITORIA DE VIABILIDADE — se temos ww_orcamento_faixa e ww_num_convidados:
   - Detectar moeda: se valor declarado pelo lead estava em euros/dólares, converter ({COTACOES}) e gravar ww_orcamento_faixa em BRL.
   - Calcular \`valor_por_convidado = orcamento_BRL / num_convidados\`.
{ZONAS}`,
  detect_pitch_saturation:
    `SATURAÇÃO DE PITCH — releia os 5 últimos turnos da assistant. Conte ocorrências de oferta de "reunião com a Wedding Planner" / "próximo passo é uma conversa com a especialista" / variação. Se >= 2 nos últimos 5 turnos da assistant, marque \`pitch_saturado = true\`.`,
};

/**
 * Ordem em que as routines aparecem no prompt (quando ativas).
 */
const ROUTINE_ORDER: RoutineKey[] = [
  'detect_pending_promises',
  'detect_contradictions',
  'detect_unanswered_questions',
  'audit_viability',
  'detect_pitch_saturation',
];

const PREAMBLE = `Ao classificar momento da conversa, use: abertura (primeiro contato), identificação (cliente conhecido mas faltam destino/data/convidados/orçamento), atendimento (gates mínimos preenchidos), objeção (cliente levantou preocupação), desejo (pronto pra agendar), encerramento. Detecte sinais indiretos: se menciona viagem internacional recente (Europa, Caribe, EUA, Ásia nos últimos 12 meses), registra ww_sdr_perfil_viagem_internacional. Se menciona casamento admirado (amiga, famoso, evento que viu), registra ww_sdr_referencia_casamento_premium.`;

const DIFF_HEADER = `DIFF COGNITIVO (rodar a cada turno onde role do último input é "user")

Antes de produzir o output do contexto, faça esta auditoria interna e registre em campos auxiliares do contexto pra que o main model use:`;

// Defaults dos parâmetros editáveis pelo admin via UI.
// Quando admin preenche audit_viability.currency_rates / .zones no banco,
// esses defaults são SUBSTITUÍDOS.

export const DEFAULT_CURRENCY_RATES = [
  { from: 'EUR', to_brl: 6 },
  { from: 'USD', to_brl: 5 },
];

export const DEFAULT_VIABILITY_ZONES = [
  {
    max_per_guest_brl: 800,
    label: 'abaixo_minimo_resistente',
    action: 'escopo claramente fora da Welcome — desfecho_nao_qualificado direto',
  },
  {
    max_per_guest_brl: 1200,
    label: 'fronteira_defensiva',
    action: 'sondar 2 opcionais E perguntar aberto se o valor é norte fechado ou se ainda estão conversando em casa',
  },
];

/**
 * Renderiza o bloco de zonas + cotações como texto que substitui os placeholders
 * {ZONAS} e {COTACOES} no template da audit_viability.
 */
function renderViabilityParams(
  zones: Array<{ max_per_guest_brl?: number; label?: string; action?: string }>,
  rates: Array<{ from?: string; to_brl?: number }>,
): { zonasText: string; cotacoesText: string } {
  const sortedZones = [...zones].sort(
    (a, b) => (a.max_per_guest_brl ?? 0) - (b.max_per_guest_brl ?? 0),
  );

  const zonasLines = sortedZones.map((z) =>
    `   - Se **< R$ ${z.max_per_guest_brl}/conv** → \`inviabilidade_economica = "${z.label}"\` (${z.action}).`
  );
  if (sortedZones.length > 0) {
    const last = sortedZones[sortedZones.length - 1];
    zonasLines.push(
      `   - Se **≥ R$ ${last.max_per_guest_brl}/conv** → omitir o flag (fluxo normal).`,
    );
  }

  const cotacoesText = rates
    .map((r) => `1 ${r.from} ≈ R$ ${r.to_brl}`)
    .join(', ');

  return {
    zonasText: zonasLines.join('\n'),
    cotacoesText,
  };
}

/**
 * Config legível do banco. Cada routine tem só `enabled`. audit_viability
 * tem params extras (zones, currency_rates). Resto vem do código.
 */
export interface CognitiveAuditConfigFromDB {
  detect_contradictions?: { enabled?: boolean };
  detect_pending_promises?: { enabled?: boolean };
  detect_unanswered_questions?: { enabled?: boolean };
  detect_pitch_saturation?: { enabled?: boolean };
  audit_viability?: {
    enabled?: boolean;
    zones?: Array<{ max_per_guest_brl?: number; label?: string; action?: string }>;
    currency_rates?: Array<{ from?: string; to_brl?: number }>;
  };
}

/**
 * Monta o texto final do DIFF COGNITIVO da Patricia, respeitando toggles
 * ON/OFF por routine + params editáveis (audit_viability).
 *
 * Se a config vier null/vazia, assume TODAS as 5 routines ON com defaults.
 */
export function buildDiffCognitivoText(
  config: CognitiveAuditConfigFromDB | null | undefined = null,
): string {
  const cfg = config ?? {};

  const enabledKeys = ROUTINE_ORDER.filter((key) => {
    const routine = cfg[key];
    if (!routine) return true; // default: tudo ON quando config vazia
    return routine.enabled !== false; // ON a menos que explicitamente OFF
  });

  if (enabledKeys.length === 0) {
    // Admin desligou tudo. Mantém o preamble (classificação de momento) — ele
    // é "definição de termos", não auditoria opcional.
    return PREAMBLE;
  }

  const numberedRoutines = enabledKeys.map((key, idx) => {
    let text = ROUTINE_TEXTS[key];
    if (key === 'audit_viability') {
      const viab = cfg.audit_viability ?? {};
      const { zonasText, cotacoesText } = renderViabilityParams(
        viab.zones && viab.zones.length > 0 ? viab.zones : DEFAULT_VIABILITY_ZONES,
        viab.currency_rates && viab.currency_rates.length > 0
          ? viab.currency_rates
          : DEFAULT_CURRENCY_RATES,
      );
      text = text
        .replace('{ZONAS}', zonasText)
        .replace('{COTACOES}', cotacoesText);
    }
    return `${idx + 1}. ${text}`;
  });

  return `${PREAMBLE}

${DIFF_HEADER}

${numberedRoutines.join('\n\n')}`;
}
