import type { PlaybookMoment } from '@/hooks/playbook/useAgentMoments'

export type MomentAlertSeverity = 'warning' | 'error'

export interface MomentAlert {
  id: string
  severity: MomentAlertSeverity
  title: string
  detail: string
  /** Sugestão de ação concreta (texto curto pra UI). */
  suggestion?: string
}

/**
 * Detecta inconsistências num momento — usado pela UI v3 pra mostrar
 * alertas inline sem precisar caçar campos.
 *
 * REGRA DE OURO: este detector NÃO modifica dados nem persiste nada.
 * Roda 100% no cliente, lendo o objeto PlaybookMoment já carregado.
 *
 * Catálogo atual de checks:
 *   1. Texto âncora exige 2+ perguntas mas red_lines proíbem ("uma pergunta só")
 *   2. Modo literal/faithful sem texto âncora
 *   3. Slot da Sondagem sem perguntas escritas (IA improvisa)
 *   4. Trigger keyword sem palavras configuradas
 *   5. Trigger score_threshold sem valor
 */
export function detectMomentAlerts(moment: PlaybookMoment): MomentAlert[] {
  const alerts: MomentAlert[] = []

  // ── 1. Conflito de quantidade de perguntas no texto âncora vs red_lines ──
  if (moment.anchor_text && moment.anchor_text.trim().length > 0) {
    const questionCount = countQuestions(moment.anchor_text)
    if (questionCount >= 2) {
      const conflictingRedLine = (moment.red_lines ?? []).find(rl => isOnePerTurnRule(rl))
      if (conflictingRedLine) {
        alerts.push({
          id: 'questions-conflict',
          severity: 'warning',
          title: 'Texto vs linha vermelha em conflito',
          detail: `Seu texto tem ${questionCount} perguntas, mas a linha vermelha "${truncate(conflictingRedLine, 60)}" diz pra mandar uma só. A agente provavelmente vai cortar perguntas.`,
          suggestion: 'Edite a linha vermelha pra abrir exceção, ou remova perguntas do texto.',
        })
      }
    }
  }

  // ── 2. Modos literal/faithful sem texto âncora ──
  if ((moment.message_mode === 'literal' || moment.message_mode === 'faithful') &&
      !(moment.anchor_text ?? '').trim()) {
    alerts.push({
      id: 'missing-anchor-text',
      severity: 'error',
      title: 'Texto âncora faltando',
      detail: `Modo "${moment.message_mode === 'literal' ? 'Texto exato' : 'Diretriz fiel'}" exige um texto pra agente seguir.`,
      suggestion: 'Escreva o texto que ela vai usar, ou troque o modo para Estilo livre.',
    })
  }

  // ── 3. Slots da Sondagem sem perguntas escritas ──
  if (moment.discovery_config && Array.isArray(moment.discovery_config.slots)) {
    const emptySlots = moment.discovery_config.slots.filter(s =>
      !Array.isArray(s.questions) || s.questions.length === 0 || s.questions.every(q => !q.trim())
    )
    if (emptySlots.length > 0) {
      const labels = emptySlots.map(s => s.label || s.key).slice(0, 3).join(', ')
      const more = emptySlots.length > 3 ? ` +${emptySlots.length - 3}` : ''
      alerts.push({
        id: 'empty-discovery-questions',
        severity: 'warning',
        title: `${emptySlots.length} ${emptySlots.length > 1 ? 'campos' : 'campo'} sem pergunta sugerida`,
        detail: `Sem pergunta escrita, a agente improvisa diferente em cada conversa. Campos: ${labels}${more}.`,
        suggestion: 'Escreva pelo menos uma pergunta pra cada campo.',
      })
    }
  }

  // ── 4. Trigger keyword sem palavras ──
  if (moment.trigger_type === 'keyword') {
    const cfg = moment.trigger_config ?? {}
    const kws = Array.isArray(cfg.keywords) ? (cfg.keywords as string[]).filter(k => typeof k === 'string' && k.trim()) : []
    if (kws.length === 0) {
      alerts.push({
        id: 'missing-keywords',
        severity: 'error',
        title: 'Sem palavras-chave',
        detail: 'O gatilho está em "Contém palavras-chave" mas nenhuma palavra foi configurada. A jogada nunca vai disparar.',
        suggestion: 'Adicione palavras que o cliente pode dizer pra disparar essa jogada.',
      })
    }
  }

  // ── 5. Trigger score_threshold sem valor ──
  if (moment.trigger_type === 'score_threshold') {
    const cfg = moment.trigger_config ?? {}
    const value = cfg.value
    if (value === undefined || value === null || (typeof value === 'number' && Number.isNaN(value))) {
      alerts.push({
        id: 'missing-score-threshold',
        severity: 'error',
        title: 'Sem valor de pontuação',
        detail: 'O gatilho é "Score atingiu valor" mas o valor não foi definido.',
        suggestion: 'Defina o número mínimo da pontuação (ex: 25).',
      })
    }
  }

  return alerts
}

/** Conta '?' que parecem fechar uma frase de pergunta no texto âncora. */
function countQuestions(text: string): number {
  // Conta cada sequência de '?' como UMA pergunta (evita counting '???' como 3)
  const matches = text.match(/\?+/g)
  return matches ? matches.length : 0
}

/** Detecta heuristicamente uma red line do tipo "uma pergunta por turno" / "não empilhar". */
function isOnePerTurnRule(redLine: string): boolean {
  const t = redLine.toLowerCase()
  // Cobre as variações que apareceram historicamente nos prompts da Estela
  // sem incluir a versão moderna que abre exceção pra mesmo tema.
  if (t.includes('exceção')) return false // versão moderna
  if (t.includes('mesmo tema')) return false // versão moderna
  if (t.includes('uma pergunta só') || t.includes('uma pergunta so')) return true
  if (t.includes('não perguntar 2') || t.includes('nao perguntar 2')) return true
  if (t.includes('não empilhar') && t.includes('pergunta')) return true
  if (t.includes('uma pergunta por turno') && !t.includes('exceção') && !t.includes('em geral')) return true
  return false
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s
}
