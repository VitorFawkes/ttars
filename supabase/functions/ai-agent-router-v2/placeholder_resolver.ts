// Resolver de placeholders dinâmicos em textos editáveis pelo admin (v2).
//
// Substitui {agent_name}, {company_name}, {contact_name} em runtime.
// Idempotente: texto sem placeholder passa intocado.
//
// Aplicado em todos os render*Block do prompt_assembler.ts e nas
// validator_rules do brand_validator.ts.

export interface ResolverContext {
  agent_name: string;
  company_name?: string | null;
  contact_name?: string | null;
}

export function resolveAgentPlaceholders(text: string | null | undefined, ctx: ResolverContext): string {
  if (!text || typeof text !== "string") return text || "";
  if (!text.includes("{")) return text;

  let result = text;
  result = result.replaceAll("{agent_name}", ctx.agent_name || "");
  if (ctx.company_name != null) result = result.replaceAll("{company_name}", ctx.company_name);
  if (ctx.contact_name != null) result = result.replaceAll("{contact_name}", ctx.contact_name);

  return result;
}

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
