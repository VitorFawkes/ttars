import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-platform-id",
};

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

                    const messageText = data.text || data.body || singlePayload.text || "";
                    if (!messageText) continue;

                    const contactPhone = data.from || data.remote_phone || data.contact_phone || data.contact?.phone || singlePayload.from || singlePayload.contact_phone || "";
                    if (!contactPhone) continue;

                    try {
                        const routerRes = await fetch(`${supabaseUrl}/functions/v1/ai-agent-router`, {
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
