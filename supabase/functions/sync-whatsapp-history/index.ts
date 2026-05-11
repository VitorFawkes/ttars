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
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        const { contact_id } = await req.json();

        if (!contact_id) {
            throw new Error("Missing contact_id");
        }

        // 1. Get Contact Phone
        const { data: contact, error: contactError } = await supabase
            .from("contatos")
            .select("id, telefone, chatpro_session_id")
            .eq("id", contact_id)
            .single();

        if (contactError || !contact) {
            throw new Error("Contact not found");
        }

        if (!contact.telefone) {
            throw new Error("Contact has no phone number");
        }

        // 2. Normalize Phone for API
        // ChatPro expects numbers without + and usually with country code.
        // Our normalize_phone function strips non-digits.
        const { data: normalizedPhone } = await supabase.rpc('normalize_phone', { phone_number: contact.telefone });

        // 3. Fetch from ChatPro API
        const chatProUrl = Deno.env.get("CHATPRO_API_URL");
        const chatProToken = Deno.env.get("CHATPRO_API_TOKEN");

        if (!chatProUrl || !chatProToken) {
            throw new Error("ChatPro configuration missing");
        }

        // Endpoint: /api/v1/messages/{number} (Hypothetical, need to verify actual ChatPro endpoint)
        // Usually it's something like /api/v1/get_messages or similar.
        // Assuming a standard endpoint for now, can be adjusted.
        // Common pattern: GET /api/v1/messages?number=5511999999999

        // Let's assume we want to fetch the last 50 messages.
        const apiUrl = `${chatProUrl}/api/v1/messages/${normalizedPhone}`;

        console.log(`Fetching history from: ${apiUrl}`);

        const response = await fetch(apiUrl, {
            headers: {
                "Authorization": chatProToken, // Or "Bearer " + token depending on auth scheme
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) {
            const text = await response.text();
            console.error("ChatPro API Error:", text);
            throw new Error(`ChatPro API failed: ${response.status}`);
        }

        const data = await response.json();
        // Assuming data is an array of messages or { messages: [] }
        const messages = Array.isArray(data) ? data : (data.messages || []);

        console.log(`Fetched ${messages.length} messages`);

        // 4. Upsert Messages
        const messagesToUpsert = messages.map((msg: any) => ({
            external_id: msg.id,
            contact_id: contact.id,
            direction: msg.from_me ? 'outbound' : 'inbound',
            type: msg.type || 'text',
            body: msg.body || msg.message, // Adjust based on actual API response
            media_url: msg.media_url || msg.url,
            status: msg.status || 'delivered',
            metadata: msg,
            created_at: msg.timestamp ? new Date(msg.timestamp * 1000).toISOString() : new Date().toISOString(), // ChatPro often uses unix timestamp
            processed_at: new Date().toISOString()
        }));

        if (messagesToUpsert.length > 0) {
            const { error: upsertError } = await supabase
                .from("whatsapp_messages")
                .upsert(messagesToUpsert, { onConflict: 'external_id' });

            if (upsertError) {
                console.error("Upsert error:", upsertError);
                throw upsertError;
            }
        }

        // 5. Update Contact Last Sync
        await supabase
            .from("contatos")
            .update({ last_whatsapp_sync: new Date().toISOString() })
            .eq("id", contact.id);

        return new Response(JSON.stringify({ success: true, count: messagesToUpsert.length }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
        });

    } catch (error) {
        console.error("Error syncing history:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
        });
    }
});
