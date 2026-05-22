// Resolver de placeholders dinâmicos em textos editáveis pelo admin (v2).
//
// Substitui {agent_name}, {company_name}, {contact_name},
// {wedding_planner_name}, {wedding_planner_short}, {honorario_faixa},
// {empresa_stats}, {network_regions}, {destination_categories},
// {brochure_policy} em runtime.
//
// Idempotente: texto sem placeholder passa intocado.
//
// Aplicado em todos os render*Block do prompt_assembler.ts, nas
// validator_rules do brand_validator.ts e nos defaults curados por agente.

export interface ResolverContext {
  agent_name: string;
  company_name?: string | null;
  contact_name?: string | null;
  /** Nome completo da Wedding Planner que recebe handoff (ex: "Ana Carolina Kuss"). */
  wedding_planner_name?: string | null;
  /** Nome curto da Wedding Planner usado em conversa íntima (ex: "Ana Carolina"). */
  wedding_planner_short?: string | null;
  /** Faixa de honorário formatada (ex: "R$ 4 mil a R$ 18 mil"). */
  honorario_faixa?: string | null;
  /** Stats da empresa formatado (ex: "Desde 2012, mais de 650 casamentos em 20 países, 5 prêmios"). */
  empresa_stats?: string | null;
  /** Regiões da rede própria formatado (ex: "Caribe (Cancún, Punta Cana, Tulum, Riviera Maya), Maldivas, Nordeste brasileiro..."). */
  network_regions?: string | null;
  /** Categorias canônicas do campo de destino (ex: "Caribe / Maldivas / Nordeste / Mendoza / Europa / Outro"). */
  destination_categories?: string | null;
  /** Política de material/brochura (texto: "A Welcome não tem material..." OU "Material disponível em..."). */
  brochure_policy?: string | null;
}

export function resolveAgentPlaceholders(text: string | null | undefined, ctx: ResolverContext): string {
  if (!text || typeof text !== "string") return text || "";
  if (!text.includes("{")) return text;

  let result = text;
  result = result.replaceAll("{agent_name}", ctx.agent_name || "");
  if (ctx.company_name != null) result = result.replaceAll("{company_name}", ctx.company_name);
  if (ctx.contact_name != null) result = result.replaceAll("{contact_name}", ctx.contact_name);
  if (ctx.wedding_planner_name != null) result = result.replaceAll("{wedding_planner_name}", ctx.wedding_planner_name);
  if (ctx.wedding_planner_short != null) result = result.replaceAll("{wedding_planner_short}", ctx.wedding_planner_short);
  if (ctx.honorario_faixa != null) result = result.replaceAll("{honorario_faixa}", ctx.honorario_faixa);
  if (ctx.empresa_stats != null) result = result.replaceAll("{empresa_stats}", ctx.empresa_stats);
  if (ctx.network_regions != null) result = result.replaceAll("{network_regions}", ctx.network_regions);
  if (ctx.destination_categories != null) result = result.replaceAll("{destination_categories}", ctx.destination_categories);
  if (ctx.brochure_policy != null) result = result.replaceAll("{brochure_policy}", ctx.brochure_policy);

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
