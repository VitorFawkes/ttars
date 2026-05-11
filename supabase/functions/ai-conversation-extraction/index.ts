/**
 * ai-conversation-extraction — Marco C
 *
 * Botão "IA lê conversa": lê toda a conversa WhatsApp ligada ao card e devolve
 * preview estruturado em três seções (campos do card, contato principal,
 * viajantes acompanhantes) para o operador revisar e aplicar.
 *
 * NÃO aplica nada: só retorna sugestões. O frontend chama depois a RPC
 * `apply_ai_conversation_extraction` com as seções aprovadas.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Req {
  card_id: string;
}

interface FieldDef {
  field_key: string;
  section: string;
  field_type: string;
  label: string;
  prompt_question: string;
  prompt_format: string;
  prompt_examples: string | null;
  prompt_extract_when: string | null;
  allowed_values: string[] | null;
}

interface WhatsappMessage {
  created_at: string;
  direction: string | null;
  sender_name: string | null;
  message_type: string | null;
  body: string | null;
  media_url: string | null;
}

interface Card {
  id: string;
  titulo: string | null;
  produto: string | null;
  produto_data: Record<string, unknown> | null;
  briefing_inicial: Record<string, unknown> | null;
  pipeline_stage_id: string | null;
  pessoa_principal_id: string | null;
}

interface Contato {
  id: string;
  nome: string | null;
  sobrenome: string | null;
  email: string | null;
  data_nascimento: string | null;
  endereco: Record<string, unknown> | null;
  observacoes: string | null;
  nome_locked_at: string | null;
  last_whatsapp_conversation_id: string | null;
}

interface Viajante {
  contato_id: string;
  nome: string | null;
  sobrenome: string | null;
  tipo_vinculo: string | null;
}

interface PreviewResponse {
  status: "preview" | "no_messages" | "error";
  card_id: string;
  message_count?: number;
  campos_card?: Record<string, unknown>;
  campos_card_atuais?: Record<string, unknown>;
  contato_principal?: Record<string, unknown>;
  contato_principal_atual?: Record<string, unknown>;
  contato_principal_nome_locked?: boolean;
  viajantes?: Array<{
    nome: string;
    tipo_vinculo?: string | null;
    tipo_pessoa?: "adulto" | "crianca";
    telefone?: string | null;
    data_nascimento?: string | null;
    match_type: "new" | "existing_phone" | "existing_fuzzy";
    match_contact_id?: string | null;
    match_existing_name?: string | null;
  }>;
  viajantes_existentes?: Array<{ contato_id: string; nome: string; tipo_vinculo: string | null }>;
  field_config?: FieldDef[];
  error?: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const MODEL = "gpt-5.1";
const MAX_MESSAGES = 200;
const MAX_BODY_CHARS_PER_MSG = 2000;

function buildSystemPrompt(cardFields: FieldDef[]): string {
  const cardFieldLines = cardFields.map((f) => {
    const bits = [
      `- "${f.field_key}" (${f.field_type}): ${f.prompt_question}`,
      `  formato: ${f.prompt_format}`,
      f.allowed_values?.length ? `  valores permitidos: ${JSON.stringify(f.allowed_values)}` : null,
      f.prompt_examples ? `  exemplos: ${f.prompt_examples}` : null,
      f.prompt_extract_when ? `  extrair quando: ${f.prompt_extract_when}` : null,
    ].filter(Boolean);
    return bits.join("\n");
  }).join("\n\n");

  return `Você é a Julia, assistente de IA da Welcome Trips. Sua função é ler uma conversa WhatsApp inteira entre um consultor da agência e um cliente, e retornar um JSON estruturado com três seções: campos da viagem, dados do contato principal e viajantes acompanhantes mencionados.

## REGRAS ABSOLUTAS
1. Extraia APENAS informações confirmadas/ditas explicitamente. Nunca invente.
2. Se houver ambiguidade ou baixa confiança, NÃO inclua o campo.
3. Respeite os formatos e valores permitidos.
4. Nomes que parecem placeholder (só dígitos, "WhatsApp 55...", "Contato 123", vazios) NÃO são nomes válidos.
5. Para datas, formato YYYY-MM-DD.
6. Para arrays de destinos, nunca inclua cidade onde o cliente mora ou referências a viagens passadas.

## SEÇÃO 1: campos_card
Extraia os campos abaixo baseado no que o cliente disse/confirmou. Se não houve informação nova, omita o campo.

${cardFieldLines}

## SEÇÃO 2: contato_principal
Objeto com dados pessoais do cliente. Só preencha campo com evidência textual clara. Campos possíveis:
- "nome" (string): nome completo do cliente — só se mencionado/assinado na conversa
- "email" (string): email válido
- "data_nascimento" (YYYY-MM-DD)
- "cidade" (string): cidade onde mora. NÃO usar cidade de origem da viagem.
- "profissao" (string): profissão mencionada
- "observacoes" (string curta): observação pessoal relevante (ex: "Vegetariana", "Tem medo de avião")

## SEÇÃO 3: viajantes
Array de pessoas EXPLICITAMENTE mencionadas como companheiras desta viagem. Regras:
- NÃO incluir: cliente principal, pessoas citadas mas que NÃO vão viajar ("meu chefe disse...", "minha amiga recomendou..."), pessoas de viagens passadas.
- INCLUIR: "vou com meu marido João", "os dois filhos vão junto, Pedro de 8 e Ana de 5", "levo minha mãe de 70 anos".

Cada viajante:
- "nome" (string, obrigatório): nome completo ou primeiro nome
- "tipo_vinculo" (string, opcional): conjuge, filho, filha, pai, mae, irmao, irma, sogro, sogra, amigo, amiga, colega, namorado, namorada — inferir do contexto
- "tipo_pessoa" ("adulto" | "crianca"): inferir da idade se mencionada (< 13 = crianca, senão adulto)
- "telefone" (string, opcional): só se mencionado
- "data_nascimento" (YYYY-MM-DD, opcional): só se mencionado

## SAÍDA
Responda APENAS com JSON válido, sem markdown, sem texto adicional. Estrutura:
{
  "campos_card": { ... },
  "contato_principal": { ... },
  "viajantes": [ ... ]
}

Se uma seção não tem nada relevante, devolva objeto/array vazio: {} ou [].`;
}

function formatConversationForPrompt(
  messages: WhatsappMessage[],
  contatoNome: string,
): string {
  const lines: string[] = [];
  for (const m of messages) {
    const when = m.created_at.substring(0, 16).replace("T", " ");
    const who = m.direction === "inbound"
      ? (contatoNome && contatoNome.trim() ? contatoNome : "Cliente")
      : m.direction === "outbound"
      ? "Consultor"
      : (m.sender_name || "?");
    let content = (m.body || "").trim();
    if (content.length > MAX_BODY_CHARS_PER_MSG) {
      content = content.slice(0, MAX_BODY_CHARS_PER_MSG) + "…";
    }
    if (!content && m.media_url) {
      content = `[${m.message_type || "media"}]`;
    }
    if (!content) continue;
    lines.push(`[${when}] ${who}: ${content}`);
  }
  return lines.join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as Req;
    if (!body?.card_id) {
      return jsonResponse({ status: "error", card_id: "", error: "card_id obrigatório" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    // 1. Card + contato principal
    const { data: card, error: cardErr } = await supabase
      .from("cards")
      .select("id, titulo, produto, produto_data, briefing_inicial, pipeline_stage_id, pessoa_principal_id")
      .eq("id", body.card_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (cardErr || !card) {
      return jsonResponse(
        { status: "error", card_id: body.card_id, error: `card não encontrado: ${cardErr?.message || "not found"}` },
        404,
      );
    }
    const c = card as Card;

    let contato: Contato | null = null;
    if (c.pessoa_principal_id) {
      const { data: ct } = await supabase
        .from("contatos")
        .select("id, nome, sobrenome, email, data_nascimento, endereco, observacoes, nome_locked_at, last_whatsapp_conversation_id")
        .eq("id", c.pessoa_principal_id)
        .maybeSingle();
      contato = (ct as Contato) || null;
    }

    // 2. Viajantes já vinculados ao card (para informar à IA não duplicar)
    const { data: vjRows } = await supabase
      .from("cards_contatos")
      .select("contato_id, tipo_vinculo, contatos:contato_id(id, nome, sobrenome)")
      .eq("card_id", c.id);
    const viajantesExistentes: Array<{ contato_id: string; nome: string; tipo_vinculo: string | null }> = [];
    for (const row of (vjRows || []) as unknown as Array<{
      contato_id: string;
      tipo_vinculo: string | null;
      contatos: { id: string; nome: string | null; sobrenome: string | null } | null;
    }>) {
      if (!row.contatos) continue;
      if (row.contato_id === c.pessoa_principal_id) continue;
      const nome = [row.contatos.nome, row.contatos.sobrenome].filter(Boolean).join(" ").trim();
      if (!nome) continue;
      viajantesExistentes.push({
        contato_id: row.contato_id,
        nome,
        tipo_vinculo: row.tipo_vinculo,
      });
    }

    // 3. Mensagens — por card_id; se vazio, fallback por conversation_id do contato
    let messages: WhatsappMessage[] = [];
    {
      const { data: byCard } = await supabase
        .from("whatsapp_messages")
        .select("created_at, direction, sender_name, message_type, body, media_url")
        .eq("card_id", c.id)
        .order("created_at", { ascending: true })
        .limit(MAX_MESSAGES);
      messages = (byCard as WhatsappMessage[]) || [];
    }
    if (messages.length < 3 && contato?.last_whatsapp_conversation_id) {
      const { data: byConv } = await supabase
        .from("whatsapp_messages")
        .select("created_at, direction, sender_name, message_type, body, media_url")
        .eq("conversation_id", contato.last_whatsapp_conversation_id)
        .order("created_at", { ascending: true })
        .limit(MAX_MESSAGES);
      const extras = (byConv as WhatsappMessage[]) || [];
      const seen = new Set(messages.map((m) => `${m.created_at}|${m.body}`));
      for (const m of extras) {
        const k = `${m.created_at}|${m.body}`;
        if (!seen.has(k)) {
          messages.push(m);
          seen.add(k);
        }
      }
      messages.sort((a, b) => a.created_at.localeCompare(b.created_at));
      messages = messages.slice(-MAX_MESSAGES);
    }

    if (messages.length === 0) {
      return jsonResponse({ status: "no_messages", card_id: c.id, message_count: 0 });
    }

    // 4. Campos da viagem — pegar config de trip_info + observacoes, mas filtrar por stage visibility
    const { data: fieldRows } = await supabase
      .from("ai_extraction_field_config")
      .select("field_key, section, field_type, label, prompt_question, prompt_format, prompt_examples, prompt_extract_when, allowed_values, sort_order")
      .eq("is_active", true)
      .in("section", ["trip_info", "observacoes"])
      .order("sort_order", { ascending: true });
    const cardFields = (fieldRows as FieldDef[]) || [];

    // Filtra campos ocultos no stage
    let hiddenKeys = new Set<string>();
    if (c.pipeline_stage_id) {
      const { data: hiddenRows } = await supabase
        .from("stage_field_config")
        .select("field_key, is_visible")
        .eq("stage_id", c.pipeline_stage_id)
        .eq("is_visible", false);
      for (const r of (hiddenRows as Array<{ field_key: string }> | null) || []) {
        hiddenKeys.add(r.field_key);
      }
    }
    const visibleFields = cardFields.filter((f) => !hiddenKeys.has(f.field_key));

    // 5. Monta prompt + chama OpenAI
    const contatoNome = [contato?.nome, contato?.sobrenome].filter(Boolean).join(" ").trim();
    const systemPrompt = buildSystemPrompt(visibleFields);
    const conversationText = formatConversationForPrompt(messages, contatoNome);

    const existingTravelers = viajantesExistentes.length
      ? "\n\nVIAJANTES JÁ CADASTRADOS NESTE CARD (não repetir — só incluir novos):\n" +
        viajantesExistentes.map((v) => `- ${v.nome}${v.tipo_vinculo ? ` (${v.tipo_vinculo})` : ""}`).join("\n")
      : "";

    const currentDataBits: string[] = [];
    if (contatoNome) currentDataBits.push(`Cliente cadastrado: ${contatoNome}`);
    if (contato?.email) currentDataBits.push(`Email atual: ${contato.email}`);
    if (contato?.data_nascimento) currentDataBits.push(`Nascimento atual: ${contato.data_nascimento}`);
    const cidadeAtual = contato?.endereco && typeof contato.endereco === "object"
      ? (contato.endereco as Record<string, unknown>)["cidade"]
      : null;
    if (cidadeAtual) currentDataBits.push(`Cidade atual: ${cidadeAtual}`);
    const currentContext = currentDataBits.length
      ? `\n\nDADOS ATUAIS DO CLIENTE (não re-sugerir se iguais):\n${currentDataBits.join("\n")}`
      : "";

    const userPrompt = `CONVERSA WHATSAPP (${messages.length} mensagens):

${conversationText}${currentContext}${existingTravelers}

Analise a conversa e devolva o JSON com as três seções (campos_card, contato_principal, viajantes).`;

    const aiStart = Date.now();
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 4096,
        temperature: 0.1,
      }),
    });
    const aiMs = Date.now() - aiStart;
    console.log(`[ai-conversation-extraction] OpenAI ${aiMs}ms`);

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      return jsonResponse(
        { status: "error", card_id: c.id, error: `OpenAI ${openaiRes.status}: ${errText.slice(0, 500)}` },
        502,
      );
    }

    const openaiJson = await openaiRes.json();
    const content = openaiJson.choices?.[0]?.message?.content;
    if (!content) {
      return jsonResponse({ status: "error", card_id: c.id, error: "Resposta vazia da IA" }, 502);
    }

    let parsed: {
      campos_card?: Record<string, unknown>;
      contato_principal?: Record<string, unknown>;
      viajantes?: Array<Record<string, unknown>>;
    };
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error("[ai-conversation-extraction] JSON parse fail:", content.slice(0, 500));
      return jsonResponse({ status: "error", card_id: c.id, error: "IA retornou JSON inválido" }, 502);
    }

    // 6. Monta valores atuais para o preview (fase SDR lê briefing_inicial, demais lê produto_data)
    const produtoData = (c.produto_data || {}) as Record<string, unknown>;
    const briefing = (c.briefing_inicial || {}) as Record<string, unknown>;
    const camposCardAtuais: Record<string, unknown> = {};
    for (const f of visibleFields) {
      if (produtoData[f.field_key] !== undefined && produtoData[f.field_key] !== null) {
        camposCardAtuais[f.field_key] = produtoData[f.field_key];
      } else if (briefing[f.field_key] !== undefined && briefing[f.field_key] !== null) {
        camposCardAtuais[f.field_key] = briefing[f.field_key];
      }
    }

    const contatoAtual: Record<string, unknown> = {};
    if (contatoNome) contatoAtual.nome = contatoNome;
    if (contato?.email) contatoAtual.email = contato.email;
    if (contato?.data_nascimento) contatoAtual.data_nascimento = contato.data_nascimento;
    if (cidadeAtual) contatoAtual.cidade = cidadeAtual;
    if (contato?.observacoes) contatoAtual.observacoes = contato.observacoes;

    // 7. Matching de viajantes: detectar quem bate com viajante já vinculado (fuzzy simples)
    const viajantesSugeridos: NonNullable<PreviewResponse["viajantes"]> = [];
    for (const v of (parsed.viajantes || [])) {
      const nome = String(v.nome || "").trim();
      if (!nome) continue;
      const existingMatch = viajantesExistentes.find(
        (ex) => stripAccents(ex.nome).toLowerCase() === stripAccents(nome).toLowerCase(),
      );
      viajantesSugeridos.push({
        nome,
        tipo_vinculo: (v.tipo_vinculo as string | undefined) || null,
        tipo_pessoa: (v.tipo_pessoa === "crianca" ? "crianca" : "adulto") as "adulto" | "crianca",
        telefone: (v.telefone as string | undefined) || null,
        data_nascimento: (v.data_nascimento as string | undefined) || null,
        match_type: existingMatch ? "existing_fuzzy" : "new",
        match_contact_id: existingMatch?.contato_id || null,
        match_existing_name: existingMatch?.nome || null,
      });
    }

    const response: PreviewResponse = {
      status: "preview",
      card_id: c.id,
      message_count: messages.length,
      campos_card: parsed.campos_card || {},
      campos_card_atuais: camposCardAtuais,
      contato_principal: parsed.contato_principal || {},
      contato_principal_atual: contatoAtual,
      contato_principal_nome_locked: !!contato?.nome_locked_at,
      viajantes: viajantesSugeridos,
      viajantes_existentes: viajantesExistentes,
      field_config: visibleFields,
    };

    return jsonResponse(response);
  } catch (err) {
    console.error("[ai-conversation-extraction] Unhandled:", err);
    return jsonResponse(
      { status: "error", card_id: "", error: (err as Error).message || "erro interno" },
      500,
    );
  }
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
