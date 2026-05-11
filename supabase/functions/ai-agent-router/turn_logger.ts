// Helper de logging de execução por turno do agente IA.
// scrubPII roda pre-INSERT em prompt_system/prompt_user/raw_response.
// hashDiscoveryConfig produz hash (SHA-256 via WebCrypto OU hash síncrono FNV-like
// pra usos em test runner sem await).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Remove PII básico do texto antes de gravar nos logs.
 * Cobre: telefone BR, email, CPF. Nomes próprios NÃO scrubbed
 * (trade-off consciente — necessários pra auditoria de tom).
 *
 * Ordem importa: CPF antes de telefone porque alguns padrões se sobrepõem.
 */
export function scrubPII(text: string): string {
  if (!text) return text;
  return text
    // CPF com pontuação: 123.456.789-00
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, "[CPF]")
    // CPF sem pontuação: 11 dígitos seguidos (antes do telefone)
    .replace(/\b\d{11}\b/g, "[CPF]")
    // Telefone BR (com ou sem +55, 9 ou 8 dígitos no celular)
    .replace(/(\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g, "[PHONE]")
    // Email
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[EMAIL]");
}

/**
 * Hash SHA-256 (truncado a 16 chars) do discovery_config.
 * Async porque usa WebCrypto. Use hashDiscoveryConfigSync em testes.
 */
export async function hashDiscoveryConfig(config: unknown): Promise<string> {
  const json = JSON.stringify(config ?? null);
  const buf = new TextEncoder().encode(json);
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .substring(0, 16);
}

/**
 * Hash síncrono não-criptográfico (FNV-like). Suficiente pra detectar
 * mudança de config entre turns. Útil em testes que não usam await.
 */
export function hashDiscoveryConfigSync(config: unknown): string {
  const json = JSON.stringify(config ?? null);
  let h = 0;
  for (let i = 0; i < json.length; i++) {
    h = ((h << 5) - h + json.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}

export interface TurnLogPayload {
  turn_id: string;
  agent_id: string;
  org_id: string;
  conversation_id: string;
  attempt_number: number;
  prompt_system: string;
  prompt_user: string;
  raw_response: string;
  final_messages: string[] | null;
  model_used: string;
  temperature_used: number;
  max_tokens_used: number;
  tool_calls: unknown[];
  validator_verdict: unknown;
  slot_in_focus: string | null;
  duration_ms: number;
  prompt_builder_version: string;
  discovery_config_hash: string;
}

/**
 * Insere log em ai_agent_turn_logs. Fire-and-forget: erro de INSERT
 * NÃO bloqueia envio ao WhatsApp (caller já pode ter enviado). Loga
 * erros via console — visíveis em logs do edge function.
 */
export async function recordTurnLog(
  supabase: SupabaseClient,
  payload: TurnLogPayload,
): Promise<void> {
  try {
    const scrubbed = {
      ...payload,
      prompt_system: scrubPII(payload.prompt_system),
      prompt_user: scrubPII(payload.prompt_user),
      raw_response: scrubPII(payload.raw_response),
    };
    const { error } = await supabase.from("ai_agent_turn_logs").insert(scrubbed);
    if (error) {
      console.error("[turn_logger] INSERT failed:", error.message);
    }
  } catch (e) {
    console.error("[turn_logger] exception:", (e as Error).message);
  }
}
