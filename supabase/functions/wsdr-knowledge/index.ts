// wsdr-knowledge — CRUD da base de conhecimento da Sofia com embedding automático.
// O admin edita uma lista simples de pergunta/resposta; aqui calculamos o embedding
// (OpenAI text-embedding-3-small) e gravamos em wsdr_knowledge_items. A busca em si
// roda no n8n via a RPC wsdr_search_knowledge. DB ops usam o JWT do usuário → a RLS
// garante o isolamento por org (a função não burla org).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Embedding via OpenAI. Devolve string no formato literal de pgvector "[a,b,c]" ou null.
async function embed(text: string): Promise<string | null> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return null;
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  const emb = j?.data?.[0]?.embedding;
  return Array.isArray(emb) ? `[${emb.join(",")}]` : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } },
    );
    const body = await req.json().catch(() => ({}));
    const action = body.action;
    const agent_slug = body.agent_slug || "sofia-weddings";

    if (action === "list") {
      const { data, error } = await supabase
        .from("wsdr_knowledge_items")
        .select("id, pergunta, resposta, enabled, created_at")
        .eq("agent_slug", agent_slug)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return json({ items: data ?? [] });
    }

    if (action === "upsert") {
      const item = body.item || {};
      const pergunta = String(item.pergunta || "").trim();
      const resposta = String(item.resposta || "").trim();
      if (!pergunta || !resposta) return json({ error: "Pergunta e resposta são obrigatórias." }, 400);
      const embedding = await embed(`${pergunta}\n${resposta}`);
      const row: Record<string, unknown> = {
        agent_slug,
        pergunta,
        resposta,
        enabled: item.enabled !== false,
        embedding,
        updated_at: new Date().toISOString(),
      };
      if (item.id) row.id = item.id;
      const { data, error } = await supabase
        .from("wsdr_knowledge_items")
        .upsert(row)
        .select("id, pergunta, resposta, enabled")
        .single();
      if (error) throw error;
      return json({ item: data, embedded: embedding !== null });
    }

    // search: chamado pelo n8n (com a chave de serviço). Embute a mensagem do casal e
    // busca os trechos relevantes via a RPC (SECURITY DEFINER, recebe org_id). Devolve
    // já formatado pro prompt. Vazio se kb desligada / sem itens / sem mensagem.
    if (action === "search") {
      const message = String(body.message || "").trim();
      const org_id = body.org_id;
      if (!message || !org_id) return json({ faqs_txt: "", count: 0 });
      const emb = await embed(message);
      if (!emb) return json({ faqs_txt: "", count: 0 });
      const { data, error } = await supabase.rpc("wsdr_search_knowledge", {
        p_org_id: org_id,
        p_agent_slug: agent_slug,
        p_query_embedding: emb,
        p_match_count: typeof body.top_k === "number" ? body.top_k : 4,
      });
      if (error) return json({ faqs_txt: "", count: 0, error: error.message });
      const rows = (data ?? []) as Array<{ pergunta: string; resposta: string }>;
      const faqs_txt = rows.map((r) => `- P: ${r.pergunta}\n  R: ${r.resposta}`).join("\n");
      return json({ faqs_txt, count: rows.length });
    }

    if (action === "delete") {
      if (!body.id) return json({ error: "id obrigatório" }, 400);
      const { error } = await supabase.from("wsdr_knowledge_items").delete().eq("id", body.id);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: "Ação inválida (use list, upsert ou delete)." }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
