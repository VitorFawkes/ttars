/**
 * wsdr-test — proxy de teste da SDR Weddings (Sofia) para a UI.
 * A tela chama esta função (via supabase.functions.invoke, com auth+CORS resolvidos)
 * que repassa a mensagem ao webhook do n8n e devolve a resposta da Sofia.
 * Permite o leigo VER que mexer na config mudou o comportamento (anti-controle-falso).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const N8N_WEBHOOK = "https://n8n-n8n.ymnmx7.easypanel.host/webhook/sdr-weddings";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const message = String(body.message || "").trim();
    const history = Array.isArray(body.history) ? body.history : [];
    if (!message) {
      return new Response(JSON.stringify({ error: "message é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // phone fixo do teste (mesmo whitelistado na linha) — só pra exercitar a config
    const res = await fetch(N8N_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "5511964293533", nome: body.nome || "", message, history }),
    });
    const data = await res.json().catch(() => ({}));
    return new Response(JSON.stringify({ reply: data?.reply ?? "", ok: res.ok }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
