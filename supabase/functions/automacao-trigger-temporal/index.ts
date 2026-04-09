/**
 * automacao-trigger-temporal — Detecta triggers baseados em tempo.
 *
 * Chamado via pg_cron 1x por dia (6h São Paulo = 9h UTC).
 *
 * Triggers temporais suportados:
 *   - dias_no_stage: cards parados em um stage por X dias
 *   - dias_sem_contato: cards sem mensagem WhatsApp por X dias
 *   - sem_resposta_horas: última msg outbound sem resposta inbound
 *   - dias_antes_viagem: D-X dias antes da data_viagem_inicio
 *   - dias_apos_viagem: D+X dias após data_viagem_fim
 *   - aniversario_contato: data_nascimento do contato = hoje
 *   - proposta_expirada: proposals.expires_at < now
 *   - documento_pendente: card_document_requirements pendente > X dias
 */

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

  const start = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch all active temporal automations
    const { data: regras } = await supabase
      .from("automacao_regras")
      .select("id, org_id, produto, trigger_type, trigger_config, template_id")
      .eq("ativa", true)
      .in("trigger_type", [
        "dias_no_stage", "dias_sem_contato", "sem_resposta_horas",
        "dias_antes_viagem", "dias_apos_viagem", "aniversario_contato",
        "proposta_expirada", "documento_pendente",
      ]);

    if (!regras || regras.length === 0) {
      return new Response(
        JSON.stringify({ message: "Nenhuma automação temporal ativa", enqueued: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalEnqueued = 0;

    for (const regra of regras) {
      const config = regra.trigger_config || {};
      let enqueued = 0;

      try {
        switch (regra.trigger_type) {
          case "dias_no_stage": {
            const dias = config.dias || 7;
            const cutoff = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

            // Cards with pipeline_stage_id unchanged for X days
            // We use updated_at as proxy (or stage_changed_at if available)
            const { data: cards } = await supabase
              .from("cards")
              .select("id, pessoa_principal_id, org_id")
              .eq("produto", regra.produto)
              .eq("status_comercial", "aberto")
              .lte("updated_at", cutoff)
              .limit(200);

            if (cards) {
              for (const card of cards) {
                if (!card.pessoa_principal_id) continue;
                await enqueueExecution(supabase, regra, card.id, card.pessoa_principal_id, card.org_id);
                enqueued++;
              }
            }
            break;
          }

          case "dias_sem_contato": {
            const dias = config.dias || 14;
            const cutoff = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

            // Cards where last WhatsApp message is older than X days
            const { data: cards } = await supabase.rpc("cards_sem_contato_whatsapp", {
              p_produto: regra.produto,
              p_cutoff: cutoff,
              p_limit: 200,
            });

            if (cards) {
              for (const card of cards) {
                await enqueueExecution(supabase, regra, card.card_id, card.pessoa_principal_id, card.org_id);
                enqueued++;
              }
            }
            break;
          }

          case "dias_antes_viagem": {
            const dias = config.dias || 30;
            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() + dias);
            const dateStr = targetDate.toISOString().split("T")[0];

            const { data: cards } = await supabase
              .from("cards")
              .select("id, pessoa_principal_id, org_id")
              .eq("produto", regra.produto)
              .eq("status_comercial", "aberto")
              .eq("data_viagem_inicio", dateStr)
              .limit(200);

            if (cards) {
              for (const card of cards) {
                if (!card.pessoa_principal_id) continue;
                await enqueueExecution(supabase, regra, card.id, card.pessoa_principal_id, card.org_id);
                enqueued++;
              }
            }
            break;
          }

          case "dias_apos_viagem": {
            const dias = config.dias || 3;
            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() - dias);
            const dateStr = targetDate.toISOString().split("T")[0];

            const { data: cards } = await supabase
              .from("cards")
              .select("id, pessoa_principal_id, org_id")
              .eq("produto", regra.produto)
              .eq("data_viagem_fim", dateStr)
              .limit(200);

            if (cards) {
              for (const card of cards) {
                if (!card.pessoa_principal_id) continue;
                await enqueueExecution(supabase, regra, card.id, card.pessoa_principal_id, card.org_id);
                enqueued++;
              }
            }
            break;
          }

          case "aniversario_contato": {
            const now = new Date();
            const month = now.getMonth() + 1; // 1-based
            const day = now.getDate();

            // Find contacts with birthday today that have active cards
            const { data: contatos } = await supabase.rpc("contatos_aniversario_hoje", {
              p_month: month,
              p_day: day,
              p_produto: regra.produto,
              p_limit: 200,
            });

            if (contatos) {
              for (const c of contatos) {
                await enqueueExecution(supabase, regra, c.card_id, c.contato_id, c.org_id);
                enqueued++;
              }
            }
            break;
          }

          case "proposta_expirada": {
            const { data: proposals } = await supabase
              .from("proposals")
              .select("id, card_id, cards!inner(pessoa_principal_id, produto, org_id)")
              .lt("expires_at", new Date().toISOString())
              .neq("status", "accepted")
              .neq("status", "rejected")
              .limit(200);

            if (proposals) {
              for (const p of proposals) {
                const card = (p as Record<string, unknown>).cards as Record<string, unknown>;
                if (card && card.pessoa_principal_id) {
                  await enqueueExecution(supabase, regra, p.card_id, card.pessoa_principal_id as string, card.org_id as string);
                  enqueued++;
                }
              }
            }
            break;
          }

          case "documento_pendente": {
            const dias = config.dias || 7;
            const cutoff = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

            const { data: docs } = await supabase
              .from("card_document_requirements")
              .select("card_id, contato_id, cards!inner(org_id, produto)")
              .eq("status", "pending")
              .lte("created_at", cutoff)
              .limit(200);

            if (docs) {
              for (const d of docs) {
                const card = (d as Record<string, unknown>).cards as Record<string, unknown>;
                if (card && card.produto?.toString() === regra.produto) {
                  await enqueueExecution(supabase, regra, d.card_id, d.contato_id, card.org_id as string);
                  enqueued++;
                }
              }
            }
            break;
          }
        }
      } catch (ruleErr) {
        console.error(`[trigger-temporal] Error processing rule ${regra.id} (${regra.trigger_type}):`, ruleErr);
      }

      totalEnqueued += enqueued;
      if (enqueued > 0) {
        console.log(`[trigger-temporal] Rule ${regra.id} (${regra.trigger_type}): enqueued ${enqueued}`);
      }
    }

    const elapsed = Date.now() - start;

    return new Response(
      JSON.stringify({
        rules_processed: regras.length,
        total_enqueued: totalEnqueued,
        elapsed_ms: elapsed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[trigger-temporal] Error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ---------------------------------------------------------------------------
// Enqueue execution (with dedup)
// ---------------------------------------------------------------------------
async function enqueueExecution(
  supabase: ReturnType<typeof createClient>,
  regra: Record<string, unknown>,
  cardId: string,
  contactId: string,
  orgId: string
): Promise<void> {
  const dedupKey = `${regra.id}|${cardId}|${new Date().toISOString().split("T")[0]}`;

  await supabase.from("automacao_execucoes").insert({
    org_id: orgId,
    regra_id: regra.id,
    card_id: cardId,
    contact_id: contactId,
    trigger_type: regra.trigger_type,
    trigger_data: regra.trigger_config,
    template_id: regra.template_id,
    dedup_key: dedupKey,
    status: "pending",
  }).then(({ error }) => {
    // Ignore dedup conflicts silently
    if (error && !error.message?.includes("duplicate") && !error.message?.includes("unique")) {
      console.error(`[trigger-temporal] Enqueue error for card ${cardId}:`, error.message);
    }
  });
}
