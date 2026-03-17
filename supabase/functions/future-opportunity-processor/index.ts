/**
 * FUTURE OPPORTUNITY PROCESSOR
 * ============================
 * Edge Function chamada diariamente via pg_cron (8h BRT / 11h UTC).
 *
 * Processa oportunidades futuras agendadas:
 * - lost_future → cria card novo independente via RPC criar_card_oportunidade_futura
 * - won_upsell → cria sub-card via RPC criar_sub_card_futuro
 *
 * Cards SÓ são criados quando scheduled_date <= hoje (nunca antes).
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

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 1. Buscar oportunidades pendentes cuja data já chegou
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    const { data: pendingOpps, error: fetchError } = await supabase
      .from("future_opportunities")
      .select("id, source_type, titulo, source_card_id")
      .eq("status", "pending")
      .lte("scheduled_date", today)
      .order("scheduled_date", { ascending: true });

    if (fetchError) {
      console.error("Erro ao buscar oportunidades:", fetchError);
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!pendingOpps || pendingOpps.length === 0) {
      return new Response(
        JSON.stringify({ message: "Nenhuma oportunidade pendente para processar", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processando ${pendingOpps.length} oportunidade(s) futura(s)...`);

    const results: Array<{ id: string; success: boolean; error?: string }> = [];

    // 2. Processar cada oportunidade
    for (const opp of pendingOpps) {
      try {
        let result;

        if (opp.source_type === "lost_future") {
          // Caso 1: Card perdido → novo card independente
          const { data, error } = await supabase.rpc(
            "criar_card_oportunidade_futura",
            { p_future_opp_id: opp.id }
          );

          if (error) throw error;
          result = data;
        } else if (opp.source_type === "won_upsell") {
          // Caso 2: Card Planner/Pós-Venda → sub-card
          const { data, error } = await supabase.rpc(
            "criar_sub_card_futuro",
            { p_future_opp_id: opp.id }
          );

          if (error) throw error;
          result = data;
        } else {
          throw new Error(`source_type desconhecido: ${opp.source_type}`);
        }

        if (result?.success) {
          console.log(`✓ ${opp.source_type} processado: ${opp.titulo} (opp ${opp.id})`);
          results.push({ id: opp.id, success: true });
        } else {
          console.error(`✗ Falha RPC para ${opp.id}: ${result?.error}`);
          results.push({ id: opp.id, success: false, error: result?.error });
        }
      } catch (err) {
        console.error(`✗ Erro ao processar ${opp.id}:`, err);
        results.push({
          id: opp.id,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    console.log(`Concluído: ${successCount} sucesso, ${failCount} falha(s)`);

    return new Response(
      JSON.stringify({
        processed: pendingOpps.length,
        success: successCount,
        failed: failCount,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Erro geral:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
