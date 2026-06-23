// Núcleo compartilhado de criação de lead de WEDDING a partir de webhooks.
//
// Reusado por:
//   - leadster-webhook-wedding (fonte Leadster, origem='leadster', com JWT)
//   - wedding-site-webhook       (formulário do site, origem='site', sem JWT)
//
// Cada função de entrada normaliza o payload da sua fonte para `WeddingLead` e
// chama `createWeddingLead`. Toda a mecânica de dedup + criação (idêntica entre
// as fontes) mora aqui — só mudam payload, autenticação e `origem`.

// deno-lint-ignore no-explicit-any
export type SupaClient = any;

// ---- Constantes WEDDING (workspace Welcome Weddings) ----
export const WEDDING_PIPELINE_ID = "f4611f84-ce9c-48ad-814b-dcd6081f15db"; // Pipeline Welcome Wedding
export const WEDDING_CARD_ORG_ID = "b0000000-0000-0000-0000-000000000002"; // workspace Welcome Weddings (cards)
export const WEDDING_ENTRY_STAGE_ID = "6acb35af-d1a2-48e7-bc48-133907ae9554"; // etapa "Novo Lead" (fase SDR)
export const SHARED_CONTACT_ORG_ID = "a0000000-0000-0000-0000-000000000001"; // conta Welcome Group (contatos compartilhados)

/** Lead já normalizado, comum às duas fontes. */
export type WeddingLead = {
  nome: string | null;
  email: string | null;
  telefone: string | null;
  destino: string | null; // → ww_destino
  convidados: string | null; // → ww_num_convidados (+ detecta Elopement)
  orcamentoFaixa: string | null; // já normalizado p/ opção de ww_orcamento_faixa, ou null
  cidade: string | null; // → ww_sdr_cidade
  nomeNoivos: string | null; // → Noivo(a) 2 (acompanhante)
  marketing: Record<string, unknown>; // crus do payload (auditoria)
};

export type CreateOptions = {
  createEnabled: boolean;
  origem: string; // 'leadster' | 'site' — também vira tag do contato e cards.origem
  fallbackName?: string; // nome de exibição quando o lead vem sem nome
};

export type CreateResult = { plan: string; createdCardId: string | null };

/**
 * Lê o interruptor de criação de cards em integration_settings do workspace WEDDING.
 * `key` é específico por fonte (ex.: 'leadster_create_cards', 'site_create_cards').
 * Ausente/erro/'false' = modo ensaio (não cria nada). 'true' = cria de verdade.
 */
export async function isCreateEnabled(
  supabase: SupaClient,
  key: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("integration_settings")
    .select("value")
    .eq("key", key)
    .eq("org_id", WEDDING_CARD_ORG_ID)
    .is("produto", null)
    .maybeSingle();
  const v = data?.value == null ? null : String(data.value).trim();
  return (v ?? "false").toLowerCase() === "true";
}

/** Junta os dois nomes no corpo do título ("Ana & João"). Só Noivo 1 → só ele. */
export function joinNoivos(n1: string | null, n2: string | null, fallback: string): string {
  const a = (n1 ?? "").trim();
  const b = (n2 ?? "").trim();
  if (!b || b.toLowerCase() === a.toLowerCase()) return a || fallback; // Noivo 2 ausente/igual
  if (!a) return b; // só Noivo 2 (raro)
  return `${a} & ${b}`;
}

/**
 * Cria o(a) Noivo(a) 2 como segundo contato do card (acompanhante), só com o nome
 * (a SDR completa e-mail/telefone depois). Sem dedup: sem email/telefone não há como
 * casar. No-op quando o nome do Noivo 2 é vazio ou igual ao principal. Retorna um
 * trecho legível pro log/plano. Reusado pelo núcleo (Leadster/site) e pelo Active.
 */
export async function linkNoivo2(
  supabase: SupaClient,
  cardId: string,
  nomeNoivos: string | null,
  nomePrincipal: string | null,
  origem: string,
): Promise<string> {
  const n2 = (nomeNoivos ?? "").trim();
  if (!n2 || n2.toLowerCase() === (nomePrincipal ?? "").trim().toLowerCase()) return "";
  const pparts = n2.split(/\s+/);
  const { data: parceiro, error: pErr } = await supabase
    .from("contatos")
    .insert({
      org_id: SHARED_CONTACT_ORG_ID,
      nome: pparts[0],
      sobrenome: pparts.length > 1 ? pparts.slice(1).join(" ") : null,
      tipo_pessoa: "adulto",
      origem,
      tags: [origem],
    })
    .select("id").single();
  if (pErr) return `; ERRO ao criar Noivo(a) 2: ${pErr.message}`;
  await supabase.from("cards_contatos").insert({
    card_id: cardId,
    contato_id: parceiro.id,
    tipo_viajante: "acompanhante",
    ordem: 1,
  });
  return `; Noivo(a) 2 criado como acompanhante (contato ${parceiro.id})`;
}

/**
 * Processa um lead de WEDDING: dedup de contato e card e (só quando
 * `createEnabled`) criação de verdade. Sem `createEnabled` é puro SELECT
 * (modo ensaio) — nenhuma linha é criada.
 *
 * Critério de dedup (igual a public-api/Echo e integration-process):
 *   contato por email → por telefone (find_contact_by_whatsapp);
 *   card por pessoa_principal_id + produto WEDDING + status aberto.
 */
export async function createWeddingLead(
  supabase: SupaClient,
  lead: WeddingLead,
  opts: CreateOptions,
): Promise<CreateResult> {
  const { createEnabled, origem } = opts;
  const fallbackName = opts.fallbackName ?? "Lead";
  const { nome, email, telefone } = lead;

  if (!email && !telefone) {
    return { plan: "ignorado: payload sem Email e sem Telefone (impossível dedup/criar)", createdCardId: null };
  }

  // --- 1. Dedup de contato (email → telefone) ---
  let contactId: string | null = null;
  let matchedBy: string | null = null;

  if (email) {
    const { data } = await supabase
      .from("contatos").select("id").eq("email", email).limit(1).maybeSingle();
    if (data?.id) { contactId = data.id; matchedBy = "email"; }
  }
  if (!contactId && telefone) {
    const { data: foundId } = await supabase
      .rpc("find_contact_by_whatsapp", { p_phone: telefone, p_convo_id: "" });
    if (foundId) { contactId = foundId as string; matchedBy = "telefone"; }
  }

  // --- 2. Dedup de card (só faz sentido se já existe contato) ---
  let existingCardId: string | null = null;
  if (contactId) {
    const { data: cards } = await supabase
      .from("cards")
      .select("id")
      .eq("pessoa_principal_id", contactId)
      .eq("produto", "WEDDING")
      .not("status_comercial", "in", '("ganho","perdido")')
      .is("deleted_at", null)
      .limit(1);
    existingCardId = cards?.[0]?.id ?? null;
  }

  // --- 3. Etapa de entrada do pipeline WEDDING ("Novo Lead") ---
  const stageId = WEDDING_ENTRY_STAGE_ID;

  // --- Título combinado (Noivo 1 & Noivo 2), no padrão do funil WW ---
  //   "Elopement | Ana & João" quando o form responde "Apenas o casal";
  //   "DW | Ana & João" (Destination Wedding) para os demais.
  const isElopement = (lead.convidados ?? "").trim().toLowerCase() === "apenas o casal";
  const coupleName = joinNoivos(nome, lead.nomeNoivos, fallbackName);
  const titulo = `${isElopement ? "Elopement" : "DW"} | ${coupleName}`;

  // --- Plano legível (vale tanto pro ensaio quanto pro log de produção) ---
  const contatoPlan = contactId
    ? `contato existente ${contactId} (via ${matchedBy})`
    : "criaria contato novo (org Welcome Group)";
  const cardPlan = existingCardId
    ? `card WEDDING aberto já existe ${existingCardId} → DEDUP, não criaria`
    : `criaria card WEDDING novo (título "${titulo}")`;
  // Noivo(a) 2 só é criado quando há card novo e o nome difere do principal (igual ao passo 4e).
  // Aparece no plano (inclusive ensaio) pra dar pra conferir o de-para do campo de parceiro(a).
  const noivo2 = lead.nomeNoivos;
  const noivo2Plan = !existingCardId && noivo2 && noivo2.toLowerCase() !== (nome ?? "").toLowerCase()
    ? `; criaria Noivo(a) 2: ${noivo2}`
    : "";
  const planBase = `${contatoPlan}; ${cardPlan}${noivo2Plan}`;

  // --- Modo ensaio: para por aqui, nada é criado ---
  if (!createEnabled) {
    return { plan: `ENSAIO (${origem}_create_cards off): ${planBase}`, createdCardId: null };
  }

  // --- 4. Criação real ---
  // 4a. Card já existe → dedup, não cria nada.
  if (existingCardId) {
    return { plan: `DEDUP: card WEDDING aberto já existe ${existingCardId}`, createdCardId: existingCardId };
  }

  // 4b. Criar contato se necessário.
  if (!contactId) {
    const parts = (nome ?? fallbackName).split(/\s+/);
    const { data: novo, error: cErr } = await supabase
      .from("contatos")
      .insert({
        org_id: SHARED_CONTACT_ORG_ID,
        nome: parts[0],
        sobrenome: parts.length > 1 ? parts.slice(1).join(" ") : null,
        email,
        telefone,
        tipo_pessoa: "adulto",
        origem,
        tags: [origem],
      })
      .select("id").single();
    if (cErr) return { plan: `ERRO ao criar contato: ${cErr.message}`, createdCardId: null };
    contactId = novo.id;
  }

  // 4c. produto_data = campos estruturados da seção Qualificação.
  // Os valores crus continuam em marketing_data (auditoria).
  const produtoData: Record<string, unknown> = {};
  if (lead.destino) produtoData.ww_destino = lead.destino;
  if (lead.convidados) produtoData.ww_num_convidados = lead.convidados;
  if (lead.orcamentoFaixa) produtoData.ww_orcamento_faixa = lead.orcamentoFaixa;
  if (lead.cidade) produtoData.ww_sdr_cidade = lead.cidade;

  // Tipo do casamento (Elopement quando "apenas o casal"); título já calculado acima.
  produtoData.ww_tipo_casamento = isElopement ? "Elopement" : "Destination Wedding";

  // 4d. Criar card WEDDING.
  const { data: card, error: cardErr } = await supabase
    .from("cards")
    .insert({
      titulo,
      pessoa_principal_id: contactId,
      org_id: WEDDING_CARD_ORG_ID,
      pipeline_id: WEDDING_PIPELINE_ID,
      pipeline_stage_id: stageId,
      produto: "WEDDING",
      origem,
      status_comercial: "aberto",
      moeda: "BRL",
      marketing_data: lead.marketing,
      produto_data: produtoData,
    })
    .select("id").single();
  if (cardErr) return { plan: `ERRO ao criar card: ${cardErr.message}`, createdCardId: null };

  // NOTA: o contato principal NÃO entra em cards_contatos — vive em
  // cards.pessoa_principal_id, e um trigger do banco bloqueia a duplicação
  // ("already the Main Contact"). cards_contatos guarda só os adicionais.

  // 4e. Criar o(a) Noivo(a) 2 como segundo contato do card (acompanhante).
  const parceiroPlan = await linkNoivo2(supabase, card.id, lead.nomeNoivos, nome, origem);

  return { plan: `CRIADO card WEDDING ${card.id} (contato ${contactId})${parceiroPlan}`, createdCardId: card.id };
}
