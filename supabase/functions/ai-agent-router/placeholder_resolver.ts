// Resolver de placeholders dinâmicos em textos editáveis pelo admin.
//
// Substitui {agent_name}, {company_name}, {contact_name} em runtime.
// Idempotente: texto sem placeholder passa intocado (sem efeito colateral).
//
// Aplicado em:
//   - system_prompt, prompts_extra.* (textos do prompt principal)
//   - validator_rules[].condition (regras do validator)
//   - identity_config / voice_config / boundaries_config / listening_config (campos JSONB)
//   - moments.anchor_text / intent / red_lines / must_cover / literal_phrases
//   - few_shot_examples.* / silent_signals.* / business_config.*
//   - handoff_actions.message / book_meeting templates
//
// Compatibilidade com texto sem placeholder (ex: anchor_text já tinha "Estela"
// hardcoded antes de migrar): passa intocado, comportamento idêntico ao atual.
//
// IMPORTANTE: este resolver NÃO toca em mensagens persistidas (ai_conversation_turns)
// — só em prompts montados pra LLM em runtime.

export interface ResolverContext {
  agent_name: string;
  company_name?: string | null;
  contact_name?: string | null;
}

/**
 * Substitui placeholders em uma string. Retorna a string original se não
 * houver mudanças (importante: pra evitar criar JSONB novo desnecessariamente).
 */
export function resolveAgentPlaceholders(text: string | null | undefined, ctx: ResolverContext): string {
  if (!text || typeof text !== "string") return text || "";
  if (!text.includes("{")) return text; // fast path

  let result = text;
  result = result.replaceAll("{agent_name}", ctx.agent_name || "");
  if (ctx.company_name != null) result = result.replaceAll("{company_name}", ctx.company_name);
  if (ctx.contact_name != null) result = result.replaceAll("{contact_name}", ctx.contact_name);

  return result;
}

/**
 * Aplica resolver recursivamente em qualquer estrutura JSON (object, array,
 * string). Útil pra processar configs JSONB inteiros (validator_rules,
 * boundaries_config, etc) sem ter que mapear campo a campo.
 *
 * Tipo de retorno: T (preserva shape).
 */
export function resolvePlaceholdersDeep<T>(value: T, ctx: ResolverContext): T {
  if (typeof value === "string") {
    return resolveAgentPlaceholders(value, ctx) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => resolvePlaceholdersDeep(v, ctx)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = resolvePlaceholdersDeep(v, ctx);
    }
    return out as unknown as T;
  }
  return value;
}
