/**
 * wedme-rsvp-dispatcher — processa a fila wedme_rsvp_outbox e faz POST pro Wedme.
 *
 * Chamadas:
 *   - { outbox_id: "<uuid>" }       → processa só esse row (chamado pelo trigger SQL)
 *   - { action: "process_pending" } → varre pending/failed (chamado pelo pg_cron)
 *   - sem body                       → mesma coisa que process_pending
 *
 * Pra cada row:
 *   - POST pra target_url com header X-Webhook-Secret: WEDME_RSVP_SECRET
 *   - 2xx → marca sent
 *   - 4xx (exceto 5xx) → marca failed (não retenta — problema de dados)
 *   - 5xx ou network error → marca failed + agenda next_retry_at (backoff exponencial)
 *
 * Env:
 *   - WEDME_RSVP_SECRET — segredo compartilhado pela Wedme
 *   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — built-in
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface OutboxRow {
  id: string;
  target_url: string;
  payload: unknown;
  attempts: number;
  status: string;
}

// Backoff exponencial em segundos: 1min, 5min, 30min, 2h, 6h
const RETRY_BACKOFF_SECONDS = [60, 300, 1800, 7200, 21600];
const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 50;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const wedmeSecret = Deno.env.get("WEDME_RSVP_SECRET") ?? "";

  if (!supabaseUrl || !serviceKey) {
    return json({ error: "SUPABASE_URL/SERVICE_ROLE_KEY missing" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Body opcional
  let body: { outbox_id?: string; action?: string } = {};
  try { body = await req.json(); } catch { /* sem body, ok */ }

  // Carrega rows pra processar
  let rows: OutboxRow[] = [];
  if (body.outbox_id) {
    const { data, error } = await supabase
      .from("wedme_rsvp_outbox")
      .select("id, target_url, payload, attempts, status")
      .eq("id", body.outbox_id)
      .in("status", ["pending", "failed"])
      .lt("attempts", MAX_ATTEMPTS)
      .limit(1);
    if (error) return json({ error: error.message }, 500);
    rows = (data ?? []) as OutboxRow[];
  } else {
    // process_pending: varre fila
    const { data, error } = await supabase
      .from("wedme_rsvp_outbox")
      .select("id, target_url, payload, attempts, status")
      .in("status", ["pending", "failed"])
      .lt("attempts", MAX_ATTEMPTS)
      .or(`next_retry_at.is.null,next_retry_at.lte.${new Date().toISOString()}`)
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);
    if (error) return json({ error: error.message }, 500);
    rows = (data ?? []) as OutboxRow[];
  }

  if (rows.length === 0) {
    return json({ processed: 0, message: "no rows to process" }, 200);
  }

  if (!wedmeSecret) {
    // Marca todas como failed com erro claro — quando o secret for configurado,
    // o cron pega de novo.
    const now = new Date().toISOString();
    const nextRetryMs = Date.now() + RETRY_BACKOFF_SECONDS[0] * 1000;
    await supabase
      .from("wedme_rsvp_outbox")
      .update({
        status: "failed",
        last_error: "WEDME_RSVP_SECRET não configurado no edge function",
        next_retry_at: new Date(nextRetryMs).toISOString(),
        attempts: 0, // não conta como tentativa real
      })
      .in("id", rows.map(r => r.id));
    return json({ processed: 0, error: "WEDME_RSVP_SECRET não configurado", marked_failed: rows.length }, 200);
  }

  let sent = 0;
  let failed = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (const row of rows) {
    const attempts = row.attempts + 1;
    try {
      const resp = await fetch(row.target_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Secret": wedmeSecret,
        },
        body: JSON.stringify(row.payload),
      });

      const responseText = await resp.text();
      const responseCode = resp.status;

      if (resp.ok) {
        // 2xx → sucesso
        await supabase
          .from("wedme_rsvp_outbox")
          .update({
            status: "sent",
            attempts,
            response_code: responseCode,
            response_body: responseText.slice(0, 2000),
            sent_at: new Date().toISOString(),
            last_error: null,
            next_retry_at: null,
          })
          .eq("id", row.id);
        sent++;
      } else if (responseCode >= 400 && responseCode < 500) {
        // 4xx → dados ruins, não retenta
        await supabase
          .from("wedme_rsvp_outbox")
          .update({
            status: "failed",
            attempts,
            response_code: responseCode,
            response_body: responseText.slice(0, 2000),
            last_error: `HTTP ${responseCode} (4xx — não retenta)`,
            next_retry_at: null,
          })
          .eq("id", row.id);
        failed++;
        errors.push({ id: row.id, error: `${responseCode}: ${responseText.slice(0, 200)}` });
      } else {
        // 5xx → retenta com backoff
        const backoffSec = RETRY_BACKOFF_SECONDS[Math.min(attempts - 1, RETRY_BACKOFF_SECONDS.length - 1)];
        const nextRetry = new Date(Date.now() + backoffSec * 1000).toISOString();
        await supabase
          .from("wedme_rsvp_outbox")
          .update({
            status: "failed",
            attempts,
            response_code: responseCode,
            response_body: responseText.slice(0, 2000),
            last_error: `HTTP ${responseCode} (5xx — retry em ${backoffSec}s)`,
            next_retry_at: nextRetry,
          })
          .eq("id", row.id);
        failed++;
        errors.push({ id: row.id, error: `${responseCode}: retry em ${backoffSec}s` });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const backoffSec = RETRY_BACKOFF_SECONDS[Math.min(attempts - 1, RETRY_BACKOFF_SECONDS.length - 1)];
      const nextRetry = new Date(Date.now() + backoffSec * 1000).toISOString();
      await supabase
        .from("wedme_rsvp_outbox")
        .update({
          status: "failed",
          attempts,
          last_error: `network error: ${msg}`,
          next_retry_at: nextRetry,
        })
        .eq("id", row.id);
      failed++;
      errors.push({ id: row.id, error: msg });
    }
  }

  return json({ processed: rows.length, sent, failed, errors }, 200);
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
