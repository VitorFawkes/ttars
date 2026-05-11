import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        const payload = await req.json();
        // Supabase Database Webhook payload structure: { type: 'INSERT', table: 'integration_events', record: { ... }, old_record: null, schema: 'public' }
        const eventRecord = payload.record;

        if (!eventRecord || !eventRecord.integration_id) {
            // Not a valid DB webhook payload or missing ID
            return new Response(JSON.stringify({ message: "Invalid payload" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // 1. Fetch Integration Config
        const { data: integration, error: fetchError } = await supabaseClient
            .from("integrations")
            .select("*")
            .eq("id", eventRecord.integration_id)
            .single();

        if (fetchError || !integration) {
            console.error("Integration not found:", eventRecord.integration_id);
            return new Response(JSON.stringify({ error: "Integration not found" }), { status: 404 });
        }

        // 2. Process Logic (Transform & Map)
        // This is a simplified version. In a real "Elite" system, we would have a robust transformation engine.
        // For now, we assume config.mapping is a simple key-value map: { "crm_field": "payload_field_path" }

        const inputData = eventRecord.payload;
        const mapping = integration.config.mapping || {};
        const targetTable = integration.config.target_table || "cards"; // Default to cards

        const mappedData: any = {};

        // Helper to get nested value
        const getValue = (obj: any, path: string) => {
            return path.split('.').reduce((o, k) => (o || {})[k], obj);
        };

        for (const [crmField, payloadPath] of Object.entries(mapping)) {
            mappedData[crmField] = getValue(inputData, payloadPath as string);
        }

        // Apply Transformer Rules (Simplified)
        // integration.transformer_rules could be: [{ field: "email", rule: "lowercase" }]
        if (integration.transformer_rules && Array.isArray(integration.transformer_rules)) {
            for (const rule of integration.transformer_rules) {
                if (rule.rule === "lowercase" && mappedData[rule.field]) {
                    mappedData[rule.field] = String(mappedData[rule.field]).toLowerCase();
                }
                // Add more rules here
            }
        }

        // 3. Execute Action
        const { data: result, error: actionError } = await supabaseClient
            .from(targetTable)
            .insert(mappedData)
            .select()
            .single();

        if (actionError) {
            throw new Error(`Failed to insert into ${targetTable}: ${actionError.message}`);
        }

        // 4. Update Event Status
        await supabaseClient
            .from("integration_events")
            .update({
                status: "completed",
                response: result,
                logs: [...(eventRecord.logs || []), { step: "process", timestamp: new Date().toISOString(), message: "Success" }]
            })
            .eq("id", eventRecord.id);

        return new Response(JSON.stringify({ message: "Processed successfully" }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (error: any) {
        console.error("Processing Error:", error);

        // Update event with failure
        // We need to re-instantiate client or use the existing one if scope allows, but here we are in catch block
        // Ideally we should have the record ID.

        // Note: In a real system, we would calculate next_retry_at here.

        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
