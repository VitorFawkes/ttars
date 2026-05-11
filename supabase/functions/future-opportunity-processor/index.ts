/**
 * FUTURE OPPORTUNITY PROCESSOR
 * ============================
 * Edge Function chamada diariamente via pg_cron (8h BRT / 11h UTC).
 *
 * Processa oportunidades futuras agendadas:
 * - lost_future → cria card novo independente via RPC criar_card_oportunidade_futura
 * - won_future → cria sub-card via RPC criar_sub_card_futuro
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

    // 1. Buscar oportunidades pendentes ou com falha cuja data já chegou
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    const { data: pendingOpps, error: fetchError } = await supabase
      .from("future_opportunities")
      .select("id, source_type, titulo, source_card_id, status, echo_released_at")
      .in("status", ["pending", "failed"])
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
        } else if (opp.source_type === "won_future") {
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

          // Se for card CORP e ainda não fizemos release, reabre conversa no Echo
          // (idempotente via echo_released_at). Falha aqui é só warning — não quebra o card.
          if (opp.source_type === "lost_future" && !opp.echo_released_at && opp.source_card_id) {
            try {
              await releaseEchoConversation(supabase, opp.id, opp.source_card_id);
            } catch (releaseErr) {
              const msg = releaseErr instanceof Error ? releaseErr.message : String(releaseErr);
              console.warn(`[release-echo] opp=${opp.id}: ${msg}`);
            }
          }

          results.push({ id: opp.id, success: true });
        } else {
          const errMsg = result?.error || "RPC retornou falha sem detalhe";
          console.error(`✗ Falha RPC para ${opp.id}: ${errMsg}`);
          // Marcar como failed para visibilidade no frontend
          await supabase.from("future_opportunities").update({
            status: "failed",
            metadata: { error: errMsg, failed_at: new Date().toISOString() },
          }).eq("id", opp.id);
          results.push({ id: opp.id, success: false, error: errMsg });
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`✗ Erro ao processar ${opp.id}:`, errMsg);
        // Marcar como failed para retry e visibilidade
        await supabase.from("future_opportunities").update({
          status: "failed",
          metadata: { error: errMsg, failed_at: new Date().toISOString() },
        }).eq("id", opp.id);
        results.push({ id: opp.id, success: false, error: errMsg });
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

// ============================================================================
// releaseEchoConversation
// Apenas pra cards do produto CORP. Acha a conversa do Echo ligada ao card
// original (que foi fechado como oportunidade futura) e dá POST /release.
// Salva timestamp em future_opportunities.echo_released_at pra evitar retry.
// ============================================================================
async function releaseEchoConversation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  oppId: string,
  sourceCardId: string,
): Promise<void> {
  // 1. O card original é CORP?
  const { data: card } = await supabase
    .from("cards")
    .select("id, produto, pessoa_principal_id")
    .eq("id", sourceCardId)
    .maybeSingle();

  if (!card || card.produto !== "CORP") {
    return; // Só Corp por enquanto (decisão do produto)
  }

  // 2. Achar última conversation_id de mensagens do card
  const { data: msgs } = await supabase
    .from("whatsapp_messages")
    .select("conversation_id")
    .eq("card_id", sourceCardId)
    .not("conversation_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);

  const localConvId = msgs?.[0]?.conversation_id;
  if (!localConvId) {
    console.log(`[release-echo] opp=${oppId}: card sem mensagens, pulando`);
    return;
  }

  // 3. Resolver external_conversation_id
  const { data: conv } = await supabase
    .from("whatsapp_conversations")
    .select("external_conversation_id")
    .or(`id.eq.${localConvId},external_conversation_id.eq.${localConvId}`)
    .limit(1)
    .maybeSingle();

  const externalId = conv?.external_conversation_id || localConvId;
  if (!externalId) {
    console.log(`[release-echo] opp=${oppId}: sem external_conversation_id`);
    return;
  }

  // 4. Montar URL do release a partir do ECHO_API_URL configurado
  // ECHO_API_URL aponta pra .../echo-api/send-message — derivamos a base
  // e construímos .../echo-api/conversations/{id}/release
  const echoApiUrl = Deno.env.get("ECHO_API_URL");
  const echoApiKey = Deno.env.get("ECHO_API_KEY");

  if (!echoApiUrl || !echoApiKey) {
    console.warn(`[release-echo] ECHO_API_URL ou ECHO_API_KEY não configurado`);
    return;
  }

  // Deriva base: tira o último segmento (ex: send-message) e troca pelo path certo
  const baseUrl = echoApiUrl.replace(/\/[^/]+\/?$/, "");
  const releaseUrl = `${baseUrl}/conversations/${encodeURIComponent(externalId)}/release`;

  // 5. POST release
  const res = await fetch(releaseUrl, {
    method: "POST",
    headers: {
      "x-api-key": echoApiKey,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`release HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  // 6. Marca idempotência
  await supabase
    .from("future_opportunities")
    .update({ echo_released_at: new Date().toISOString() })
    .eq("id", oppId);

  console.log(`✓ Echo release ok: opp=${oppId}, conv=${externalId}`);
}
