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
import { loadScoringRulesForPlaybook, type ScoringRule } from "./playbook_loader.ts";
import { evaluateSubjectiveRules } from "./subjective_evaluator.ts";
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

  // Patricia aceita TEXT, ÁUDIO (Whisper), IMAGEM (Vision gpt-5.1) e DOCUMENTO (file API gpt-5.1).
  // Outros tipos (sticker, location, contact_card, etc) ainda são descartados.
  const allowedTypes = new Set(["text", "audio", "image", "document"]);
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
          handoff_actions, handoff_signals, intelligent_decisions, context_fields_config,
          engine, timings, multimodal_config, wedding_planner_profile_id, scheduling_config
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
            "Conversa zerada. Manda 'oi' pra começar de novo.",
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
        } else if (r.media_url && (mt === "audio" || mt === "image" || mt === "document")) {
          const processed = await processMediaToText(mt, r.media_url, OPENAI_API_KEY, mmConfig);
          if (processed) segments.push(processed);
        } else {
          segments.push(`[lead enviou ${mt} — conteúdo não processado]`);
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

    if (criticosColetados && scoringEnabled) {
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

      const valorPorPax = (orcamentoTeto && numConv > 0) ? orcamentoTeto / numConv : null;
      const isFronteira = valorPorPax !== null && valorPorPax < 2500;

      const viajouInternacional = trackedData["ww_sdr_perfil_viagem_internacional"];
      const ajudaFamilia = trackedData["ww_sdr_ajuda_familia"];
      const opcionaisColetadas = viajouInternacional != null && ajudaFamilia != null;

      const podeDesfechar = !isFronteira || opcionaisColetadas;

      // FRONTEIRA + opcionais ainda não coletadas → força LLM a ficar na
      // sondagem (perguntar viagem internacional + apoio família) ANTES de
      // qualquer desfecho. Sem isso, o LLM pulava pra desfecho_qualificado
      // direto (red_line só protegia o caminho do não-qualificado). Bug
      // observado 2026-05-12: caso 50k/30/Nordeste virou qualificado direto
      // sem coletar opcionais.
      if (!podeDesfechar && criticosColetados && isFronteira) {
        forcedMomentKey = "sondagem";
        console.log(`[v2] trigger: fronteira sem opcionais → forçando moment=sondagem (valor/pax=${valorPorPax})`);
      }

      if (podeDesfechar) {
        // Chamar RPC determinística + avaliar regras ai_subjective via LLM.
        // RPC avalia só {equals, range, boolean_true}. Regras ai_subjective
        // (todas as 14 regras da Patricia) precisam de LLM intermediário. Sem
        // isso, RPC retornava score=0/breakdown=[] e o trigger nunca disparava
        // o desfecho determinístico — Patricia improvisava agendamento sem
        // slots reais. Padrão portado da Estela em 2026-05-12.
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
              forcedMomentKey = qualificado
                ? "desfecho_qualificado"
                : "desfecho_nao_qualificado";
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
        card_form_data: Object.keys(trackedData).length > 0 ? trackedData : cardFormData,
        forced_moment_key: forcedMomentKey,
        qualification_result: qualificationResult,
        proposed_slots: proposedSlots,
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
    const cardPatch = singleAgentResult.output.card_patch || {};
    const contactPatch = singleAgentResult.output.contact_patch || {};

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

    // Defesa pré-loop: se LLM está em desfecho com slots E NÃO chamou
    // confirm_meeting_slot mas a resposta dele OU a msg do lead aponta
    // claramente pra um dos slots, injetamos a chamada. Sem isso, LLM diz
    // "fica marcado" sem agendar de verdade.
    const llmCalledConfirm = singleAgentResult.output.tool_calls.some((tc) => tc.tool_name === "confirm_meeting_slot");
    if (inDesfechoComSlots && !llmCalledConfirm) {
      // Busca match em: msg do lead + texto da resposta da Patricia
      // (cobre 2 casos: "marca 14/05 10h" do lead, OU Patricia já
      // confirmando "vou agendar 14/05 às 10:00" sem chamar tool).
      const agentMessages = (singleAgentResult.output.messages || [])
        .map((m) => (m.content || "").toLowerCase())
        .join(" ");
      const haystack = `${(processedText || "").toLowerCase()} ${agentMessages}`;

      // Aliases pra weekdays (curto + longo)
      const weekdayAliases: Record<string, string[]> = {
        dom: ["dom", "domingo"],
        seg: ["seg", "segunda", "segunda-feira"],
        ter: ["ter", "terça", "terca", "terça-feira", "terca-feira"],
        qua: ["qua", "quarta", "quarta-feira"],
        qui: ["qui", "quinta", "quinta-feira"],
        sex: ["sex", "sexta", "sexta-feira"],
        sáb: ["sáb", "sab", "sábado", "sabado"],
      };

      let matched: { date: string; time: string } | null = null;
      for (const slot of proposedSlots!) {
        const [dd, mm] = slot.date.split("/");
        const hh = slot.time.split(":")[0];
        const dayPatterns = [
          slot.date.toLowerCase(),
          `${parseInt(dd, 10)}/${parseInt(mm, 10)}`,
          `dia ${parseInt(dd, 10)}`,
          ...(weekdayAliases[slot.weekday.toLowerCase()] || [slot.weekday.toLowerCase()]),
        ];
        const hourPatterns = [
          slot.time,
          `${hh}h`,
          `${parseInt(hh, 10)}h`,
          `às ${parseInt(hh, 10)}`,
          ` ${parseInt(hh, 10)} `,
          `${parseInt(hh, 10)}:00`,
        ];
        const dayHit = dayPatterns.some((p) => p.length >= 2 && haystack.includes(p));
        const hourHit = hourPatterns.some((p) => haystack.includes(p));
        if (dayHit && hourHit) {
          matched = { date: slot.date, time: slot.time };
          break;
        }
      }
      if (matched) {
        console.warn(`[v2] LLM não chamou confirm_meeting_slot em desfecho — injetando chamada { date: ${matched.date}, time: ${matched.time} }`);
        singleAgentResult.output.tool_calls.unshift({
          tool_name: "confirm_meeting_slot",
          args: matched,
        });
      }
    }

    for (let tc of singleAgentResult.output.tool_calls) {
      // (1) Auto-rotear create_task em contexto de agendamento
      if (
        inDesfechoComSlots &&
        tc.tool_name === "create_task"
      ) {
        const args = tc.args || {};
        // Tenta extrair date/time dos vários formatos comuns: data_inicio,
        // data_vencimento, scheduled_at — tudo pode ser ISO ou string livre.
        const dt = args.data_inicio || args.data_vencimento || args.scheduled_at || args.start_at;
        let rerouted: { date: string; time: string } | null = null;
        if (typeof dt === "string") {
          // ISO "YYYY-MM-DDTHH:MM..." ou "YYYY-MM-DD HH:MM"
          const m = dt.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
          if (m) {
            rerouted = { date: `${m[3]}/${m[2]}/${m[1]}`, time: `${m[4]}:${m[5]}` };
          }
        }
        if (rerouted) {
          console.warn(`[v2] LLM chamou create_task em desfecho com slots — auto-rotando pra confirm_meeting_slot { date: ${rerouted.date}, time: ${rerouted.time} }`);
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

      // Persistir assistant turn (junta blocos em 1 turno; reasoning vai pra coluna).
      // qualification_score_at_turn é persistido SEMPRE que o trigger determinístico
      // rodou — assim dashboards e auditoria têm o histórico de score por turno.
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
          forced_moment_key: forcedMomentKey,
          qualification_result: qualificationResult,
          proposed_slots: proposedSlots,
          subjective_eval: subjectiveEvalSnapshot,
          slots_conflicts_excluded: slotsConflictsExcluded,
        },
        detected_intent: singleAgentResult.output.current_moment_key,
        qualification_score_at_turn: qualificationResult?.score ?? null,
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
          // Snapshot de dados estruturados acumulados (resiste a card_id=null)
          tracked_data: updatedTrackedData,
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
