/**
 * Parser do prompt do Playbook v2 (XML-tagged) em blocos legíveis.
 *
 * O prompt vem do backend `prompt_builder_v2.ts` com esta estrutura:
 *
 *   <agent name="...">
 *     header text (preamble — quem é, missão, descrição da empresa)
 *     <voice>...</voice>
 *     <anchors>...</anchors>
 *     <boundaries>...</boundaries>
 *     <qualification>...</qualification>
 *     <silent_signals>...</silent_signals>
 *     <examples>...</examples>
 *   </agent>
 *
 *   <turn>
 *     <detected>...</detected>
 *     <qualification_status>...</qualification_status>
 *     <known>...</known>
 *     <history>...</history>
 *     <last_message from="lead">...</last_message>
 *   </turn>
 *
 *   instruções finais (texto livre)
 *
 * O parser não regenera o prompt — só divide em pedaços e atribui um título humano
 * + ícone a cada um. Conteúdo dentro de cada bloco é mantido literal (sem tags).
 */

export type HumanBlockKind =
  | 'header'
  | 'voice'
  | 'anchors'
  | 'boundaries'
  | 'qualification'
  | 'silent_signals'
  | 'examples'
  | 'turn'
  | 'closing'

export interface HumanBlock {
  kind: HumanBlockKind
  title: string
  emoji: string
  description: string
  content: string
  /** Sub-blocos de `<turn>` (detected, known, history, etc.) */
  subBlocks?: { label: string; content: string }[]
}

const META: Record<HumanBlockKind, { title: string; emoji: string; description: string }> = {
  header: {
    title: 'Quem é a agente',
    emoji: '👤',
    description: 'Identidade, missão e o que a agente sabe sobre a empresa.',
  },
  voice: {
    title: 'Como a agente fala',
    emoji: '🎙️',
    description: 'Tom, formalidade, frases típicas e proibidas.',
  },
  anchors: {
    title: 'Frases por momento',
    emoji: '⚓',
    description: 'O que dizer em cada fase da conversa, com regras específicas por fase.',
  },
  boundaries: {
    title: 'Regras invioláveis',
    emoji: '🚫',
    description: 'Linhas vermelhas que valem em qualquer momento da conversa.',
  },
  qualification: {
    title: 'Qualificação',
    emoji: '🎯',
    description: 'Critérios pra considerar o lead qualificado, desqualificado ou bonus.',
  },
  silent_signals: {
    title: 'Sinais silenciosos',
    emoji: '👁️',
    description: 'O que a agente observa e registra sem comentar com o lead.',
  },
  examples: {
    title: 'Exemplos prontos',
    emoji: '💡',
    description: 'Pares "lead disse → agente responde" pra calibrar o tom.',
  },
  turn: {
    title: 'Turno atual',
    emoji: '🎬',
    description: 'O contexto vivo deste turno: momento detectado, score, histórico, última mensagem.',
  },
  closing: {
    title: 'Instrução final',
    emoji: '✅',
    description: 'O que a agente é instruída a produzir como output.',
  },
}

const AGENT_RE = /<agent\b[^>]*>([\s\S]*?)<\/agent>/
const TURN_RE = /<turn\b[^>]*>([\s\S]*?)<\/turn>/

const AGENT_INNER_TAGS: HumanBlockKind[] = [
  'voice',
  'anchors',
  'boundaries',
  'qualification',
  'silent_signals',
  'examples',
]

const TURN_SUB_LABELS: Record<string, string> = {
  detected: 'Momento detectado',
  qualification_status: 'Status de qualificação',
  known: 'O que a agente sabe',
  history: 'Histórico',
  last_message: 'Última mensagem do lead',
}

function extractTag(source: string, tag: string): { content: string; before: string; after: string } | null {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`)
  const m = source.match(re)
  if (!m || m.index === undefined) return null
  return {
    content: m[1].trim(),
    before: source.slice(0, m.index),
    after: source.slice(m.index + m[0].length),
  }
}

function parseTurnSubBlocks(turnInner: string): { label: string; content: string }[] {
  const subs: { label: string; content: string }[] = []
  for (const tag of Object.keys(TURN_SUB_LABELS)) {
    const found = extractTag(turnInner, tag)
    if (found && found.content) {
      subs.push({ label: TURN_SUB_LABELS[tag], content: found.content })
    }
  }
  return subs
}

export function parsePromptToHumanBlocks(prompt: string): HumanBlock[] {
  const blocks: HumanBlock[] = []
  const trimmed = prompt.trim()
  if (!trimmed) return blocks

  // 1. Extrai bloco <agent>...</agent>
  const agentMatch = trimmed.match(AGENT_RE)
  let afterAgent = trimmed
  if (agentMatch) {
    const agentInner = agentMatch[1]

    // Header = texto livre dentro de <agent> antes da primeira tag conhecida
    let firstTagIdx = agentInner.length
    for (const tag of AGENT_INNER_TAGS) {
      const idx = agentInner.search(new RegExp(`<${tag}\\b`))
      if (idx >= 0 && idx < firstTagIdx) firstTagIdx = idx
    }
    const headerText = agentInner.slice(0, firstTagIdx).trim()
    if (headerText) {
      blocks.push({
        kind: 'header',
        ...META.header,
        content: headerText,
      })
    }

    // Cada tag interna conhecida vira um bloco
    for (const tag of AGENT_INNER_TAGS) {
      const found = extractTag(agentInner, tag)
      if (found && found.content) {
        blocks.push({
          kind: tag,
          ...META[tag],
          content: found.content,
        })
      }
    }

    afterAgent = trimmed.slice(agentMatch.index! + agentMatch[0].length)
  }

  // 2. Extrai bloco <turn>...</turn>
  const turnMatch = afterAgent.match(TURN_RE)
  let afterTurn = afterAgent
  if (turnMatch) {
    const turnInner = turnMatch[1]
    blocks.push({
      kind: 'turn',
      ...META.turn,
      content: turnInner.trim(),
      subBlocks: parseTurnSubBlocks(turnInner),
    })
    afterTurn = afterAgent.slice(turnMatch.index! + turnMatch[0].length)
  }

  // 3. Texto restante = instrução final
  const closing = afterTurn.trim()
  if (closing) {
    blocks.push({
      kind: 'closing',
      ...META.closing,
      content: closing,
    })
  }

  return blocks
}
