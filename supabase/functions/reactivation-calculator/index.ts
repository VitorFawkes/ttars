/**
 * REACTIVATION CALCULATOR
 * =======================
 * Edge Function chamada diariamente via cron (03:00 UTC / 00:00 BRT).
 *
 * Chama a RPC calculate_reactivation_patterns() que analisa padrões
 * de viagem históricos e calcula score de reativação para cada contato.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Chamar RPC de cálculo
    const { data, error } = await supabase.rpc(
      "calculate_reactivation_patterns"
    );

    if (error) {
      console.error("RPC error:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message,
          duration_ms: Date.now() - startTime,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const count = data ?? 0;
    const duration = Date.now() - startTime;

    console.log(
      `Reactivation patterns calculated: ${count} contacts in ${duration}ms`
    );

    return new Response(
      JSON.stringify({
        success: true,
        contacts_processed: count,
        duration_ms: duration,
        calculated_at: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message,
        duration_ms: Date.now() - startTime,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
