/**
 * automacao-mensagem-processor — Motor de processamento da fila de automações.
 *
 * Chamado via pg_cron a cada 1 minuto.
 *
 * Batches:
 *   1. Pendentes: avalia condições → envia ou skip
 *   2. Aguardando passo: avança jornadas multi-step
 *   3. Retries: reprocessa falhas com backoff
 *   4. Métricas: atualiza contadores
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const TIMEZONE = "America/Sao_Paulo";
const BUSINESS_HOURS_START = 9;
const BUSINESS_HOURS_END = 18;
const BATCH_SIZE = 50;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isBrazilBusinessHours(): boolean {
  const now = new Date();
  // Rough UTC-3 offset for São Paulo
  const brHour = (now.getUTCHours() - 3 + 24) % 24;
  const brDay = now.getUTCDay(); // 0=Sun, 6=Sat
  return brDay >= 1 && brDay <= 5 && brHour >= BUSINESS_HOURS_START && brHour < BUSINESS_HOURS_END;
}

function isWeekday(daysAllowed?: number[]): boolean {
  const now = new Date();
  const brDay = now.getUTCDay(); // 0=Sun
  // Convert to ISO weekday (1=Mon, 7=Sun)
  const isoDay = brDay === 0 ? 7 : brDay;
  if (!daysAllowed || daysAllowed.length === 0) return true;
  return daysAllowed.includes(isoDay);
}

// ---------------------------------------------------------------------------
// Condition evaluator
// ---------------------------------------------------------------------------
async function evaluateConditions(
  supabase: SupabaseClient,
  conditions: Array<Record<string, unknown>>,
  cardId: string | null,
  contactId: string | null
): Promise<{ pass: boolean; reason: string }> {
  if (!conditions || conditions.length === 0) return { pass: true, reason: "" };

  for (const cond of conditions) {
    const tipo = cond.tipo as string;
    const campo = cond.campo as string;
    const op = cond.op as string;

    if (tipo === "horario") {
      if (cond.business_hours_only && !isBrazilBusinessHours()) {
        return { pass: false, reason: "fora_horario" };
      }
      if (!isWeekday(cond.dias_semana as number[])) {
        return { pass: false, reason: "fora_horario" };
      }
    }

    if (tipo === "contato" && contactId) {
      if (campo === "telefone" && op === "not_null") {
        const { data } = await supabase
          .from("contatos")
          .select("telefone")
          .eq("id", contactId)
          .single();
        if (!data?.telefone) return { pass: false, reason: "sem_telefone" };
      }
      if (campo === "optout" && op === "eq") {
        // Check optout is handled separately
      }
    }

    if (tipo === "card" && cardId) {
      const { data: card } = await supabase
        .from("cards")
        .select(campo)
        .eq("id", cardId)
        .single();
      if (!card) return { pass: false, reason: "card_nao_encontrado" };

      const value = (card as Record<string, unknown>)[campo];

      if (op === "eq" && value !== cond.valor) return { pass: false, reason: "condicao_falhou" };
      if (op === "neq" && value === cond.valor) return { pass: false, reason: "condicao_falhou" };
      if (op === "not_in" && Array.isArray(cond.valores) && cond.valores.includes(value)) {
        return { pass: false, reason: "condicao_falhou" };
      }
      if (op === "in" && Array.isArray(cond.valores) && !cond.valores.includes(value)) {
        return { pass: false, reason: "condicao_falhou" };
      }
      if (op === "gte" && typeof value === "number" && value < (cond.valor as number)) {
        return { pass: false, reason: "condicao_falhou" };
      }
      if (op === "gt" && typeof value === "number" && value <= (cond.valor as number)) {
        return { pass: false, reason: "condicao_falhou" };
      }
      if (op === "not_null" && (value === null || value === undefined)) {
        return { pass: false, reason: "condicao_falhou" };
      }
    }

    if (tipo === "engajamento" && cardId && contactId) {
      if (campo === "respondeu_ultimas_horas") {
        const horas = (cond.horas as number) || 24;
        const since = new Date(Date.now() - horas * 60 * 60 * 1000).toISOString();
        const { count } = await supabase
          .from("whatsapp_messages")
          .select("id", { count: "exact", head: true })
          .eq("contact_id", contactId)
          .eq("direction", "inbound")
          .gte("created_at", since);

        const responded = (count ?? 0) > 0;
        if (op === "eq" && cond.valor === false && responded) {
          return { pass: false, reason: "cliente_respondeu" };
        }
        if (op === "eq" && cond.valor === true && !responded) {
          return { pass: false, reason: "condicao_falhou" };
        }
      }
    }
  }

  return { pass: true, reason: "" };
}

// ---------------------------------------------------------------------------
// Check optout
// ---------------------------------------------------------------------------
async function isOptedOut(
  supabase: SupabaseClient,
  contactId: string,
  regraId: string
): Promise<boolean> {
  // Global optout
  const { count: globalCount } = await supabase
    .from("automacao_optout")
    .select("id", { count: "exact", head: true })
    .eq("contact_id", contactId)
    .is("regra_id", null);

  if ((globalCount ?? 0) > 0) return true;

  // Per-rule optout
  const { count: ruleCount } = await supabase
    .from("automacao_optout")
    .select("id", { count: "exact", head: true })
    .eq("contact_id", contactId)
    .eq("regra_id", regraId);

  return (ruleCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Check daily limit
// ---------------------------------------------------------------------------
async function dailyMessageCount(
  supabase: SupabaseClient,
  contactId: string
): Promise<number> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { count } = await supabase
    .from("automacao_execucoes")
    .select("id", { count: "exact", head: true })
    .eq("contact_id", contactId)
    .eq("status", "enviado")
    .gte("enviado_at", todayStart.toISOString());

  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Check response-aware (client responded since execution was created)
// ---------------------------------------------------------------------------
async function clientRespondedSince(
  supabase: SupabaseClient,
  contactId: string,
  since: string
): Promise<boolean> {
  const { count } = await supabase
    .from("whatsapp_messages")
    .select("id", { count: "exact", head: true })
    .eq("contact_id", contactId)
    .eq("direction", "inbound")
    .gte("created_at", since);

  return (count ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Send message DIRECTLY via Echo API (no intermediary Edge Function)
// ---------------------------------------------------------------------------
async function sendMessage(
  supabase: SupabaseClient,
  execucao: Record<string, unknown>,
  regra: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const echoApiUrl = Deno.env.get("ECHO_API_URL");
  const echoApiKey = Deno.env.get("ECHO_API_KEY");
  const defaultPhoneNumberId = Deno.env.get("ECHO_PHONE_NUMBER_ID");

  if (!echoApiUrl || !echoApiKey) {
    return { success: false, error: "ECHO_API_URL ou ECHO_API_KEY não configurado" };
  }

  try {
    // 1. Fetch contact phone
    const { data: contact } = await supabase
      .from("contatos")
      .select("id, nome, sobrenome, telefone, telefone_normalizado, tipo_cliente, email")
      .eq("id", execucao.contact_id)
      .single();

    if (!contact?.telefone && !contact?.telefone_normalizado) {
      return { success: false, error: "Contato sem telefone" };
    }

    const rawPhone = (contact.telefone_normalizado || contact.telefone || "").replace(/\D/g, "");
    const phone = rawPhone.startsWith("55") ? rawPhone : "55" + rawPhone;

    // 2. Resolve message body
    let messageBody = (execucao.corpo_renderizado as string) || "";

    if (!messageBody) {
      const templateId = execucao.template_id || regra.template_id;
      if (templateId) {
        const { data: tpl } = await supabase
          .from("mensagem_templates")
          .select("corpo, modo")
          .eq("id", templateId)
          .single();

        if (tpl?.corpo) {
          messageBody = tpl.corpo;
        }
      }
    }

    // 3. Render variables
    if (messageBody) {
      messageBody = messageBody.replace(/\{\{contact\.nome\}\}/g, contact.nome || "");
      messageBody = messageBody.replace(/\{\{contact\.sobrenome\}\}/g, contact.sobrenome || "");
      messageBody = messageBody.replace(/\{\{contact\.nome_completo\}\}/g,
        [contact.nome, contact.sobrenome].filter(Boolean).join(" "));
      messageBody = messageBody.replace(/\{\{contact\.email\}\}/g, contact.email || "");

      // Card variables
      if (execucao.card_id) {
        const { data: card } = await supabase
          .from("cards")
          .select("titulo, valor_estimado, valor_final, data_viagem_inicio, data_viagem_fim, briefing_inicial, dono_atual_id")
          .eq("id", execucao.card_id)
          .single();

        if (card) {
          messageBody = messageBody.replace(/\{\{card\.titulo\}\}/g, card.titulo || "");
          const valor = card.valor_final ?? card.valor_estimado;
          messageBody = messageBody.replace(/\{\{card\.valor\}\}/g,
            valor != null ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor) : "");
          messageBody = messageBody.replace(/\{\{card\.data_viagem\}\}/g,
            card.data_viagem_inicio ? new Date(card.data_viagem_inicio).toLocaleDateString("pt-BR") : "");
          messageBody = messageBody.replace(/\{\{card\.data_retorno\}\}/g,
            card.data_viagem_fim ? new Date(card.data_viagem_fim).toLocaleDateString("pt-BR") : "");

          const bi = card.briefing_inicial as Record<string, Record<string, unknown>> | null;
          messageBody = messageBody.replace(/\{\{card\.destino\}\}/g,
            (bi?.trip_info?.destinos as string) || "");

          // Agent variables
          if (card.dono_atual_id) {
            const { data: agent } = await supabase
              .from("profiles")
              .select("nome, email, telefone")
              .eq("id", card.dono_atual_id)
              .single();
            if (agent) {
              messageBody = messageBody.replace(/\{\{agent\.nome\}\}/g, agent.nome || "");
              messageBody = messageBody.replace(/\{\{agent\.primeiro_nome\}\}/g, (agent.nome || "").split(" ")[0]);
              messageBody = messageBody.replace(/\{\{agent\.email\}\}/g, agent.email || "");
              messageBody = messageBody.replace(/\{\{agent\.telefone\}\}/g, agent.telefone || "");
            }
          }
        }
      }

      // System variables
      const now = new Date();
      messageBody = messageBody.replace(/\{\{hoje\}\}/g, now.toLocaleDateString("pt-BR"));
      const dias = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
      messageBody = messageBody.replace(/\{\{dia_semana\}\}/g, dias[now.getDay()]);
    }

    if (!messageBody.trim()) {
      return { success: false, error: "Mensagem vazia após renderização" };
    }

    // 4. Resolve phone number ID
    const phoneNumberId = (regra.phone_number_id as string) || defaultPhoneNumberId;

    // 5. Send via Echo API
    const echoResp = await fetch(echoApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": echoApiKey,
      },
      body: JSON.stringify({ to: phone, message: messageBody, phone_number_id: phoneNumberId }),
    });

    const echoResult = await echoResp.json().catch(() => ({}));
    const echoSuccess = echoResp.ok || !!echoResult?.whatsapp_message_id;

    // 6. Insert into whatsapp_messages
    await supabase.from("whatsapp_messages").insert({
      contact_id: execucao.contact_id,
      card_id: execucao.card_id || null,
      body: messageBody,
      direction: "outbound",
      is_from_me: true,
      type: "text",
      status: echoSuccess ? "sent" : "failed",
      sender_phone: phone,
      sent_by_user_name: "Automação",
      phone_number_label: "Automação",
      metadata: {
        source: "automacao",
        automacao_execucao_id: execucao.id,
        echo_response: echoResult,
      },
    });

    // 7. Insert activity
    if (execucao.card_id) {
      await supabase.from("activities").insert({
        card_id: execucao.card_id,
        tipo: "whatsapp_automation_sent",
        descricao: `Mensagem automática enviada para ${contact.nome || "contato"}`,
        metadata: { source: "automacao", message_length: messageBody.length, success: echoSuccess },
      });
    }

    // 8. Update execution
    if (echoSuccess) {
      await supabase.from("automacao_execucoes")
        .update({
          status: "enviado",
          corpo_renderizado: messageBody,
          enviado_at: new Date().toISOString(),
        })
        .eq("id", execucao.id);
    }

    return { success: echoSuccess, error: echoSuccess ? undefined : JSON.stringify(echoResult) };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// Process pending executions
// ---------------------------------------------------------------------------
async function processPending(supabase: SupabaseClient): Promise<number> {
  const { data: pendentes } = await supabase
    .from("automacao_execucoes")
    .select("*, automacao_regras!inner(id, condicoes, template_id, max_envios_por_card, dedup_janela_horas, max_mensagens_contato_dia, response_aware, modo_aprovacao, tipo, phone_number_id, agent_aware, business_hours)")
    .eq("status", "pending")
    .limit(BATCH_SIZE)
    .order("created_at", { ascending: true });

  if (!pendentes || pendentes.length === 0) return 0;

  let processed = 0;

  for (const exec of pendentes) {
    const regra = exec.automacao_regras;

    // 1. Check optout
    if (exec.contact_id && await isOptedOut(supabase, exec.contact_id, exec.regra_id)) {
      await supabase.from("automacao_execucoes")
        .update({ status: "skipped", skip_reason: "optout" })
        .eq("id", exec.id);
      processed++;
      continue;
    }

    // 2. Check daily limit
    if (exec.contact_id) {
      const dailyCount = await dailyMessageCount(supabase, exec.contact_id);
      if (dailyCount >= (regra.max_mensagens_contato_dia || 3)) {
        await supabase.from("automacao_execucoes")
          .update({ status: "skipped", skip_reason: "limite_diario" })
          .eq("id", exec.id);
        processed++;
        continue;
      }
    }

    // 3. Check response-aware
    if (regra.response_aware && exec.contact_id) {
      if (await clientRespondedSince(supabase, exec.contact_id, exec.created_at)) {
        await supabase.from("automacao_execucoes")
          .update({ status: "cancelado", skip_reason: "cliente_respondeu" })
          .eq("id", exec.id);
        processed++;
        continue;
      }
    }

    // 3b. Check agent-aware (agent sent manual message recently)
    if (regra.agent_aware && exec.contact_id) {
      const agentHours = 4;
      const since = new Date(Date.now() - agentHours * 60 * 60 * 1000).toISOString();
      const { count: agentMsgCount } = await supabase
        .from("whatsapp_messages")
        .select("id", { count: "exact", head: true })
        .eq("contact_id", exec.contact_id)
        .eq("direction", "outbound")
        .eq("is_from_me", true)
        .gte("created_at", since)
        .is("metadata->automacao_execucao_id", null);  // Only manual msgs (not from automacao)

      if ((agentMsgCount ?? 0) > 0) {
        await supabase.from("automacao_execucoes")
          .update({ status: "skipped", skip_reason: "agente_ja_enviou" })
          .eq("id", exec.id);
        processed++;
        continue;
      }
    }

    // 3c. Check business hours
    if (regra.business_hours && !isBrazilBusinessHours()) {
      await supabase.from("automacao_execucoes")
        .update({ status: "aguardando_horario" })
        .eq("id", exec.id);
      processed++;
      continue;
    }

    // 4. Evaluate conditions
    const conditions = (regra.condicoes || []) as Array<Record<string, unknown>>;
    const evalResult = await evaluateConditions(supabase, conditions, exec.card_id, exec.contact_id);

    if (!evalResult.pass) {
      if (evalResult.reason === "fora_horario") {
        // Reschedule for next business hours window
        await supabase.from("automacao_execucoes")
          .update({ status: "aguardando_horario" })
          .eq("id", exec.id);
      } else {
        await supabase.from("automacao_execucoes")
          .update({ status: "skipped", skip_reason: evalResult.reason })
          .eq("id", exec.id);
      }
      processed++;
      continue;
    }

    // 5. For jornada type, handle first step
    if (regra.tipo === "jornada") {
      const { data: firstStep } = await supabase
        .from("automacao_regra_passos")
        .select("*")
        .eq("regra_id", exec.regra_id)
        .order("ordem", { ascending: true })
        .limit(1)
        .single();

      if (firstStep) {
        await processJornadaStep(supabase, exec, regra, firstStep);
      } else {
        await supabase.from("automacao_execucoes")
          .update({ status: "skipped", skip_reason: "jornada_sem_passos" })
          .eq("id", exec.id);
      }
      processed++;
      continue;
    }

    // 6. Single mode — check if IA mode needs n8n first
    const templateId = exec.template_id || regra.template_id;
    let needsIA = false;

    if (templateId) {
      const { data: tpl } = await supabase
        .from("mensagem_templates")
        .select("modo, ia_prompt, ia_contexto_config, ia_restricoes")
        .eq("id", templateId)
        .single();

      if (tpl && (tpl.modo === "template_ia" || tpl.modo === "ia_generativa")) {
        needsIA = true;

        // If already has corpo_ia_gerado (n8n already ran), skip to send
        if (!exec.corpo_ia_gerado) {
          // Call n8n to generate message
          const n8nWebhookUrl = Deno.env.get("N8N_AUTOMACAO_GERAR_MENSAGEM_URL");
          if (n8nWebhookUrl) {
            await supabase.from("automacao_execucoes")
              .update({ status: "gerando_ia" })
              .eq("id", exec.id);

            try {
              const n8nResp = await fetch(n8nWebhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  card_id: exec.card_id,
                  contact_id: exec.contact_id,
                  template_id: templateId,
                  ia_prompt: tpl.ia_prompt || "",
                  ia_contexto_config: tpl.ia_contexto_config || {},
                  ia_restricoes: tpl.ia_restricoes || {},
                  execucao_id: exec.id,
                }),
              });

              if (!n8nResp.ok) {
                console.error(`[processor] n8n IA generation failed: ${n8nResp.status}`);
                await supabase.from("automacao_execucoes")
                  .update({ status: "falhou", skip_reason: "ia_generation_failed" })
                  .eq("id", exec.id);
              }
              // n8n callback updates corpo_ia_gerado and sets status back to pending
            } catch (n8nErr) {
              console.error("[processor] n8n call error:", n8nErr);
              await supabase.from("automacao_execucoes")
                .update({ status: "falhou", skip_reason: `ia_error: ${String(n8nErr)}` })
                .eq("id", exec.id);
            }
            processed++;
            continue;
          }
        }

        // IA already generated — use corpo_ia_gerado as the message
        if (exec.corpo_ia_gerado) {
          // Check if approval is needed
          if (regra.modo_aprovacao) {
            await supabase.from("automacao_execucoes")
              .update({
                status: "aguardando_aprovacao",
                corpo_renderizado: exec.corpo_ia_gerado,
              })
              .eq("id", exec.id);
            processed++;
            continue;
          }

          // Send the IA-generated message directly
          const sendResult = await sendMessage(
            supabase,
            { ...exec, corpo_renderizado: exec.corpo_ia_gerado },
            regra
          );
          if (!sendResult.success) {
            const attempts = (exec.attempts || 0) + 1;
            const backoffMs = Math.min(attempts * 5 * 60 * 1000, 60 * 60 * 1000);
            await supabase.from("automacao_execucoes")
              .update({
                status: "falhou",
                attempts,
                next_retry_at: new Date(Date.now() + backoffMs).toISOString(),
                skip_reason: sendResult.error,
              })
              .eq("id", exec.id);
          }
          processed++;
          continue;
        }
      }
    }

    // 6b. Template fixo or direct — send message
    const sendResult = await sendMessage(supabase, exec, regra);

    if (!sendResult.success) {
      const attempts = (exec.attempts || 0) + 1;
      const backoffMs = Math.min(attempts * 5 * 60 * 1000, 60 * 60 * 1000); // max 1h
      await supabase.from("automacao_execucoes")
        .update({
          status: "falhou",
          attempts,
          next_retry_at: new Date(Date.now() + backoffMs).toISOString(),
          skip_reason: sendResult.error,
        })
        .eq("id", exec.id);
    }
    // send-whatsapp-message updates status to 'enviado' on success

    processed++;
  }

  return processed;
}

// ---------------------------------------------------------------------------
// Process jornada step
// ---------------------------------------------------------------------------
async function processJornadaStep(
  supabase: SupabaseClient,
  exec: Record<string, unknown>,
  regra: Record<string, unknown>,
  step: Record<string, unknown>
): Promise<void> {
  const config = step.config as Record<string, unknown>;

  switch (step.tipo) {
    case "enviar_mensagem": {
      const templateId = config.template_id as string;
      await supabase.from("automacao_execucoes")
        .update({ template_id: templateId, passo_atual_id: step.id, passo_atual_ordem: step.ordem })
        .eq("id", exec.id);

      const sendResult = await sendMessage(supabase, { ...exec, template_id: templateId }, regra);
      if (sendResult.success) {
        await advanceToNextStep(supabase, exec, step);
      }
      break;
    }
    case "aguardar": {
      const horas = (config.horas as number) || 24;
      const horasMs = horas * 60 * 60 * 1000;
      await supabase.from("automacao_execucoes")
        .update({
          status: "aguardando_passo",
          passo_atual_id: step.id,
          passo_atual_ordem: step.ordem,
          proximo_passo_at: new Date(Date.now() + horasMs).toISOString(),
        })
        .eq("id", exec.id);
      break;
    }
    case "verificar_resposta": {
      const responded = exec.contact_id
        ? await clientRespondedSince(supabase, exec.contact_id as string, exec.created_at as string)
        : false;

      if (responded && config.se_respondeu === "parar") {
        await supabase.from("automacao_execucoes")
          .update({ status: "respondido", passo_atual_id: step.id })
          .eq("id", exec.id);
      } else {
        await advanceToNextStep(supabase, exec, step);
      }
      break;
    }
    case "criar_tarefa": {
      if (exec.card_id) {
        await supabase.from("tarefas").insert({
          card_id: exec.card_id,
          tipo: (config.tipo as string) || "contato",
          titulo: (config.titulo as string) || "Tarefa de automação",
          descricao: config.descricao || null,
          prioridade: (config.prioridade as string) || "alta",
          status: "pendente",
        });
      }
      await advanceToNextStep(supabase, exec, step);
      break;
    }
    case "atualizar_campo": {
      if (exec.card_id && config.tabela === "cards") {
        await supabase.from("cards")
          .update({ [config.campo as string]: config.valor })
          .eq("id", exec.card_id);
      }
      await advanceToNextStep(supabase, exec, step);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Advance jornada to next step
// ---------------------------------------------------------------------------
async function advanceToNextStep(
  supabase: SupabaseClient,
  exec: Record<string, unknown>,
  currentStep: Record<string, unknown>
): Promise<void> {
  const currentOrdem = (currentStep.ordem as number) || 0;

  const { data: nextStep } = await supabase
    .from("automacao_regra_passos")
    .select("*")
    .eq("regra_id", exec.regra_id)
    .gt("ordem", currentOrdem)
    .order("ordem", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!nextStep) {
    await supabase.from("automacao_execucoes")
      .update({ status: "completo" })
      .eq("id", exec.id);
    return;
  }

  // Set as pending again to process next step in next cycle
  await supabase.from("automacao_execucoes")
    .update({
      status: "pending",
      passo_atual_id: nextStep.id,
      passo_atual_ordem: nextStep.ordem,
    })
    .eq("id", exec.id);
}

// ---------------------------------------------------------------------------
// Process waiting steps (jornadas)
// ---------------------------------------------------------------------------
async function processWaitingSteps(supabase: SupabaseClient): Promise<number> {
  const { data: waiting } = await supabase
    .from("automacao_execucoes")
    .select("*, automacao_regras!inner(id, condicoes, template_id, response_aware, tipo)")
    .eq("status", "aguardando_passo")
    .lte("proximo_passo_at", new Date().toISOString())
    .limit(BATCH_SIZE);

  if (!waiting || waiting.length === 0) return 0;

  let processed = 0;
  for (const exec of waiting) {
    // Advance: set back to pending so processPending picks it up
    await supabase.from("automacao_execucoes")
      .update({ status: "pending" })
      .eq("id", exec.id);
    processed++;
  }
  return processed;
}

// ---------------------------------------------------------------------------
// Process business hours waiting
// ---------------------------------------------------------------------------
async function processWaitingHorario(supabase: SupabaseClient): Promise<number> {
  if (!isBrazilBusinessHours()) return 0;

  const { data: waiting } = await supabase
    .from("automacao_execucoes")
    .select("id")
    .eq("status", "aguardando_horario")
    .limit(BATCH_SIZE);

  if (!waiting || waiting.length === 0) return 0;

  const ids = waiting.map((w) => w.id);
  await supabase
    .from("automacao_execucoes")
    .update({ status: "pending" })
    .in("id", ids);

  return ids.length;
}

// ---------------------------------------------------------------------------
// Process retries
// ---------------------------------------------------------------------------
async function processRetries(supabase: SupabaseClient): Promise<number> {
  const { data: retries } = await supabase
    .from("automacao_execucoes")
    .select("*, automacao_regras!inner(id, condicoes, template_id, tipo)")
    .eq("status", "falhou")
    .lt("attempts", 3)
    .lte("next_retry_at", new Date().toISOString())
    .limit(BATCH_SIZE);

  if (!retries || retries.length === 0) return 0;

  let processed = 0;
  for (const exec of retries) {
    // Set back to pending for reprocessing
    await supabase.from("automacao_execucoes")
      .update({ status: "pending" })
      .eq("id", exec.id);
    processed++;
  }
  return processed;
}

// ---------------------------------------------------------------------------
// Update rule metrics
// ---------------------------------------------------------------------------
async function updateMetrics(supabase: SupabaseClient): Promise<void> {
  // Get all active rules and update their counters from execucoes
  const { data: rules } = await supabase
    .from("automacao_regras")
    .select("id")
    .eq("ativa", true);

  if (!rules) return;

  for (const rule of rules) {
    const { data: counts } = await supabase.rpc("count_automacao_metrics", {
      p_regra_id: rule.id,
    }).maybeSingle();

    // If RPC doesn't exist yet, skip silently
    if (!counts) continue;

    await supabase
      .from("automacao_regras")
      .update(counts)
      .eq("id", rule.id);
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const start = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const pendingCount = await processPending(supabase);
    const waitingStepsCount = await processWaitingSteps(supabase);
    const waitingHorarioCount = await processWaitingHorario(supabase);
    const retryCount = await processRetries(supabase);

    // Update metrics every 5th run (to avoid excessive DB writes)
    // We don't have a counter, so just do it if there was activity
    if (pendingCount > 0) {
      await updateMetrics(supabase).catch(() => {});
    }

    const elapsed = Date.now() - start;

    const result = {
      processed: {
        pending: pendingCount,
        waiting_steps: waitingStepsCount,
        waiting_horario: waitingHorarioCount,
        retries: retryCount,
      },
      elapsed_ms: elapsed,
    };

    console.log(`[automacao-processor] ${JSON.stringify(result)}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[automacao-processor] Error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
