import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { processMediaToText } from "../_shared/media.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-platform-id",
};

// ── Whitelist da Sofia/wsdr (números que o agente responde) ──────────────────
// Forma "local" do número (sem DDI 55) p/ comparar com tolerância a formato.
function sdrwLocalPhone(s: string | null | undefined): string {
    const d = String(s ?? "").replace(/\D/g, "");
    if (d.length === 13 && d.startsWith("55")) return d.slice(2);
    if (d.length === 12 && d.startsWith("55")) return d.slice(2);
    return d;
}
// SEGURO por padrão: lista vazia/nula = NÃO responde ninguém (≠ Patricia, onde
// vazio = responde todo mundo). Casa com/sem DDI e com pequenas variações de dígitos.
function sdrwPhoneAllowed(contact: string, list: string[] | null | undefined): boolean {
    if (!list || list.length === 0) return false;
    const c = sdrwLocalPhone(contact);
    if (!c) return false;
    return list.some((w) => {
        const lw = sdrwLocalPhone(w);
        return !!lw && (lw === c || c.endsWith(lw) || lw.endsWith(c));
    });
}

/**
 * WhatsApp Webhook Ingest
 * 
 * Receives webhooks from ChatPro and Echo, stores raw payload for processing.
 * 
 * Usage:
 * POST /functions/v1/whatsapp-webhook?provider=chatpro
 * POST /functions/v1/whatsapp-webhook?provider=echo
 */
Deno.serve(async (req) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        const url = new URL(req.url);
        const provider = url.searchParams.get("provider");

        // Validate provider
        if (!provider || !["chatpro", "echo"].includes(provider)) {
            return new Response(
                JSON.stringify({ error: "Invalid or missing provider. Use ?provider=chatpro or ?provider=echo" }),
                {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                }
            );
        }

        // 1. Fetch Platform Config
        const { data: platform, error: platformError } = await supabaseClient
            .from("whatsapp_platforms")
            .select("id, is_active")
            .eq("provider", provider)
            .single();

        if (platformError || !platform) {
            console.error("Platform not found:", provider, platformError);
            return new Response(
                JSON.stringify({ error: `Platform '${provider}' not configured` }),
                {
                    status: 404,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                }
            );
        }

        if (!platform.is_active) {
            return new Response(
                JSON.stringify({ error: `Platform '${provider}' is inactive` }),
                {
                    status: 403,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                }
            );
        }

        // 2. Parse payload
        const payload = await req.json();

        // Handle array payloads (some platforms send batches)
        const payloads = Array.isArray(payload) ? payload : [payload];
        const insertedIds: string[] = [];
        const errors: string[] = [];

        for (const singlePayload of payloads) {
            // 3. Extract event type and idempotency key based on provider
            let eventType: string | null = null;
            let idempotencyKey: string | null = null;
            let origem: string | null = null;

            if (provider === "chatpro") {
                eventType = singlePayload.event || singlePayload.message_type || null;
                idempotencyKey = singlePayload.message_id || null;
                origem = singlePayload.origem || null;
            } else if (provider === "echo") {
                // Echo wraps data in 'data' object
                const data = singlePayload.data || singlePayload;
                eventType = data.event || singlePayload.event || null;
                idempotencyKey = data.whatsapp_message_id || data.message_id || null;
                origem = null; // Echo doesn't have origem
            }

            // 4. Idempotency Check
            if (idempotencyKey) {
                const { data: existingEvent } = await supabaseClient
                    .from("whatsapp_raw_events")
                    .select("id")
                    .eq("platform_id", platform.id)
                    .eq("idempotency_key", String(idempotencyKey))
                    .single();

                if (existingEvent) {
                    console.log(`Duplicate event ignored: ${idempotencyKey}`);
                    continue; // Skip duplicate
                }
            }

            // 5. Insert raw event
            const { data: insertedEvent, error: insertError } = await supabaseClient
                .from("whatsapp_raw_events")
                .insert({
                    platform_id: platform.id,
                    event_type: eventType,
                    origem: origem,
                    idempotency_key: idempotencyKey,
                    raw_payload: singlePayload,
                    status: "pending",
                })
                .select("id")
                .single();

            if (insertError) {
                console.error("Failed to insert event:", insertError);
                errors.push(insertError.message);
            } else if (insertedEvent) {
                insertedIds.push(insertedEvent.id);
            }
        }

        // 6. Update platform last_event_at
        await supabaseClient
            .from("whatsapp_platforms")
            .update({ last_event_at: new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T') + '-03:00' })
            .eq("id", platform.id);

        // 6.5 Forward to n8n Julia agent (awaited)
        if (provider === "echo" && insertedIds.length > 0) {
            const n8nUrl = Deno.env.get("N8N_JULIA_WEBHOOK_URL");
            if (n8nUrl) {
                const { data: labelSetting } = await supabaseClient
                    .from("integration_settings")
                    .select("value")
                    .eq("key", "JULIA_PHONE_LABELS")
                    .single();
                const allowedLabels = (labelSetting?.value || "").split(",").map((s: string) => s.trim()).filter(Boolean);
                if (allowedLabels.length > 0) {
                    for (const singlePayload of payloads) {
                        const phoneLabel = singlePayload?.phone_number || singlePayload?.data?.phone_number;
                        if (phoneLabel && allowedLabels.includes(phoneLabel)) {
                            try {
                                // Convert ts_iso from UTC to São Paulo time
                                const fwdPayload = { ...singlePayload };
                                if (fwdPayload.ts_iso) {
                                    const d = new Date(fwdPayload.ts_iso);
                                    fwdPayload.ts_iso = d.toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T') + '-03:00';
                                }
                                const fwdRes = await fetch(n8nUrl, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify(fwdPayload),
                                });
                                console.log("n8n forward:", fwdRes.status);
                            } catch (err) {
                                console.error("n8n forward error:", err);
                            }
                        }
                    }
                }
            }
        }

        // 6.6 Forward to n8n Wedding agent
        if (provider === "echo" && insertedIds.length > 0) {
            const weddingN8nUrl = Deno.env.get("N8N_WEDDING_WEBHOOK_URL");
            if (weddingN8nUrl) {
                const { data: weddingLabelSetting } = await supabaseClient
                    .from("integration_settings")
                    .select("value")
                    .eq("key", "WEDDING_PHONE_LABELS")
                    .single();
                const weddingLabels = (weddingLabelSetting?.value || "").split(",").map((s: string) => s.trim()).filter(Boolean);
                if (weddingLabels.length > 0) {
                    for (const singlePayload of payloads) {
                        const phoneLabel = singlePayload?.phone_number || singlePayload?.data?.phone_number;
                        if (phoneLabel && weddingLabels.includes(phoneLabel)) {
                            try {
                                const fwdPayload = { ...singlePayload };
                                if (fwdPayload.ts_iso) {
                                    const d = new Date(fwdPayload.ts_iso);
                                    fwdPayload.ts_iso = d.toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T') + '-03:00';
                                }
                                const fwdRes = await fetch(weddingN8nUrl, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify(fwdPayload),
                                });
                                console.log("n8n wedding forward:", fwdRes.status);
                            } catch (err) {
                                console.error("n8n wedding forward error:", err);
                            }
                        }
                    }
                }
            }
        }

        // 6.7 Forward to AI Agent Router (modular agents)
        if (provider === "echo" && insertedIds.length > 0) {
            const agentRouterEnabled = Deno.env.get("AI_AGENT_ROUTER_ENABLED");
            if (agentRouterEnabled === "true") {
                const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
                const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
                for (const singlePayload of payloads) {
                    // Só processar mensagens inbound (não status updates)
                    const data = singlePayload.data || singlePayload;
                    const direction = data.direction || singlePayload.direction;
                    if (direction === "outbound") continue;

                    // BUG FIX 2026-04-23: Echo envia "message.status" com `text` preenchido
                    // (eco da msg outbound). Sem filtro, o webhook tratava isso como msg
                    // inbound nova, chamava o router, que respondia à própria resposta →
                    // loop infinito de mensagens. Status events NUNCA devem disparar router.
                    const eventKind = data.event || singlePayload.event;
                    if (typeof eventKind === "string" && eventKind.startsWith("message.status")) {
                        // 2026-05-19: ANTES de descartar, processa failures pra refletir
                        // no relatório de Envios do Dia (envio_lotes + whatsapp_messages).
                        try {
                            const statusName = data.status_name || singlePayload.status_name;
                            const wppId = data.whatsapp_message_id || singlePayload.whatsapp_message_id;
                            if (statusName === "failed" && wppId) {
                                const errorMsg = data.error_message || data.error || singlePayload.error_message || singlePayload.error || "Falha reportada pelo WhatsApp";
                                // Echo já faz fallback automático com variação do número (com/sem 9)
                                // quando Meta devolve #131026 "Message undeliverable". Não marcar
                                // como falha final — fica pending_fallback até confirmação.
                                const isUndeliverable131026 = /message undeliverable/i.test(String(errorMsg));
                                const { data: msgRow } = await supabaseClient
                                    .from("whatsapp_messages")
                                    .update(
                                        isUndeliverable131026
                                            ? { status: "pending_fallback", error_message: errorMsg, ack_status: -1 }
                                            : { has_error: true, error_message: errorMsg, ack_status: -1 }
                                    )
                                    .eq("whatsapp_message_id", wppId)
                                    .select("id, metadata")
                                    .maybeSingle();
                                // Só incrementa failed do lote se for falha real (não fallback em andamento)
                                if (!isUndeliverable131026) {
                                    const loteId = (msgRow?.metadata as Record<string, unknown> | null)?.envio_lote_id;
                                    if (typeof loteId === "string") {
                                        await supabaseClient.rpc("increment_envio_lote_failed", { p_lote_id: loteId });
                                    }
                                }
                            }
                        } catch (err) {
                            console.warn("[webhook] failed-status processing error:", err);
                        }
                        continue;
                    }
                    // Heurística extra: sender=null + status_name preenchido = status event
                    const isStatusOnly = (data.sender === null && data.status_name)
                        || (singlePayload.sender === null && singlePayload.status_name);
                    if (isStatusOnly) continue;

                    const messageText = data.text || data.body || singlePayload.text || "";
                    if (!messageText) continue;

                    const contactPhone = data.from || data.remote_phone || data.contact_phone || data.contact?.phone || singlePayload.from || singlePayload.contact_phone || "";
                    if (!contactPhone) continue;

                    // Defense-in-depth contra echo loop (2026-04-25): se o messageText
                    // bate exatamente com algo enviado outbound nos últimos 90s pra esse
                    // mesmo destinatário, é eco da própria resposta — descarta.
                    // Echo às vezes manda webhook de "message.created" com text preenchido
                    // sem direction=outbound nem event=message.status, escapando dos 3
                    // filtros acima. Sem isso, o router responde à própria resposta
                    // (loop) ou comenta o eco ("Haha, mensagem voltou pra mim").
                    try {
                        const phoneDigits = contactPhone.replace(/\D/g, "");
                        const since = new Date(Date.now() - 90 * 1000).toISOString();
                        const trimmed = messageText.trim();
                        const { data: recentOutbound } = await supabaseClient
                            .from("whatsapp_messages")
                            .select("body")
                            .eq("direction", "outbound")
                            .eq("sender_phone", phoneDigits)
                            .gte("created_at", since)
                            .limit(20);
                        if (recentOutbound?.some((m: { body: string | null }) => (m.body ?? "").trim() === trimmed)) {
                            console.log(`[webhook] DISCARDED echo loop: text matches outbound msg sent <90s ago to ${phoneDigits}`);
                            continue;
                        }
                    } catch (err) {
                        console.warn("[webhook] echo-loop check failed (proceeding):", err);
                    }

                    // ── PRE-FILTRO: só insere no buffer (e chama o roteador) se a
                    //   linha tem agente IA ativo E o contato passa nas whitelists.
                    // Sem isso, o webhook insere msgs de TODA linha — vendedores humanos,
                    // grupos, linhas sem IA — e essas linhas ficam órfãs no buffer (a msg
                    // já está em whatsapp_messages, que é a fonte de verdade da conversa).
                    // Quando ativar agente pra clientes reais, basta zerar
                    // routing_filter.allowed_phones + test_mode_phone_whitelist do agente.
                    const phoneNumberId = data.phone_number_id || singlePayload.phone_number_id || null;
                    const normalizedContact = contactPhone.replace(/\D/g, "");
                    if (!phoneNumberId) {
                        console.log(`[webhook] AI skip: no phone_number_id on inbound`);
                        continue;
                    }

                    // ── SDR Weddings (Sofia / clones, n8n) — roteamento por linha + whitelist no banco ──
                    // Config-driven: wsdr_phone_line_routing diz quais linhas são de um agente wsdr;
                    // wsdr_agents.test_mode_phone_whitelist diz QUAIS números ele responde.
                    // SEGURO: lista vazia/nula = NÃO responde ninguém (≠ Patricia). Editado na tela da Sofia.
                    // Se a linha NÃO é de um agente wsdr, segue pra lógica genérica (Patricia) abaixo.
                    let sdrwRoute: { org_id: string; agent_slug: string } | null = null;
                    try {
                        const { data: route } = await supabaseClient.rpc("wsdr_resolve_agent_by_line", { p_phone_line: phoneNumberId });
                        const r = Array.isArray(route) ? route[0] : route;
                        if (r?.org_id && r?.agent_slug) sdrwRoute = { org_id: r.org_id, agent_slug: r.agent_slug };
                    } catch (_rErr) { /* sem rota wsdr: cai na lógica genérica */ }

                    if (sdrwRoute) {
                        // whitelist + on/off do agente (vazio/nulo = ninguém — fail-safe)
                        let sdrwAllowed = false;
                        let sdrwAgentActive = true;
                        try {
                            const { data: ag } = await supabaseClient
                                .from("wsdr_agents")
                                .select("active, test_mode_phone_whitelist")
                                .eq("org_id", sdrwRoute.org_id)
                                .eq("slug", sdrwRoute.agent_slug)
                                .maybeSingle();
                            sdrwAgentActive = (ag as { active?: boolean } | null)?.active !== false;
                            sdrwAllowed = sdrwPhoneAllowed(normalizedContact, (ag as { test_mode_phone_whitelist?: string[] | null } | null)?.test_mode_phone_whitelist ?? null);
                        } catch (_wErr) { sdrwAllowed = false; }

                        if (sdrwAgentActive && sdrwAllowed) {
                            // Comando /reset no WhatsApp (paridade Patricia): o testador zera a
                            // própria conversa antes do cérebro. Só números whitelistados chegam aqui.
                            if ((messageText || "").trim().toLowerCase() === "/reset") {
                                let resetCid: string | null = null;
                                try {
                                    const { data: ensured } = await supabaseClient.rpc("wsdr_ensure_contact", {
                                        p_org_id: sdrwRoute.org_id,
                                        p_phone: normalizedContact,
                                        p_name: data.contact_name || data.contact?.name || data.pushname || singlePayload.contact_name || null,
                                    });
                                    resetCid = (typeof ensured === "string" ? ensured : null);
                                } catch (_eErr) { /* sem contato: ainda assim tenta resetar */ }
                                try {
                                    const { data: rr } = await supabaseClient.rpc("wsdr_reset_conversation_by_phone", {
                                        p_agent_slug: sdrwRoute.agent_slug,
                                        p_phone: normalizedContact,
                                        p_org_id: sdrwRoute.org_id,
                                    });
                                    console.log(`[webhook] SDR /reset ${normalizedContact}: ${JSON.stringify(rr)}`);
                                } catch (rErr) {
                                    console.error("[webhook] SDR /reset error:", rErr);
                                }
                                if (resetCid) {
                                    try {
                                        await fetch(`${supabaseUrl}/functions/v1/send-whatsapp-message`, {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
                                            body: JSON.stringify({
                                                contact_id: resetCid,
                                                corpo: "Conversa zerada 💛 manda um oi pra gente começar do zero.",
                                                phone_number_id: phoneNumberId,
                                                source: "sdr-weddings",
                                            }),
                                        });
                                    } catch (_sErr) { /* confirmação é best-effort */ }
                                }
                                continue; // /reset não vai pro cérebro
                            }
                            try {
                                // acha o contato (na org do agente); número novo whitelistado sem contato → cria
                                let sdrwContactId: string | null = null;
                                let sdrwContactNome: string | null = null;
                                const { data: cts } = await supabaseClient
                                    .from("contatos")
                                    .select("id, nome")
                                    .eq("org_id", sdrwRoute.org_id)
                                    .eq("telefone_normalizado", sdrwLocalPhone(normalizedContact))
                                    .limit(1);
                                const ct = (cts && cts[0]) || null;
                                sdrwContactId = ct?.id || null;
                                sdrwContactNome = ct?.nome || null;
                                if (!sdrwContactId) {
                                    try {
                                        const { data: ensured } = await supabaseClient.rpc("wsdr_ensure_contact", {
                                            p_org_id: sdrwRoute.org_id,
                                            p_phone: normalizedContact,
                                            p_name: data.contact_name || data.contact?.name || data.pushname || singlePayload.contact_name || null,
                                        });
                                        sdrwContactId = (typeof ensured === "string" ? ensured : null);
                                    } catch (_eErr) { /* segue sem contato: só não entrega */ }
                                }
                                let sdrwHistory: { role: string; text: string }[] = [];
                                if (sdrwContactId) {
                                    // Histórico recente E só da PRÓPRIA Sofia: inclui o que o lead
                                    // mandou (inbound) + respostas da Sofia (source=sdr-weddings).
                                    // Exclui mensagens de outros agentes (ex: Patricia=ai_agent_v2)
                                    // que contaminariam/confundiriam o contexto da Sofia.
                                    const sdrwSince = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
                                    const { data: msgs } = await supabaseClient
                                        .from("whatsapp_messages")
                                        .select("body, direction, created_at, metadata")
                                        .eq("contact_id", sdrwContactId)
                                        .gte("created_at", sdrwSince)
                                        .or("direction.eq.inbound,metadata->>source.eq.sdr-weddings")
                                        .order("created_at", { ascending: true })
                                        .limit(16);
                                    sdrwHistory = (msgs || [])
                                        .filter((m: { body: string | null }) => (m.body || "").trim() !== "")
                                        .map((m: { body: string | null; direction: string }) => ({
                                            role: m.direction === "outbound" ? "assistant" : "casal",
                                            text: m.body || "",
                                        }));
                                }
                                // Multimodal: Echo manda mídia (áudio/foto/PDF/sticker) com um
                                // PLACEHOLDER de texto ('[Áudio]', '[Documento]'…) ou a legenda da
                                // imagem — NUNCA vazio. Por isso o gatilho é o TIPO + media_url
                                // (igual à Patricia em ai-agent-router-v2), e não "texto vazio".
                                // O bug anterior (gate "texto vazio") nunca disparava → a Sofia
                                // recebia literalmente "[Áudio]" e não entendia a mídia.
                                let sdrwMessage = messageText;
                                const sdrwMsgType = data.type || data.message_type || "text";
                                const sdrwMediaUrl = data.media_url || data.media?.url || null;
                                const sdrwIsMedia = !!sdrwMediaUrl && ["audio", "image", "document", "sticker"].includes(sdrwMsgType);
                                if (sdrwIsMedia) {
                                    // Legenda real (imagem com texto) vs placeholder do Echo: o
                                    // placeholder é um único token entre colchetes ('[Áudio]');
                                    // uma legenda real não casa com esse padrão.
                                    const sdrwCaption = /^\[[^\]]+\]$/.test((messageText || "").trim()) ? "" : (messageText || "").trim();
                                    try {
                                        const { data: sdrwCfg } = await supabaseClient
                                            .from("wsdr_agent_config")
                                            .select("config")
                                            .eq("slug", sdrwRoute.agent_slug)
                                            .eq("org_id", sdrwRoute.org_id)
                                            .maybeSingle();
                                        const mm = sdrwCfg?.config?.capabilities?.multimodal || null;
                                        if (mm?.enabled) {
                                            const sdrwMediaText = await processMediaToText(sdrwMsgType, sdrwMediaUrl, OPENAI_API_KEY, mm);
                                            sdrwMessage = sdrwCaption ? `${sdrwCaption}\n${sdrwMediaText}` : sdrwMediaText;
                                        } else {
                                            sdrwMessage = `[o casal mandou um ${sdrwMsgType}, mas a Sofia não está processando mídia agora]`;
                                        }
                                    } catch (mErr) {
                                        console.error("[webhook] Sofia multimodal error:", mErr);
                                        sdrwMessage = sdrwCaption || `[${sdrwMsgType} recebido]`;
                                    }
                                }
                                // Persiste a mensagem do LEAD em whatsapp_messages (espelho do insert
                                // das respostas dela), pra o histórico conter os DOIS lados nos próximos
                                // turnos — hoje só as respostas dela ficavam salvas. Gravo DEPOIS de
                                // montar sdrwHistory (pra não duplicar a msg atual neste turno) e com o
                                // texto já resolvido (transcrição de áudio etc). Fire-and-forget pra não
                                // somar latência antes do cérebro (completa durante o await do n8n).
                                if (sdrwContactId && sdrwMessage && sdrwMessage.trim()) {
                                    supabaseClient.from("whatsapp_messages").insert({
                                        contact_id: sdrwContactId,
                                        body: sdrwMessage,
                                        direction: "inbound",
                                        is_from_me: false,
                                        type: "text",
                                        status: "received",
                                        sender_phone: normalizedContact,
                                        phone_number_label: singlePayload.phone_number || data.phone_number || null,
                                        metadata: { source: "sdr-weddings-inbound", original_type: sdrwMsgType, whatsapp_message_id: data.whatsapp_message_id || data.message_id || null },
                                    }).then(() => {}).catch((e: Error) => console.error("[webhook] Sofia inbound save error:", e));
                                }
                                const sdrwRes = await fetch("https://n8n-n8n.ymnmx7.easypanel.host/webhook/sdr-weddings", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                        contact_phone: normalizedContact,
                                        contact_id: sdrwContactId,
                                        nome: data.contact_name || data.contact?.name || data.pushname || singlePayload.contact_name || sdrwContactNome || "",
                                        message: sdrwMessage,
                                        history: sdrwHistory,
                                        org_id: sdrwRoute.org_id,
                                        agent_slug: sdrwRoute.agent_slug,
                                    }),
                                });
                                const sdrwJson = await sdrwRes.json().catch(() => ({}));
                                const sdrwReply = sdrwJson?.reply;
                                // Entrega humana: se a Sofia devolveu bolhas, manda uma a uma com
                                // um pequeno delay; senão, manda a resposta inteira (compat).
                                const sdrwBubbles = (Array.isArray(sdrwJson?.bubbles) && sdrwJson.bubbles.length)
                                    ? sdrwJson.bubbles
                                    : (sdrwReply ? [sdrwReply] : []);
                                if (sdrwBubbles.length && sdrwContactId) {
                                    for (let bi = 0; bi < sdrwBubbles.length; bi++) {
                                        if (bi > 0) await new Promise((r) => setTimeout(r, 1500));
                                        await fetch(`${supabaseUrl}/functions/v1/send-whatsapp-message`, {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
                                            body: JSON.stringify({
                                                contact_id: sdrwContactId,
                                                corpo: sdrwBubbles[bi],
                                                phone_number_id: phoneNumberId,
                                                source: "sdr-weddings",
                                            }),
                                        });
                                    }
                                    console.log(`[webhook] SDR Weddings (${sdrwRoute.agent_slug}) respondeu via Echo (${sdrwBubbles.length} bolha(s))`);
                                } else {
                                    console.warn(`[webhook] SDR Weddings sem reply/contato (reply=${!!sdrwReply}, contact=${sdrwContactId})`);
                                }
                            } catch (err) {
                                console.error("[webhook] SDR Weddings branch error:", err);
                            }
                        } else {
                            console.log(`[webhook] SDR wsdr: ignorando ${normalizedContact} (allowed=${sdrwAllowed}, active=${sdrwAgentActive})`);
                        }
                        continue; // a linha é de um agente wsdr; Patricia não roda aqui
                    }
                    const { data: lineRow } = await supabaseClient
                        .from("whatsapp_linha_config")
                        .select("id")
                        .eq("phone_number_id", phoneNumberId)
                        .eq("ativo", true)
                        .limit(1)
                        .maybeSingle();
                    if (!lineRow) {
                        console.log(`[webhook] AI skip: no active linha_config for phone_number_id=${phoneNumberId}`);
                        continue;
                    }
                    const { data: agentLink } = await supabaseClient
                        .from("ai_agent_phone_line_config")
                        .select("routing_filter, ai_agents!inner(id, ativa, test_mode_phone_whitelist, engine)")
                        .eq("phone_line_id", lineRow.id)
                        .eq("ativa", true)
                        .eq("ai_agents.ativa", true)
                        .limit(1)
                        .maybeSingle();
                    if (!agentLink) {
                        console.log(`[webhook] AI skip: no active agent linked to line ${lineRow.id}`);
                        continue;
                    }
                    // deno-lint-ignore no-explicit-any
                    const routingAllowed: string[] | null = (agentLink as any).routing_filter?.allowed_phones ?? null;
                    // deno-lint-ignore no-explicit-any
                    const testWhitelist: string[] | null = ((agentLink as any).ai_agents)?.test_mode_phone_whitelist ?? null;
                    const passRouting = !routingAllowed || routingAllowed.length === 0 || routingAllowed.includes(normalizedContact);
                    const passTestMode = !testWhitelist || testWhitelist.length === 0 || testWhitelist.includes(normalizedContact);
                    if (!passRouting || !passTestMode) {
                        console.log(`[webhook] AI skip: ${normalizedContact} not in whitelist (routing=${passRouting}, test=${passTestMode})`);
                        continue;
                    }

                    // Insert into debounce buffer before calling router
                    const msgType = data.type || data.message_type || "text";
                    const mediaUrl = data.media_url || data.media?.url || null;
                    await supabaseClient.from("ai_message_buffer").insert({
                        contact_phone: normalizedContact,
                        phone_number_id: phoneNumberId,
                        contact_name: data.contact_name || data.contact?.name || data.pushname || singlePayload.contact_name || null,
                        message_text: messageText,
                        message_type: msgType,
                        media_url: mediaUrl,
                        metadata: { phone_number_label: singlePayload.phone_number || data.phone_number },
                    }).then(() => console.log("[webhook] Buffered message for debounce"))
                      .catch((err: Error) => console.error("[webhook] Buffer insert error:", err));

                    try {
                        // deno-lint-ignore no-explicit-any
                        const agentEngine = ((agentLink as any).ai_agents)?.engine || "multi_agent_pipeline";
                        const routerPath = agentEngine === "single_agent_v2"
                            ? "/functions/v1/ai-agent-router-v2"
                            : "/functions/v1/ai-agent-router";
                        const routerRes = await fetch(`${supabaseUrl}${routerPath}`, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${serviceKey}`,
                            },
                            body: JSON.stringify({
                                contact_phone: contactPhone,
                                message_text: messageText,
                                message_type: data.type || data.message_type || "text",
                                phone_number_label: singlePayload.phone_number || data.phone_number,
                                phone_number_id: data.phone_number_id || singlePayload.phone_number_id,
                                contact_name: data.contact_name || data.contact?.name || data.pushname || singlePayload.contact_name,
                                whatsapp_message_id: data.whatsapp_message_id || data.message_id,
                                echo_conversation_id: data.conversation_id || data.conversation?.id,
                                media_url: data.media_url || data.media?.url || null,
                            }),
                        });
                        const routerResult = await routerRes.json();
                        console.log("AI agent router:", routerResult.handled ? `handled by ${routerResult.agent}` : "no agent");
                    } catch (err) {
                        console.error("AI agent router error:", err);
                    }
                }
            }
        }

        // 7. Return response
        if (errors.length > 0 && insertedIds.length === 0) {
            return new Response(
                JSON.stringify({ error: "Failed to process all events", details: errors }),
                {
                    status: 500,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                }
            );
        }

        return new Response(
            JSON.stringify({
                message: "Accepted",
                events_received: payloads.length,
                events_inserted: insertedIds.length,
                events_duplicated: payloads.length - insertedIds.length - errors.length,
                event_ids: insertedIds,
            }),
            {
                status: 202,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );

    } catch (error) {
        console.error("Error:", error);
        return new Response(
            JSON.stringify({ error: "Internal Server Error", details: String(error) }),
            {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );
    }
});
