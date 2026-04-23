/**
 * ai-agent-outbound-trigger — Processa fila outbound e envia primeira mensagem.
 *
 * POST /functions/v1/ai-agent-outbound-trigger
 * Invocada via cron (pg_cron ou n8n) a cada 30-60 segundos.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface QueueItem {
  queue_id: string;
  agent_id: string;
  card_id: string;
  contato_id: string;
  contact_phone: string;
  contact_name: string;
  form_data: Record<string, unknown>;
  trigger_type: string;
  trigger_metadata: Record<string, unknown>;
  org_id: string;
  first_message_config: {
    type: "fixed" | "ai_generated";
    fixed_template?: string;
    ai_instructions?: string;
    delay_seconds?: number;
  } | null;
  interaction_mode: string;
}

interface BusinessHoursConfig {
  start: string;
  end: string;
  timezone: string;
  days: string[];
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 12 && digits.startsWith("55")) return digits;
  if (digits.length >= 10) return `55${digits}`;
  return digits;
}

function isValidBRPhone(phone: string): boolean {
  const digits = normalizePhone(phone).replace(/^55/, "");
  return digits.length >= 10 && digits.length <= 11;
}

function isWithinBusinessHours(config: BusinessHoursConfig | undefined): boolean {
  if (!config) return true;
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: config.timezone || "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = formatter.formatToParts(now);
  const hour = parts.find((p) => p.type === "hour")?.value || "00";
  const minute = parts.find((p) => p.type === "minute")?.value || "00";
  const dayName = (parts.find((p) => p.type === "weekday")?.value || "").toLowerCase();
  const currentTime = `${hour}:${minute}`;
  if (!config.days.includes(dayName)) return false;
  return currentTime >= config.start && currentTime <= config.end;
}

function resolveTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+(?::[\w-]+)?)\}\}/g, (_, key: string) => {
    if (key === "contact_name") return vars.contact_name || "Cliente";
    if (key === "agent_name") return vars.agent_name || "";
    if (key === "company_name") return vars.company_name || "";
    if (key.startsWith("form_field:")) {
      const field = key.split(":")[1];
      return vars[`form_${field}`] || "";
    }
    return vars[key] || "";
  });
}

/**
 * System prompt para modo concept (diretriz livre). Usado tanto pela nova
 * tabela ai_agent_presentations quanto pelo fallback legado first_message_config.
 */
function buildConceptSystemPrompt(
  concept: string,
  item: QueueItem,
  vars: Record<string, string>,
): string {
  const formContext = Object.entries(item.form_data || {})
    .filter(([, v]) => v)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");

  return `Voce e ${vars.agent_name || "um assistente de vendas"}${
    vars.company_name ? ` da ${vars.company_name}` : ""
  }. Gere UMA mensagem WhatsApp de primeiro contato.

DIRETRIZ (siga como base, mantenha seu tom):
${concept}

Dados do lead:
- Nome: ${item.contact_name || "Cliente"}
${formContext ? `\nDados do formulario:\n${formContext}` : ""}

REGRAS:
- Maximo 2 frases. Tom natural, sem ser robotico.
- NUNCA mencione "diretriz", "instrucao", IA, sistema ou formulario.
- NUNCA use emojis em excesso (0-1 no maximo).
- Personalize com os dados disponiveis.

SAIDA: APENAS o texto da mensagem, pronto pra enviar.`;
}

async function callLLM(
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      max_completion_tokens: 300,
      temperature: 0.7,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function generateFollowUpMessage(
  supabase: ReturnType<typeof createClient>,
  item: QueueItem,
): Promise<string> {
  const idleDays = (item.trigger_metadata as Record<string, unknown>)?.idle_days || 3;

  // Carregar card com ai_resumo e ai_contexto
  const { data: card } = await supabase
    .from("cards")
    .select("titulo, ai_resumo, ai_contexto, pipeline_stage_id, produto_data")
    .eq("id", item.card_id)
    .single();

  // Carregar nome do estagio
  let stageName = "";
  if (card?.pipeline_stage_id) {
    const { data: stage } = await supabase
      .from("pipeline_stages")
      .select("nome")
      .eq("id", card.pipeline_stage_id)
      .single();
    stageName = stage?.nome || "";
  }

  // Carregar ultima conversa AI deste contato
  const { data: lastConv } = await supabase
    .from("ai_conversations")
    .select("id, status, updated_at")
    .eq("contact_id", item.contato_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  let historicoCompacto = "";
  if (lastConv?.id) {
    const { data: turns } = await supabase
      .from("ai_conversation_turns")
      .select("role, content, created_at")
      .eq("conversation_id", lastConv.id)
      .order("created_at", { ascending: false })
      .limit(8);

    if (turns && turns.length > 0) {
      historicoCompacto = turns
        .reverse()
        .map((t) => {
          const who = t.role === "user" ? "lead" : "agente";
          return `[${who}]: ${t.content}`;
        })
        .join("\n");
    }
  }

  // Carregar agent name e persona
  const { data: agent } = await supabase
    .from("ai_agents")
    .select("nome, persona, system_prompt")
    .eq("id", item.agent_id)
    .single();

  const agentName = agent?.nome || "Assistente";
  const aiResumo = card?.ai_resumo || "Sem resumo disponivel";
  const aiContexto = card?.ai_contexto || "";

  const systemPrompt = `Voce e ${agentName}, assistente de vendas.
${agent?.persona ? `Personalidade: ${agent.persona}` : ""}

O lead ${item.contact_name || "Cliente"} conversou com voce ha ${idleDays} dias e nao respondeu mais.
Seu objetivo: retomar a conversa de forma natural, como se fosse um follow-up humano.

CONTEXTO DO LEAD:
- Resumo: ${aiResumo}
${aiContexto ? `- Contexto adicional: ${aiContexto}` : ""}
${stageName ? `- Estagio no pipeline: ${stageName}` : ""}
${card?.titulo ? `- Card: ${card.titulo}` : ""}

ULTIMA CONVERSA:
${historicoCompacto || "Nenhum historico disponivel"}

REGRAS:
- Gere UMA mensagem de follow-up natural que retome de onde parou.
- NAO repita perguntas ja respondidas na conversa anterior.
- NAO mencione IA, sistema, bot ou qualquer indicativo automatizado.
- NAO diga "estou entrando em contato novamente" de forma robotica.
- Tom casual e natural, como um humano mandaria no WhatsApp.
- Maximo 2-3 frases. Pode usar 0-1 emoji.
- Se o historico mostra que o lead demonstrou interesse em algo especifico, retome a partir dali.

SAIDA: APENAS o texto da mensagem, pronto pra enviar via WhatsApp.`;

  return await callLLM(systemPrompt, "Gere a mensagem de follow-up.");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // 1. Claim items from queue
    const { data: items, error: queueErr } = await supabase.rpc(
      "process_outbound_queue",
      { p_limit: 10 },
    );

    if (queueErr) {
      console.error("[ai-agent-outbound-trigger] Queue RPC error:", queueErr.message);
      return new Response(
        JSON.stringify({ error: "Queue processing failed", details: queueErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!items || items.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, message: "No items in queue" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[ai-agent-outbound-trigger] Processing ${items.length} items`);
    const results: Array<{ queue_id: string; status: string; error?: string }> = [];

    for (const item of items as QueueItem[]) {
      try {
        // 2. Validate phone
        if (!isValidBRPhone(item.contact_phone)) {
          await supabase.rpc("complete_outbound_queue_item", {
            p_queue_id: item.queue_id,
            p_status: "skipped",
            p_error: "Invalid phone number",
          });
          results.push({ queue_id: item.queue_id, status: "skipped", error: "invalid_phone" });
          continue;
        }

        // 3. Check business hours + test-mode whitelist
        const { data: agentRow } = await supabase
          .from("ai_agents")
          .select("outbound_trigger_config, test_mode_phone_whitelist")
          .eq("id", item.agent_id)
          .single();

        const testWhitelist = (agentRow as { test_mode_phone_whitelist?: string[] | null } | null)
          ?.test_mode_phone_whitelist;

        if (testWhitelist && testWhitelist.length > 0) {
          const normalizedTarget = normalizePhone(item.contact_phone);
          const normalizedWhitelist = testWhitelist.map((p) => p.replace(/\D/g, ""));
          if (!normalizedWhitelist.includes(normalizedTarget)) {
            console.warn(
              `[ai-agent-outbound-trigger] BLOCKED by test_mode_phone_whitelist: to=${normalizedTarget} allowed=${JSON.stringify(normalizedWhitelist)}`,
            );
            await supabase.rpc("complete_outbound_queue_item", {
              p_queue_id: item.queue_id,
              p_status: "skipped",
              p_error: "blocked_by_test_mode_phone_whitelist",
            });
            results.push({ queue_id: item.queue_id, status: "skipped", error: "blocked_by_test_mode" });
            continue;
          }
        }

        const bizHours = (agentRow?.outbound_trigger_config as Record<string, unknown>)
          ?.business_hours as BusinessHoursConfig | undefined;

        if (!isWithinBusinessHours(bizHours)) {
          await supabase.rpc("complete_outbound_queue_item", {
            p_queue_id: item.queue_id,
            p_status: "scheduled",
            p_error: null,
          });
          results.push({ queue_id: item.queue_id, status: "rescheduled" });
          continue;
        }

        // 3b. Anti-spam: check max outbound per contact
        const maxPerContact = (agentRow?.outbound_trigger_config as Record<string, unknown>)
          ?.max_outbound_per_contact as number | undefined ?? 3;

        const { count: sentCount } = await supabase
          .from("ai_outbound_queue")
          .select("id", { count: "exact", head: true })
          .eq("contato_id", item.contato_id)
          .eq("status", "sent");

        if ((sentCount ?? 0) >= maxPerContact) {
          await supabase.rpc("complete_outbound_queue_item", {
            p_queue_id: item.queue_id,
            p_status: "skipped",
            p_error: "max_outbound_reached",
          });
          results.push({ queue_id: item.queue_id, status: "skipped", error: "max_outbound_reached" });
          console.log(`[ai-agent-outbound-trigger] Skipped ${item.contact_name}: max outbound reached (${sentCount}/${maxPerContact})`);
          continue;
        }

        // 4. Generate message (first contact vs follow-up)
        let messageText = "";

        if (item.trigger_type === "idle_days") {
          // === FOLLOW-UP: carregar contexto da conversa anterior ===
          messageText = await generateFollowUpMessage(supabase, item);
        } else {
          // === FIRST CONTACT: fonte prioritária = ai_agent_presentations ===
          // Fallback para first_message_config legado só se a tabela estiver
          // sem linha pro cenário (compat até remoção do JSONB).
          const templateVars: Record<string, string> = {
            contact_name: item.contact_name || "Cliente",
            agent_name: "",
            company_name: "",
          };
          if (item.form_data) {
            for (const [k, v] of Object.entries(item.form_data)) {
              if (v) templateVars[`form_${k}`] = String(v);
            }
          }

          // Carregar agent.nome + business.company_name pra variáveis
          const { data: agentMeta } = await supabase
            .from("ai_agents")
            .select("nome")
            .eq("id", item.agent_id)
            .single();
          const { data: bizMeta } = await supabase
            .from("ai_agent_business_config")
            .select("company_name")
            .eq("agent_id", item.agent_id)
            .maybeSingle();
          templateVars.agent_name = (agentMeta as { nome?: string } | null)?.nome || "";
          templateVars.company_name = (bizMeta as { company_name?: string } | null)?.company_name || "";

          // Tentar nova tabela primeiro
          const { data: presentationRow } = await supabase
            .from("ai_agent_presentations")
            .select("mode, fixed_template, concept_text, enabled")
            .eq("agent_id", item.agent_id)
            .eq("scenario", "first_contact_outbound_form")
            .eq("enabled", true)
            .maybeSingle();

          const presentation = presentationRow as {
            mode: "fixed" | "concept";
            fixed_template: string | null;
            concept_text: string | null;
            enabled: boolean;
          } | null;

          if (presentation && presentation.mode === "fixed" && presentation.fixed_template) {
            messageText = resolveTemplate(presentation.fixed_template, templateVars);
          } else if (presentation && presentation.mode === "concept" && presentation.concept_text) {
            messageText = await callLLM(
              buildConceptSystemPrompt(presentation.concept_text, item, templateVars),
              "Gere a primeira mensagem de abordagem.",
            );
          } else {
            // Fallback legado: first_message_config
            const fmc = item.first_message_config;
            if (!fmc) {
              await supabase.rpc("complete_outbound_queue_item", {
                p_queue_id: item.queue_id,
                p_status: "skipped",
                p_error: "No presentation or first_message_config",
              });
              results.push({ queue_id: item.queue_id, status: "skipped", error: "no_config" });
              continue;
            }

            if (fmc.type === "fixed" && fmc.fixed_template) {
              messageText = resolveTemplate(fmc.fixed_template, templateVars);
            } else if (fmc.type === "ai_generated" && fmc.ai_instructions) {
              messageText = await callLLM(
                buildConceptSystemPrompt(fmc.ai_instructions, item, templateVars),
                "Gere a primeira mensagem de abordagem.",
              );
            }
          }
        }

        if (!messageText.trim()) {
          await supabase.rpc("complete_outbound_queue_item", {
            p_queue_id: item.queue_id,
            p_status: "failed",
            p_error: "Empty message generated",
          });
          results.push({ queue_id: item.queue_id, status: "failed", error: "empty_message" });
          continue;
        }

        // 5. Create conversation + first turn
        const { data: conv, error: convErr } = await supabase
          .from("ai_conversations")
          .insert({
            org_id: item.org_id,
            contact_id: item.contato_id,
            card_id: item.card_id,
            primary_agent_id: item.agent_id,
            current_agent_id: item.agent_id,
            status: "active",
            intent: item.trigger_type === "idle_days" ? "outbound_followup" : "outbound_first_contact",
          })
          .select("id")
          .single();

        if (convErr || !conv) {
          throw new Error(`Failed to create conversation: ${convErr?.message}`);
        }

        await supabase.from("ai_conversation_state").insert({
          conversation_id: conv.id,
        });

        await supabase.from("ai_conversation_turns").insert({
          conversation_id: conv.id,
          role: "assistant",
          content: messageText,
          agent_id: item.agent_id,
        });

        // 6. Send via Echo API
        const echoApiUrl = Deno.env.get("ECHO_API_URL");
        const echoApiKey = Deno.env.get("ECHO_API_KEY");
        const defaultPhoneId = Deno.env.get("ECHO_PHONE_NUMBER_ID");

        if (echoApiUrl && echoApiKey) {
          const normalizedPhone = normalizePhone(item.contact_phone);
          console.log(`[ai-agent-outbound-trigger] Sending to ${normalizedPhone}`);

          const echoRes = await fetch(echoApiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": echoApiKey,
            },
            body: JSON.stringify({
              to: normalizedPhone,
              message: messageText,
              phone_number_id: defaultPhoneId,
            }),
          });

          const echoResult = await echoRes.json().catch(() => ({}));
          const success = echoRes.ok || !!echoResult?.whatsapp_message_id;

          // Save to whatsapp_messages
          await supabase.from("whatsapp_messages").insert({
            contact_id: item.contato_id,
            card_id: item.card_id,
            body: messageText,
            direction: "outbound",
            is_from_me: true,
            type: "text",
            status: success ? "sent" : "failed",
            sender_phone: normalizedPhone,
            sent_by_user_name: "Luna IA (outbound)",
            metadata: { source: "ai_outbound_trigger", echo_response: echoResult },
          });

          if (!success) {
            throw new Error(`Echo API error: ${JSON.stringify(echoResult)}`);
          }
        } else {
          console.warn("[ai-agent-outbound-trigger] ECHO_API_URL or ECHO_API_KEY not configured");
        }

        // 7. Mark as sent
        await supabase.rpc("complete_outbound_queue_item", {
          p_queue_id: item.queue_id,
          p_status: "sent",
          p_error: null,
        });
        results.push({ queue_id: item.queue_id, status: "sent" });
        console.log(`[ai-agent-outbound-trigger] Sent to ${item.contact_name} (${item.contact_phone})`);
      } catch (err) {
        console.error(`[ai-agent-outbound-trigger] Error processing ${item.queue_id}:`, err);
        await supabase.rpc("complete_outbound_queue_item", {
          p_queue_id: item.queue_id,
          p_status: "failed",
          p_error: String(err),
        });
        results.push({ queue_id: item.queue_id, status: "failed", error: String(err) });
      }
    }

    return new Response(
      JSON.stringify({ processed: items.length, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[ai-agent-outbound-trigger] Fatal error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
