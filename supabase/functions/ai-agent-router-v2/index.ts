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
import type { BuildSinglePromptInput } from "./prompt_assembler.ts";
import { validateBrandCompliance, type ValidatorRule } from "./brand_validator.ts";
import { loadScoringRulesForPlaybook, type ScoringRule } from "./playbook_loader.ts";
import { evaluateSubjectiveRules } from "./subjective_evaluator.ts";
import { getDefaultsForAgent } from "./defaults/index.ts";
import {
  type AgentRow,
  type BusinessConfigRow,
  compactConversationHistory,
  executePatriciaToolCall,
  expandAvailableHours,
  formatWhatsAppMessagesHeuristic,
  type IncomingMessageInput,
  isPhoneInWhitelist,
  loadConversationHistory,
  normalizePhone,
  normalizeWhatsAppText,
  processMediaToText,
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

  // Patricia aceita TEXT, ÁUDIO (Whisper), IMAGEM (Vision gpt-5.1), DOCUMENTO (file API)
  // e STICKER (Vision via WebP — WhatsApp envia sticker como imagem WebP).
  // Outros tipos (location, contact_card, video, etc) ainda são descartados.
  const allowedTypes = new Set(["text", "audio", "image", "document", "sticker"]);
  if (body.message_type && !allowedTypes.has(body.message_type)) {
    console.log(`[v2] message_type=${body.message_type} ignorado (não suportado)`);
    return jsonResponse({
      ok: true,
      skipped: true,
      reason: `message_type ${body.message_type} não suportado`,
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
          handoff_actions,
          engine, timings, multimodal_config, wedding_planner_profile_id, scheduling_config,
          fallback_message, prompts_extra, tool_descriptions, cognitive_audit_config, data_update_rules
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
    // 1a. Comando especial /reset — testador pode zerar a própria conversa
    // pelo WhatsApp (mesma RPC do botão "Zerar conversa" do Studio).
    // Curtocircuita antes do debounce/LLM. Filtra por contact_phone, então
    // cada testador só apaga o que é dele.
    // ------------------------------------------------------------------
    const incomingText = (message_text || "").trim().toLowerCase();
    if (incomingText === "/reset") {
      console.log(`[v2 reset] solicitado agent=${agent.id} phone=${contact_phone}`);
      const { data: resetResult, error: resetErr } = await supabase.rpc(
        "reset_agent_conversations_with_phone",
        { p_agent_id: agent.id, p_phone: contact_phone },
      );
      if (resetErr) {
        console.error(`[v2 reset] RPC falhou:`, resetErr.message);
      } else {
        console.log(`[v2 reset] OK ${JSON.stringify(resetResult)}`);
      }

      // Confirmação via Echo. Não inserimos em ai_conversation_turns porque
      // o reset acabou de apagar tudo — qualquer insert aqui ressuscitaria
      // estado limpo. Também não criamos card/contato.
      if (ECHO_API_URL && ECHO_API_KEY) {
        try {
          await sendEchoMessage(
            ECHO_API_URL,
            ECHO_API_KEY,
            phone_number_id,
            contact_phone,
            "Conversa zerada. Manda 'Oi, vim do site e gostaria de saber mais sobre Destination Wedding' pra começar de novo.",
          );
        } catch (e) {
          console.warn(`[v2 reset] envio echo falhou:`, (e as Error).message);
        }
      }

      return jsonResponse({
        ok: true,
        action: "reset",
        result: resetResult ?? null,
        duration_ms: Date.now() - startedAt,
      });
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
      // Texto vai direto. Áudio/imagem/documento são processados via OpenAI
      // (Whisper / Vision gpt-5.1 / file API gpt-5.1) e o conteúdo extraído
      // entra como texto no fluxo. Multimodal_config do agente respeita
      // toggle de cada tipo se admin desligar.
      const mmConfig = (agent as unknown as { multimodal_config?: { audio?: boolean; image?: boolean; pdf?: boolean } | null }).multimodal_config ?? null;
      const segments: string[] = [];
      for (const r of claimedRows) {
        const mt = r.message_type || "text";
        if (mt === "text") {
          if (r.message_text && r.message_text.trim().length > 0) segments.push(r.message_text);
        } else if (r.media_url && (mt === "audio" || mt === "image" || mt === "document" || mt === "sticker")) {
          // Sticker tem path próprio em processMediaToText (WebP via Vision,
          // fallback neutro "[lead reagiu com um sticker]" quando falha).
          const processed = await processMediaToText(mt, r.media_url, OPENAI_API_KEY, mmConfig);
          if (processed) segments.push(processed);
        } else {
          segments.push(`[lead enviou ${mt}]`);
        }
      }
      const combined = segments.join("\n");
      if (combined) {
        processedText = combined;
        const mediaTypes = claimedRows.filter((r) => r.message_type && r.message_type !== "text").map((r) => r.message_type);
        console.log(`[v2 debounce] Claimed ${claimedRows.length} message(s) atomically (${combined.length} chars, media=${mediaTypes.join(",") || "none"})`);
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
    // 2.1 Resolve placeholders dinâmicos do business pra prompt
    //
    // Carrega nome da Wedding Planner (FK profiles via
    // ai_agents.wedding_planner_profile_id) e calcula o nome curto pra
    // conversa íntima. Junta com os 5 campos editáveis do
    // ai_agent_business_config + fallbacks do defaults curado por agente.
    // ------------------------------------------------------------------
    let wpName: string | null = null;
    let wpShort: string | null = null;
    const wpId = (agent as unknown as { wedding_planner_profile_id?: string | null }).wedding_planner_profile_id;
    if (wpId) {
      const { data: wpRow } = await supabase
        .from("profiles")
        .select("nome")
        .eq("id", wpId)
        .maybeSingle();
      if (wpRow?.nome) {
        wpName = wpRow.nome.trim();
        const parts = wpName.split(/\s+/).filter(Boolean);
        wpShort = parts.length >= 2 ? `${parts[0]} ${parts[1]}` : parts[0] || wpName;
      }
    }

    const agentDefaults = getDefaultsForAgent(agent.id);
    const fallbacks = agentDefaults?.businessFallbacks;
    const businessForPrompt: BuildSinglePromptInput["business"] = business ? {
      company_name: business.company_name,
      company_description: business.company_description,
      methodology_text: business.methodology_text,
      process_steps: business.process_steps || [],
      secondary_contact_role_name: business.secondary_contact_role_name,
      wedding_planner_name: wpName ?? fallbacks?.wedding_planner_name ?? null,
      wedding_planner_short: wpShort ?? fallbacks?.wedding_planner_short ?? null,
      honorario_faixa: business.honorario_faixa_text ?? fallbacks?.honorario_faixa ?? null,
      empresa_stats: business.empresa_stats_text ?? fallbacks?.empresa_stats ?? null,
      network_regions: business.network_regions_text ?? fallbacks?.network_regions ?? null,
      destination_categories: business.destination_categories_text ?? fallbacks?.destination_categories ?? null,
      brochure_policy: business.brochure_policy_text ?? fallbacks?.brochure_policy ?? null,
    } : (fallbacks ? {
      company_name: null,
      company_description: null,
      methodology_text: null,
      process_steps: [],
      secondary_contact_role_name: null,
      wedding_planner_name: wpName ?? fallbacks.wedding_planner_name,
      wedding_planner_short: wpShort ?? fallbacks.wedding_planner_short,
      honorario_faixa: fallbacks.honorario_faixa,
      empresa_stats: fallbacks.empresa_stats,
      network_regions: fallbacks.network_regions,
      destination_categories: fallbacks.destination_categories,
      brochure_policy: fallbacks.brochure_policy,
    } : null);

    // ------------------------------------------------------------------
    // 3. Find or create contato
    //
    // Modo teste (whitelist do agente não-vazia): usa contato/card ISOLADO
    // marcado com test_agent_id = agent.id, pra não poluir cards reais
    // que existam com o mesmo telefone. Reset apaga só os marcados.
    // Modo produção (whitelist vazia/null): comportamento normal.
    // ------------------------------------------------------------------
    const isTestMode = Array.isArray(agent.test_mode_phone_whitelist) && agent.test_mode_phone_whitelist.length > 0;
    const testAgentId: string | null = isTestMode ? agent.id : null;
    const phoneNorm = normalizePhone(contact_phone);
    const contactId = await findOrCreateContact(supabase, agent.org_id, phoneNorm, testAgentId);

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
        testAgentId,
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

    // Fallback: se a linha não cria card (criar_card=false) mas a conversa
    // já tem card_id vinculado por outro fluxo, usa esse pra que tools
    // dependentes (confirm_meeting_slot, request_handoff, etc) funcionem.
    if (!cardId) {
      const { data: convRow } = await supabase
        .from("ai_conversations")
        .select("card_id")
        .eq("id", conversationId)
        .maybeSingle();
      if (convRow?.card_id) {
        cardId = convRow.card_id as string;
      }
    }

    // ------------------------------------------------------------------
    // 5b. Card pausado permanentemente? (handoff humano invisível)
    //
    // Quando o agente chamou request_handoff com handoff_actions.pause_permanently=true,
    // cards.ai_pause_config = { permanent: true, ... }. O humano assumiu a
    // conversa via NotificationCenter — a agente NÃO deve responder mais
    // nesse contato. Bail out antes de gastar tokens do LLM.
    // ------------------------------------------------------------------
    if (cardId) {
      const { data: pauseRow } = await supabase
        .from("cards")
        .select("ai_pause_config")
        .eq("id", cardId)
        .maybeSingle();
      const pauseConfig = pauseRow?.ai_pause_config as { permanent?: boolean; reason?: string } | null;
      if (pauseConfig?.permanent === true) {
        console.info(`[v2] agente pausado permanentemente, abortando`, {
          card_id: cardId,
          conversation_id: conversationId,
          reason: pauseConfig.reason || null,
        });
        return jsonResponse({
          ok: true,
          skipped: true,
          reason: "card_paused_permanently",
          card_id: cardId,
        });
      }
    }

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

    // cards.form_data NÃO existe — dados estruturados do lead WEDDING vivem em
    // cards.produto_data (chaves ww_*). Para conversas sem card (inbound webhook
    // antes da criação do card), usamos tracked_data em ai_conversation_state.
    let cardFormData: Record<string, unknown> | null = null;
    let cardTitulo: string | null = null;
    if (cardId) {
      const { data: cardRow } = await supabase
        .from("cards")
        .select("titulo, produto_data, ai_resumo, ai_contexto")
        .eq("id", cardId)
        .maybeSingle();
      if (cardRow) {
        cardFormData = (cardRow.produto_data as Record<string, unknown>) || null;
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

        // Fix 1.3 (2026-05-24) — Early exit do avanço mecânico quando lead pronto pra fechar
        //
        // Quando self_analysis.lead_intent do TURN ANTERIOR foi "pronto_pra_fechar"
        // E moment ativo é "abertura" (que avançaria pro bloco 2 genérico
        // de apresentação Welcome), LIBERA o avanço mecânico pro LLM escolher
        // próximo moment.
        //
        // Observado em 23/05: cenário Renata ("já vi tudo, quero marcar reunião"
        // + "quarta 14h?") — Patricia ficou em abertura bloco 2 despejando pitch
        // genérico em quem já decidiu. lead_intent="pronto_pra_fechar" no turn
        // anterior + lastMomentKey="abertura" → libera, prompt_assembler dá
        // instrução de "sondagem mínima ANTES de marcar".
        const lastLeadIntent = previousVars.last_lead_intent as string | undefined;
        if (lastLeadIntent === "pronto_pra_fechar" && lastMomentKey === "abertura") {
          console.log(`[v2] early_exit_abertura: lead_intent=pronto_pra_fechar → libera moment_step`);
          effectiveStep = 0;
          effectiveMomentKey = null;
        }
      }
    }

    // ------------------------------------------------------------------
    // 8c. Tracked data (estado estruturado acumulado da conversa)
    //
    // Quando não há card linkado (inbound webhook antes de criar card), o
    // card_patch do LLM iria pra lugar nenhum. Persistimos em
    // extracted_variables.tracked_data pra ter um lugar único de verdade.
    // Quando há card, mesclamos com produto_data (preserva o que já estava
    // gravado lá).
    // ------------------------------------------------------------------
    const previousTracked = (previousVars.tracked_data as Record<string, unknown>) || {};
    const trackedData: Record<string, unknown> = {
      ...(cardFormData || {}),
      ...previousTracked,
    };

    // ------------------------------------------------------------------
    // 8c.fallback. Extração heurística de opcionais (executa ANTES do trigger
    // determinístico, pra que ele veja os opcionais salvos no MESMO turn em
    // que o lead respondeu).
    //
    // Por que existe: o LLM single_agent às vezes "esquece" de incluir no
    // card_patch a resposta que o lead deu a perguntas binárias de slot
    // (ex: "Sim, só nosso" → ww_sdr_ajuda_familia=false). Sem esse fallback,
    // a sondagem fica em loop sem conseguir qualificar. Regex preserva a
    // inteligência da Patricia (não substitui), só fecha a lacuna.
    // ------------------------------------------------------------------
    {
      const lastAssistantContent = (turns.length >= 2 && turns[turns.length - 2]?.role === "assistant")
        ? (turns[turns.length - 2].content || "")
        : "";
      const leadAnswer = (processedText || "").toLowerCase();

      // AJUDA FAMÍLIA — pergunta inclui família/ajuda/apoio/pais/sozinhos/conta própria/só de vocês
      if (trackedData["ww_sdr_ajuda_familia"] == null) {
        const askedAjuda = /fam[ií]lia|ajuda|apoio|pais|sogros|sozinh|conta pr[óo]pria|s[óo] nosso|s[óo] de voc[êe]s|de voc[êe]s dois|or[çc]amento de voc[êe]s|s[óo] vc/i.test(lastAssistantContent);
        if (askedAjuda) {
          if (/\b(n[ãa]o|nenhuma|s[óo] nosso|s[óo] a gente|sozinhos|conta pr[óo]pria|s[óo] de n[óo]s|s[óo] do casal|s[óo] meu|s[óo] nossa|por conta)\b/i.test(leadAnswer)) {
            trackedData["ww_sdr_ajuda_familia"] = false;
            console.log(`[v2 fallback] ww_sdr_ajuda_familia=false detectado em "${leadAnswer.substring(0, 60)}"`);
          } else if (/\b(sim|ajuda|ajudam|contribuem|pais|m[ãa]e|pai|sogros|fam[ií]lia ajuda)\b/i.test(leadAnswer)) {
            trackedData["ww_sdr_ajuda_familia"] = true;
            console.log(`[v2 fallback] ww_sdr_ajuda_familia=true detectado em "${leadAnswer.substring(0, 60)}"`);
          }
        }
      }

      // VIAGEM INTERNACIONAL — pergunta inclui viagem/viajar/internacional/fora do brasil/exterior
      if (trackedData["ww_sdr_perfil_viagem_internacional"] == null) {
        const askedViagem = /viagem|viaja|internacional|fora do brasil|exterior|outro pa[ií]s/i.test(lastAssistantContent);
        if (askedViagem) {
          if (/\b(n[ãa]o|nunca|nenhuma)\b/i.test(leadAnswer) && leadAnswer.length < 50) {
            trackedData["ww_sdr_perfil_viagem_internacional"] = false;
            console.log(`[v2 fallback] ww_sdr_perfil_viagem_internacional=false`);
          } else if (leadAnswer.length > 0 && leadAnswer.length < 200) {
            trackedData["ww_sdr_perfil_viagem_internacional"] = processedText;
            console.log(`[v2 fallback] ww_sdr_perfil_viagem_internacional="${processedText.substring(0, 60)}"`);
          }
        }
      }

      // DETECÇÃO GENÉRICA via detection_patterns dos sinais silenciosos.
      // Aplica a mesma lógica dos 2 blocos acima, mas pra QUALQUER sinal
      // do agente que tenha keywords configuradas via UI. Permite criar
      // novos sinais (qualquer agente) sem precisar de deploy.
      try {
        const { data: configuredSignals } = await supabase
          .from("ai_agent_silent_signals")
          .select("signal_key, crm_field_key, detection_patterns")
          .eq("agent_id", agent.id)
          .eq("enabled", true)
          .not("detection_patterns", "is", null);

        for (const sig of (configuredSignals || []) as Array<{
          signal_key: string;
          crm_field_key: string | null;
          detection_patterns: {
            question_keywords?: string[];
            answer_yes_keywords?: string[];
            answer_no_keywords?: string[];
            max_answer_length?: number;
          } | null;
        }>) {
          const field = sig.crm_field_key;
          if (!field) continue;
          if (trackedData[field] != null) continue;

          const p = sig.detection_patterns || {};
          const questionKw = Array.isArray(p.question_keywords) ? p.question_keywords.filter(Boolean) : [];
          const yesKw = Array.isArray(p.answer_yes_keywords) ? p.answer_yes_keywords.filter(Boolean) : [];
          const noKw = Array.isArray(p.answer_no_keywords) ? p.answer_no_keywords.filter(Boolean) : [];
          const maxLen = typeof p.max_answer_length === "number" && p.max_answer_length > 0
            ? p.max_answer_length
            : 200;
          if (questionKw.length === 0) continue;

          const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const asked = questionKw.some((kw) => {
            try {
              return new RegExp(escapeRegex(kw), "i").test(lastAssistantContent);
            } catch {
              return false;
            }
          });
          if (!asked) continue;

          const matchesNo = noKw.some((kw) => {
            try {
              return new RegExp(`\\b${escapeRegex(kw)}\\b`, "i").test(leadAnswer);
            } catch {
              return false;
            }
          });
          if (matchesNo) {
            trackedData[field] = false;
            console.log(`[v2 fallback] ${field}=false detectado por detection_patterns(${sig.signal_key})`);
            continue;
          }

          const matchesYes = yesKw.some((kw) => {
            try {
              return new RegExp(`\\b${escapeRegex(kw)}\\b`, "i").test(leadAnswer);
            } catch {
              return false;
            }
          });
          if (matchesYes) {
            trackedData[field] = true;
            console.log(`[v2 fallback] ${field}=true detectado por detection_patterns(${sig.signal_key})`);
            continue;
          }

          if (leadAnswer.length > 0 && leadAnswer.length < maxLen) {
            trackedData[field] = processedText;
            console.log(`[v2 fallback] ${field}="${processedText.substring(0, 60)}" detectado por detection_patterns(${sig.signal_key})`);
          }
        }
      } catch (err) {
        console.warn("[v2 fallback] erro lendo detection_patterns dos signals:", err);
      }
    }

    // ------------------------------------------------------------------
    // 8d. Trigger determinístico de desfecho + score
    //
    // Quando os 4 críticos (data, destino, convidados, orçamento) estão
    // coletados + (se valor/convidado < R$ 2.500) as 2 opcionais (viagem,
    // família), o router chama a RPC de scoring direto e força o momento
    // de desfecho. Tira a decisão do LLM (que não foi confiável: o caso de
    // 2026-05-12 com Vitor terminou em "deu pra entender" sem score).
    // ------------------------------------------------------------------
    let forcedMomentKey: string | null = null;
    let qualificationResult: { score: number; qualificado: boolean; breakdown?: unknown } | null = null;
    let proposedSlots: Array<{ date: string; time: string; weekday: string }> | null = null;

    // ------------------------------------------------------------------
    // 8c'. Detecção de recent_blocks_count → handoff_humano_invisivel
    //
    // Se o validator bloqueou N+ mensagens da agente nos últimos M turns,
    // a agente está travada — não consegue gerar resposta honesta sob as
    // regras atuais. Em vez de loop infinito de fallback_message ("deixa eu
    // verificar e já volto"), forçamos moment `handoff_humano_invisivel`
    // que manda uma frase humana coerente e chama request_handoff.
    //
    // N (block_threshold) e M (window_turns) são configuráveis por agente em
    // ai_agents.handoff_actions.auto_handoff_invisible. Default: 3 em 5
    // (threshold 2 era agressivo demais — qualificações com 1-2 hiccups
    // iniciais entravam em pausa). Toggle enabled controla se o trigger roda.
    // ------------------------------------------------------------------
    let autoHandoffTriggered = false;
    {
      const autoHandoffCfg = ((agent.handoff_actions || {}) as Record<string, unknown>)
        .auto_handoff_invisible as { enabled?: boolean; block_threshold?: number; window_turns?: number } | undefined;
      const ahEnabled = autoHandoffCfg?.enabled ?? true;
      const ahBlockThreshold = Math.max(1, autoHandoffCfg?.block_threshold ?? 3);
      const ahWindowTurns = Math.max(1, autoHandoffCfg?.window_turns ?? 5);

      const { data: recentTurns } = await supabase
        .from("ai_conversation_turns")
        .select("validator_verdict_action")
        .eq("conversation_id", conversationId)
        .eq("role", "assistant")
        .order("created_at", { ascending: false })
        .limit(ahWindowTurns);
      const recentBlocksCount = (recentTurns || []).filter(
        (t) => t.validator_verdict_action === "block",
      ).length;
      if (ahEnabled && recentBlocksCount >= ahBlockThreshold) {
        forcedMomentKey = "handoff_humano_invisivel";
        autoHandoffTriggered = true;
        console.log(
          `[v2] trigger: ${recentBlocksCount} blocks recentes → forçando moment=handoff_humano_invisivel + executando request_handoff direto`,
        );
        // Executar request_handoff direto, sem depender do LLM lembrar de
        // chamar a tool no tool_calls. O moment garante a frase humana,
        // mas a ação concreta (pausa + notify) é responsabilidade do router.
        if (cardId) {
          const ha = (agent.handoff_actions || {}) as Record<string, unknown>;
          const updates: Record<string, unknown> = {};
          if (ha.change_stage_id) updates.pipeline_stage_id = ha.change_stage_id;
          if (ha.pause_permanently === true) {
            updates.ai_pause_config = {
              permanent: true,
              reason: "validator_block_repetido",
              paused_at: new Date().toISOString(),
            };
          }
          if (Object.keys(updates).length > 0) {
            const { error: upErr } = await supabase.from("cards").update(updates).eq("id", cardId);
            if (upErr) console.error(`[v2 auto-handoff] update card falhou:`, upErr.message);
          }
          if (ha.notify_responsible === true) {
            const bookMeeting = (ha.book_meeting || {}) as Record<string, unknown>;
            const responsavelId =
              (bookMeeting.responsavel_id as string | undefined) ||
              (ha.responsavel_id as string | undefined) ||
              agent.wedding_planner_profile_id;
            if (responsavelId) {
              await supabase.from("notifications").insert({
                user_id: responsavelId,
                org_id: agent.org_id,
                type: "handoff_agente",
                title: `${agent.nome} pediu handoff (auto)`,
                body: `Agente travou (${recentBlocksCount} blocks consecutivos). Assuma a conversa.`,
                card_id: cardId,
                url: `/cards/${cardId}`,
                metadata: { agent_id: agent.id, motivo: "validator_block_repetido", severity: "high", auto: true },
              });
            }
          }
        }
      }
    }
    // Snapshot do que o subjective_evaluator devolveu — persistido em
    // context_used pra auditoria via SQL (logs do edge runtime não aparecem
    // em function_logs do analytics).
    let subjectiveEvalSnapshot: {
      rules_count: number;
      resolved: Record<string, boolean>;
      tokens: { input: number; output: number };
      elapsed_ms: number;
      eval_ran: boolean;
      rules_summary?: Array<{ rule_id: string; dimension: string; resolved: boolean | null; weight: number; rule_type: string }>;
    } | null = null;
    // Snapshot dos slots ocupados (reunioes table) excluídos do mock — útil
    // pra debug quando agenda começar a ter conflitos.
    let slotsConflictsExcluded: number = 0;

    const dataCasamento = trackedData["ww_data_casamento"];
    const destinoRegiao = trackedData["ww_destino"];
    const numConvidados = trackedData["ww_num_convidados"];
    const orcamentoFaixa = trackedData["ww_orcamento_faixa"];
    const criticosColetados = !!(dataCasamento && destinoRegiao && numConvidados && orcamentoFaixa);

    // Fix 1.2 (2026-05-24) — Trigger secundário de inviabilidade econômica precoce
    //
    // Quando lead já deu orçamento + convidados e a conta dá < R$ 800/conv,
    // força desfecho_nao_qualificado MESMO SEM data/destino. Proteção de marca:
    // recusar com dignidade > insistir em sondagem inviável.
    //
    // Observado em 23/05: cenário Pedro ("15k tudo incluso / 100 convidados Maldivas")
    // → R$ 150/conv. Patricia ficou em objecao_preco porque faltava data → trigger
    // de criticosColetados não disparou. Validator bloqueou tarde com nao_qualificar_inviavel.
    //
    // Pré-condições: !autoHandoffTriggered (handoff é prioridade), !forcedMomentKey,
    // orçamento>0 + convidados>0, valor_por_convidado<800.
    if (!autoHandoffTriggered && !forcedMomentKey) {
      const orcRaw = trackedData["ww_orcamento_faixa"];
      const convRaw = trackedData["ww_num_convidados"];
      const orcBrl = typeof orcRaw === "number" ? orcRaw : (typeof orcRaw === "string" ? parseInt(orcRaw.replace(/[^0-9]/g, ""), 10) : 0);
      const convNum = typeof convRaw === "number" ? convRaw : (typeof convRaw === "string" ? parseInt(convRaw.replace(/[^0-9]/g, ""), 10) : 0);
      if (orcBrl > 0 && convNum > 0) {
        const vpc = orcBrl / convNum;
        if (vpc < 800) {
          forcedMomentKey = "desfecho_nao_qualificado";
          qualificationResult = {
            score: 0,
            qualificado: false,
            threshold: 25,
            breakdown: [{
              dimension: "viabilidade_economica",
              label: "Abaixo do piso mínimo resistente",
              weight: -999,
              rule_id: "early_disqualify_below_minimum",
              rule_type: "disqualify",
              source: "router_early_check",
              value: `R$ ${vpc.toFixed(0)}/conv`,
            }],
          } as Record<string, unknown>;
          console.log(
            `[v2] early_disqualify: R$ ${vpc.toFixed(0)}/conv (orcamento=${orcBrl} conv=${convNum}) → forcedMomentKey=desfecho_nao_qualificado`,
          );
        }
      }
    }

    if (!forcedMomentKey && criticosColetados && scoringEnabled) {
      // Parse orcamento → número de teto (tenta vários formatos)
      let orcamentoTeto: number | null = null;
      if (typeof orcamentoFaixa === "number") {
        orcamentoTeto = orcamentoFaixa;
      } else if (typeof orcamentoFaixa === "string") {
        const digits = orcamentoFaixa.replace(/[^0-9]/g, "");
        if (digits.length > 0) {
          orcamentoTeto = parseInt(digits, 10);
          // Heurística "50k" → 50000: se número tem ≤3 dígitos e original contém 'k'/'mil'
          if (orcamentoFaixa.toLowerCase().match(/k\b|mil\b/) && orcamentoTeto < 1000) {
            orcamentoTeto *= 1000;
          }
        }
      } else if (typeof orcamentoFaixa === "object" && orcamentoFaixa) {
        const obj = orcamentoFaixa as Record<string, unknown>;
        const candidate = obj.maximo || obj.max || obj.teto || obj.total || obj.value;
        if (typeof candidate === "number") orcamentoTeto = candidate;
        else if (typeof candidate === "string") {
          const d = candidate.replace(/[^0-9]/g, "");
          if (d) orcamentoTeto = parseInt(d, 10);
        }
      }

      const numConv = typeof numConvidados === "number"
        ? numConvidados
        : parseInt(String(numConvidados).replace(/[^0-9]/g, ""), 10) || 0;

      // Converter on-the-fly se moeda estrangeira está no tracked_data mas o
      // valor parece ter ficado em EUR/USD original (LLM ignorou conversão no
      // primeiro turn). Heurística: se orcamentoTeto < 50k E moeda != BRL.
      const moedaOriginal = trackedData["ww_orcamento_moeda_original"] as string | undefined;
      const cotacaoUsada = trackedData["ww_orcamento_cotacao_usada"] as number | undefined;
      if (
        orcamentoTeto && orcamentoTeto < 50000 && cotacaoUsada &&
        moedaOriginal && moedaOriginal.toUpperCase() !== "BRL"
      ) {
        const original = orcamentoTeto;
        orcamentoTeto = Math.round(orcamentoTeto * cotacaoUsada);
        console.log(`[v2] trigger: convertendo orçamento ${original} ${moedaOriginal} × ${cotacaoUsada} = ${orcamentoTeto} BRL`);
      }

      // NOTA: removidos os pisos hardcoded de viabilidade (<R$800/conv =
      // inviável; <R$2500/conv = fronteira exigindo 2 opcionais). Eram regras
      // paralelas ao scoring que sobrepunham (e contradiziam) a régua real
      // configurável pela UI. Agora quem decide qualificação é APENAS o
      // scoring (ai_agent_scoring_rules + threshold). Pra ajustar
      // sensibilidade, mexer nas regras de scoring (que combinam destino +
      // valor + bônus) — não em código.
      const valorPorPax = (orcamentoTeto && numConv > 0) ? orcamentoTeto / numConv : null;

      {
        // Chamar RPC determinística + avaliar regras ai_subjective via LLM.
        // RPC avalia só {equals, range, boolean_true}. Regras ai_subjective
        // (todas as 14 regras da Patricia) precisam de LLM intermediário. Sem
        // isso, RPC retornava score=0/breakdown=[] e o trigger nunca disparava
        // o desfecho determinístico — Patricia improvisava agendamento sem
        // slots reais. Padrão portado da Estela em 2026-05-12.
        //
        // Fix 1.1 (2026-05-24): viajouInternacional e ajudaFamilia eram
        // referenciadas sem declaração prévia, chegando undefined na RPC.
        // Bonus desses 2 critérios nunca somava → score artificialmente baixo.
        // Lendo de trackedData (populado pela fallback heurística + extração
        // pelo LLM). Fallback null se não coletado.
        const viajouInternacional = trackedData["ww_sdr_perfil_viagem_internacional"] ?? null;
        const ajudaFamilia = trackedData["ww_sdr_ajuda_familia"] ?? null;

        const scoringInputs: Record<string, unknown> = {
          ww_data_casamento: dataCasamento,
          ww_destino: destinoRegiao,
          ww_num_convidados: numConv,
          ww_orcamento_faixa: orcamentoTeto,
          ww_sdr_perfil_viagem_internacional: viajouInternacional,
          ww_sdr_ajuda_familia: ajudaFamilia,
        };

        // Carrega regras pra ter pesos + labels das ai_subjective em mãos
        // antes da RPC. Custa 1 SELECT extra (~10ms). Mantém isolamento por
        // agent_id, então não afeta Estela.
        let scoringRules: ScoringRule[] = [];
        try {
          scoringRules = await loadScoringRulesForPlaybook(supabase, agent.id);
        } catch (e) {
          console.warn(`[v2] trigger: falha ao carregar scoring rules:`, (e as Error).message);
        }

        // Avalia regras ai_subjective via LLM (gpt-5.1). Combina histórico +
        // ai_resumo + ai_contexto + trackedData. Falha tolerante: se LLM cai,
        // resolved={} e trigger ainda decide pela RPC pura (que vai vir vazia
        // pra Patricia hoje, mas o fluxo se mantém).
        const subjectiveResolved: Record<string, boolean> = {};
        let subjectiveEvalRan = false;
        const subjectiveRules = scoringRules.filter((r) => r.condition_type === 'ai_subjective');
        if (subjectiveRules.length > 0 && OPENAI_API_KEY) {
          // Normaliza trackedData (Record<string, unknown>) para form_data (Record<string, string>)
          const formDataString: Record<string, string> = {};
          for (const [k, v] of Object.entries(trackedData)) {
            if (v == null) continue;
            formDataString[k] = typeof v === 'string' ? v : String(v);
          }
          try {
            const evalRes = await evaluateSubjectiveRules({
              rules: subjectiveRules,
              historico_compacto: historico,
              ai_resumo: aiResumo || '',
              ai_contexto: aiContexto || '',
              form_data: formDataString,
              agentName: agent.nome ?? '',
              openaiApiKey: OPENAI_API_KEY,
            });
            Object.assign(subjectiveResolved, evalRes.resolved);
            // Marca avaliação como rodada quando cobriu TODAS as regras (sinal
            // de sucesso completo). Se faltou alguma → tratamos como falha
            // parcial e mantemos fallback conservador.
            subjectiveEvalRan = Object.keys(evalRes.resolved).length === subjectiveRules.length;
            subjectiveEvalSnapshot = {
              rules_count: subjectiveRules.length,
              resolved: evalRes.resolved,
              tokens: evalRes.tokens,
              elapsed_ms: evalRes.elapsed_ms,
              eval_ran: subjectiveEvalRan,
              rules_summary: subjectiveRules.map((r) => ({
                rule_id: r.id,
                dimension: r.dimension,
                resolved: evalRes.resolved[r.id] ?? null,
                weight: Number(r.weight ?? 0),
                rule_type: r.rule_type ?? 'qualify',
              })),
            };
            console.log(JSON.stringify({
              event: 'v2_subjective_evaluated',
              agent_id: agent.id,
              rules_count: subjectiveRules.length,
              resolved: evalRes.resolved,
              tokens: evalRes.tokens,
              elapsed_ms: evalRes.elapsed_ms,
              eval_ran: subjectiveEvalRan,
            }));
          } catch (e) {
            console.warn(`[v2] trigger: subjective eval falhou:`, (e as Error).message);
          }
        }

        try {
          const { data: scoreData, error: scoreErr } = await supabase.rpc(
            "calculate_agent_qualification_score",
            { p_agent_id: agent.id, p_inputs: scoringInputs },
          );
          if (scoreErr) {
            console.warn(`[v2] trigger: RPC score falhou:`, scoreErr.message);
          } else if (scoreData) {
            const sd = scoreData as Record<string, unknown>;
            const rpcBreakdown = Array.isArray(sd.breakdown) ? [...(sd.breakdown as unknown[])] : [];
            let score = Number(sd.score) || 0;
            let disqualified = Boolean(sd.disqualified ?? false);
            const breakdown: unknown[] = [...rpcBreakdown];

            // Soma pesos das ai_subjective resolvidas como true (a RPC não
            // contemplou essas regras). Disqualify subjective força !qualificado.
            //
            // Regras de destino (dimension `destino_pref_*`) NÃO somam entre si:
            // casal pode mencionar múltiplos destinos ("Caribe ou Nordeste"),
            // mas pontuação considera o de MAIOR peso (decisão de negócio
            // 2026-05-13). Demais famílias (família, viagem, valor/convidado,
            // bonus) somam normal.
            const MAX_GROUP_PREFIXES = ['destino_pref_'];
            type ResolvedRule = typeof scoringRules[number];
            const maxGroupBest: Record<string, ResolvedRule> = {};
            const directSum: ResolvedRule[] = [];

            for (const r of scoringRules) {
              if (r.condition_type !== 'ai_subjective') continue;
              if (subjectiveResolved[r.id] !== true) continue;
              if (r.rule_type === 'disqualify') {
                disqualified = true;
                continue;
              }
              const prefix = MAX_GROUP_PREFIXES.find((p) => r.dimension.startsWith(p));
              if (prefix) {
                const cur = maxGroupBest[prefix];
                if (!cur || Number(r.weight ?? 0) > Number(cur.weight ?? 0)) {
                  maxGroupBest[prefix] = r;
                }
              } else {
                directSum.push(r);
              }
            }

            for (const r of directSum) {
              score += Number(r.weight ?? 0);
              breakdown.push({
                dimension: r.dimension,
                label: r.label ?? r.dimension,
                weight: r.weight ?? 0,
                rule_id: r.id,
                rule_type: r.rule_type ?? 'qualify',
                source: 'ai_subjective',
              });
            }
            for (const r of Object.values(maxGroupBest)) {
              score += Number(r.weight ?? 0);
              breakdown.push({
                dimension: r.dimension,
                label: r.label ?? r.dimension,
                weight: r.weight ?? 0,
                rule_id: r.id,
                rule_type: r.rule_type ?? 'qualify',
                source: 'ai_subjective_max',
              });
            }

            const threshold = Number(sd.threshold ?? scoringThreshold) || scoringThreshold;
            const qualificado = !disqualified && score >= threshold;

            // Confia no resultado se: (a) há breakdown/score, OU
            // (b) subjective eval rodou com sucesso (todas as regras
            // respondidas pelo LLM, mesmo todas false → resultado legítimo
            // de "não qualifica"). Só cai no fallback se RPC vazia E
            // subjective não rodou completo (timeout, parse error, etc).
            const breakdownEffective = breakdown.length > 0 || score > 0 || subjectiveEvalRan;
            if (!breakdownEffective) {
              console.log(`[v2] trigger: RPC vazia e subjective não avaliou. Deixando LLM decidir.`);
              qualificationResult = null;
            } else {
              qualificationResult = {
                score,
                qualificado,
                breakdown,
              };
              // handoff_humano_invisivel tem prioridade absoluta — só seta
              // desfecho_X se nenhum trigger anterior reivindicou.
              if (!forcedMomentKey) {
                forcedMomentKey = qualificado
                  ? "desfecho_qualificado"
                  : "desfecho_nao_qualificado";
              }
            }

            // Buscar horários disponíveis. Configurável via
            // `ai_agents.scheduling_config` (Studio). Defaults seguros mantêm
            // comportamento legado quando config é null.
            if (qualificationResult?.qualificado) {
              const sc = agent.scheduling_config ?? {};
              const availableHours = expandAvailableHours(sc);
              const maxPerDay = Number(sc.max_slots_per_day ?? 1);
              const maxDays = Number(sc.max_days ?? 3);
              const totalSlots = Number(sc.total_slots ?? Math.max(maxDays * maxPerDay, 3));
              const skipWeekends = sc.skip_weekends !== false; // default true
              const windowDays = Number(sc.search_window_days ?? 14);
              const dateFormat = (sc.date_format === "full") ? "full" : "short"; // default short

              const today = new Date();
              const weekdays = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
              type Slot = { date: string; time: string; weekday: string; iso: string };
              const candidates: Slot[] = [];
              const formatDate = (d: Date): string => {
                const dd = String(d.getDate()).padStart(2, "0");
                const mm = String(d.getMonth() + 1).padStart(2, "0");
                if (dateFormat === "full") {
                  return `${dd}/${mm}/${d.getFullYear()}`;
                }
                return `${dd}/${mm}`;
              };
              for (let i = 1; i < windowDays; i++) {
                const d = new Date(today);
                d.setDate(today.getDate() + i);
                const wd = d.getDay();
                if (skipWeekends && (wd === 0 || wd === 6)) continue;
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, "0");
                const dd = String(d.getDate()).padStart(2, "0");
                const dStr = formatDate(d);
                for (const h of availableHours) {
                  candidates.push({
                    date: dStr,
                    time: h,
                    weekday: weekdays[wd],
                    iso: `${yyyy}-${mm}-${dd}T${h}:00`,
                  });
                }
              }

              // Coleta horários ocupados de reuniões no mesmo org nas próximas N semanas.
              // Quando há Wedding Planner configurada, filtra apenas as reuniões dela.
              const occupied = new Set<string>();
              try {
                const horizonStart = new Date(today);
                const horizonEnd = new Date(today);
                horizonEnd.setDate(today.getDate() + windowDays);
                let meetingsQuery = supabase
                  .from("reunioes")
                  .select("data_inicio,status")
                  .eq("org_id", agent.org_id)
                  .gte("data_inicio", horizonStart.toISOString())
                  .lt("data_inicio", horizonEnd.toISOString())
                  .in("status", ["agendada", "confirmada", "agendado", "confirmado"]);
                if (agent.wedding_planner_profile_id) {
                  meetingsQuery = meetingsQuery.eq("responsavel_id", agent.wedding_planner_profile_id);
                }
                const { data: meetings, error: meetErr } = await meetingsQuery;
                if (meetErr) {
                  console.warn("[v2] trigger: erro lendo reunioes:", meetErr.message);
                } else if (Array.isArray(meetings)) {
                  for (const m of meetings) {
                    const di = m.data_inicio as string | null;
                    if (!di) continue;
                    const md = new Date(di);
                    const yyyy = md.getFullYear();
                    const mm = String(md.getMonth() + 1).padStart(2, "0");
                    const dd = String(md.getDate()).padStart(2, "0");
                    const hh = String(md.getHours()).padStart(2, "0");
                    const mi = String(md.getMinutes()).padStart(2, "0");
                    occupied.add(`${yyyy}-${mm}-${dd}T${hh}:${mi}:00`);
                  }
                }
              } catch (e) {
                console.warn("[v2] trigger: exception lendo reunioes:", (e as Error).message);
              }

              const free = candidates.filter((c) => !occupied.has(c.iso));
              slotsConflictsExcluded = candidates.length - free.length;

              // Distribui slots: até `maxPerDay` por dia, até `maxDays` dias,
              // total <= `totalSlots`. Ordem cronológica preservada (candidates
              // já vem ordenado).
              const freeByDate = new Map<string, Slot[]>();
              for (const c of free) {
                const arr = freeByDate.get(c.date);
                if (arr) arr.push(c);
                else freeByDate.set(c.date, [c]);
              }
              const finalSlots: Slot[] = [];
              let daysUsed = 0;
              for (const [, slotsThisDate] of freeByDate) {
                if (finalSlots.length >= totalSlots) break;
                if (daysUsed >= maxDays) break;
                let pickedThisDay = 0;
                for (const slot of slotsThisDate) {
                  if (pickedThisDay >= maxPerDay) break;
                  if (finalSlots.length >= totalSlots) break;
                  finalSlots.push(slot);
                  pickedThisDay++;
                }
                if (pickedThisDay > 0) daysUsed++;
              }
              // Fallback: se filtrou tudo, usa candidatos brutos (nunca pior
              // que antes).
              if (finalSlots.length === 0 && candidates.length > 0) {
                let pickedDays = 0;
                const seenDates = new Set<string>();
                for (const c of candidates) {
                  if (finalSlots.length >= totalSlots) break;
                  if (!seenDates.has(c.date)) {
                    if (pickedDays >= maxDays) continue;
                    seenDates.add(c.date);
                    pickedDays++;
                  }
                  finalSlots.push(c);
                }
              }

              proposedSlots = finalSlots.map((s) => ({
                date: s.date,
                time: s.time,
                weekday: s.weekday,
              }));
            }
            if (qualificationResult) {
              console.log(`[v2] trigger: desfecho forçado moment=${forcedMomentKey} score=${qualificationResult.score} qualificado=${qualificationResult.qualificado} threshold=${threshold}`);
            }
          }
        } catch (e) {
          console.warn(`[v2] trigger: exception chamando RPC:`, (e as Error).message);
        }
      }
    }

    // ------------------------------------------------------------------
    // 9. Decidir tools disponíveis
    // ------------------------------------------------------------------
    const availableTools: string[] = [
      "search_knowledge_base",
      "check_calendar",
      "confirm_meeting_slot",
      "request_handoff",
      "update_contact",
      "assign_tag",
    ];
    // create_task é exposta SÓ fora do desfecho_qualificado com slots
    // (confunde LLM, observado 2026-05-13).
    if (!(forcedMomentKey === "desfecho_qualificado" && proposedSlots && proposedSlots.length > 0)) {
      availableTools.push("create_task");
    }
    // Só expor calculate_qualification_score se o router NÃO já calculou.
    // Quando o trigger determinístico rodou, o resultado já está em
    // qualificationResult — LLM não precisa (e não deve) chamar a tool de novo.
    if (scoringEnabled && !qualificationResult) {
      availableTools.unshift("calculate_qualification_score");
    }

    // ------------------------------------------------------------------
    // 10. Chamar Single Agent (modelo configurável via pipeline_models.main)
    // ------------------------------------------------------------------
    let singleAgentResult = await runSingleAgent({
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
        scheduling_config: agent.scheduling_config,
        prompts_extra: (agent as unknown as { prompts_extra?: BuildSinglePromptInput["agent"]["prompts_extra"] }).prompts_extra,
        tool_descriptions: (agent as unknown as { tool_descriptions?: BuildSinglePromptInput["agent"]["tool_descriptions"] }).tool_descriptions ?? null,
        cognitive_audit_config: (agent as unknown as { cognitive_audit_config?: Record<string, unknown> | null }).cognitive_audit_config ?? null,
        data_update_rules: (agent as unknown as { data_update_rules?: BuildSinglePromptInput["agent"]["data_update_rules"] }).data_update_rules ?? null,
      },
      business: businessForPrompt,
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
        card_form_data: Object.keys(trackedData).length > 0 ? trackedData : cardFormData,
        forced_moment_key: forcedMomentKey,
        qualification_result: qualificationResult,
        proposed_slots: proposedSlots,
        // Fix 1.3 + 1.4 (2026-05-24) — passar facts do self_analysis turn anterior pro turn_policy
        last_lead_intent: (previousVars.last_lead_intent as "explorando" | "qualificando" | "objetando" | "pronto_pra_fechar" | undefined) ?? null,
        contradicao_detectada: (previousVars.last_contradicao_detectada as { campos?: string[]; descricao?: string } | undefined) ?? null,
      },
      scoringThreshold,
      availableTools,
    });

    console.log(`[v2] single_agent: model=${singleAgentResult.model_used} duration=${singleAgentResult.duration_ms}ms moment=${singleAgentResult.output.current_moment_key} messages=${singleAgentResult.output.messages.length} tools=${singleAgentResult.output.tool_calls.length}`);

    // ------------------------------------------------------------------
    // 11. Aplicar card_patch + contact_patch
    //
    // card_patch sempre é mesclado em trackedData (persiste em
    // ai_conversation_state.extracted_variables.tracked_data adiante). Quando há
    // card, também grava em cards.produto_data pra o CRM enxergar.
    // ------------------------------------------------------------------
    const cardPatchRaw = singleAgentResult.output.card_patch || {};
    const contactPatchRaw = singleAgentResult.output.contact_patch || {};

    // ── Cerca de segurança: validar contra business_config ───────────────
    // O admin configura quais campos a agente pode atualizar na aba
    // "Regras de Negócio" (auto_update_fields / contact_update_fields /
    // protected_fields). Aqui filtramos o que o LLM gerou contra essas
    // listas, ANTES de qualquer normalização/persistência. Campos fora
    // da allowlist são descartados silenciosamente com log.
    //
    // SEMPRE permitidos no card (mesmo sem allowlist): campos system que
    // o próprio router/tools precisam atualizar (ai_resumo, ai_contexto,
    // pipeline_stage_id, titulo + os 2 auxiliares de conversão de moeda).
    const SYSTEM_ALWAYS_ALLOWED_CARD = new Set([
      "titulo", "ai_resumo", "ai_contexto", "pipeline_stage_id",
      "ww_orcamento_moeda_original", "ww_orcamento_cotacao_usada",
    ]);
    // SEMPRE bloqueados no contato (proteção dura): telefone nunca é
    // sobrescrito pelo agente — é a chave de identidade.
    const SYSTEM_NEVER_ALLOWED_CONTACT = new Set(["telefone", "id", "org_id"]);

    const businessAutoUpdate: string[] = Array.isArray(business?.auto_update_fields)
      ? (business?.auto_update_fields as string[]) : [];
    const businessProtected: string[] = Array.isArray(business?.protected_fields)
      ? (business?.protected_fields as string[]) : [];
    const businessContactUpdate: string[] = Array.isArray(business?.contact_update_fields)
      ? (business?.contact_update_fields as string[]) : [];

    const cardAllowlistEnabled = businessAutoUpdate.length > 0;
    const cardAllowlist = new Set([...SYSTEM_ALWAYS_ALLOWED_CARD, ...businessAutoUpdate]);
    const cardDenylist = new Set(businessProtected);

    const cardPatch: Record<string, unknown> = {};
    const cardFiltered: string[] = [];
    for (const [k, v] of Object.entries(cardPatchRaw)) {
      if (cardDenylist.has(k)) {
        cardFiltered.push(`${k}(protected)`);
        continue;
      }
      if (cardAllowlistEnabled && !cardAllowlist.has(k)) {
        cardFiltered.push(`${k}(not_in_allowlist)`);
        continue;
      }
      cardPatch[k] = v;
    }
    if (cardFiltered.length > 0) {
      console.warn(`[v2] card_patch filtrado por business_config: ${cardFiltered.join(", ")}`);
    }

    // Contato: SEMPRE filtra o que o admin não autorizou. Fallback pra
    // ["nome", "email", "data_nascimento"] se admin não configurou nada
    // (mantém compat com agentes legados sem business_config completo).
    const contactAllowlistEffective = businessContactUpdate.length > 0
      ? businessContactUpdate.filter((k) => !SYSTEM_NEVER_ALLOWED_CONTACT.has(k))
      : ["nome", "email", "data_nascimento"];
    const contactAllowlist = new Set(contactAllowlistEffective);

    const contactPatch: Record<string, unknown> = {};
    const contactFiltered: string[] = [];
    for (const [k, v] of Object.entries(contactPatchRaw)) {
      if (SYSTEM_NEVER_ALLOWED_CONTACT.has(k)) {
        contactFiltered.push(`${k}(system_never)`);
        continue;
      }
      if (!contactAllowlist.has(k)) {
        contactFiltered.push(`${k}(not_in_allowlist)`);
        continue;
      }
      contactPatch[k] = v;
    }
    if (contactFiltered.length > 0) {
      console.warn(`[v2] contact_patch filtrado por business_config: ${contactFiltered.join(", ")}`);
    }

    // Auto-normalização de moeda estrangeira: se o LLM gravou moeda original
    // (EUR/USD/GBP) + cotação mas esqueceu de converter o valor em BRL,
    // multiplicamos aqui. Padrão observado: LLM declara "convertendo 15k * 6"
    // no reasoning mas grava 15000 cru no campo (não obedece a própria intenção).
    {
      const moeda = (cardPatch.ww_orcamento_moeda_original as string | undefined)
        || (trackedData["ww_orcamento_moeda_original"] as string | undefined);
      const cotacao = (cardPatch.ww_orcamento_cotacao_usada as number | undefined)
        || (trackedData["ww_orcamento_cotacao_usada"] as number | undefined);
      const valor = cardPatch.ww_orcamento_faixa;
      if (
        moeda && moeda.toUpperCase() !== "BRL" && cotacao && typeof valor === "number" &&
        valor > 0 && valor < 50000  // heurística: < R$ 50k pra 150 pax já é absurdo; deve ser EUR não convertido
      ) {
        const converted = Math.round(valor * cotacao);
        console.log(`[v2] auto-convert moeda: ${valor} ${moeda} × ${cotacao} = ${converted} BRL`);
        cardPatch.ww_orcamento_faixa = converted;
      }
    }

    // Mesclar card_patch em trackedData (sempre, mesmo sem card linkado)
    let updatedTrackedData = trackedData;
    if (Object.keys(cardPatch).length > 0) {
      updatedTrackedData = { ...trackedData };
      const TOP_LEVEL_COLS = new Set(["titulo", "ai_resumo", "ai_contexto", "valor_estimado", "valor_final"]);
      for (const [k, v] of Object.entries(cardPatch)) {
        if (!TOP_LEVEL_COLS.has(k)) updatedTrackedData[k] = v;
      }
    }

    // (Fallback de opcionais foi movido pra 8c, ANTES do trigger 8d, pra
    // permitir qualificação no mesmo turno em que o lead responde.)

    if (cardId && Object.keys(cardPatch).length > 0) {
      // Decompose: campos top-level vs produto_data nested
      const topLevel: Record<string, unknown> = {};
      const produtoDataDelta: Record<string, unknown> = {};
      const TOP_LEVEL_COLS = new Set(["titulo", "ai_resumo", "ai_contexto", "valor_estimado", "valor_final"]);
      for (const [k, v] of Object.entries(cardPatch)) {
        if (TOP_LEVEL_COLS.has(k)) topLevel[k] = v;
        else produtoDataDelta[k] = v;
      }

      if (Object.keys(produtoDataDelta).length > 0) {
        const newProdutoData = { ...(cardFormData || {}), ...produtoDataDelta };
        topLevel.produto_data = newProdutoData;
      }

      if (Object.keys(topLevel).length > 0) {
        const { error } = await supabase.from("cards").update(topLevel).eq("id", cardId);
        if (error) console.error(`[v2] card_patch falhou:`, error.message);
      }
    }

    if (Object.keys(contactPatch).length > 0) {
      // contactPatch já vem filtrado contra contact_update_fields (linhas acima).
      // Aqui só removemos valores null pra não sobrescrever com vazio.
      const safe: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(contactPatch)) {
        if (v != null) safe[k] = v;
      }
      if (Object.keys(safe).length > 0) {
        const { error } = await supabase.from("contatos").update(safe).eq("id", contactId);
        if (error) console.error(`[v2] contact_patch falhou:`, error.message);
      }
    }

    // ------------------------------------------------------------------
    // 12. Executar tool_calls
    //
    // Defesa em camadas:
    //   1. Auto-rotear create_task → confirm_meeting_slot quando estamos
    //      em desfecho_qualificado com slots (LLM tem viés forte de chamar
    //      create_task mesmo instruído contrário — observado 2026-05-13).
    //   2. Filtrar pra só executar tools em availableTools (LLM pode
    //      alucinar nomes de tools).
    // ------------------------------------------------------------------
    const availableToolsSet = new Set(availableTools);
    const toolResults: Array<{ tool: string; ok: boolean; error?: string; rerouted_from?: string }> = [];
    let checkCalendarResult: { slots_disponiveis?: Array<{ date: string; time: string; weekday: string }>; note?: string | null } | null = null;
    const inDesfechoComSlots = forcedMomentKey === "desfecho_qualificado" && !!(proposedSlots && proposedSlots.length > 0);

    // Defesa pré-loop AMPLA (Vitor 18/05): sempre que o agente tem Wedding
    // Planner configurada E a Patricia confirmou data+hora na resposta (até
    // mesmo data FORA dos proposed_slots — lead pode sugerir), injetamos
    // confirm_meeting_slot. A função tem check de conflito interno — se o
    // slot estiver ocupado, retorna erro e Patricia se ajeita no próximo
    // turno. Regra: nunca deixar "reservado" verbal sem agendar de fato.
    const llmCalledConfirm = singleAgentResult.output.tool_calls.some((tc) => tc.tool_name === "confirm_meeting_slot");
    const agentHasWP = !!(agent as unknown as { wedding_planner_profile_id?: string | null }).wedding_planner_profile_id;
    const agentResponseText = (singleAgentResult.output.messages || [])
      .map((m) => m.content || "")
      .join(" ");

    /** Extrai (date DD/MM[/YYYY], time HH:MM) de um texto livre.
     *  Aceita formatos: "22/05", "22/05/2026", "às 11:00", "às 11h", "11h00".
     *  Pega o par (date, time) mais próximos (até 80 chars de distância). */
    const findDateTime = (text: string): { date: string; time: string } | null => {
      if (!text) return null;
      const dateRe = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/g;
      const timeRe = /(?:às\s+|as\s+)?(\d{1,2})(?::(\d{2})|h\s*(\d{0,2}))(?:\s*h(?:oras?)?)?/gi;
      const dates: Array<{ idx: number; date: string }> = [];
      const times: Array<{ idx: number; time: string }> = [];
      let m: RegExpExecArray | null;
      while ((m = dateRe.exec(text)) !== null) {
        const dd = m[1].padStart(2, "0");
        const mm = m[2].padStart(2, "0");
        const yyyy = m[3] || "";
        dates.push({ idx: m.index, date: yyyy ? `${dd}/${mm}/${yyyy}` : `${dd}/${mm}` });
      }
      while ((m = timeRe.exec(text)) !== null) {
        const hh = parseInt(m[1], 10);
        if (hh > 23) continue;
        const mi = m[2] ?? (m[3] && m[3].length > 0 ? m[3] : "00");
        const miPadded = mi.padStart(2, "0");
        if (parseInt(miPadded, 10) > 59) continue;
        times.push({ idx: m.index, time: `${String(hh).padStart(2, "0")}:${miPadded}` });
      }
      if (dates.length === 0 || times.length === 0) return null;
      let best: { date: string; time: string; dist: number } | null = null;
      for (const d of dates) {
        for (const t of times) {
          const dist = Math.abs(d.idx - t.idx);
          if (dist <= 80 && (!best || dist < best.dist)) {
            best = { date: d.date, time: t.time, dist };
          }
        }
      }
      return best ? { date: best.date, time: best.time } : null;
    };

    // Palavras que indicam que a Patricia CONFIRMOU o agendamento (verbal).
    // Evita falsos positivos quando ela só está propondo/perguntando.
    const confirmHints = /\b(reservad[oa]|marcad[oa]|agendad[oa]|combinad[oa]|fechad[oa]|consigo\s+sim|pode\s+ser|fica\s+pra|fica\s+reservad|fica\s+marcad|fica\s+agendad|t[áa]\s+(?:marcad|agendad|fechad)|perfeito,?\s+(?:ent[ãa]o|fica))/i;
    const agentConfirmed = confirmHints.test(agentResponseText);

    if (agentHasWP && !llmCalledConfirm && agentConfirmed) {
      const found = findDateTime(agentResponseText);
      if (found) {
        console.warn(`[v2] LLM confirmou agendamento sem chamar confirm_meeting_slot — injetando { date: ${found.date}, time: ${found.time} }`);
        singleAgentResult.output.tool_calls.unshift({
          tool_name: "confirm_meeting_slot",
          args: found,
        });
      }
    }

    for (let tc of singleAgentResult.output.tool_calls) {
      // (1) Auto-rotear create_task pra confirm_meeting_slot em agente com WP.
      // Cobre desfecho_qualificado com slots formais E quando LLM confirma
      // data livre sugerida pelo lead (mesmo fora dos slots oferecidos).
      if (agentHasWP && tc.tool_name === "create_task") {
        const args = tc.args || {};
        const dt = args.data_inicio || args.data_vencimento || args.scheduled_at || args.start_at;
        let rerouted: { date: string; time: string } | null = null;
        if (typeof dt === "string") {
          const m = dt.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
          if (m) {
            rerouted = { date: `${m[3]}/${m[2]}/${m[1]}`, time: `${m[4]}:${m[5]}` };
          } else {
            rerouted = findDateTime(dt);
          }
        }
        if (!rerouted) {
          rerouted = findDateTime(`${args.titulo || ""} ${args.descricao || ""}`);
        }
        const looksLikeMeeting = /reuni[ãa]o|videoconfer[êe]ncia|call|encontro|conversa.*planner|wedding\s+planner/i.test(`${args.titulo || ""} ${args.descricao || ""} ${args.tipo || ""}`);
        if (rerouted && (looksLikeMeeting || inDesfechoComSlots)) {
          console.warn(`[v2] auto-rotando create_task → confirm_meeting_slot { date: ${rerouted.date}, time: ${rerouted.time} } (reason: ${inDesfechoComSlots ? "desfecho+slots" : "looksLikeMeeting"})`);
          tc = { tool_name: "confirm_meeting_slot", args: rerouted };
        }
      }

      if (!availableToolsSet.has(tc.tool_name)) {
        const original = tc.tool_name;
        console.warn(`[v2] tool '${original}' não está em availableTools — ignorando`);
        toolResults.push({ tool: original, ok: false, error: "tool não disponível neste contexto" });
        continue;
      }
      const result = await executePatriciaToolCall(supabase, agent, cardId, contactId, tc);
      toolResults.push({ tool: tc.tool_name, ok: result.ok, error: result.error });
      if (tc.tool_name === "check_calendar" && result.ok && result.result) {
        checkCalendarResult = result.result as typeof checkCalendarResult;
      }
      if (!result.ok) {
        console.error(`[v2] tool ${tc.tool_name} falhou: ${result.error}`);
      }
    }

    // ------------------------------------------------------------------
    // 12b. Agentic loop curto pra check_calendar
    //
    // O LLM gera mensagem + tool_calls no mesmo output e NÃO vê o resultado
    // da tool no mesmo turn. Quando o lead pediu uma data fora dos slots
    // originais (ex: 'tem dia 17?'), a Patricia chama check_calendar mas
    // responde "vou ver" às cegas. Aqui pegamos o retorno da tool e
    // re-chamamos o single_agent com tool_results populado → resposta
    // baseada nos slots reais retornados.
    //
    // Só roda 1 vez por turn (sem risco de loop infinito). Só pra
    // check_calendar — outras tools mantêm comportamento atual.
    // ------------------------------------------------------------------
    if (inDesfechoComSlots && checkCalendarResult) {
      const newSlots = checkCalendarResult.slots_disponiveis || [];
      console.log(`[v2] agentic loop: check_calendar retornou ${newSlots.length} slots (note: ${checkCalendarResult.note || "—"}). Re-chamando LLM.`);

      // Atualiza proposedSlots local: quando tem slots novos, usa eles.
      // Se vier vazio, mantém os originais visíveis no contexto (LLM vai
      // explicar a falta usando o note).
      if (newSlots.length > 0) {
        proposedSlots = newSlots;
      }

      try {
        const reagentResult = await runSingleAgent({
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
            scheduling_config: agent.scheduling_config,
          },
          business: businessForPrompt,
          conversationState: {
            historico_compacto: historico,
            last_lead_message: processedText,
            last_moment_key: effectiveMomentKey,
            moment_step: effectiveStep,
            turn_count: turns.length,
            is_primeiro_contato: turns.length <= 1,
            contact_name: contactName,
            card_titulo: cardTitulo,
            ai_resumo: aiResumo,
            ai_contexto: aiContexto,
            card_form_data: Object.keys(trackedData).length > 0 ? trackedData : cardFormData,
            forced_moment_key: forcedMomentKey,
            qualification_result: qualificationResult,
            proposed_slots: proposedSlots,
            tool_results: { check_calendar: checkCalendarResult },
            // Fix 1.3 + 1.4 (2026-05-24) — preservar facts no re-call do agentic loop
            last_lead_intent: (previousVars.last_lead_intent as "explorando" | "qualificando" | "objetando" | "pronto_pra_fechar" | undefined) ?? null,
            contradicao_detectada: (previousVars.last_contradicao_detectada as { campos?: string[]; descricao?: string } | undefined) ?? null,
          },
          scoringThreshold,
          availableTools,
        });
        console.log(`[v2] agentic loop: re-chamada concluída duration=${reagentResult.duration_ms}ms`);
        // Substitui o resultado original — a nova mensagem usa os slots reais.
        singleAgentResult = reagentResult;
      } catch (e) {
        console.warn(`[v2] agentic loop: re-chamada falhou (${(e as Error).message}). Mantendo resposta original.`);
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

    // Instrução custom do validator (ai_agents.prompts_extra.validator) é
    // concatenada após as regras — habilita admin a escrever orientação meta
    // sobre COMO o validador deve raciocinar (ex: "audite princípios de
    // caráter, não checklist"). Per-agente; vazio = comportamento padrão.
    const extraValidatorInstruction = (
      (agent as unknown as { prompts_extra?: { validator?: string | null } | null }).prompts_extra?.validator
    ) || null;

    // -------- Context facts pré-validator -----------------------------------
    // O main LLM (gpt-5.5-thinking) pensa antes de responder e preenche o
    // bloco `self_analysis` com detecção de contradição, pitch saturado,
    // inviabilidade econômica, pendências e sinais defensivos.
    //
    // O router consome esse self_analysis e passa pro validator. Em vez de
    // heurísticas regex/listas hardcoded, o validator confia no julgamento
    // semântico do main (que entende nuance: "frio + Mendoza" não é
    // contradição, "frio + Trancoso" é).
    //
    // Fallback determinístico: a viabilidade econômica é cruzada com cálculo
    // matemático (com conversão de moeda) — defesa em profundidade caso o
    // LLM erre. Se há divergência, usamos o cálculo mais restritivo.
    const selfAnalysis = singleAgentResult.output.self_analysis || {};
    const contextFacts: Record<string, unknown> = {};
    if (selfAnalysis.contradicao_detectada) {
      contextFacts.contradicao_detectada = selfAnalysis.contradicao_detectada;
    }
    if (selfAnalysis.pitch_saturado_self === true) {
      contextFacts.pitch_saturado = true;
      contextFacts.pitch_count_recent = selfAnalysis.pitch_count_recent || 2;
    }
    if (selfAnalysis.pendencia_resolver) {
      contextFacts.pendencias_patricia = selfAnalysis.pendencia_resolver;
    }
    if (selfAnalysis.sinais_defensivos_lead === true) {
      contextFacts.sinais_defensivos_lead = true;
    }
    if (selfAnalysis.pergunta_lead_nao_respondida) {
      contextFacts.pergunta_lead_nao_respondida = selfAnalysis.pergunta_lead_nao_respondida;
    }

    // Fallback determinístico de viabilidade: calcula matemática e cruza com
    // o que o LLM disse. Toma o MAIS restritivo (proteção da marca > LLM otimista).
    {
      const orc = updatedTrackedData["ww_orcamento_faixa"];
      const conv = updatedTrackedData["ww_num_convidados"];
      let orcNum = typeof orc === "number" ? orc : (typeof orc === "string" ? parseInt(orc.replace(/[^0-9]/g, ""), 10) || 0 : 0);
      const convNum = typeof conv === "number" ? conv : (typeof conv === "string" ? parseInt(conv.replace(/[^0-9]/g, ""), 10) || 0 : 0);
      const moedaCtx = updatedTrackedData["ww_orcamento_moeda_original"] as string | undefined;
      const cotacaoCtx = updatedTrackedData["ww_orcamento_cotacao_usada"] as number | undefined;
      if (orcNum > 0 && orcNum < 50000 && cotacaoCtx && moedaCtx && moedaCtx.toUpperCase() !== "BRL") {
        orcNum = Math.round(orcNum * cotacaoCtx);
      }
      if (orcNum > 0 && convNum > 0) {
        const valorPorPax = orcNum / convNum;
        const calcLevel = valorPorPax < 800 ? "abaixo_minimo_resistente"
          : valorPorPax < 1200 ? "fronteira_defensiva"
          : null;
        const llmLevel = selfAnalysis.inviabilidade_calc || null;
        // Toma o mais restritivo entre cálculo determinístico e LLM
        const severityRank: Record<string, number> = { "abaixo_minimo_resistente": 2, "fronteira_defensiva": 1 };
        const calcRank = calcLevel ? severityRank[calcLevel] : 0;
        const llmRank = llmLevel ? severityRank[llmLevel] : 0;
        const finalLevel = calcRank >= llmRank ? calcLevel : llmLevel;
        if (finalLevel) contextFacts.inviabilidade_economica = finalLevel;
        contextFacts.valor_por_convidado_brl = Math.round(valorPorPax);
      } else if (selfAnalysis.valor_por_convidado_brl) {
        // LLM calculou mas dados do trackedData ainda não chegaram; usa LLM
        contextFacts.valor_por_convidado_brl = selfAnalysis.valor_por_convidado_brl;
        if (selfAnalysis.inviabilidade_calc) {
          contextFacts.inviabilidade_economica = selfAnalysis.inviabilidade_calc;
        }
      }
    }
    console.log(`[v2] contextFacts (self+calc):`, JSON.stringify(contextFacts));

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
        extra_validator_instruction: extraValidatorInstruction,
        context_facts: contextFacts,
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

    // Fix Vitor 25/05 — handoff_actions.transition_message é injetada pela UI
    // SEMPRE que houver handoff invisível. Detecção tripla:
    //   1. forcedMomentKey = handoff_humano_invisivel (router forçou)
    //   2. LLM classificou current_moment_key = handoff_humano_invisivel
    //   3. LLM chamou tool request_handoff (caso onde marca moment=null mas
    //      pede handoff — observado em Carla 26/05 T6)
    // Qualquer um dos 3 → frase da UI sobrescreve mensagem gerada pelo LLM.
    // Também desbloqueia se validator havia barrado por nao_prometer_voltar
    // (a frase da UI é determinística e válida — handoff foi disparado de fato).
    const llmCalledHandoffTool = (singleAgentResult.output.tool_calls || []).some(
      (tc) => tc.tool_name === "request_handoff",
    );
    const handoffDetected =
      forcedMomentKey === "handoff_humano_invisivel" ||
      singleAgentResult.output.current_moment_key === "handoff_humano_invisivel" ||
      llmCalledHandoffTool;
    if (handoffDetected) {
      const ha = (agent.handoff_actions || {}) as Record<string, unknown>;
      const handoffText = (ha.transition_message as string | null | undefined) || (ha.message as string | null | undefined);
      if (handoffText && handoffText.trim().length > 0) {
        console.log(`[v2] handoff: usando frase da UI (handoff_actions.transition_message). Detectado por: forced=${forcedMomentKey === "handoff_humano_invisivel"}, llm_moment=${singleAgentResult.output.current_moment_key === "handoff_humano_invisivel"}, tool=${llmCalledHandoffTool}`);
        finalMessages = [handoffText.trim()];
        // Se o validator bloqueou por suspeita de promessa vazia, a frase da
        // UI restaura o turno: handoff aconteceu de fato (tool foi chamada),
        // a frase é responsabilidade do admin.
        if (blocked) {
          console.log(`[v2] handoff: destravando turno bloqueado pelo validator (handoff de fato disparado via tool)`);
          blocked = false;
        }
      }
    }

    // Enforcement: quando o moment ativo é wait_for_reply sequenciado, o
    // contrato é "1 mensagem por turno". Se o LLM gerou múltiplas mensagens
    // dentro do mesmo bloco (ex: separou eco social de "Tudo bem, X" da
    // apresentação literal do bloco 2), MESCLA todas em 1 mensagem só —
    // preserva todo o conteúdo do LLM em vez de jogar fora o que veio
    // depois (bug histórico: em 2026-05-12 com gpt-5.1, eco social ia, mas
    // o bloco 2 inteiro era descartado).
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
          console.log(`[v2] enforcement: moment ${effectiveMomentKey} é sequenciado (${partsCount} blocos), LLM gerou ${finalMessages.length} messages — mesclando em 1`);
          finalMessages = [finalMessages.join("\n\n")];
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
      // Estratégia de quebra em bolhas WhatsApp:
      //  (a) Se o LLM devolveu múltiplos items em messages[] que cabem no max,
      //      respeita a separação natural — cada item vira uma bolha.
      //  (b) Se devolveu 1 item só com múltiplos parágrafos (\n\n) — comum em
      //      moments LITERAL onde o anchor é uma string contínua — auto-quebra
      //      pelos parágrafos pra virar bolhas separadas.
      //  (c) Fallback: junta tudo e usa heurística.
      const normalizedMsgs = finalMessages
        .map((m) => normalizeWhatsAppText(m))
        .filter((m) => m.trim().length > 0);

      if (normalizedMsgs.length === 1 && normalizedMsgs[0].includes("\n\n")) {
        // Quebra automática por parágrafos (caso (b))
        blocks = formatWhatsAppMessagesHeuristic(normalizedMsgs[0], maxMessageBlocks, 1024);
      } else if (normalizedMsgs.length > 0 && normalizedMsgs.length <= maxMessageBlocks) {
        blocks = normalizedMsgs.map((m) => (m.length > 1024 ? m.substring(0, 1023) + "…" : m));
      } else {
        const allMessagesText = normalizedMsgs.join("\n\n");
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

      // Persistir assistant turn (junta blocos em 1 turno; reasoning vai pra coluna).
      // qualification_score_at_turn é persistido SEMPRE que o trigger determinístico
      // rodou — assim dashboards e auditoria têm o histórico de score por turno.
      // validator_verdict_action é o resumo binário (pass/rewrite/block) que habilita
      // queries diretas e a detecção de recent_blocks_count → handoff_humano_invisivel.
      const { error: turnInsertErr } = await supabase.from("ai_conversation_turns").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: blocks.join("\n\n"),
        agent_id: agent.id,
        // T5.1 — tokens reais pra rastrear custo
        input_tokens: singleAgentResult.input_tokens,
        output_tokens: singleAgentResult.output_tokens,
        reasoning: singleAgentResult.output.internal_reasoning,
        skills_used: toolResults,
        context_used: {
          model: singleAgentResult.model_used,
          duration_ms: singleAgentResult.duration_ms,
          prompt_chars: singleAgentResult.prompt_system_chars + singleAgentResult.prompt_user_chars,
          input_tokens: singleAgentResult.input_tokens,
          output_tokens: singleAgentResult.output_tokens,
          validator: verdict,
          raw_messages: singleAgentResult.output.messages,
          send_results: sendResults,
          forced_moment_key: forcedMomentKey,
          qualification_result: qualificationResult,
          proposed_slots: proposedSlots,
          subjective_eval: subjectiveEvalSnapshot,
          slots_conflicts_excluded: slotsConflictsExcluded,
        },
        detected_intent: singleAgentResult.output.current_moment_key,
        current_moment_key: singleAgentResult.output.current_moment_key ?? null,
        moment_detection_method: forcedMomentKey ? "deterministic" : "llm",
        moment_transition_reason: forcedMomentKey
          ? `router forçou ${forcedMomentKey} (recent_blocks_count ou regra determinística)`
          : null,
        qualification_score_at_turn: qualificationResult?.score ?? null,
        validator_verdict_action: verdict?.action ?? null,
      });
      if (turnInsertErr) {
        console.error(`[v2] FALHA AO PERSISTIR ASSISTANT TURN: ${turnInsertErr.message}`, turnInsertErr);
      }

      // Denormalizar pontuação no card (cards.sdr_qualification_score_latest)
      // pra UI ler — mesmo shape que o trigger de SDR humano (migration
      // 20260512d_sdr_qualifications.sql). Inclui source/agent_id pra distinguir
      // IA de humano. Se humano qualificar depois, o trigger existente
      // sobrescreve com a versão humana (comportamento esperado).
      if (cardId && qualificationResult && typeof qualificationResult.score === "number") {
        const { error: cardScoreErr } = await supabase
          .from("cards")
          .update({
            sdr_qualification_score_latest: {
              qualification_id: null,
              score: qualificationResult.score,
              qualificado: qualificationResult.qualificado ?? false,
              disqualified: (qualificationResult as { disqualified?: boolean }).disqualified ?? false,
              finalized_at: new Date().toISOString(),
              sdr_user_id: null,
              source: "ai_agent",
              agent_id: agent.id,
            },
          })
          .eq("id", cardId);
        if (cardScoreErr) {
          console.error(`[v2] FALHA AO DENORMALIZAR SCORE NO CARD: ${cardScoreErr.message}`, cardScoreErr);
        }
      }
    }

    // Quando o validator bloqueia (action="block"), o flow acima não envia
    // nada e a lead fica esperando indefinidamente. Envia agent.fallback_message
    // pra dar um sinal de vida ("Deixa eu verificar uma coisa aqui e já volto.")
    // — Vitor pediu 2026-05-18 após Sarah ficar sem resposta a uma pergunta
    // de orçamento bloqueada pela regra nunca_preco.
    let fallbackSent = false;
    const fallbackMessage = (agent as unknown as { fallback_message?: string | null }).fallback_message;
    if (blocked && fallbackMessage && fallbackMessage.trim().length > 0) {
      fallbackSent = true;
      const fallbackText = fallbackMessage.trim();
      const sendResult = await sendEchoMessage(
        ECHO_API_URL,
        ECHO_API_KEY,
        phone_number_id,
        contact_phone,
        fallbackText,
      );
      let success = sendResult.ok;
      let wamid: string | null = null;
      try {
        const parsed = sendResult.body ? JSON.parse(sendResult.body) : null;
        wamid = parsed?.whatsapp_message_id || parsed?.id || null;
        if (!success && wamid) success = true;
      } catch (_) {}
      sendResults.push({ ok: success, status: sendResult.status, error: sendResult.error, body: sendResult.body });

      try {
        await supabase.from("whatsapp_messages").insert({
          contact_id: contactId,
          card_id: cardId || null,
          body: fallbackText,
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
          metadata: { source: "ai_agent_v2_fallback", agent_id: agent.id, blocked_by_validator: true },
        });
      } catch (insErr) {
        console.warn(`[v2] insert whatsapp_messages fallback falhou:`, insErr);
      }

      const { error: fbTurnInsertErr } = await supabase.from("ai_conversation_turns").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: fallbackText,
        agent_id: agent.id,
        // T5.1 — tokens do turno bloqueado (LLM gastou tokens gerando antes do validator vetar)
        input_tokens: singleAgentResult.input_tokens,
        output_tokens: singleAgentResult.output_tokens,
        reasoning: "Validator bloqueou a resposta original — enviando fallback_message do agente.",
        skills_used: toolResults,
        context_used: {
          validator: verdict,
          raw_messages: singleAgentResult.output.messages,
          send_results: sendResults,
          fallback_triggered: true,
          input_tokens: singleAgentResult.input_tokens,
          output_tokens: singleAgentResult.output_tokens,
        },
        detected_intent: singleAgentResult.output.current_moment_key,
        current_moment_key: singleAgentResult.output.current_moment_key ?? null,
        moment_detection_method: forcedMomentKey ? "deterministic" : "fallback",
        moment_transition_reason: "fallback_disparado_por_validator_block",
        qualification_score_at_turn: qualificationResult?.score ?? null,
        validator_verdict_action: verdict?.action ?? "block",
      });
      if (fbTurnInsertErr) {
        console.error(`[v2] FALHA AO PERSISTIR FALLBACK TURN: ${fbTurnInsertErr.message}`, fbTurnInsertErr);
      }
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

    // Fix 1.3 + 1.4 (2026-05-24) — Persistir facts do self_analysis pra próximo turn
    // - lead_intent: usado no avanço mecânico de moment_step + turn_policy
    // - contradicao_detectada: usado no turn_policy pra forçar devolução
    const saSnap = (singleAgentResult.output.self_analysis as Record<string, unknown> | undefined) ?? {};
    const lastLeadIntentToPersist = saSnap.lead_intent as string | undefined;
    const lastContradicaoToPersist = saSnap.contradicao_detectada as { campos?: string[]; descricao?: string } | null | undefined;

    await supabase
      .from("ai_conversation_state")
      .upsert({
        conversation_id: conversationId,
        extracted_variables: {
          ...previousVars,
          last_moment_key: finalMomentKey,
          moment_step: newStep,
          last_reasoning: singleAgentResult.output.internal_reasoning,
          last_lead_intent: lastLeadIntentToPersist ?? null,
          last_contradicao_detectada: lastContradicaoToPersist ?? null,
          // Snapshot de dados estruturados acumulados (resiste a card_id=null)
          tracked_data: updatedTrackedData,
        },
        updated_at: new Date().toISOString(),
      }, { onConflict: "conversation_id" });

    // Atualizar contadores da conversa
    await supabase
      .from("ai_conversations")
      .update({
        message_count: turns.length + 1 + ((blocked && !fallbackSent) ? 0 : 1),
        ai_message_count: (blocked && !fallbackSent) ? 0 : 1,
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
  testAgentId: string | null = null,
): Promise<string> {
  // Em modo teste, busca/cria identidade isolada — não reutiliza contato
  // real homônimo (mesmo telefone). Migration 20260518c adiciona a coluna.
  let query = supabase
    .from("contatos")
    .select("id")
    .eq("org_id", orgId)
    .eq("telefone", phone)
    .limit(1);
  if (testAgentId) {
    query = query.eq("test_agent_id", testAgentId);
  } else {
    query = query.is("test_agent_id", null);
  }
  const { data: existing } = await query.maybeSingle();

  if (existing?.id) return existing.id;

  // telefone_normalizado é GENERATED — não pode passar valor explícito.
  const insertData: Record<string, unknown> = {
    org_id: orgId,
    telefone: phone,
    nome: testAgentId ? "Lead (teste)" : "WhatsApp",
    sobrenome: phone.slice(-4),
    origem: testAgentId ? "ai_agent_test" : "whatsapp_ai_agent",
  };
  if (testAgentId) insertData.test_agent_id = testAgentId;

  const { data: created, error } = await supabase
    .from("contatos")
    .insert(insertData)
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
  testAgentId: string | null = null,
): Promise<string | null> {
  if (!pipelineId || !stageId) return null;

  // Em modo teste: filtra cards pelo test_agent_id. Cards reais (sem
  // a marca) ficam isolados mesmo que pertençam ao mesmo contact_id
  // — relevante porque o contato de teste é distinto do real.
  let query = supabase
    .from("cards")
    .select("id")
    .eq("org_id", orgId)
    .eq("pessoa_principal_id", contactId)
    .eq("pipeline_id", pipelineId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (testAgentId) {
    query = query.eq("test_agent_id", testAgentId);
  } else {
    query = query.is("test_agent_id", null);
  }
  const { data: existing } = await query.maybeSingle();

  if (existing?.id) return existing.id;

  // Cria novo card
  const insertData: Record<string, unknown> = {
    org_id: orgId,
    pessoa_principal_id: contactId,
    pipeline_id: pipelineId,
    pipeline_stage_id: stageId,
    titulo: testAgentId ? "[TESTE] Lead WhatsApp" : "Novo lead WhatsApp",
  };
  if (defaultOwnerId) insertData.dono_atual_id = defaultOwnerId;
  if (produto) insertData.produto = produto;
  if (testAgentId) insertData.test_agent_id = testAgentId;

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
