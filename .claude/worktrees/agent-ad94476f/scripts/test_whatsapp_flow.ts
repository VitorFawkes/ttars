import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "http://localhost:54321";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "your-anon-key";
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/webhook-whatsapp`;

// Mock Payloads
const chatProPayload = {
    "event": "message",
    "instance_id": "legacy-chatpro", // Testing with the legacy instance we created
    "message_data": {
        "id": `test-msg-${Date.now()}`,
        "number": "5511999998888",
        "message": "Hello from ChatPro Test Script!",
        "from_me": false,
        "type": "text"
    }
};

const echoPayload = {
    "event": "received_message",
    "instance_id": "legacy-chatpro", // Using same instance for simplicity, or create a new one
    "message_data": {
        "id": `test-echo-${Date.now()}`,
        "number": "5511999997777",
        "text": "Hello from ECHO Test Script!",
        "type": "text"
    }
};

async function testWebhook(provider: string, payload: any) {
    console.log(`\n--- Testing ${provider} Webhook ---`);
    console.log(`Target: ${FUNCTION_URL}?provider=${provider}`);

    try {
        const response = await fetch(`${FUNCTION_URL}?provider=${provider}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify(payload)
        });

        const text = await response.text();
        console.log(`Status: ${response.status}`);
        console.log(`Response: ${text}`);

        if (response.ok) {
            console.log("✅ Webhook accepted");
        } else {
            console.error("❌ Webhook failed");
        }
    } catch (error) {
        console.error("❌ Request Error:", error.message);
    }
}

async function main() {
    console.log("Starting WhatsApp Integration Verification...");

    // Test ChatPro
    await testWebhook('chatpro', chatProPayload);

    // Test ECHO
    // Note: We might need to create an ECHO instance in DB first for this to fully work 
    // if we want it to be linked to an instance, otherwise it might fall back or error.
    // But for now let's test the routing.
    await testWebhook('echo', echoPayload);
}

main();
