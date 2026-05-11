import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-integration-id",
};

/**
 * Extract metadata from ActiveCampaign webhook payload.
 * Maps AC payload structure to our normalized entity_type, event_type, and external_id.
 */
function parseACPayload(payload: Record<string, unknown>): {
    entity_type: string | null;
    event_type: string | null;
    external_id: string | null;
} {
    const type = payload.type as string | undefined;

    // Classify entity type from payload structure and type
    let entity_type: string | null = null;

    if (payload['deal[id]'] || payload.deal_id) {
        // Deal-related events
        if (type?.startsWith('deal_task') || type?.startsWith('deal_note')) {
            entity_type = 'dealActivity';
        } else {
            entity_type = 'deal';
        }
    } else if (payload['contact[id]'] || payload.contact_id) {
        // Contact-related events
        entity_type = 'contact';
    } else if (type?.includes('automation')) {
        entity_type = 'contactAutomation';
    } else if (type === 'sent' || type?.includes('campaign')) {
        entity_type = 'campaign';
    }

    // Event type directly from AC payload's type field
    const event_type = type || null;

    // External ID for the primary entity
    const rawExternalId =
        payload['deal[id]'] ||
        payload.deal_id ||
        payload['contact[id]'] ||
        payload.contact_id ||
        payload.id ||
        null;

    const external_id = rawExternalId ? String(rawExternalId) : null;

    return { entity_type, event_type, external_id };
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        const url = new URL(req.url);
        const integrationId = url.searchParams.get("id");

        if (!integrationId) {
            console.warn("Webhook received without integration_id");
            return new Response(JSON.stringify({ message: "Accepted" }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // 1. Fetch Integration Config
        const { data: integration, error: fetchError } = await supabaseClient
            .from("integrations")
            .select("*")
            .eq("id", integrationId)
            .single();

        if (fetchError || !integration) {
            console.warn(`Integration not found: ${integrationId}`);
            return new Response(JSON.stringify({ message: "Accepted" }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Check global inbound pause setting - use maybeSingle to avoid throwing if setting doesn't exist
        const { data: inboundSetting } = await supabaseClient
            .from("integration_settings")
            .select("value")
            .eq("key", "INBOUND_INGEST_ENABLED")
            .maybeSingle();

        // Only pause if the setting is EXPLICITLY set to 'false'
        // If the setting doesn't exist, is null, or has any other value, allow the webhook
        const settingValue = inboundSetting?.value;
        console.log(`INBOUND_INGEST_ENABLED = ${settingValue || 'not set (allowing)'}`);

        if (settingValue === 'false') {
            console.log("Webhook paused globally via INBOUND_INGEST_ENABLED=false");
            return new Response(JSON.stringify({ message: "Webhook paused" }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        if (!integration.is_active) {
            console.log(`Integration ${integrationId} is inactive, ignoring webhook`);
            return new Response(JSON.stringify({ message: "Accepted" }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Parse payload - AC sends as application/x-www-form-urlencoded
        const contentType = req.headers.get("content-type") || "";
        let payload: Record<string, unknown>;

        if (contentType.includes("application/json")) {
            payload = await req.json();
        } else {
            // Form-urlencoded (default for ActiveCampaign)
            const formData = await req.text();
            payload = Object.fromEntries(new URLSearchParams(formData));
        }

        // ---- DEBUG LOGGING (Fire and Forget) ----
        console.log("Incoming Webhook Payload:", JSON.stringify(payload));
        supabaseClient.from("debug_requests").insert({
            function_name: "webhook-ingest",
            method: req.method,
            url: req.url,
            headers: Object.fromEntries(req.headers.entries()),
            payload: payload
        }).then(({ error }) => {
            if (error) console.error("Failed to log to debug_requests:", error);
        });
        // -----------------------------------------

        const headers = Object.fromEntries(req.headers.entries());

        // 2. Validate HMAC (if configured)
        // TODO: Implement HMAC validation based on integration.config.secret_key and provider

        // 3. Idempotency Check
        const idempotencyKey = headers["idempotency-key"] || headers["x-idempotency-key"] || payload.id || payload.event_id;

        if (idempotencyKey) {
            const { data: existingEvent } = await supabaseClient
                .from("integration_events")
                .select("id")
                .eq("integration_id", integrationId)
                .eq("idempotency_key", String(idempotencyKey))
                .single();

            if (existingEvent) {
                console.log(`Duplicate event ignored: ${idempotencyKey}`);
                return new Response(JSON.stringify({ message: "Ignored duplicate" }), {
                    status: 200,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }
        }

        // 4. Extract metadata from AC payload
        const { entity_type, event_type, external_id } = parseACPayload(payload);

        // 5. Enqueue Event
        const { data: insertedEvent, error: insertError } = await supabaseClient
            .from("integration_events")
            .insert({
                integration_id: integrationId,
                payload: payload,
                status: "pending",
                entity_type,
                event_type,
                external_id,
                idempotency_key: idempotencyKey ? String(idempotencyKey) : null,
                logs: [{ step: "ingest", timestamp: new Date().toISOString(), message: "Webhook received" }]
            })
            .select('id')
            .single();

        if (insertError) {
            console.error("Failed to insert event:", insertError);
            return new Response(JSON.stringify({ message: "Accepted" }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // 6. AUTO-PROCESS: Call integration-process with retry
        // Non-blocking for the webhook response, but with retry to ensure reliability
        if (insertedEvent?.id) {
            const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
            const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
            const cronSecret = Deno.env.get("CRON_SECRET") ?? "";

            const autoProcess = async (eventId: string) => {
                const MAX_ATTEMPTS = 3;
                const BACKOFFS = [2000, 5000]; // 2s, 5s between retries
                for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                    try {
                        const controller = new AbortController();
                        const timeout = setTimeout(() => controller.abort(), 25000); // 25s (edge fn limit is 30s)

                        const res = await fetch(`${supabaseUrl}/functions/v1/integration-process`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${serviceKey}`,
                                'x-internal-secret': cronSecret
                            },
                            body: JSON.stringify({
                                integration_id: integrationId,
                                event_ids: [eventId]
                            }),
                            signal: controller.signal
                        });
                        clearTimeout(timeout);

                        if (res.ok) {
                            console.log(`Auto-process OK for event ${eventId} (attempt ${attempt})`);
                            return;
                        }
                        console.warn(`Auto-process attempt ${attempt}/${MAX_ATTEMPTS} for event ${eventId}: ${res.status}`);
                    } catch (err) {
                        console.warn(`Auto-process attempt ${attempt}/${MAX_ATTEMPTS} for event ${eventId} failed:`, err);
                    }
                    if (attempt < MAX_ATTEMPTS) await new Promise(r => setTimeout(r, BACKOFFS[attempt - 1]));
                }
                console.error(`Auto-process FAILED for event ${eventId} after ${MAX_ATTEMPTS} attempts - will be picked up by cron`);
            };

            // Non-blocking: don't await, but retry logic runs in background
            autoProcess(insertedEvent.id);
        }

        return new Response(JSON.stringify({ message: "Accepted" }), {
            status: 202,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (error) {
        console.error("Webhook ingest error:", error);
        return new Response(JSON.stringify({ message: "Accepted" }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
