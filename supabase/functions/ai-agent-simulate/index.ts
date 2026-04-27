/**
 * ai-agent-simulate — Simulador do agente para o editor.
 *
 * Recebe agent_id + messages e retorna a resposta SEM gravar em conversas,
 * enviar via WhatsApp ou atualizar CRM. Útil para o admin iterar prompts
 * sem ativar o agente.
 *
 * v2 (Marco 2b): aceita `preview_playbook_config` opcional pra testar
 * configuração em memória (ainda não salva no banco) — usado pelo painel
 * "Prévia" da aba Playbook.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import {
  buildPromptV2,
} from "../ai-agent-router/prompt_builder_v2.ts";
import {
  loadPlaybookMoments,
  loadPlaybookSilentSignals,
  loadPlaybookFewShotExamples,
  loadScoringRulesForPlaybook,
  type PlaybookMoment,
  type PlaybookSilentSignal,
  type PlaybookFewShotExample,
  type IdentityConfig,
  type VoiceConfig,
  type BoundariesConfig,
  type ScoringRule,
} from "../ai-agent-router/playbook_loader.ts";
import { detectMoment } from "../ai-agent-router/moment_detector.ts";

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
  // v2
  playbook_enabled?: boolean | null;
  identity_config?: IdentityConfig | null;
  voice_config?: VoiceConfig | null;
  boundaries_config?: BoundariesConfig | null;
}

interface PreviewPlaybookConfig {
  identity_config?: IdentityConfig | null;
  voice_config?: VoiceConfig | null;
  boundaries_config?: BoundariesConfig | null;
  moments?: PlaybookMoment[];
  silent_signals?: PlaybookSilentSignal[];
  few_shot_examples?: PlaybookFewShotExample[];
  scoring_rules?: ScoringRule[];
}

interface SimulateRequest {
  agent_id: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  card_id?: string;
  // v2 — quando presente, ignora dados do banco e usa estas configs.
  // Permite testar alterações antes de salvar.
  preview_playbook_config?: PreviewPlaybookConfig;
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
        handoff_signals, intelligent_decisions, prompts_extra, multimodal_config,
        playbook_enabled, identity_config, voice_config, boundaries_config
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

    // Business config básico pra prompt v2
    const { data: businessRow } = await supabase
      .from("ai_agent_business_config")
      .select("company_name, company_description, methodology_text")
      .eq("agent_id", body.agent_id)
      .maybeSingle();

    const preview = body.preview_playbook_config;
    const usePlaybook = Boolean(preview) || a.playbook_enabled === true;

    let systemPrompt = "";
    let detectedMoment: string | null = null;
    let momentDetectionMethod: string | null = null;

    if (usePlaybook) {
      // Carrega configs: prefere preview (memória), senão banco
      let moments: PlaybookMoment[] = [];
      let signals: PlaybookSilentSignal[] = [];
      let examples: PlaybookFewShotExample[] = [];
      let rules: ScoringRule[] = [];

      if (preview?.moments) moments = preview.moments;
      else moments = await loadPlaybookMoments(supabase, a.id);

      if (preview?.silent_signals) signals = preview.silent_signals;
      else signals = await loadPlaybookSilentSignals(supabase, a.id);

      if (preview?.few_shot_examples) examples = preview.few_shot_examples;
      else examples = await loadPlaybookFewShotExamples(supabase, a.id);

      if (preview?.scoring_rules) rules = preview.scoring_rules;
      else rules = await loadScoringRulesForPlaybook(supabase, a.id);

      const identity = preview?.identity_config ?? a.identity_config ?? null;
      const voice = preview?.voice_config ?? a.voice_config ?? null;
      const boundaries = preview?.boundaries_config ?? a.boundaries_config ?? null;

      if (moments.length === 0) {
        return new Response(
          JSON.stringify({
            error: "Preview playbook sem momentos configurados",
            hint: "Adicione pelo menos 1 momento na aba Playbook ou no preview_playbook_config",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Detecta momento a partir das messages do simulador
      const isPrimeiro = body.messages.filter(m => m.role === 'user').length <= 1;
      const lastLeadMsg = [...body.messages].reverse().find(m => m.role === 'user')?.content ?? null;
      const ownerBeforeLast = body.messages.length > 1
        && body.messages[body.messages.length - 1].role === 'user'
        && body.messages.some(m => m.role === 'assistant');

      const detected = detectMoment({
        moments,
        ctx: {
          is_primeiro_contato: isPrimeiro,
          lead_replied_now: ownerBeforeLast,
          last_lead_message: lastLeadMsg,
          last_moment_key: null,
          turn_count: body.messages.filter(m => m.role === 'user').length,
          qualification_score_current: null,
        },
        backofficeSuggestion: null,
      });

      detectedMoment = detected.moment.moment_key;
      momentDetectionMethod = detected.method;

      const historicoCompacto = body.messages
        .slice(-8)
        .map(m => `[${m.role === 'user' ? 'lead' : 'owner'}]: ${m.content}`)
        .join('\n');

      systemPrompt = buildPromptV2({
        agentName: a.nome,
        companyName: businessRow?.company_name ?? "",
        identity,
        voice,
        boundaries,
        moments,
        currentMoment: detected.moment,
        currentMomentMethod: detected.method,
        silentSignals: signals,
        fewShotExamples: examples,
        scoringRules: rules,
        // Marcar enabled:true preview-only pra que blocos dependentes (qualification,
        // handoff_logic) renderizem. Score real é calculado só em produção via persona_v2.
        scoreInfo: { enabled: true, score: 0, threshold: 25, qualificado: false },
        ctx: {
          is_primeiro_contato: isPrimeiro,
          contact_name: "Cliente Teste",
          contact_name_known: true,
          contact_role: "primary",
          card_id: null,
          card_titulo: null,
          pipeline_stage_id: null,
          ai_resumo: "",
          ai_contexto: "",
          form_data: {},
          qualificationSignals: {},
          historico_compacto: historicoCompacto,
          last_moment_key: null,
        },
        userMessage: lastLeadMsg ?? "",
        companyDescription: businessRow?.methodology_text ?? businessRow?.company_description,
      });
    } else {
      // v1: comportamento original
      const handoffBlock = buildHandoffBlock(a);
      const decisionsBlock = buildDecisionsBlock(a);
      const extraBlock = buildExtraPromptsBlock(a);
      systemPrompt = `${a.system_prompt}\n${handoffBlock}\n${decisionsBlock}\n${extraBlock}\n\nMODO SIMULAÇÃO: você está sendo testado pelo administrador. Responda como responderia ao cliente real. Não chame ferramentas — explique em texto o que faria.`;
    }

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
        max_completion_tokens: a.max_tokens ?? 1024,
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
        agent_version: usePlaybook ? 'v2' : 'v1',
        current_moment_key: detectedMoment,
        moment_detection_method: momentDetectionMethod,
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
