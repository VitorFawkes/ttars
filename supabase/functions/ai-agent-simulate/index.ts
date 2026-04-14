/**
 * ai-agent-simulate — Simulador do agente para o editor (C7).
 *
 * Recebe agent_id + messages e retorna a resposta da Luna SEM:
 *   - Gravar em ai_conversations
 *   - Enviar mensagem real via Echo/WhatsApp
 *   - Atualizar dados do CRM
 *
 * Útil para o cliente iterar prompts sem ativar o agente.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface AgentRow {
  id: string;
  org_id: string;
  nome: string;
  persona: string | null;
  modelo: string;
  temperature: number;
  max_tokens: number;
  system_prompt: string;
  handoff_signals?: Array<{ slug: string; enabled: boolean; description: string }> | null;
  intelligent_decisions?: Record<string, { enabled: boolean; config: Record<string, unknown> }> | null;
  prompts_extra?: { context?: string; data_update?: string; formatting?: string; validator?: string } | null;
  multimodal_config?: { audio: boolean; image: boolean; pdf: boolean } | null;
}

interface SimulateRequest {
  agent_id: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  card_id?: string;
}

function buildHandoffBlock(agent: AgentRow): string {
  const signals = agent.handoff_signals?.filter(s => s.enabled) ?? [];
  if (signals.length === 0) return "";
  const items = signals.map(s => `- ${s.description}`).join("\n");
  return `\nSINAIS DE HANDOFF:\n${items}`;
}

function buildDecisionsBlock(agent: AgentRow): string {
  const decisions = agent.intelligent_decisions ?? {};
  const active = Object.entries(decisions).filter(([_, d]) => d.enabled);
  if (active.length === 0) return "";
  const items = active.map(([key, d]) => {
    const instr = (d.config?.instructions as string) || "";
    return `- ${key}${instr ? `: ${instr}` : ""}`;
  }).join("\n");
  return `\nDECISÕES INTELIGENTES:\n${items}`;
}

function buildExtraPromptsBlock(agent: AgentRow): string {
  const extra = agent.prompts_extra ?? {};
  const parts: string[] = [];
  if (extra.context) parts.push(`CONTEXTO:\n${extra.context}`);
  if (extra.data_update) parts.push(`ATUALIZAÇÃO DE DADOS:\n${extra.data_update}`);
  if (extra.formatting) parts.push(`FORMATAÇÃO:\n${extra.formatting}`);
  if (extra.validator) parts.push(`VALIDAÇÃO:\n${extra.validator}`);
  return parts.length > 0 ? `\n${parts.join("\n\n")}` : "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json() as SimulateRequest;
    if (!body.agent_id || !body.messages || body.messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "agent_id and messages required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: agent, error: agentErr } = await supabase
      .from("ai_agents")
      .select(`
        id, org_id, nome, persona, modelo, temperature, max_tokens, system_prompt,
        handoff_signals, intelligent_decisions, prompts_extra, multimodal_config
      `)
      .eq("id", body.agent_id)
      .single();

    if (agentErr || !agent) {
      return new Response(
        JSON.stringify({ error: "Agent not found", details: agentErr?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const a = agent as AgentRow;
    const handoffBlock = buildHandoffBlock(a);
    const decisionsBlock = buildDecisionsBlock(a);
    const extraBlock = buildExtraPromptsBlock(a);

    const systemPrompt = `${a.system_prompt}\n${handoffBlock}\n${decisionsBlock}\n${extraBlock}\n\nMODO SIMULAÇÃO: você está sendo testado pelo administrador. Responda como responderia ao cliente real. Não chame ferramentas — explique em texto o que faria.`;

    const startTime = Date.now();
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: a.modelo || "gpt-4.1-mini",
        temperature: a.temperature ?? 0.7,
        max_tokens: a.max_tokens ?? 1024,
        messages: [
          { role: "system", content: systemPrompt },
          ...body.messages,
        ],
      }),
    });

    if (!openaiRes.ok) {
      const errBody = await openaiRes.text();
      return new Response(
        JSON.stringify({ error: "LLM error", details: errBody }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const llmData = await openaiRes.json();
    const elapsed = Date.now() - startTime;
    const response = llmData.choices?.[0]?.message?.content || "(sem resposta)";
    const usage = llmData.usage || {};

    return new Response(
      JSON.stringify({
        success: true,
        response,
        elapsed_ms: elapsed,
        tokens: {
          input: usage.prompt_tokens || 0,
          output: usage.completion_tokens || 0,
        },
        prompt_used: systemPrompt,
        modelo: a.modelo,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal error", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
