/**
 * disparo-dispatcher — dreno da fila de Disparo Livre (texto livre via Echo
 * não-oficial), com throttle por tempo pra reduzir risco de bloqueio Meta.
 *
 * Chamada por pg_cron a cada 1 min (cron 'disparo-dispatcher'). O espaçamento
 * real entre mensagens já está em disparo_fila.execute_at (calculado na agenda);
 * aqui só pegamos os itens que estão "na hora" e mandamos.
 *
 * Por invocação:
 *   1. Detecta opt-outs por inbound ("SAIR"/"PARAR") → blocklist (RPC).
 *   2. Reaper + claim atômico de N itens prontos (RPC disparo_claim_batch).
 *   3. Pra cada item: re-checa blocklist → envia via send-whatsapp-message →
 *      marca sent / retry(backoff) / failed.
 *   4. Circuit breaker: campanha com muitas falhas e zero envios → pausa.
 *
 * Env (built-in): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Quantos enviar por tick (cron = 1 min). Pequeno de propósito: o espaçamento
// fino entre mensagens já está no execute_at; aqui é só não acumular atraso.
const BATCH = 4;
const RETRY_BACKOFF_MIN = 5;          // minutos até retry numa falha
const BREAKER_FAILS = 5;              // falhas sem nenhum envio → pausa campanha

interface ClaimedRow {
  id: string;
  campaign_id: string;
  contact_id: string;
  org_id: string;
  corpo: string | null;
  phone_number_id: string | null;
  telefone: string | null;
  attempts: number;
  max_attempts: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "SUPABASE_URL/SERVICE_ROLE_KEY missing" }, 500);
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  // 1. Opt-outs por inbound (palavra-chave estrita)
  try {
    await supabase.rpc("disparo_detectar_opt_outs", { p_minutes: 120 });
  } catch (err) {
    console.error("[disparo-dispatcher] detectar_opt_outs:", err instanceof Error ? err.message : String(err));
  }

  // 2. Claim
  const { data: claimed, error: claimErr } = await supabase.rpc("disparo_claim_batch", { p_limit: BATCH });
  if (claimErr) return json({ error: claimErr.message }, 500);
  const rows = (claimed ?? []) as ClaimedRow[];
  if (rows.length === 0) return json({ processed: 0, message: "nada pronto" }, 200);

  let sent = 0;
  let failed = 0;
  let optedOut = 0;
  const touchedCampaigns = new Set<string>();

  for (const row of rows) {
    touchedCampaigns.add(row.campaign_id);

    // 3a. Re-checa blocklist imediatamente antes de mandar
    const { data: opt } = await supabase
      .from("disparo_opt_outs")
      .select("id")
      .eq("org_id", row.org_id)
      .eq("telefone_normalizado", row.telefone ?? "")
      .maybeSingle();
    if (opt) {
      await supabase.from("disparo_fila")
        .update({ status: "opt_out", claimed_at: null })
        .eq("id", row.id);
      optedOut++;
      continue;
    }

    if (!row.corpo || !row.corpo.trim()) {
      await markFailed(supabase, row, "corpo_vazio", null);
      failed++;
      continue;
    }

    // 3b. Envia (reusa send-whatsapp-message → Echo /send-message texto livre)
    try {
      const { data: res, error: invErr } = await supabase.functions.invoke("send-whatsapp-message", {
        body: {
          contact_id: row.contact_id,
          corpo: row.corpo,
          phone_number_id: row.phone_number_id,
          source: "disparo",
        },
      });

      const ok = !invErr && (res?.success === true || !!res?.whatsapp_message_id);
      if (ok) {
        await supabase.from("disparo_fila")
          .update({
            status: "sent",
            enviado_at: new Date().toISOString(),
            whatsapp_message_id: res?.whatsapp_message_id ?? null,
            erro_motivo: null,
            error_code: null,
          })
          .eq("id", row.id);
        sent++;
      } else {
        const motivo = invErr?.message || res?.echo_response?.error || `echo_status ${res?.echo_status ?? "?"}`;
        const code = res?.echo_status ? String(res.echo_status) : null;
        await markFailedOrRetry(supabase, row, String(motivo).slice(0, 300), code);
        failed++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await markFailedOrRetry(supabase, row, msg.slice(0, 300), null);
      failed++;
    }
  }

  // 4. Circuit breaker — campanha falhando inteira pausa sozinha
  for (const cid of touchedCampaigns) {
    const { data: camp } = await supabase
      .from("disparo_campanhas")
      .select("status, enviados, falhados")
      .eq("id", cid)
      .maybeSingle();
    if (camp && camp.status === "disparando" && camp.enviados === 0 && (camp.falhados ?? 0) >= BREAKER_FAILS) {
      await supabase.from("disparo_campanhas")
        .update({ status: "pausado", paused_at: new Date().toISOString() })
        .eq("id", cid);
      console.error(`[disparo-dispatcher] circuit breaker: campanha ${cid} pausada (${camp.falhados} falhas, 0 envios)`);
    }
  }

  return json({ processed: rows.length, sent, failed, opt_out: optedOut }, 200);
});

/** Falha: retenta com backoff se ainda tem tentativa; senão marca failed. */
async function markFailedOrRetry(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  row: ClaimedRow,
  motivo: string,
  code: string | null,
) {
  const attempts = row.attempts + 1;
  if (attempts < row.max_attempts) {
    const nextAt = new Date(Date.now() + RETRY_BACKOFF_MIN * 60 * 1000).toISOString();
    await supabase.from("disparo_fila")
      .update({
        status: "pending",
        attempts,
        claimed_at: null,
        execute_at: nextAt,
        erro_motivo: motivo,
        error_code: code,
      })
      .eq("id", row.id);
  } else {
    await markFailed(supabase, row, motivo, code, attempts);
  }
}

async function markFailed(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  row: ClaimedRow,
  motivo: string,
  code: string | null,
  attempts?: number,
) {
  await supabase.from("disparo_fila")
    .update({
      status: "failed",
      attempts: attempts ?? row.attempts + 1,
      claimed_at: null,
      erro_motivo: motivo,
      error_code: code,
    })
    .eq("id", row.id);
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
