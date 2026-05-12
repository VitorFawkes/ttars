// ai-agent-router-v2 — Patricia (single-agent + brand validator).
//
// Engine: single_agent_v2 (lê ai_agents.engine).
// Roteado pelo whatsapp-webhook quando o agente vinculado à phone_line tem engine='single_agent_v2'.
//
// MVP scope:
//   - Apenas mensagens TEXT (sem multimodal nesta versão)
//   - Pipeline: build context → single agent → tools → brand validator → send
//   - Sem outbound trigger (Marco 2 se Patricia ganhar)
//   - Debounce próprio (cópia da lógica do v1, sem importar código). Lê
//     ai_message_buffer, aguarda janela, claim atômico, junta msgs com "\n".
//   - Lock de pipeline (ai_pipeline_locks, RPC genérica compartilhada).
//
// Latência alvo: <4s p95. Custo alvo: ~30-40% do v1.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runSingleAgent } from "./single_agent.ts";
import { validateBrandCompliance, type ValidatorRule } from "./brand_validator.ts";
import {
  type AgentRow,
  type BusinessConfigRow,
  compactConversationHistory,
  executePatriciaToolCall,
  formatWhatsAppMessagesHeuristic,
  type IncomingMessageInput,
  isPhoneInWhitelist,
  loadConversationHistory,
  normalizePhone,
  normalizeWhatsAppText,
  sendEchoMessage,
} from "./_utils.ts";

// ============================================================================
// Constants
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const ECHO_API_URL = Deno.env.get("ECHO_API_URL") || "";
const ECHO_API_KEY = Deno.env.get("ECHO_API_KEY") || "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ============================================================================
// Handler principal
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const startedAt = Date.now();
  let body: IncomingMessageInput;
  try {
    body = await req.json();
  } catch (_) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { contact_phone, message_text, phone_number_id, phone_number_label } = body;
  if (!contact_phone || !phone_number_id) {
    return jsonResponse({ error: "contact_phone and phone_number_id required" }, 400);
  }

  const isDrain = (body as { _drain?: boolean })._drain === true;

  // Patricia v1 só aceita TEXT
  if (body.message_type && body.message_type !== "text") {
    console.log(`[v2] message_type=${body.message_type} ignorado (MVP só processa text)`);
    return jsonResponse({
      ok: true,
      skipped: true,
      reason: "message_type não suportado em Patricia MVP",
    });
  }

  // Drain pode vir com message_text vazio — o buffer vai prover o texto.
  if (!isDrain && (!message_text || message_text.trim().length === 0)) {
    return jsonResponse({ ok: true, skipped: true, reason: "message_text vazio" });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  let lockAcquired = false;
  let normalizedForBuffer = "";

  try {
    // ------------------------------------------------------------------
    // 1. Encontrar agent vinculado ao phone_number_id
    // ------------------------------------------------------------------
    const { data: lineRow, error: lineErr } = await supabase
      .from("whatsapp_linha_config")
      .select("id, phone_number_id, phone_number_label, ativo, org_id, pipeline_id, stage_id, phase_id, criar_card, criar_contato, default_owner_id, produto, platform_id")
      .eq("phone_number_id", phone_number_id)
      .eq("ativo", true)
      .maybeSingle();

    if (lineErr || !lineRow) {
      console.error(`[v2] linha não encontrada pra phone_number_id=${phone_number_id}`, lineErr);
      return jsonResponse({ error: "phone_line não encontrada", phone_number_id }, 404);
    }

    const { data: agentLink, error: linkErr } = await supabase
      .from("ai_agent_phone_line_config")
      .select(`
        priority, routing_filter, ativa,
        ai_agents!inner (
          id, org_id, produto, nome, ativa, modelo, temperature, max_tokens,
          test_mode_phone_whitelist, validator_rules, pipeline_models,
          identity_config, voice_config, boundaries_config, listening_config,
          handoff_actions, handoff_signals, intelligent_decisions, context_fields_config,
          engine, timings
        )
      `)
      .eq("phone_line_id", lineRow.id)
      .eq("ativa", true)
      .order("priority", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (linkErr || !agentLink) {
      console.error(`[v2] nenhum agente ativo na linha`, linkErr);
      return jsonResponse({ error: "agent não encontrado pra esta linha" }, 404);
    }

    const agent = agentLink.ai_agents as unknown as AgentRow;

    if (agent.engine !== "single_agent_v2") {
      console.error(`[v2] agente ${agent.id} engine=${agent.engine} (esperado single_agent_v2). Roteamento errado.`);
      return jsonResponse({ error: `Agent engine mismatch: ${agent.engine}` }, 400);
    }

    if (!agent.ativa) {
      console.log(`[v2] agente ${agent.id} ativa=false, ignorando`);
      return jsonResponse({ ok: true, skipped: true, reason: "agent inactive" });
    }

    // Whitelist em duas camadas: routing_filter.allowed_phones (link) + ai_agents.test_mode_phone_whitelist (agent)
    const linkAllowedPhones = (agentLink.routing_filter as { allowed_phones?: string[] })?.allowed_phones;
    if (linkAllowedPhones && linkAllowedPhones.length > 0) {
      if (!isPhoneInWhitelist(contact_phone, linkAllowedPhones)) {
        console.log(`[v2] phone ${contact_phone} fora do routing_filter.allowed_phones, ignorando`);
        return jsonResponse({ ok: true, skipped: true, reason: "not in routing whitelist" });
      }
    }
    if (!isPhoneInWhitelist(contact_phone, agent.test_mode_phone_whitelist)) {
      console.log(`[v2] phone ${contact_phone} fora de test_mode_phone_whitelist, ignorando`);
      return jsonResponse({ ok: true, skipped: true, reason: "not in test whitelist" });
    }

    // ------------------------------------------------------------------
    // 1b. Debounce + claim atômico do ai_message_buffer
    //
    // Lógica replicada do router v1 (sem import, engines isoladas por desenho).
    // Janela vem de agent.timings.debounce_seconds (default 20s).
    // Quando a mensagem mais antiga do buffer ainda está dentro da janela,
    // agenda um self-call em waitMs com _drain=true. Quando vence, claim
    // atômico via UPDATE..RETURNING junta tudo num único turno.
    // ------------------------------------------------------------------
    normalizedForBuffer = normalizePhone(contact_phone);
    const debounceSeconds = agent.timings?.debounce_seconds ?? 20;
    const debounceMs = debounceSeconds * 1000;

    const { data: buffered } = await supabase
      .from("ai_message_buffer")
      .select("id, message_text, message_type, media_url, created_at")
      .eq("contact_phone", normalizedForBuffer)
      .is("processed_at", null)
      .order("created_at", { ascending: true });

    // Bail: drain chegou após outro drain já ter capturado tudo.
    if (isDrain && (!buffered || buffered.length === 0)) {
      console.log(`[v2 debounce] drain reached buffer check with empty buffer — superseded`);
      return jsonResponse({ handled: false, reason: "drain_superseded_v2" });
    }

    let processedText = message_text;
    let claimedRows: Array<{ id: string; message_text: string; message_type: string; media_url: string | null; created_at: string }> | null = null;

    if (buffered && buffered.length > 0) {
      const oldest = buffered[0];
      const ageOldestMs = Date.now() - new Date(oldest.created_at).getTime();

      if (ageOldestMs < debounceMs) {
        // Ainda esperando — agenda self-call. Idempotente: query filtra
        // processed_at IS NULL, double-drain bate em buffer vazio.
        console.log(`[v2 debounce] ${buffered.length} msgs buffered, oldest ${Math.round(ageOldestMs / 1000)}s ago — waiting (window=${debounceSeconds}s)`);
        const waitMs = debounceMs - ageOldestMs + 500;
        // deno-lint-ignore no-explicit-any
        const runtime = (globalThis as any).EdgeRuntime;
        const schedule = async () => {
          await new Promise((r) => setTimeout(r, waitMs));
          try {
            await fetch(`${SUPABASE_URL}/functions/v1/ai-agent-router-v2`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
              body: JSON.stringify({
                phone_number_id, contact_phone, message_text: "", _drain: true,
              }),
            });
          } catch (err) {
            console.error("[v2 debounce drain]", err);
          }
        };
        if (runtime?.waitUntil) runtime.waitUntil(schedule()); else schedule();
        return jsonResponse({ handled: true, debounced: true, buffered_count: buffered.length, drain_scheduled: true });
      }

      // Janela expirou — claim atômico via UPDATE..RETURNING.
      const { data: claimedData } = await supabase
        .from("ai_message_buffer")
        .update({ processed_at: new Date().toISOString() })
        .eq("contact_phone", normalizedForBuffer)
        .is("processed_at", null)
        .select("id, message_text, message_type, media_url, created_at");
      claimedRows = claimedData;

      if (!claimedRows || claimedRows.length === 0) {
        console.log(`[v2 debounce] claim returned 0 rows — another drain won, bailing`);
        return jsonResponse({ handled: true, debounced: true, drain_superseded: true });
      }

      claimedRows.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      // MVP da Patricia é text-only: ignora msgs de áudio/imagem do buffer.
      const combined = claimedRows
        .filter((b) => (b.message_type || "text") === "text")
        .map((b) => b.message_text)
        .filter(Boolean)
        .join("\n");
      if (combined) {
        processedText = combined;
        console.log(`[v2 debounce] Claimed ${claimedRows.length} message(s) atomically (${combined.length} chars)`);
      }
    }

    // ------------------------------------------------------------------
    // 1c. Lock de pipeline (RPC genérica, compartilhada com v1).
    //
    // Previne 2 pipelines rodando em paralelo pro mesmo lead. Se já existe
    // lock ativo, reverte o claim cirurgicamente, agenda re-drain em 30s
    // e retorna sem rodar single_agent.
    // ------------------------------------------------------------------
    {
      const { data: lockResult } = await supabase.rpc("try_acquire_pipeline_lock", {
        p_contact_phone: normalizedForBuffer,
        p_ttl_seconds: 90,
      });
      lockAcquired = Boolean(lockResult);
    }

    if (!lockAcquired) {
      console.log(`[v2 pipeline_lock] ${normalizedForBuffer} já tem pipeline ativo — re-drain em 30s`);
      // Reverte só os IDs que ESTA chamada acabou de claimar.
      try {
        const claimedIds = (claimedRows ?? []).map((c) => c.id);
        if (claimedIds.length > 0) {
          await supabase.from("ai_message_buffer")
            .update({ processed_at: null })
            .in("id", claimedIds);
        }
      } catch (err) {
        console.warn("[v2 pipeline_lock] revert claim failed:", err);
      }
      // deno-lint-ignore no-explicit-any
      const runtime = (globalThis as any).EdgeRuntime;
      const reSchedule = async () => {
        await new Promise((r) => setTimeout(r, 30_000));
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/ai-agent-router-v2`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
            body: JSON.stringify({ phone_number_id, contact_phone, message_text: "", _drain: true }),
          });
        } catch (err) {
          console.error("[v2 pipeline_lock] re-drain", err);
        }
      };
      if (runtime?.waitUntil) runtime.waitUntil(reSchedule()); else reSchedule();
      return jsonResponse({ handled: true, reason: "pipeline_locked_v2", re_drain_scheduled: true });
    }

    // ------------------------------------------------------------------
    // 2. Carregar business config
    // ------------------------------------------------------------------
    const { data: businessRow } = await supabase
      .from("ai_agent_business_config")
      .select("*")
      .eq("agent_id", agent.id)
      .maybeSingle();

    const business = businessRow as BusinessConfigRow | null;

    // ------------------------------------------------------------------
    // 3. Find or create contato
    // ------------------------------------------------------------------
    const phoneNorm = normalizePhone(contact_phone);
    const contactId = await findOrCreateContact(supabase, agent.org_id, phoneNorm);

    // ------------------------------------------------------------------
    // 4. Find or create card (na linha do produto, primeira stage)
    // ------------------------------------------------------------------
    let cardId: string | null = null;
    if (lineRow.criar_card !== false) {
      cardId = await findOrCreateCard(
        supabase,
        agent.org_id,
        contactId,
        lineRow.pipeline_id,
        lineRow.stage_id,
        lineRow.phase_id,
        lineRow.default_owner_id,
        lineRow.produto || agent.produto,
      );
    }

    // ------------------------------------------------------------------
    // 5. Find or create conversation
    // ------------------------------------------------------------------
    const { conversationId, isNew: conversationIsNew } = await findOrCreateConversation(
      supabase,
      agent.id,
      agent.org_id,
      contactId,
      cardId,
      phone_number_id,
    );

    // ------------------------------------------------------------------
    // 6. Inserir turno do usuário
    // ------------------------------------------------------------------
    await supabase.from("ai_conversation_turns").insert({
      conversation_id: conversationId,
      role: "user",
      content: processedText,
    });

    // ------------------------------------------------------------------
    // 7. Carregar histórico + estado + card data
    // ------------------------------------------------------------------
    const turns = await loadConversationHistory(supabase, conversationId, 20);
    const historico = compactConversationHistory(turns);

    let cardFormData: Record<string, unknown> | null = null;
    let cardTitulo: string | null = null;
    if (cardId) {
      const { data: cardRow } = await supabase
        .from("cards")
        .select("titulo, form_data, ai_resumo, ai_contexto")
        .eq("id", cardId)
        .maybeSingle();
      if (cardRow) {
        cardFormData = (cardRow.form_data as Record<string, unknown>) || null;
        cardTitulo = cardRow.titulo;
      }
    }

    const { data: convState } = await supabase
      .from("ai_conversation_state")
      .select("summary, extracted_variables")
      .eq("conversation_id", conversationId)
      .maybeSingle();

    const aiResumo = convState?.summary || null;
    const aiContexto = (convState?.extracted_variables as Record<string, unknown>)?.context as string ||
      null;

    const { data: contactRow } = await supabase
      .from("contatos")
      .select("nome")
      .eq("id", contactId)
      .maybeSingle();
    const contactName = contactRow?.nome || null;

    // ------------------------------------------------------------------
    // 8. Carregar threshold de scoring
    // ------------------------------------------------------------------
    const { data: scoringConfig } = await supabase
      .from("ai_agent_scoring_config")
      .select("threshold_qualify, enabled")
      .eq("agent_id", agent.id)
      .maybeSingle();

    const scoringThreshold = scoringConfig?.threshold_qualify || 25;
    const scoringEnabled = scoringConfig?.enabled !== false;

    // ------------------------------------------------------------------
    // 8b. Resolver bloco ativo do moment sequenciado (wait_for_reply)
    //
    // Quando o último moment é wait_for_reply e tem múltiplos blocos
    // (anchor_text_parts), o router avança o cursor moment_step a cada
    // resposta do lead. Isso garante que parts[N] sai num turno e
    // parts[N+1] no próximo, sem perguntar pro LLM "qual parte é".
    // ------------------------------------------------------------------
    const previousVars = (convState?.extracted_variables as Record<string, unknown>) || {};
    const lastMomentKey = (typeof previousVars.last_moment_key === "string" ? previousVars.last_moment_key : null);
    const previousStep = Number(previousVars.moment_step ?? 0);

    let effectiveStep = 0;
    let effectiveMomentKey: string | null = lastMomentKey;

    if (lastMomentKey) {
      const { data: lastMomentRow } = await supabase
        .from("ai_agent_moments")
        .select("anchor_text, anchor_text_parts, delivery_mode")
        .eq("agent_id", agent.id)
        .eq("moment_key", lastMomentKey)
        .maybeSingle();

      if (lastMomentRow && lastMomentRow.delivery_mode === "wait_for_reply") {
        // Conta blocos (parts > legado split por '---')
        let partsCount = 0;
        const parts = lastMomentRow.anchor_text_parts as string[] | null;
        if (parts && parts.length > 0) {
          partsCount = parts.filter((p) => p && p.trim().length > 0).length;
        } else if (lastMomentRow.anchor_text) {
          const legacy = (lastMomentRow.anchor_text as string)
            .split(/\n[ \t]*[-*_]{3,}[ \t]*\n/)
            .map((p) => p.trim())
            .filter((p) => p.length > 0);
          partsCount = legacy.length > 0 ? legacy.length : 1;
        }

        if (previousStep + 1 < partsCount) {
          // Ainda há blocos no mesmo moment → avança cursor
          effectiveStep = previousStep + 1;
          effectiveMomentKey = lastMomentKey;
        } else {
          // Esgotou a sequência → libera LLM para escolher próximo moment
          effectiveStep = 0;
          effectiveMomentKey = null;
        }
      }
    }

    // ------------------------------------------------------------------
    // 9. Decidir tools disponíveis
    // ------------------------------------------------------------------
    const availableTools: string[] = [
      "search_knowledge_base",
      "check_calendar",
      "request_handoff",
      "update_contact",
      "assign_tag",
      "create_task",
    ];
    if (scoringEnabled) availableTools.unshift("calculate_qualification_score");

    // ------------------------------------------------------------------
    // 10. Chamar Single Agent (gpt-5.5)
    // ------------------------------------------------------------------
    const singleAgentResult = await runSingleAgent({
      supabase,
      apiKey: OPENAI_API_KEY,
      agent: {
        id: agent.id,
        nome: agent.nome,
        modelo: agent.modelo,
        temperature: agent.temperature,
        max_tokens: agent.max_tokens,
        pipeline_models: agent.pipeline_models,
        identity_config: agent.identity_config,
        voice_config: agent.voice_config,
        boundaries_config: agent.boundaries_config,
        listening_config: agent.listening_config,
      },
      business: business ? {
        company_name: business.company_name,
        company_description: business.company_description,
        methodology_text: business.methodology_text,
        process_steps: business.process_steps || [],
        secondary_contact_role_name: business.secondary_contact_role_name,
      } : null,
      conversationState: {
        historico_compacto: historico,
        last_lead_message: processedText,
        last_moment_key: effectiveMomentKey,
        moment_step: effectiveStep,
        turn_count: turns.length,
        is_primeiro_contato: turns.length <= 1, // o turno que acabou de inserir já conta
        contact_name: contactName,
        card_titulo: cardTitulo,
        ai_resumo: aiResumo,
        ai_contexto: aiContexto,
        card_form_data: cardFormData,
      },
      scoringThreshold,
      availableTools,
    });

    console.log(`[v2] single_agent: model=${singleAgentResult.model_used} duration=${singleAgentResult.duration_ms}ms moment=${singleAgentResult.output.current_moment_key} messages=${singleAgentResult.output.messages.length} tools=${singleAgentResult.output.tool_calls.length}`);

    // ------------------------------------------------------------------
    // 11. Aplicar card_patch + contact_patch
    // ------------------------------------------------------------------
    const cardPatch = singleAgentResult.output.card_patch || {};
    const contactPatch = singleAgentResult.output.contact_patch || {};

    if (cardId && Object.keys(cardPatch).length > 0) {
      // Decompose: campos top-level vs form_data nested
      const topLevel: Record<string, unknown> = {};
      const formDataDelta: Record<string, unknown> = {};
      const TOP_LEVEL_COLS = new Set(["titulo", "ai_resumo", "ai_contexto", "valor_estimado", "valor_final"]);
      for (const [k, v] of Object.entries(cardPatch)) {
        if (TOP_LEVEL_COLS.has(k)) topLevel[k] = v;
        else formDataDelta[k] = v;
      }

      if (Object.keys(formDataDelta).length > 0) {
        const newFormData = { ...(cardFormData || {}), ...formDataDelta };
        topLevel.form_data = newFormData;
      }

      if (Object.keys(topLevel).length > 0) {
        const { error } = await supabase.from("cards").update(topLevel).eq("id", cardId);
        if (error) console.error(`[v2] card_patch falhou:`, error.message);
      }
    }

    if (Object.keys(contactPatch).length > 0) {
      const allowed = ["nome", "email", "data_nascimento"];
      const safe: Record<string, unknown> = {};
      for (const k of allowed) {
        if (contactPatch[k] != null) safe[k] = contactPatch[k];
      }
      if (Object.keys(safe).length > 0) {
        const { error } = await supabase.from("contatos").update(safe).eq("id", contactId);
        if (error) console.error(`[v2] contact_patch falhou:`, error.message);
      }
    }

    // ------------------------------------------------------------------
    // 12. Executar tool_calls
    // ------------------------------------------------------------------
    const toolResults: Array<{ tool: string; ok: boolean; error?: string }> = [];
    for (const tc of singleAgentResult.output.tool_calls) {
      const result = await executePatriciaToolCall(supabase, agent, cardId, contactId, tc);
      toolResults.push({ tool: tc.tool_name, ok: result.ok, error: result.error });
      if (!result.ok) {
        console.error(`[v2] tool ${tc.tool_name} falhou: ${result.error}`);
      }
    }

    // ------------------------------------------------------------------
    // 13. Brand Validator
    //
    // Passamos o moment ativo + mode pra o validador entender que em modo
    // literal/faithful o admin curou o texto — não deve sugerir rewrites
    // que bagunçam o playbook (ex: cortar a 2ª pergunta complementar).
    // ------------------------------------------------------------------
    const validatorRules = (agent.validator_rules || []) as ValidatorRule[];

    let activeMomentMode: "literal" | "faithful" | "free" | null = null;
    let activeMomentLabel: string | null = null;
    const activeMomentKey = singleAgentResult.output.current_moment_key || effectiveMomentKey;
    if (activeMomentKey) {
      const { data: momentRow } = await supabase
        .from("ai_agent_moments")
        .select("message_mode, moment_label")
        .eq("agent_id", agent.id)
        .eq("moment_key", activeMomentKey)
        .maybeSingle();
      if (momentRow) {
        activeMomentMode = (momentRow.message_mode as "literal" | "faithful" | "free") ?? null;
        activeMomentLabel = (momentRow.moment_label as string) ?? null;
      }
    }

    const verdict = await validateBrandCompliance(
      {
        messages: singleAgentResult.output.messages,
        rules: validatorRules,
        agent_name: agent.nome,
        is_first_contact: turns.length <= 1,
        last_lead_message: processedText,
        active_moment_key: activeMomentKey,
        active_moment_mode: activeMomentMode,
        active_moment_label: activeMomentLabel,
      },
      OPENAI_API_KEY,
    );

    console.log(`[v2] brand_validator: ok=${verdict.ok} action=${verdict.action} violations=${verdict.violations.length}`);

    // Decidir mensagens finais
    let finalMessages: string[];
    let blocked = false;

    if (verdict.action === "block") {
      console.warn(`[v2] BLOCK acionado. Violations:`, verdict.violations);
      finalMessages = [];
      blocked = true;
    } else if (verdict.action === "rewrite" && verdict.corrected_messages.length > 0) {
      finalMessages = verdict.corrected_messages.map((m) => m.content);
    } else {
      finalMessages = singleAgentResult.output.messages.map((m) => m.content);
    }

    // Enforcement: quando o moment ativo é wait_for_reply sequenciado, o
    // contrato é "1 mensagem por turno". Se o LLM ignorou turn_policy e
    // gerou múltiplas, MERGE elas em 1 (mantém só a primeira e descarta o
    // resto, que pertence aos próximos blocos do playbook — vão sair
    // naturalmente nos próximos turnos).
    if (!blocked && effectiveMomentKey && finalMessages.length > 1) {
      const { data: activeMomentRow } = await supabase
        .from("ai_agent_moments")
        .select("delivery_mode, anchor_text, anchor_text_parts")
        .eq("agent_id", agent.id)
        .eq("moment_key", effectiveMomentKey)
        .maybeSingle();
      if (activeMomentRow && activeMomentRow.delivery_mode === "wait_for_reply") {
        const parts = (activeMomentRow.anchor_text_parts as string[] | null);
        const partsCount = parts && parts.length > 0
          ? parts.length
          : (activeMomentRow.anchor_text ? (activeMomentRow.anchor_text as string).split(/\n[ \t]*[-*_]{3,}[ \t]*\n/).filter((p) => p.trim()).length : 1);
        if (partsCount > 1) {
          console.log(`[v2] enforcement: moment ${effectiveMomentKey} é sequenciado (${partsCount} blocos), LLM gerou ${finalMessages.length} messages — truncando pra 1`);
          finalMessages = [finalMessages[0]];
        }
      }
    }

    // ------------------------------------------------------------------
    // 14. Enviar mensagens via Echo + insert assistant turn
    //
    // Para cada bloco: envia, registra em whatsapp_messages (com platform_id
    // + external_id pra dedup com webhook do Echo), aguarda typing_delay e
    // segue pro próximo. NÃO interrompe a sequência se um send falhar —
    // continua tentando os blocos seguintes (padrão herdado do v1, que aprendeu
    // isso a duras penas em 2026-05-06 quando a Patricia entregava só 1/3 da
    // resposta sempre que o Echo dava timeout pontual).
    // ------------------------------------------------------------------
    const typingDelayMs = Math.round((agent.timings?.typing_delay_seconds ?? 1.5) * 1000);
    const maxMessageBlocks = agent.timings?.max_message_blocks ?? 3;
    const platformId = (lineRow as { platform_id?: string | null }).platform_id ?? null;

    const sendResults: Array<{ ok: boolean; status: number; error?: string; body?: string }> = [];
    let blocks: string[] = [];

    if (!blocked && finalMessages.length > 0) {
      // Se o LLM já devolveu N mensagens distintas e cabem no máximo configurado,
      // respeita essa separação natural. Caso contrário, junta tudo e re-quebra
      // pela heurística (last resort).
      if (finalMessages.length > 0 && finalMessages.length <= maxMessageBlocks) {
        blocks = finalMessages
          .map((m) => normalizeWhatsAppText(m))
          .filter((m) => m.trim().length > 0)
          .map((m) => (m.length > 1024 ? m.substring(0, 1023) + "…" : m));
      } else {
        const allMessagesText = finalMessages.join("\n\n");
        blocks = formatWhatsAppMessagesHeuristic(allMessagesText, maxMessageBlocks, 1024);
      }

      for (let i = 0; i < blocks.length; i++) {
        const text = blocks[i];
        const sendResult = await sendEchoMessage(
          ECHO_API_URL,
          ECHO_API_KEY,
          phone_number_id,
          contact_phone,
          text,
        );

        // Echo às vezes retorna status != 200 mas com wamid no body (msg enviada
        // mesmo assim). Reaproveita o padrão flexível do v1.
        let success = sendResult.ok;
        let wamid: string | null = null;
        try {
          const parsed = sendResult.body ? JSON.parse(sendResult.body) : null;
          wamid = parsed?.whatsapp_message_id || parsed?.id || null;
          if (!success && wamid) success = true;
        } catch (_) {}

        sendResults.push({ ok: success, status: sendResult.status, error: sendResult.error, body: sendResult.body });
        if (!success) {
          console.error(`[v2] sendEcho falhou bloco ${i + 1}/${blocks.length}:`, sendResult);
        }

        // Persiste em whatsapp_messages (uma linha por bloco, igual v1).
        // platform_id + external_id permite ON CONFLICT com o webhook do Echo
        // sem criar duplicata.
        try {
          await supabase.from("whatsapp_messages").insert({
            contact_id: contactId,
            card_id: cardId || null,
            body: text,
            direction: "outbound",
            is_from_me: true,
            type: "text",
            status: success ? "sent" : "failed",
            sender_phone: contact_phone.replace(/\D/g, ""),
            sent_by_user_name: agent.nome,
            phone_number_label: lineRow.phone_number_label,
            external_id: wamid,
            platform_id: platformId,
            phone_number_id: phone_number_id,
            metadata: { source: "ai_agent_v2", agent_id: agent.id },
          });
        } catch (insErr) {
          console.warn(`[v2] insert whatsapp_messages falhou:`, insErr);
        }

        // Delay entre mensagens (naturalidade, evita rate limit do Echo)
        if (i < blocks.length - 1) {
          await new Promise((r) => setTimeout(r, typingDelayMs));
        }
      }

      // Persistir assistant turn (junta blocos em 1 turno; reasoning vai pra coluna)
      await supabase.from("ai_conversation_turns").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: blocks.join("\n\n"),
        agent_id: agent.id,
        reasoning: singleAgentResult.output.internal_reasoning,
        skills_used: toolResults,
        context_used: {
          model: singleAgentResult.model_used,
          duration_ms: singleAgentResult.duration_ms,
          prompt_chars: singleAgentResult.prompt_system_chars + singleAgentResult.prompt_user_chars,
          validator: verdict,
          send_results: sendResults,
        },
        detected_intent: singleAgentResult.output.current_moment_key,
      });
    }

    // ------------------------------------------------------------------
    // 15. Atualizar ai_conversation_state (last_moment_key, moment_step, summary)
    //
    // Se o LLM continuou no mesmo moment que o router havia preparado
    // (effectiveMomentKey), persistimos o step efetivo. Se mudou de moment,
    // reseta para 0 — próxima rodada começa do bloco 1 do novo moment.
    // ------------------------------------------------------------------
    const finalMomentKey = singleAgentResult.output.current_moment_key;
    const newStep = (finalMomentKey && finalMomentKey === effectiveMomentKey) ? effectiveStep : 0;

    await supabase
      .from("ai_conversation_state")
      .upsert({
        conversation_id: conversationId,
        extracted_variables: {
          ...previousVars,
          last_moment_key: finalMomentKey,
          moment_step: newStep,
          last_reasoning: singleAgentResult.output.internal_reasoning,
        },
        updated_at: new Date().toISOString(),
      }, { onConflict: "conversation_id" });

    // Atualizar contadores da conversa
    await supabase
      .from("ai_conversations")
      .update({
        message_count: turns.length + 1 + (blocked ? 0 : 1),
        ai_message_count: blocked ? 0 : 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);

    // ------------------------------------------------------------------
    // 16. Resposta
    // ------------------------------------------------------------------
    return jsonResponse({
      ok: true,
      blocked,
      conversation_id: conversationId,
      contact_id: contactId,
      card_id: cardId,
      moment: singleAgentResult.output.current_moment_key,
      messages_sent: finalMessages.length,
      validator: { action: verdict.action, ok: verdict.ok, violations: verdict.violations.length },
      single_agent_duration_ms: singleAgentResult.duration_ms,
      total_duration_ms: Date.now() - startedAt,
      model: singleAgentResult.model_used,
      send_results: sendResults,
      tool_results: toolResults,
    });
  } catch (e) {
    const errMsg = (e as Error).message;
    const errStack = (e as Error).stack;
    console.error(`[v2] handler ERROR:`, errMsg, errStack);
    return jsonResponse({ error: errMsg, total_duration_ms: Date.now() - startedAt }, 500);
  } finally {
    if (lockAcquired && normalizedForBuffer) {
      try {
        await supabase.rpc("release_pipeline_lock", { p_contact_phone: normalizedForBuffer });
      } catch (err) {
        console.warn("[v2] release_pipeline_lock failed:", err);
      }
    }
  }
});

// ============================================================================
// Helpers de DB
// ============================================================================

async function findOrCreateContact(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  phone: string,
): Promise<string> {
  const { data: existing } = await supabase
    .from("contatos")
    .select("id")
    .eq("org_id", orgId)
    .eq("telefone", phone)
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: created, error } = await supabase
    .from("contatos")
    .insert({
      org_id: orgId,
      telefone: phone,
      nome: "WhatsApp",
      sobrenome: phone.slice(-4), // últimos 4 dígitos como sobrenome temp; lead atualiza ao se identificar
      origem: "whatsapp_ai_agent",
    })
    .select("id")
    .single();

  if (error) throw new Error(`Falha ao criar contato: ${error.message}`);
  return created!.id;
}

async function findOrCreateCard(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  contactId: string,
  pipelineId: string | null,
  stageId: string | null,
  phaseId: string | null,
  defaultOwnerId: string | null,
  produto: string | null,
): Promise<string | null> {
  if (!pipelineId || !stageId) return null;

  // Busca card ATIVO recente do contato neste pipeline
  const { data: existing } = await supabase
    .from("cards")
    .select("id")
    .eq("org_id", orgId)
    .eq("contato_principal_id", contactId)
    .eq("pipeline_id", pipelineId)
    .in("status", ["aberto", "open", "ativo", "active"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id;

  // Cria novo
  const insertData: Record<string, unknown> = {
    org_id: orgId,
    contato_principal_id: contactId,
    pipeline_id: pipelineId,
    etapa_id: stageId,
    titulo: "Novo lead WhatsApp",
    status: "aberto",
  };
  if (phaseId) insertData.fase_id = phaseId;
  if (defaultOwnerId) insertData.dono_atual_id = defaultOwnerId;
  if (produto) insertData.produto = produto;

  const { data: created, error } = await supabase
    .from("cards")
    .insert(insertData)
    .select("id")
    .single();

  if (error) {
    console.error(`[v2] findOrCreateCard error:`, error.message);
    return null;
  }
  return created?.id || null;
}

async function findOrCreateConversation(
  supabase: ReturnType<typeof createClient>,
  agentId: string,
  orgId: string,
  contactId: string,
  cardId: string | null,
  phoneNumberId: string,
): Promise<{ conversationId: string; isNew: boolean }> {
  const { data: existing } = await supabase
    .from("ai_conversations")
    .select("id")
    .eq("primary_agent_id", agentId)
    .eq("contact_id", contactId)
    .in("status", ["active", "waiting"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) return { conversationId: existing.id, isNew: false };

  const { data: created, error } = await supabase
    .from("ai_conversations")
    .insert({
      org_id: orgId,
      contact_id: contactId,
      card_id: cardId,
      primary_agent_id: agentId,
      current_agent_id: agentId,
      status: "active",
      phone_number_id: phoneNumberId,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Falha ao criar conversa: ${error.message}`);
  return { conversationId: created!.id, isNew: true };
}

// ============================================================================
// Helpers misc
// ============================================================================

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
