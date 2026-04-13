import { createClient } from "jsr:@supabase/supabase-js@2";
/**
 * ActiveCampaign inbound webhook receiver.
 * Public endpoint (verify_jwt=false) — chamado diretamente pelo AC via webhook URL.
 *
 * Integration ID é fixo para a integração AC. Dispara integration-process
 * em background (fire-and-forget com retry).
 *
 * Reconstruído em 2026-04-13 após perda do source original (deploy antigo via UI).
 * Lógica equivalente a webhook-ingest?id=<AC_INTEGRATION_ID>.
 */ const AC_INTEGRATION_ID = "a2141b92-561f-4514-92b4-9412a068d236";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};
function parseACPayload(payload) {
  const type = payload.type;
  let entity_type = null;
  if (payload["deal[id]"] || payload.deal_id) {
    if (type?.startsWith("deal_task") || type?.startsWith("deal_note")) {
      entity_type = "dealActivity";
    } else {
      entity_type = "deal";
    }
  } else if (payload["contact[id]"] || payload.contact_id) {
    entity_type = "contact";
  } else if (type?.includes("automation")) {
    entity_type = "contactAutomation";
  } else if (type === "sent" || type?.includes("campaign")) {
    entity_type = "campaign";
  }
  const rawExternalId = payload["deal[id]"] || payload.deal_id || payload["contact[id]"] || payload.contact_id || payload.id || null;
  return {
    entity_type,
    event_type: type || null,
    external_id: rawExternalId ? String(rawExternalId) : null
  };
}
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    // Verificar pausa global (INBOUND_INGEST_ENABLED=false)
    const { data: inboundSetting } = await supabase.from("integration_settings").select("value").eq("key", "INBOUND_INGEST_ENABLED").maybeSingle();
    if (inboundSetting?.value === "false") {
      console.log("AC webhook paused via INBOUND_INGEST_ENABLED=false");
      return new Response(JSON.stringify({
        message: "Webhook paused"
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    // Parse payload (AC envia como application/x-www-form-urlencoded por padrão)
    const contentType = req.headers.get("content-type") || "";
    let payload;
    if (contentType.includes("application/json")) {
      payload = await req.json();
    } else {
      const formData = await req.text();
      payload = Object.fromEntries(new URLSearchParams(formData));
    }
    console.log("AC webhook payload type:", payload.type, "deal:", payload["deal[id]"] || "-");
    // Idempotency
    const headers = Object.fromEntries(req.headers.entries());
    const idempotencyKey = headers["idempotency-key"] || headers["x-idempotency-key"] || payload.id || payload.event_id;
    if (idempotencyKey) {
      const { data: existingEvent } = await supabase.from("integration_events").select("id").eq("integration_id", AC_INTEGRATION_ID).eq("idempotency_key", String(idempotencyKey)).maybeSingle();
      if (existingEvent) {
        return new Response(JSON.stringify({
          message: "Ignored duplicate"
        }), {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      }
    }
    // Enqueue event
    const { entity_type, event_type, external_id } = parseACPayload(payload);
    const { data: insertedEvent, error: insertError } = await supabase.from("integration_events").insert({
      integration_id: AC_INTEGRATION_ID,
      payload: payload,
      source: "active_campaign",
      status: "pending",
      entity_type,
      event_type,
      external_id,
      idempotency_key: idempotencyKey ? String(idempotencyKey) : null,
      logs: [
        {
          step: "ingest",
          timestamp: new Date().toISOString(),
          message: "AC webhook received"
        }
      ]
    }).select("id").single();
    if (insertError) {
      console.error("AC webhook insert error:", insertError);
      // Sempre 200 para AC não desabilitar o webhook por falha transitória
      return new Response(JSON.stringify({
        message: "Accepted"
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    // Auto-process fire-and-forget com retry
    if (insertedEvent?.id) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
      const autoProcess = async (eventId)=>{
        const MAX = 3;
        const BACKOFFS = [
          2000,
          5000
        ];
        for(let i = 1; i <= MAX; i++){
          try {
            const ctrl = new AbortController();
            const t = setTimeout(()=>ctrl.abort(), 25000);
            const res = await fetch(`${supabaseUrl}/functions/v1/integration-process`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceKey}`,
                "x-internal-secret": cronSecret
              },
              body: JSON.stringify({
                integration_id: AC_INTEGRATION_ID,
                event_ids: [
                  eventId
                ]
              }),
              signal: ctrl.signal
            });
            clearTimeout(t);
            if (res.ok) return;
            console.warn(`AC auto-process attempt ${i}/${MAX}: ${res.status}`);
          } catch (err) {
            console.warn(`AC auto-process attempt ${i}/${MAX} error:`, err);
          }
          if (i < MAX) await new Promise((r)=>setTimeout(r, BACKOFFS[i - 1]));
        }
        console.error(`AC auto-process FAILED for event ${eventId}`);
      };
      // @ts-expect-error EdgeRuntime é global do Deno deploy
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
        // @ts-expect-error EdgeRuntime é global do Deno deploy
        EdgeRuntime.waitUntil(autoProcess(insertedEvent.id));
      } else {
        autoProcess(insertedEvent.id);
      }
    }
    return new Response(JSON.stringify({
      message: "Accepted"
    }), {
      status: 202,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    console.error("AC webhook error:", error);
    return new Response(JSON.stringify({
      message: "Accepted"
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
