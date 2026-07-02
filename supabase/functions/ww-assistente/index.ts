// ww-assistente — o assistente IA PRÓPRIO do casamento (Weddings).
//
// Mesma arquitetura do agente de conversa do Trips (ai-conversation-extraction),
// mas um agente separado, com contexto e campos do casamento:
//   • action='chat'    → pergunta livre sobre TUDO que foi trocado (WhatsApp,
//                        e-mail, reuniões/transcrições, dados do card).
//   • action='extract' → lê as conversas e SUGERE atualização de campos ww_*
//                        (nunca aplica — a pessoa revisa e confirma na tela).
//
// Regras herdadas do Trips: só extrair o que está CONFIRMADO na conversa,
// nunca inventar, datas YYYY-MM-DD, resposta JSON estrita no extract.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";

const MODEL = "gpt-5.1";
const MAX_MESSAGES = 300;
const MAX_BODY_CHARS = 1500;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Catálogo de campos que o assistente pode sugerir (chaves reais do card) ──
// Curado a partir de PLANEJ_FIELD + campos base do funil Weddings. Tipos:
// text | number | currency | date | datetime | boolean | select.
interface FieldDef {
  key: string;
  label: string;
  type: string;
  hint?: string;
  options?: string[];
}

const FIELD_CATALOG: FieldDef[] = [
  { key: "ww_nome_parceiro", label: "Nome do(a) parceiro(a)", type: "text" },
  { key: "ww_tipo_casamento", label: "Tipo de casamento", type: "select", options: ["Destination Wedding", "Elopement", "Internacional"] },
  { key: "ww_num_convidados", label: "Nº de convidados (estimativa inicial)", type: "number" },
  { key: "ww_planej_regiao", label: "Região / destino do casamento", type: "select", options: ["Nordeste", "Sudeste", "Sul", "Centro-Oeste", "Norte", "Caribe", "Europa", "Outro"] },
  { key: "ww_planej_espaco", label: "Espaço / venue", type: "text", hint: "nome do hotel/espaço onde será a cerimônia" },
  { key: "ww_planej_formato", label: "Formato do local", type: "select", options: ["Resort", "Pousada", "Espaço alugado", "Outro"] },
  { key: "ww_planej_tema", label: "Tema / estilo do casamento", type: "text" },
  { key: "ww_planej_data_hora_casamento", label: "Data e hora do casamento", type: "datetime", hint: "YYYY-MM-DDTHH:MM se tiver hora; senão YYYY-MM-DD" },
  { key: "ww_planej_convidados_estimado", label: "Convidados estimados", type: "number" },
  { key: "ww_planej_convidados_contrato", label: "Convidados em contrato", type: "number" },
  { key: "ww_planej_pacote_nome", label: "Nome do pacote", type: "text" },
  { key: "ww_planej_pacote_valor", label: "Valor do pacote (R$)", type: "currency" },
  { key: "ww_planej_valor_total", label: "Valor total do casamento (R$)", type: "currency" },
  { key: "ww_planej_sinal_valor", label: "Valor do sinal (R$)", type: "currency" },
  { key: "ww_planej_sinal_pago_em", label: "Sinal pago em", type: "date" },
  { key: "ww_planej_contrato_assinado", label: "Contrato assinado?", type: "boolean" },
  { key: "ww_planej_quartos_bloquear", label: "Quartos a bloquear", type: "number" },
  { key: "ww_planej_bloqueio_aptos_pedido", label: "Apartamentos pedidos (bloqueio)", type: "number" },
  { key: "ww_planej_bloqueio_aptos_fechados", label: "Apartamentos já fechados (bloqueio)", type: "number" },
  { key: "ww_planej_promo_tarifa", label: "Tarifa promocional (R$/noite)", type: "currency" },
  { key: "ww_planej_promo_inicio", label: "Início da ação promocional", type: "date" },
  { key: "ww_planej_promo_fim", label: "Fim da ação promocional", type: "date" },
  { key: "ww_planej_forma_pagamento_convidados", label: "Forma de pagamento dos convidados", type: "text" },
  { key: "ww_planej_politica_cancelamento", label: "Política de cancelamento", type: "text" },
  { key: "ww_planej_politica_reducao", label: "Política de redução", type: "text" },
  { key: "ww_planej_proxima_reuniao", label: "Próxima reunião", type: "datetime" },
];

// ── Contexto: tudo que foi trocado + o estado do card ───────────────────────
interface Ctx {
  card: { id: string; titulo: string; produto_data: Record<string, unknown> };
  pessoas: { id: string; nome: string; papel: string }[];
  conversa: string; // WhatsApp + e-mail intercalados, formatados
  reunioes: string;
}

async function buildContext(cardId: string): Promise<Ctx | { error: string }> {
  const { data: card, error: cardErr } = await supabase
    .from("cards")
    .select("id, titulo, produto, produto_data, pessoa_principal_id, org_id")
    .eq("id", cardId)
    .maybeSingle();
  if (cardErr || !card) return { error: "card não encontrado" };
  if (card.produto !== "WEDDING") return { error: "este assistente é só de casamentos (WEDDING)" };

  // casal (pessoa principal + vinculados)
  const pessoas: Ctx["pessoas"] = [];
  const contactIds: string[] = [];
  if (card.pessoa_principal_id) contactIds.push(card.pessoa_principal_id);
  const { data: vinculos } = await supabase
    .from("cards_contatos")
    .select("contato_id")
    .eq("card_id", cardId)
    .limit(20);
  for (const v of vinculos ?? []) {
    if (!contactIds.includes(v.contato_id)) contactIds.push(v.contato_id);
  }
  if (contactIds.length) {
    const { data: contatos } = await supabase
      .from("contatos")
      .select("id, nome, sobrenome")
      .in("id", contactIds);
    for (const c of contatos ?? []) {
      pessoas.push({
        id: c.id,
        nome: [c.nome, c.sobrenome].filter(Boolean).join(" "),
        papel: c.id === card.pessoa_principal_id ? "titular" : "casal/família",
      });
    }
  }
  const nomePor = new Map(pessoas.map((p) => [p.id, p.nome]));

  // WhatsApp (dos contatos do casal + ligadas ao card, ex. grupo)
  let waQuery = supabase
    .from("whatsapp_messages")
    .select("contact_id, body, media_content, is_from_me, sender_name, created_at, is_group, group_name")
    .order("created_at", { ascending: true })
    .limit(MAX_MESSAGES);
  if (contactIds.length) {
    waQuery = waQuery.or(`contact_id.in.(${contactIds.join(",")}),card_id.eq.${cardId}`);
  } else {
    waQuery = waQuery.eq("card_id", cardId);
  }
  const { data: waMsgs } = await waQuery;

  // E-mails (mensagens nativas do card)
  const { data: emails } = await supabase
    .from("mensagens")
    .select("lado, assunto, conteudo, data_hora, metadados")
    .eq("card_id", cardId)
    .eq("canal", "email")
    .order("data_hora", { ascending: true })
    .limit(100);

  // intercala por data
  type Item = { at: string; line: string };
  const itens: Item[] = [];
  for (const m of waMsgs ?? []) {
    const texto = (m.body || m.media_content || "").slice(0, MAX_BODY_CHARS);
    if (!texto) continue;
    const quem = m.is_from_me
      ? "Welcome (equipe)"
      : `${nomePor.get(m.contact_id) || m.sender_name || "Cliente"}${m.is_group ? ` (no grupo ${m.group_name || "do casal"})` : ""}`;
    itens.push({ at: m.created_at ?? "", line: `[${(m.created_at ?? "").slice(0, 16)}] WhatsApp — ${quem}: ${texto}` });
  }
  for (const e of emails ?? []) {
    const texto = (e.conteudo || "").slice(0, MAX_BODY_CHARS);
    if (!texto && !e.assunto) continue;
    const quem = e.lado === "out" ? "Welcome (equipe)" : `Casal (${(e.metadados as { from?: string })?.from ?? "e-mail"})`;
    itens.push({ at: e.data_hora ?? "", line: `[${(e.data_hora ?? "").slice(0, 16)}] E-mail — ${quem}: ${e.assunto ? `(assunto: ${e.assunto}) ` : ""}${texto}` });
  }
  itens.sort((a, b) => (a.at < b.at ? -1 : 1));

  // Reuniões (checklist tipo reuniao: resultado + transcrição)
  const { data: reunioes } = await supabase
    .from("wedding_checklist")
    .select("titulo, data_hora, status_reuniao, resultado, transcricao")
    .eq("card_id", cardId)
    .eq("tipo", "reuniao")
    .order("data_hora", { ascending: true });
  const reunioesTxt = (reunioes ?? [])
    .map((r) => {
      const partes = [
        `Reunião "${r.titulo}"${r.data_hora ? ` em ${r.data_hora.slice(0, 16)}` : ""}${r.status_reuniao ? ` (${r.status_reuniao})` : ""}`,
      ];
      if (r.resultado) partes.push(`Resultado: ${r.resultado.slice(0, 2000)}`);
      if (r.transcricao) partes.push(`Transcrição: ${r.transcricao.slice(0, 6000)}`);
      return partes.join("\n");
    })
    .join("\n---\n");

  return {
    card: { id: card.id, titulo: card.titulo, produto_data: card.produto_data ?? {} },
    pessoas,
    conversa: itens.map((i) => i.line).join("\n"),
    reunioes: reunioesTxt,
  };
}

// ── OpenAI ───────────────────────────────────────────────────────────────────
async function callOpenAI(messages: { role: string; content: string }[], jsonMode: boolean): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: jsonMode ? 0.1 : 0.4,
      max_completion_tokens: 4096,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

function baseContextPrompt(ctx: Ctx): string {
  return [
    `CASAMENTO: ${ctx.card.titulo}`,
    `PESSOAS DO CASAL: ${ctx.pessoas.map((p) => `${p.nome} (${p.papel})`).join(", ") || "—"}`,
    "",
    "DADOS ATUAIS DO CARD (produto_data):",
    JSON.stringify(ctx.card.produto_data, null, 1).slice(0, 6000),
    "",
    "REUNIÕES (resultado/transcrição):",
    ctx.reunioes || "(nenhuma registrada)",
    "",
    "HISTÓRICO DE CONVERSAS (WhatsApp + e-mail, em ordem):",
    ctx.conversa || "(nenhuma mensagem registrada)",
  ].join("\n");
}

const CHAT_SYSTEM = `Você é a assistente do time de planejamento da Welcome Weddings (casamentos destination no Brasil).
Você conhece TUDO deste casamento: as conversas de WhatsApp e e-mail com o casal, as reuniões (resultados e transcrições) e os dados do card.
Responda perguntas da planejadora de forma direta, em português, citando QUANDO a informação apareceu (data) e ONDE (WhatsApp, e-mail, reunião) sempre que possível.
Se a informação não estiver no histórico, diga claramente que não encontrou — NUNCA invente.
Seja concisa: parágrafos curtos, sem enrolação.`;

function extractSystem(): string {
  const catalogo = FIELD_CATALOG.map((f) => {
    const parts = [`- ${f.key} (${f.type}): ${f.label}`];
    if (f.options) parts.push(`  valores permitidos: ${f.options.join(" | ")}`);
    if (f.hint) parts.push(`  dica: ${f.hint}`);
    return parts.join("\n");
  }).join("\n");
  return `Você extrai dados de casamento das conversas (WhatsApp + e-mail + reuniões) para atualizar o CRM da Welcome Weddings.

REGRAS ABSOLUTAS:
1. Só extraia o que está CONFIRMADO na conversa (decidido/combinado). Cogitações e "talvez" NÃO entram.
2. NUNCA invente. Na dúvida, não inclua o campo.
3. NÃO re-sugira valores idênticos aos DADOS ATUAIS DO CARD.
4. Datas: YYYY-MM-DD. Data+hora: YYYY-MM-DDTHH:MM. Dinheiro: número puro (ex.: 25000).
5. boolean: true/false. select: use EXATAMENTE um dos valores permitidos.

CAMPOS QUE VOCÊ PODE PREENCHER:
${catalogo}

RESPONDA APENAS JSON válido neste formato:
{"campos": {"chave": valor, ...}, "justificativas": {"chave": "onde/quando isso foi confirmado", ...}}
Se nada novo: {"campos": {}, "justificativas": {}}`;
}

// ── Handler ──────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });
  if (!req.headers.get("Authorization")) return json(401, { error: "não autorizado" });
  if (!OPENAI_API_KEY) return json(500, { error: "OPENAI_API_KEY não configurada" });

  let body: { action?: string; card_id?: string; question?: string; chat_history?: { role: string; content: string }[] };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "json inválido" });
  }
  const { action, card_id } = body;
  if (!card_id) return json(400, { error: "card_id é obrigatório" });

  const ctx = await buildContext(card_id);
  if ("error" in ctx) return json(400, { error: ctx.error });

  try {
    if (action === "chat") {
      const question = (body.question ?? "").trim();
      if (!question) return json(400, { error: "question é obrigatória" });
      const history = (body.chat_history ?? []).slice(-10).map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content).slice(0, 2000),
      }));
      const answer = await callOpenAI(
        [
          { role: "system", content: CHAT_SYSTEM },
          { role: "user", content: baseContextPrompt(ctx) },
          ...history,
          { role: "user", content: question },
        ],
        false,
      );
      return json(200, { answer });
    }

    if (action === "extract") {
      const raw = await callOpenAI(
        [
          { role: "system", content: extractSystem() },
          { role: "user", content: baseContextPrompt(ctx) + "\n\nExtraia os campos confirmados que ainda não estão (ou estão diferentes) no card." },
        ],
        true,
      );
      let parsed: { campos?: Record<string, unknown>; justificativas?: Record<string, string> };
      try {
        parsed = JSON.parse(raw);
      } catch {
        return json(500, { error: "resposta da IA não veio em JSON" });
      }
      const campos = parsed.campos ?? {};
      const catalogByKey = new Map(FIELD_CATALOG.map((f) => [f.key, f]));
      const sugestoes = Object.entries(campos)
        .filter(([k, v]) => catalogByKey.has(k) && v != null && String(v).trim() !== "")
        .map(([k, v]) => ({
          key: k,
          label: catalogByKey.get(k)!.label,
          type: catalogByKey.get(k)!.type,
          novo: v,
          atual: (ctx.card.produto_data as Record<string, unknown>)[k] ?? null,
          justificativa: parsed.justificativas?.[k] ?? null,
        }))
        // não re-sugerir valor idêntico ao atual
        .filter((s) => String(s.atual ?? "") !== String(s.novo ?? ""));
      return json(200, { status: "ok", sugestoes, message_count: ctx.conversa ? ctx.conversa.split("\n").length : 0 });
    }

    return json(400, { error: `action desconhecida: ${action}` });
  } catch (e) {
    console.error("[ww-assistente]", e);
    return json(500, { error: e instanceof Error ? e.message : String(e) });
  }
});
