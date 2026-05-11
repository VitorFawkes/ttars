import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Outbound Dispatcher Edge Function
 * 
 * Triggered by database webhooks when a relevant CRM event occurs (e.g., deal.moved).
 * Fetches matching integrations, builds the payload (custom or full_object), and dispatches.
 * 
 * Usage: This function is called via a Database Webhook Trigger on tables like `cards`.
 */
serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // Payload from DB Webhook: { type: 'UPDATE', table: 'cards', record: {...}, old_record: {...} }
        const webhookPayload = await req.json();
        const { type, table, record, old_record } = webhookPayload;

        console.log(`Outbound Dispatcher: Received ${type} on ${table}`);

        // Determine the event type
        let eventType = "";
        if (table === "cards") {
            if (type === "INSERT") eventType = "deal.created";
            else if (type === "UPDATE" && record.stage_id !== old_record?.stage_id) eventType = "deal.moved";
            else if (type === "UPDATE" && record.status === "won" && old_record?.status !== "won") eventType = "deal.won";
            else eventType = "deal.updated";
        } else if (table === "contatos") {
            if (type === "INSERT") eventType = "contact.created";
            else eventType = "contact.updated";
        }

        if (!eventType) {
            return new Response(JSON.stringify({ message: "No matching event type" }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Fetch active outbound integrations matching this event
        const { data: integrations, error: fetchError } = await supabaseClient
            .from("integrations")
            .select("*")
            .eq("type", "output")
            .eq("is_active", true)
            .contains("config", { trigger_event: eventType });

        if (fetchError) {
            console.error("Error fetching integrations:", fetchError);
            throw fetchError;
        }

        if (!integrations || integrations.length === 0) {
            console.log(`No active integrations for event: ${eventType}`);
            return new Response(JSON.stringify({ message: "No matching integrations" }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Fetch related data for full_object mode
        let contactData = null;
        let userData = null;

        if (table === "cards" && record.contato_id) {
            const { data } = await supabaseClient
                .from("contatos")
                .select("*")
                .eq("id", record.contato_id)
                .single();
            contactData = data;
        }

        if (record.user_id) {
            const { data } = await supabaseClient
                .from("users")
                .select("id, nome, email")
                .eq("id", record.user_id)
                .single();
            userData = data;
        }

        let lossReasonData = null;
        if (table === "cards" && record.motivo_perda_id) {
            const { data } = await supabaseClient
                .from("motivos_perda")
                .select("nome")
                .eq("id", record.motivo_perda_id)
                .single();
            lossReasonData = data;
        }

        // Process each integration
        for (const integration of integrations) {
            const config = integration.config;
            let body: any;

            if (config.payload_mode === "full_object") {
                // Build full object payload
                body = {
                    event: eventType,
                    timestamp: new Date().toISOString(),
                    deal: table === "cards" ? {
                        id: record.id,
                        titulo: record.titulo,
                        valor_estimado: record.valor_estimado,
                        stage_id: record.stage_id,
                        pipeline_id: record.pipeline_id,
                        status: record.status,
                        created_at: record.created_at,
                        updated_at: record.updated_at,
                        metadata: record.metadata,
                        motivo_perda_id: record.motivo_perda_id,
                        motivo_perda_nome: lossReasonData?.nome || null,
                        motivo_perda_comentario: record.motivo_perda_comentario,
                    } : null,
                    contact: contactData ? {
                        id: contactData.id,
                        nome: contactData.nome,
                        email: contactData.email,
                        telefone: contactData.telefone,
                        empresa: contactData.empresa,
                        cargo: contactData.cargo,
                    } : null,
                    user: userData ? {
                        id: userData.id,
                        nome: userData.nome,
                        email: userData.email,
                    } : null,
                    previous_state: old_record ? {
                        stage_id: old_record.stage_id,
                        status: old_record.status,
                    } : null,
                };
            } else {
                // Custom template mode - replace {{variables}}
                const template = config.body_template || "{}";
                body = template
                    .replace(/\{\{event\}\}/g, eventType)
                    .replace(/\{\{deal\.id\}\}/g, record.id || "")
                    .replace(/\{\{deal\.titulo\}\}/g, record.titulo || "")
                    .replace(/\{\{deal\.valor_estimado\}\}/g, record.valor_estimado || "")
                    .replace(/\{\{deal\.motivo_perda_nome\}\}/g, lossReasonData?.nome || "")
                    .replace(/\{\{deal\.motivo_perda_comentario\}\}/g, record.motivo_perda_comentario || "")
                    .replace(/\{\{contact\.nome\}\}/g, contactData?.nome || "")
                    .replace(/\{\{contact\.email\}\}/g, contactData?.email || "")
                    .replace(/\{\{contact\.telefone\}\}/g, contactData?.telefone || "")
                    .replace(/\{\{user\.nome\}\}/g, userData?.nome || "")
                    .replace(/\{\{user\.email\}\}/g, userData?.email || "");

                try {
                    body = JSON.parse(body);
                } catch {
                    // If not valid JSON, send as-is
                    console.warn("Body template is not valid JSON, sending as string");
                }
            }

            // Build headers
            const headers: Record<string, string> = {
                "Content-Type": "application/json",
            };
            for (const h of (config.headers || [])) {
                if (h.key) headers[h.key] = h.value;
            }

            // Create event record before dispatch
            const { data: eventRecord, error: eventError } = await supabaseClient
                .from("integration_events")
                .insert({
                    integration_id: integration.id,
                    payload: body,
                    status: "pending",
                    logs: [{ step: "dispatch", timestamp: new Date().toISOString(), message: "Dispatching..." }]
                })
                .select()
                .single();

            if (eventError) {
                console.error("Failed to create event record:", eventError);
                continue;
            }

            // Dispatch the webhook
            try {
                const response = await fetch(config.url, {
                    method: config.method || "POST",
                    headers,
                    body: JSON.stringify(body),
                });

                const responseText = await response.text();
                let responseJson = null;
                try {
                    responseJson = JSON.parse(responseText);
                } catch {
                    responseJson = { raw: responseText };
                }

                // Update event with result
                await supabaseClient
                    .from("integration_events")
                    .update({
                        status: response.ok ? "success" : "failed",
                        response: responseJson,
                        logs: [
                            ...(eventRecord.logs || []),
                            {
                                step: "response",
                                timestamp: new Date().toISOString(),
                                status_code: response.status,
                                message: response.ok ? "Success" : "Failed"
                            }
                        ]
                    })
                    .eq("id", eventRecord.id);

                console.log(`Dispatched to ${config.url}: ${response.status}`);

            } catch (dispatchError: any) {
                console.error("Dispatch failed:", dispatchError);

                await supabaseClient
                    .from("integration_events")
                    .update({
                        status: "failed",
                        response: { error: dispatchError.message },
                        logs: [
                            ...(eventRecord.logs || []),
                            {
                                step: "error",
                                timestamp: new Date().toISOString(),
                                message: dispatchError.message
                            }
                        ]
                    })
                    .eq("id", eventRecord.id);
            }
        }

        return new Response(JSON.stringify({ message: "Processed", count: integrations.length }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (error: any) {
        console.error("Outbound Dispatcher Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
