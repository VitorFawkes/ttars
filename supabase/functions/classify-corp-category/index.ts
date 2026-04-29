/**
 * classify-corp-category — Onda 2 da Welcome Corporativo
 *
 * Lê as primeiras mensagens do cliente em um card CORP e classifica a
 * categoria do produto (aéreo nacional/intl, hotel, carro, ônibus, seguro
 * viagem, outros) gravando em cards.produto_data.categoria_produto.
 *
 * Comportamento:
 *  - Só age em cards do produto CORP
 *  - Não sobrescreve categoria já preenchida (respeita decisão humana)
 *  - Pode ser pausado por org via organizations.settings.corp_ai_classifier_enabled = false
 *  - Idempotente: pode ser chamado múltiplas vezes sem reprocessar
 *
 * Acionamento: trigger SQL via pg_net quando card CORP novo é criado.
 * Manual: POST { card_id } via fetch direto também funciona.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const MODEL = "gpt-5.1";

const VALID_CATEGORIES = [
  "aereo_nacional",
  "aereo_internacional",
  "hotel",
  "carro",
  "onibus",
  "seguro_viagem",
  "outros",
] as const;

type Categoria = typeof VALID_CATEGORIES[number];

interface Req {
  card_id: string;
}

interface Card {
  id: string;
  produto: string | null;
  produto_data: Record<string, unknown> | null;
  org_id: string;
  titulo: string | null;
}

interface Msg {
  body: string | null;
  direction: string | null;
  message_type: string | null;
  created_at: string;
}

function buildPrompt(messages: Msg[], titulo: string | null): string {
  const conversa = messages
    .map((m) => {
      const who = m.direction === "inbound" ? "Cliente" : "Atendente";
      const tipo = m.message_type && m.message_type !== "text" ? ` [${m.message_type}]` : "";
      return `${who}${tipo}: ${m.body ?? "(sem texto)"}`;
    })
    .join("\n");

  return `Você é um classificador de demandas de uma agência de viagens corporativa.
Sua tarefa: identificar QUE TIPO DE PRODUTO o cliente está pedindo.

Categorias possíveis:
- aereo_nacional        → passagem aérea dentro do Brasil
- aereo_internacional   → passagem aérea para fora do Brasil
- hotel                 → hospedagem (qualquer cidade)
- carro                 → aluguel de carro / transfer
- onibus                → passagem rodoviária
- seguro_viagem         → seguro viagem
- outros                → quando não dá pra determinar com clareza, ou é mais de um produto, ou é uma alteração/cancelamento

Título do atendimento: ${titulo ?? "(sem título)"}

Conversa:
${conversa}

Responda APENAS com um JSON válido no formato:
{"categoria": "aereo_internacional", "confianca": "alta"}

Use "confianca": "alta" quando estiver claro, "media" quando inferir, "baixa" quando estiver chutando (nesse caso use "outros").`;
}

function isValidCategoria(v: unknown): v is Categoria {
  return typeof v === "string" && (VALID_CATEGORIES as readonly string[]).includes(v);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { card_id }: Req = await req.json();
    if (!card_id) {
      return new Response(JSON.stringify({ error: "card_id obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Buscar card e validar
    const { data: card, error: cardErr } = await supabase
      .from("cards")
      .select("id, produto, produto_data, org_id, titulo")
      .eq("id", card_id)
      .is("deleted_at", null)
      .single<Card>();

    if (cardErr || !card) {
      return new Response(JSON.stringify({ ok: false, reason: "card not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (card.produto !== "CORP") {
      return new Response(JSON.stringify({ ok: true, skipped: "not corp" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const existingCategoria = (card.produto_data ?? {})["categoria_produto"];
    if (existingCategoria) {
      return new Response(JSON.stringify({ ok: true, skipped: "already categorized", categoria: existingCategoria }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Verificar toggle da org (default: enabled)
    const { data: org } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", card.org_id)
      .single<{ settings: Record<string, unknown> | null }>();

    const enabled = (org?.settings ?? {})["corp_ai_classifier_enabled"];
    if (enabled === false) {
      return new Response(JSON.stringify({ ok: true, skipped: "ai disabled by org" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3) Buscar primeiras mensagens (até 8 mensagens, prioriza inbound)
    const { data: messages } = await supabase
      .from("whatsapp_messages")
      .select("body, direction, message_type, created_at")
      .eq("card_id", card_id)
      .order("created_at", { ascending: true })
      .limit(8);

    const usableMsgs = (messages ?? [])
      .filter((m) => m.body && m.body.trim().length > 0) as Msg[];

    const inboundCount = usableMsgs.filter((m) => m.direction === "inbound").length;
    if (inboundCount === 0) {
      return new Response(JSON.stringify({ ok: true, skipped: "no inbound messages yet" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4) Chamar OpenAI
    const prompt = buildPrompt(usableMsgs, card.titulo);
    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return new Response(JSON.stringify({ ok: false, error: "openai failed", detail: errText.slice(0, 300) }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = aiJson.choices?.[0]?.message?.content ?? "";
    let parsed: { categoria?: unknown; confianca?: unknown };
    try {
      parsed = JSON.parse(content);
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "ai output not json", raw: content.slice(0, 200) }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const categoria: Categoria = isValidCategoria(parsed.categoria) ? parsed.categoria : "outros";
    const confianca = typeof parsed.confianca === "string" ? parsed.confianca : "media";

    // 5) Atualizar card (merge produto_data)
    const newProdutoData = {
      ...(card.produto_data ?? {}),
      categoria_produto: categoria,
      categoria_produto_meta: {
        classified_at: new Date().toISOString(),
        confianca,
        model: MODEL,
        auto: true,
      },
    };

    const { error: updErr } = await supabase
      .from("cards")
      .update({ produto_data: newProdutoData, updated_at: new Date().toISOString() })
      .eq("id", card_id);

    if (updErr) {
      return new Response(JSON.stringify({ ok: false, error: "update failed", detail: updErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, categoria, confianca }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
