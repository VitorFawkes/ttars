// Função pura que decide o que injetar no prompt da Persona pra cada slot
// da Sondagem (e outros moments com discovery_config).
// Hierarquia: literal_question > must_include > example_questions > goal puro.
// Retorna null quando schema novo não está sendo usado (goal vazio/null) — caller
// cai pro caminho legado (deriveSlotQuestion em prompt_builder_v2.ts).

export interface SlotV2 {
  key: string;
  label: string;
  icon?: string;
  priority?: "critical" | "preferred" | "nice_to_have";
  required?: boolean;
  crm_field_key: string | null;

  // Schema novo (V2)
  goal: string | null;
  must_include: string[];
  example_questions: string[];
  literal_question: string | null;

  // Schema legado (Patricia/Luna — não lidos por essa função)
  must_collect?: string[];
  questions?: string[];
  coverage_notes?: string | null;

  reject_if?: Array<{ pattern: string; hint?: string }>;
}

export function renderSlotForPrompt(slot: SlotV2): string | null {
  const goal = (slot.goal ?? "").trim();
  if (!goal) return null;

  const literal = (slot.literal_question ?? "").trim();
  if (literal) {
    return `**Slot ${slot.key}** (${slot.label})
- Use exatamente esta pergunta: "${literal}"
- Não adapte. Não reformule. Use textualmente.
- Registra em: ${slot.crm_field_key ?? "(sem campo)"}`;
  }

  const mustInclude = (slot.must_include ?? []).filter((s) => s && s.trim());
  const examplesRaw = (slot.example_questions ?? []).filter((q) => q && q.trim());
  // Fase Alpha-2 (12/05/2026): 1 ou 2 exemplos colapsam em template literal
  // (variância zero/baixa = LLM copia). Pra ser referência de tom precisa ter
  // 3+ exemplos diversos. Defensivamente tratamos 1-2 como zero — UI também
  // bloqueia salvamento de 1-2.
  const examples = examplesRaw.length >= 3 ? examplesRaw : [];

  let block = `**Slot ${slot.key}** (${slot.label})
- Objetivo: ${goal}`;

  if (mustInclude.length > 0) {
    const items = mustInclude.join(", ");
    block += `
- A pergunta DEVE coletar EXATAMENTE: ${items}. Formule natural seguindo voice config.`;
    if (examples.length > 0) {
      block += `
- Variações de tom (abstraia o padrão — NÃO copie literal NENHUMA delas; o LLM que copia exemplo perde naturalidade): ${examples.map((q) => `"${q}"`).join(" | ")}`;
    }
  } else if (examples.length > 0) {
    block += `
- Variações de tom (abstraia o padrão — NÃO copie literal NENHUMA delas; o LLM que copia exemplo perde naturalidade): ${examples.map((q) => `"${q}"`).join(" | ")}`;
  } else {
    block += `
- Formule a pergunta natural seguindo voice config e contexto da conversa. NÃO use clichês ("Que delícia", "que máximo"). Pergunta direta, sem rationale.`;
  }

  if (slot.crm_field_key) {
    block += `
- Registra em: ${slot.crm_field_key}`;
  }

  if (slot.reject_if && slot.reject_if.length > 0) {
    block += `
- Se lead responder vagamente, peça especificidade:`;
    for (const r of slot.reject_if) {
      const hint = r.hint?.trim() ? ` → ${r.hint.trim()}` : "";
      block += `\n  - "${r.pattern}"${hint}`;
    }
  }

  return block;
}
