import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-platform-id",
};

/**
 * WhatsApp Webhook Ingest (Unified)
 * 
 * Replaces the legacy function to support both ChatPro and Echo.
 * Inserts into 'whatsapp_raw_events' for robust processing.
 * 
 * Auto-detects provider if ?provider= param is missing.
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
        let provider = url.searchParams.get("provider");

        // 1. Parse payload early to help with detection
        const payload = await req.json();

        // ---- DEBUG LOGGING (Fire and Forget) ----
        console.log("Incoming Webhook Payload:", JSON.stringify(payload));
        supabaseClient.from("debug_requests").insert({
            function_name: "webhook-whatsapp",
            method: req.method,
            url: req.url,
            headers: Object.fromEntries(req.headers.entries()),
            payload: payload
        }).then(({ error }) => {
            if (error) console.error("Failed to log to debug_requests:", error);
        });
        // -----------------------------------------

        // Handle array payloads (some platforms send batches)
        const payloads = Array.isArray(payload) ? payload : [payload];

        // 2. Auto-detect provider if missing
        if (!provider && payloads.length > 0) {
            const sample = payloads[0];

            // Check for Echo signatures
            // Echo usually has 'status' event with 'message' object or 'type'='message_status'
            // OR has 'data' property in some contexts (though usually flat in webhooks).
            // Key Echo fields: 'whatsapp_message_id', 'conversation_id', 'message.conversation.id'
            const isEcho =
                sample.whatsapp_message_id ||
                sample.conversation_id ||
                (sample.data && (sample.data.whatsapp_message_id || sample.data.conversation_id)) ||
                (sample.message && sample.message.conversation);

            // Check for ChatPro signatures
            // ChatPro typically wraps in { "body": { "message_data": ... } } or just { "message_data": ... }
            const isChatPro =
                sample.message_data ||
                (sample.body && sample.body.message_data) ||
                sample.event === 'message_status'; // ChatPro statuses often look like this too, tricky.

            if (isEcho) {
                console.log("Auto-detected provider: ECHO");
                provider = "echo";
            } else {
                // Default to ChatPro for backward compatibility with the legacy function
                console.log("Auto-detected provider: CHATPRO (Default)");
                provider = "chatpro";
            }
        }

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

        // 3. Fetch Platform Config
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

        const insertedIds: string[] = [];
        const errors: string[] = [];

        for (const singlePayload of payloads) {
            // 4. Extract event type and idempotency key based on provider
            let eventType: string | null = null;
            let idempotencyKey: string | null = null;
            let origem: string | null = null;

            if (provider === "chatpro") {
                // Handle ChatPro's nested structure if present
                const effectiveData = singlePayload.body || singlePayload;
                // Sometimes it's directly at root, sometimes in body.
                // Re-normalizing for extraction:
                const messageData = effectiveData.message_data || effectiveData;

                eventType = effectiveData.event || effectiveData.message_type || (messageData ? 'message' : 'unknown');
                idempotencyKey = messageData?.id || effectiveData.message_id || null;
                origem = effectiveData.origem || null;
            } else if (provider === "echo") {
                // Echo logic
                // Echo often sends flat JSON.
                const data = singlePayload.data || singlePayload; // Handle envelope if present
                eventType = data.event || data.type || (data.message ? 'message' : 'unknown');

                // Idempotency: Echo sends 'id' for the message itself, or 'whatsapp_message_id' in a status update.
                // FIX: Include eventType in idempotencyKey because multiple events (creation, delivery, read) 
                // share the same message ID but represent different system states.
                const rawId = data.id || data.whatsapp_message_id || data.message_id;
                idempotencyKey = rawId ? `${eventType}:${rawId}` : null;
                origem = null;
            }

            // 5. Idempotency Check
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

            // 6. Insert raw event
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

        // 7. Update platform last_event_at
        await supabaseClient
            .from("whatsapp_platforms")
            .update({ last_event_at: new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T') + '-03:00' })
            .eq("id", platform.id);

        // 7.5 Forward to n8n Julia agent (awaited)
        // Only for Echo provider with new (non-duplicate) events from allowed lines.
        // Reads JULIA_PHONE_LABELS from integration_settings (configurable via CRM admin).
        if (provider === "echo" && insertedIds.length > 0) {
            const n8nUrl = Deno.env.get("N8N_JULIA_WEBHOOK_URL");
            console.log("n8n forward check:", { n8nUrl: n8nUrl ? "SET" : "MISSING", insertedIds: insertedIds.length });
            if (n8nUrl) {
                const { data: labelSetting } = await supabaseClient
                    .from("integration_settings")
                    .select("value")
                    .eq("key", "JULIA_PHONE_LABELS")
                    .single();
                const allowedLabels = (labelSetting?.value || "").split(",").map((s: string) => s.trim()).filter(Boolean);
                console.log("n8n forward labels:", { allowedLabels, payloadCount: payloads.length });
                if (allowedLabels.length > 0) {
                    for (const singlePayload of payloads) {
                        const phoneLabel = singlePayload?.phone_number || singlePayload?.data?.phone_number;
                        if (phoneLabel && allowedLabels.includes(phoneLabel)) {
                            try {
                                const fwdRes = await fetch(n8nUrl, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify(singlePayload),
                                });
                                console.log("n8n forward response:", fwdRes.status, await fwdRes.text().catch(() => ""));
                            } catch (err) {
                                console.error("n8n forward error:", err);
                            }
                        } else {
                            console.log("n8n forward skip: phoneLabel", phoneLabel, "not in", allowedLabels);
                        }
                    }
                }
            }
        }

        // 8. Return response
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
                provider_detected: provider,
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
