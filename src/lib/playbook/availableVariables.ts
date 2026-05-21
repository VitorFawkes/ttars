/**
 * Catálogo central de variáveis disponíveis pra prompts de agente IA.
 *
 * São referências que o admin pode inserir em campos editáveis (princípios,
 * cérebro analítico, regras de atualização, templates de mensagem) e que
 * são resolvidas em runtime pelo router V2:
 *
 * - {curly}: substituído por valor (contact_name, agent_name, ww_destino, ...)
 *   → resolvido em supabase/functions/ai-agent-router-v2/placeholder_resolver.ts
 *
 * - <angle>: bloco inteiro injetado pelo engine no prompt (agent_schedule,
 *   conversation_state, silent_signals, ...)
 *   → injetado em supabase/functions/ai-agent-router-v2/prompt_assembler.ts
 *
 * Categorias têm cor pra distinguir visualmente nos chips.
 */

export type VariableSyntax = 'curly' | 'angle'
export type VariableCategory = 'contact' | 'card' | 'agent' | 'engine'

export interface AvailableVariable {
  /** Nome canônico sem chaves/colchetes. Ex: 'contact_name' */
  name: string
  /** Sintaxe que vai pro prompt. */
  syntax: VariableSyntax
  /** Categoria visual + lógica. */
  category: VariableCategory
  /** Rótulo curto pra mostrar na UI. */
  label: string
  /** Descrição opcional pra hover/tooltip. */
  description?: string
}

/**
 * Helper: formata a variável no formato canônico pra inserir no texto.
 * Ex: { syntax: 'curly', name: 'contact_name' } → '{contact_name}'
 */
export function formatVariable(v: Pick<AvailableVariable, 'name' | 'syntax'>): string {
  return v.syntax === 'angle' ? `<${v.name}>` : `{${v.name}}`
}

/**
 * Lista base de variáveis universais (qualquer agente IA pode usar).
 * Pra variáveis específicas de produto (ex: ww_destino, ww_data_casamento),
 * use buildVariablesForProduto().
 */
export const UNIVERSAL_VARIABLES: AvailableVariable[] = [
  // ── CONTATO (verde) ─────────────────────────────────────────────
  { name: 'contact_name', syntax: 'curly', category: 'contact', label: 'Nome do lead', description: 'Nome do contato do CRM' },

  // ── AGENTE (roxo) ───────────────────────────────────────────────
  { name: 'agent_name', syntax: 'curly', category: 'agent', label: 'Nome do agente', description: 'Ex: Patricia' },
  { name: 'company_name', syntax: 'curly', category: 'agent', label: 'Nome da empresa', description: 'Ex: Welcome Weddings' },

  // ── BLOCOS DO ENGINE (âmbar) ────────────────────────────────────
  // Esses blocos são injetados inteiros pelo router V2 no prompt; o
  // admin referencia em descrições/instruções pra explicar o que o
  // agente "vê" naquele momento.
  { name: 'agent_schedule', syntax: 'angle', category: 'engine', label: 'Bloco: agenda real', description: 'Janelas e horários configurados em Handoff > Agendamento' },
  { name: 'proposed_slots', syntax: 'angle', category: 'engine', label: 'Bloco: horários propostos', description: '3 horários pré-calculados pra reunião' },
  { name: 'conversation_state', syntax: 'angle', category: 'engine', label: 'Bloco: estado da conversa', description: 'Tracked data + moment_step do turno' },
  { name: 'silent_signals', syntax: 'angle', category: 'engine', label: 'Bloco: sinais silenciosos', description: 'Sinais configurados que o agente está detectando' },
  { name: 'qualification_result', syntax: 'angle', category: 'engine', label: 'Bloco: resultado da qualificação', description: 'Score + breakdown calculados pelo router' },
  { name: 'context_rules', syntax: 'angle', category: 'engine', label: 'Bloco: regras de contexto', description: 'Cérebro analítico (DIFF cognitivo)' },
  { name: 'data_update_rules', syntax: 'angle', category: 'engine', label: 'Bloco: regras de atualização CRM', description: 'Como gravar dados no card' },
]

/**
 * Variáveis específicas do produto Welcome Weddings (ww_*).
 * Quando criar agentes de outros produtos (TRIPS, etc), expandir aqui
 * ou criar buildVariablesForProduto('TRIPS').
 */
export const WEDDING_CARD_VARIABLES: AvailableVariable[] = [
  { name: 'ww_destino', syntax: 'curly', category: 'card', label: 'Destino do casamento', description: 'Caribe / Maldivas / Nordeste / Mendoza / Europa / Outro' },
  { name: 'ww_data_casamento', syntax: 'curly', category: 'card', label: 'Data do casamento' },
  { name: 'ww_num_convidados', syntax: 'curly', category: 'card', label: 'Número de convidados' },
  { name: 'ww_orcamento_faixa', syntax: 'curly', category: 'card', label: 'Orçamento (R$)' },
  { name: 'ww_tipo_casamento', syntax: 'curly', category: 'card', label: 'Tipo de casamento', description: 'Praia, fazenda, salão...' },
  { name: 'ww_sdr_visao_casamento', syntax: 'curly', category: 'card', label: 'Visão do casamento (texto)' },
  { name: 'ww_sdr_ajuda_familia', syntax: 'curly', category: 'card', label: 'Família ajuda no investimento?' },
  { name: 'ww_sdr_perfil_viagem_internacional', syntax: 'curly', category: 'card', label: 'Viagem internacional recente' },
  { name: 'ww_sdr_referencia_casamento_premium', syntax: 'curly', category: 'card', label: 'Referência casamento premium' },
]

/**
 * Retorna o conjunto completo de variáveis pra um agente do produto dado.
 * Usado pra popular o autocomplete/dropdown do VariableTextarea.
 */
export function getAvailableVariables(produto?: string | null): AvailableVariable[] {
  const out = [...UNIVERSAL_VARIABLES]
  if (produto === 'WEDDING') out.push(...WEDDING_CARD_VARIABLES)
  // produto === 'TRIPS' → adicionar variáveis trips quando existirem
  return out
}

/**
 * Estilos por categoria — usados no chip + no dropdown.
 */
export const CATEGORY_STYLES: Record<VariableCategory, {
  chipBg: string
  chipText: string
  chipBorder: string
  dotBg: string
  label: string
}> = {
  contact: {
    chipBg: 'bg-emerald-50',
    chipText: 'text-emerald-800',
    chipBorder: 'border-emerald-200',
    dotBg: 'bg-emerald-500',
    label: 'Contato',
  },
  card: {
    chipBg: 'bg-sky-50',
    chipText: 'text-sky-800',
    chipBorder: 'border-sky-200',
    dotBg: 'bg-sky-500',
    label: 'Card',
  },
  agent: {
    chipBg: 'bg-violet-50',
    chipText: 'text-violet-800',
    chipBorder: 'border-violet-200',
    dotBg: 'bg-violet-500',
    label: 'Agente',
  },
  engine: {
    chipBg: 'bg-amber-50',
    chipText: 'text-amber-800',
    chipBorder: 'border-amber-200',
    dotBg: 'bg-amber-500',
    label: 'Engine',
  },
}

/**
 * Detecta variáveis num texto. Retorna lista ordenada com posição,
 * nome, sintaxe e se é conhecida (existe no catálogo) ou desconhecida.
 *
 * Padrão capturado:
 * - {word_with_underscores}
 * - <word_with_underscores>
 *
 * Não captura {algo com espaço} nem <algo-com-hífen> propositalmente —
 * só permitimos snake_case válido como nome de variável.
 */
export interface DetectedVariable {
  raw: string
  name: string
  syntax: VariableSyntax
  start: number
  end: number
  known: AvailableVariable | null
}

const VARIABLE_REGEX = /\{([a-z_][a-z0-9_]*)\}|<([a-z_][a-z0-9_]*)>/gi

export function detectVariables(
  text: string,
  available: AvailableVariable[],
): DetectedVariable[] {
  if (!text) return []
  const byName = new Map<string, AvailableVariable>()
  for (const v of available) byName.set(`${v.syntax}:${v.name}`, v)

  const out: DetectedVariable[] = []
  // matchAll é mais limpo que while-loop com .exec() e não tem state global
  for (const m of text.matchAll(VARIABLE_REGEX)) {
    const curlyName = m[1]
    const angleName = m[2]
    const syntax: VariableSyntax = curlyName ? 'curly' : 'angle'
    const name = curlyName || angleName
    const known = byName.get(`${syntax}:${name}`) ?? null
    out.push({
      raw: m[0],
      name,
      syntax,
      start: m.index ?? 0,
      end: (m.index ?? 0) + m[0].length,
      known,
    })
  }
  return out
}
