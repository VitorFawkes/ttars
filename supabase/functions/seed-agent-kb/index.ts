/**
 * seed-agent-kb — Popula a KB de um agente a partir de integration_settings.JULIA_FAQ
 * (ou de um texto passado no body). Divide por "## ", gera embeddings e vincula ao agente.
 *
 * POST /functions/v1/seed-agent-kb
 * Body: { agent_id: UUID, source_key?: string (default 'JULIA_FAQ'), kb_name?: string, replace_existing?: boolean }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const openaiKey = Deno.env.get("OPENAI_API_KEY")!;

    const body = await req.json();
    const agentId: string = body.agent_id;
    const sourceKey: string = body.source_key || "JULIA_FAQ";
    const replaceExisting: boolean = body.replace_existing !== false;

    if (!agentId) {
      return new Response(JSON.stringify({ error: "agent_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: agent } = await supabase
      .from("ai_agents").select("id, nome, org_id, produto").eq("id", agentId).single();
    if (!agent) return new Response(JSON.stringify({ error: "agent_not_found" }), { status: 404, headers: corsHeaders });

    // Tenta primeiro na org do agente; se vazio, fallback pra qualquer org (util pro Welcome Group legado)
    let setting;
    ({ data: setting } = await supabase
      .from("integration_settings").select("value").eq("key", sourceKey).eq("org_id", agent.org_id).maybeSingle());
    if (!setting?.value) {
      const { data: fallback } = await supabase
        .from("integration_settings").select("value, org_id").eq("key", sourceKey).order("updated_at", { ascending: false }).limit(1).maybeSingle();
      setting = fallback;
    }
    const faqText: string = setting?.value || body.text || "";
    if (!faqText) return new Response(JSON.stringify({ error: "source_empty", key: sourceKey }), { status: 404, headers: corsHeaders });

    // Dividir por "## " (h2)
    const lines = faqText.split("\n");
    const sections: Array<{ titulo: string; conteudo: string }> = [];
    let cTitle = ""; let cBody: string[] = [];
    for (const l of lines) {
      const h = l.match(/^##\s+(.+)$/);
      if (h) {
        if (cTitle && cBody.join("\n").trim()) sections.push({ titulo: cTitle, conteudo: cBody.join("\n").trim() });
        cTitle = h[1].trim(); cBody = [];
      } else if (cTitle) cBody.push(l);
    }
    if (cTitle && cBody.join("\n").trim()) sections.push({ titulo: cTitle, conteudo: cBody.join("\n").trim() });

    if (sections.length === 0) {
      // Fallback: usar texto inteiro como 1 item
      sections.push({ titulo: `FAQ ${agent.nome}`, conteudo: faqText });
    }

    // KB: reutilizar ou criar
    const kbNome = body.kb_name || `KB - ${agent.nome}`;
    const { data: existingKb } = await supabase
      .from("ai_knowledge_bases").select("id").eq("nome", kbNome).eq("org_id", agent.org_id).maybeSingle();

    let kbId: string;
    if (existingKb?.id) {
      kbId = existingKb.id;
      if (replaceExisting) {
        await supabase.from("ai_knowledge_base_items").delete().eq("kb_id", kbId);
      }
    } else {
      const { data: newKb, error: kbErr } = await supabase.from("ai_knowledge_bases").insert({
        org_id: agent.org_id, produto: agent.produto, nome: kbNome, tipo: "faq",
        descricao: `Base migrada de ${sourceKey} em ${new Date().toISOString()}`, ativa: true,
      }).select("id").single();
      if (kbErr || !newKb) return new Response(JSON.stringify({ error: "kb_create_failed", details: kbErr?.message }), { status: 500, headers: corsHeaders });
      kbId = newKb.id;
    }

    // Embeddings em batch
    const inputs = sections.map((s) => `${s.titulo}\n${s.conteudo}`);
    const embRes = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-3-small", input: inputs }),
    });
    if (!embRes.ok) {
      const errTxt = await embRes.text();
      return new Response(JSON.stringify({ error: "openai_embedding_failed", status: embRes.status, detail: errTxt.substring(0, 500) }), { status: 500, headers: corsHeaders });
    }
    const embData = await embRes.json();
    const vectors: number[][] = embData.data.map((d: { embedding: number[] }) => d.embedding);

    const rows = sections.map((s, i) => ({
      kb_id: kbId, titulo: s.titulo, conteudo: s.conteudo, tags: [], ordem: i,
      embedding: `[${vectors[i].join(",")}]`, ativa: true,
    }));
    const { error: insErr } = await supabase.from("ai_knowledge_base_items").insert(rows);
    if (insErr) return new Response(JSON.stringify({ error: "items_insert_failed", details: insErr.message }), { status: 500, headers: corsHeaders });

    // Vincular (upsert)
    const { data: existingLink } = await supabase
      .from("ai_agent_knowledge_bases").select("id").eq("agent_id", agent.id).eq("kb_id", kbId).maybeSingle();
    if (!existingLink) {
      await supabase.from("ai_agent_knowledge_bases").insert({
        org_id: agent.org_id, agent_id: agent.id, kb_id: kbId, priority: 10, enabled: true,
      });
    }

    await supabase.from("ai_knowledge_bases").update({ last_synced_at: new Date().toISOString() }).eq("id", kbId);

    return new Response(JSON.stringify({
      ok: true, agent_id: agent.id, agent_name: agent.nome, kb_id: kbId,
      items_inserted: rows.length, sections_detected: sections.length,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: "internal", details: String(err) }), { status: 500, headers: corsHeaders });
  }
});
