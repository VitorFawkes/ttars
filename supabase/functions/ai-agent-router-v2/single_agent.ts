// Single Agent (gpt-5.5, t=0.6) — coração da Patricia.
//
// Substitui pipeline 5-step da Estela (Backoffice + Data + Subjective + Persona + Validator)
// por UMA chamada LLM com structured output JSON.
//
// Output: { messages, card_patch, contact_patch, current_moment_key, tool_calls, internal_reasoning }
//
// Tools são OPCIONAIS — o LLM decide se chama (calculate_qualification_score,
// search_knowledge_base, etc.). Diferente do callLLMWithTools de v1 que faz loop
// turn-by-turn com OpenAI, aqui o LLM declara `tool_calls` no JSON e o runtime
// executa APÓS gerar messages (single-call). Versão futura pode adicionar loop.

import {
  loadPlaybookFewShotExamples,
  loadPlaybookMoments,
  loadPlaybookSilentSignals,
  loadScoringRulesForPlaybook,
} from "./playbook_loader.ts";
import {
  buildSinglePrompt,
  type BuildSinglePromptInput,
} from "./prompt_assembler.ts";
import {
  SINGLE_AGENT_OUTPUT_SCHEMA,
  type SingleAgentOutput,
} from "./prompt_schema.ts";

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// Default models — admin pode override via ai_agents.pipeline_models.main
const DEFAULT_MODEL = "gpt-5.1";
const DEFAULT_TEMPERATURE = 0.6;
const DEFAULT_MAX_TOKENS = 2048;

export interface RunSingleAgentInput {
  supabase: SupabaseClient;
  apiKey: string;
  agent: {
    id: string;
    nome: string;
    modelo: string | null;
    temperature: number | null;
    max_tokens: number | null;
    pipeline_models: Record<string, unknown> | null;
    identity_config: BuildSinglePromptInput["agent"]["identity_config"];
    voice_config: BuildSinglePromptInput["agent"]["voice_config"];
    boundaries_config: BuildSinglePromptInput["agent"]["boundaries_config"];
    listening_config: BuildSinglePromptInput["agent"]["listening_config"];
  };
  business: BuildSinglePromptInput["business"];
  conversationState: BuildSinglePromptInput["conversationState"];
  scoringThreshold: number;
  availableTools: string[];
}

export interface RunSingleAgentResult {
  output: SingleAgentOutput;
  raw_response: string;
  prompt_system_chars: number;
  prompt_user_chars: number;
  duration_ms: number;
  model_used: string;
}

export async function runSingleAgent(
  input: RunSingleAgentInput,
): Promise<RunSingleAgentResult> {
  const startedAt = Date.now();

  // Carregar playbook em paralelo
  const [moments, silentSignals, fewShotExamples, scoringRules] =
    await Promise.all([
      loadPlaybookMoments(input.supabase, input.agent.id),
      loadPlaybookSilentSignals(input.supabase, input.agent.id),
      loadPlaybookFewShotExamples(input.supabase, input.agent.id),
      loadScoringRulesForPlaybook(input.supabase, input.agent.id),
    ]);

  // Resolver modelo + temperature + max_tokens
  // Patricia usa pipeline_models.main por convenção (mesmo nome de v1)
  const mainModelCfg = (input.agent.pipeline_models as Record<string, { model?: string; temperature?: number; max_tokens?: number }>)?.main;
  const model = mainModelCfg?.model || input.agent.modelo || DEFAULT_MODEL;
  const temperature = mainModelCfg?.temperature ?? input.agent.temperature ?? DEFAULT_TEMPERATURE;
  const maxTokens = mainModelCfg?.max_tokens ?? input.agent.max_tokens ?? DEFAULT_MAX_TOKENS;

  // Montar prompt
  const { system, user } = buildSinglePrompt({
    agent: input.agent,
    business: input.business,
    moments,
    silentSignals,
    fewShotExamples,
    scoringRules,
    scoringThreshold: input.scoringThreshold,
    conversationState: input.conversationState,
    availableTools: input.availableTools,
  });

  // Chamar OpenAI com structured output
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model,
      // GPT-5.5 só suporta temperature=1 (default). Omitir respeita o default.
      max_completion_tokens: maxTokens,
      response_format: SINGLE_AGENT_OUTPUT_SCHEMA,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(
      `[single_agent] OpenAI HTTP ${response.status}: ${errBody.substring(0, 1000)}`,
    );
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content;

  if (!rawContent) {
    throw new Error(`[single_agent] OpenAI retornou conteúdo vazio. Body: ${JSON.stringify(data).substring(0, 500)}`);
  }

  let parsed: SingleAgentOutput;
  try {
    parsed = JSON.parse(rawContent) as SingleAgentOutput;
  } catch (e) {
    throw new Error(
      `[single_agent] JSON parse falhou: ${(e as Error).message}. Conteúdo: ${rawContent.substring(0, 1000)}`,
    );
  }

  // Validações de sanidade
  if (!Array.isArray(parsed.messages)) parsed.messages = [];
  if (!parsed.card_patch || typeof parsed.card_patch !== "object") parsed.card_patch = {};
  if (!parsed.contact_patch || typeof parsed.contact_patch !== "object") parsed.contact_patch = {};
  if (!Array.isArray(parsed.tool_calls)) parsed.tool_calls = [];
  if (typeof parsed.internal_reasoning !== "string") parsed.internal_reasoning = "";
  if (parsed.current_moment_key !== null && typeof parsed.current_moment_key !== "string") {
    parsed.current_moment_key = null;
  }

  // Filtrar mensagens vazias
  parsed.messages = parsed.messages.filter((m) => m && m.content && m.content.trim().length > 0);

  return {
    output: parsed,
    raw_response: rawContent,
    prompt_system_chars: system.length,
    prompt_user_chars: user.length,
    duration_ms: Date.now() - startedAt,
    model_used: model,
  };
}
