// Mirror da função renderSlotForPrompt do backend
// (supabase/functions/ai-agent-router/slot_renderer.ts). Usado pela UI do
// Pipeline Studio pra preview "antes vs depois" do bloco que vai pro prompt.
// MANTER EM PARIDADE COM O BACKEND.

export interface SlotV2 {
  key: string
  label: string
  icon?: string
  priority?: 'critical' | 'preferred' | 'nice_to_have'
  required?: boolean
  crm_field_key: string | null

  // Schema novo (V2)
  goal: string | null
  must_include: string[]
  example_questions: string[]
  literal_question: string | null

  // Schema legado (mantido por compat)
  must_collect?: string[]
  questions?: string[]
  coverage_notes?: string | null

  reject_if?: Array<{ pattern: string; hint?: string }>
}

export function renderSlotForPrompt(slot: SlotV2): string | null {
  const goal = (slot.goal ?? '').trim()
  if (!goal) return null

  const literal = (slot.literal_question ?? '').trim()
  if (literal) {
    return `**Slot ${slot.key}** (${slot.label})
- Use exatamente esta pergunta: "${literal}"
- Não adapte. Não reformule. Use textualmente.
- Registra em: ${slot.crm_field_key ?? '(sem campo)'}`
  }

  const mustInclude = (slot.must_include ?? []).filter((s) => s && s.trim())
  const examples = (slot.example_questions ?? []).filter((q) => q && q.trim())

  let block = `**Slot ${slot.key}** (${slot.label})
- Objetivo: ${goal}`

  if (mustInclude.length > 0) {
    const items = mustInclude.join(', ')
    block += `
- A pergunta DEVE coletar EXATAMENTE: ${items}. Formule natural seguindo voice config.`
    if (examples.length > 0) {
      block += `
- Referência de tom (não copiar literal): ${examples.map((q) => `"${q}"`).join(' | ')}`
    }
  } else if (examples.length > 0) {
    block += `
- Referência de tom (não copiar literal): ${examples.map((q) => `"${q}"`).join(' | ')}`
  } else {
    block += `
- Formule a pergunta natural seguindo voice config e contexto da conversa.`
  }

  if (slot.crm_field_key) {
    block += `
- Registra em: ${slot.crm_field_key}`
  }

  if (slot.reject_if && slot.reject_if.length > 0) {
    block += `
- Se lead responder vagamente, peça especificidade:`
    for (const r of slot.reject_if) {
      const hint = r.hint?.trim() ? ` → ${r.hint.trim()}` : ''
      block += `\n  - "${r.pattern}"${hint}`
    }
  }

  return block
}

/**
 * Render do schema legado (must_collect/questions/coverage_notes) pra preview.
 * Imita deriveSlotQuestion + caminho legado de renderOneMoment do backend.
 * Usado SÓ pra mostrar o "antes" no SlotPreviewPanel quando schema novo é editado.
 */
export function renderSlotLegacyForPreview(slot: SlotV2): string {
  const label = slot.label ?? ''
  const must = (slot.must_collect ?? []).filter(Boolean)
  const questions = (slot.questions ?? []).filter(Boolean)

  if (questions.length > 0) {
    return `Use uma destas perguntas: ${questions.map((q) => `"${q}"`).join(' | ')}`
  }

  if (must.length > 0) {
    return `Pergunta gerada (palavra-por-palavra): "Vocês já sabem o ${must.join(' e ')} de ${label.toLowerCase()}?"`
  }

  return `Sem pergunta escrita — formule pergunta natural cobrindo ${label}.`
}
