/**
 * ai-agent-deploy-prompt — Deploya prompts do Supabase para o n8n.
 *
 * Chamado quando o usuário salva um prompt no admin UI.
 * Busca o prompt atualizado do banco e atualiza o nó correspondente no n8n via API.
 *
 * POST /functions/v1/ai-agent-deploy-prompt
 * Headers: Authorization: Bearer $SERVICE_ROLE_KEY
 *
 * Body:
 *   {
 *     "agent_id": "uuid",
 *     "prompt_version": 1  // 1=Agent1, 2=Agent2, 3=Agent3
 *   }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mapeamento de versão do prompt → nome do nó no n8n
const PROMPT_NODE_MAP: Record<number, string> = {
  1: "Atualiza Info Lead e Contexto",   // Agent 1: Context & Summary
  2: "Atualiza dados",                   // Agent 2: Data & Stage Update
  3: "Responde Lead (Novo)",             // Agent 3: Julia Persona
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { agent_id, prompt_version } = await req.json();

    if (!agent_id || !prompt_version) {
      return new Response(
        JSON.stringify({ error: "agent_id and prompt_version required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Buscar agente e n8n_webhook_url
    const { data: agent, error: agentErr } = await supabase
      .from("ai_agents")
      .select("id, nome, n8n_webhook_url")
      .eq("id", agent_id)
      .single();

    if (agentErr || !agent) {
      return new Response(
        JSON.stringify({ error: "Agent not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Buscar prompt
    const { data: prompt, error: promptErr } = await supabase
      .from("ai_agent_prompts")
      .select("system_prompt, variant_name")
      .eq("agent_id", agent_id)
      .eq("version", prompt_version)
      .eq("is_active", true)
      .single();

    if (promptErr || !prompt) {
      return new Response(
        JSON.stringify({ error: "Prompt not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Extrair workflow ID do webhook URL
    // webhook URL: https://n8n-xxx/webhook/welcome-trips-agent
    // workflow ID é buscado via n8n API
    const n8nUrl = Deno.env.get("N8N_URL") || "https://n8n-n8n.ymnmx7.easypanel.host";
    const n8nApiKey = Deno.env.get("N8N_API_KEY");

    if (!n8nApiKey) {
      return new Response(
        JSON.stringify({ error: "N8N_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar o ID do workflow da Julia (hardcoded por segurança)
    const workflowId = "tvh1SN7VDgy8V3VI";

    // 4. Buscar workflow atual do n8n
    const workflowRes = await fetch(`${n8nUrl}/api/v1/workflows/${workflowId}`, {
      headers: { "X-N8N-API-KEY": n8nApiKey, Accept: "application/json" },
    });

    if (!workflowRes.ok) {
      const err = await workflowRes.text();
      return new Response(
        JSON.stringify({ error: "Failed to fetch n8n workflow", details: err }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const workflow = await workflowRes.json();

    // 5. Encontrar o nó correspondente e atualizar o prompt
    const nodeName = PROMPT_NODE_MAP[prompt_version];
    if (!nodeName) {
      return new Response(
        JSON.stringify({ error: `Invalid prompt_version: ${prompt_version}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const targetNode = workflow.nodes?.find(
      (n: { name: string }) => n.name === nodeName
    );

    if (!targetNode) {
      return new Response(
        JSON.stringify({ error: `Node '${nodeName}' not found in workflow` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prefixar com = para n8n tratar como expressão (para resolver {{ }})
    const newText = prompt.system_prompt.startsWith("=")
      ? prompt.system_prompt
      : `=${prompt.system_prompt}`;

    const oldText = targetNode.parameters?.text || "";
    targetNode.parameters.text = newText;

    // 6. Fazer PUT do workflow atualizado no n8n
    // Remover campos que o n8n não aceita no PUT
    const cleanSettings = { executionOrder: "v1" };
    const updatePayload = {
      name: workflow.name,
      nodes: workflow.nodes,
      connections: workflow.connections,
      settings: cleanSettings,
    };

    const updateRes = await fetch(`${n8nUrl}/api/v1/workflows/${workflowId}`, {
      method: "PUT",
      headers: {
        "X-N8N-API-KEY": n8nApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updatePayload),
    });

    if (!updateRes.ok) {
      const err = await updateRes.text();
      return new Response(
        JSON.stringify({ error: "Failed to update n8n workflow", details: err }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. Reativar workflow (para re-registrar webhooks)
    await fetch(`${n8nUrl}/api/v1/workflows/${workflowId}/deactivate`, {
      method: "POST",
      headers: { "X-N8N-API-KEY": n8nApiKey },
    });
    await fetch(`${n8nUrl}/api/v1/workflows/${workflowId}/activate`, {
      method: "POST",
      headers: { "X-N8N-API-KEY": n8nApiKey },
    });

    return new Response(
      JSON.stringify({
        success: true,
        agent: agent.nome,
        node_updated: nodeName,
        prompt_version: prompt_version,
        prompt_chars: newText.length,
        old_prompt_chars: oldText.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Deploy prompt error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
