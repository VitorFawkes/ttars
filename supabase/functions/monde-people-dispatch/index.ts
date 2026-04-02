import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  getMondeV2Credentials,
  getMondeV2Token,
  mondeV2Headers,
  invalidateMondeV2Token,
} from "../_shared/monde-v2-auth.ts";
import {
  mapContatoToMondePerson,
  type ContatoRecord,
} from "../_shared/monde-people-mapper.ts";

/**
 * monde-people-dispatch — Processa fila outbound (monde_people_queue)
 *
 * Chamado por cron (pg_cron) a cada 2 minutos.
 * Lê eventos pending, consolida por contato_id, e faz POST/PATCH no Monde V2.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 3;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // --- 1. Check settings ---
    const { data: settings } = await supabase
      .from("integration_settings")
      .select("key, value")
      .in("key", [
        "MONDE_V2_API_URL",
        "MONDE_V2_SYNC_ENABLED",
        "MONDE_V2_SYNC_DIRECTION",
      ]);

    const config = (settings || []).reduce(
      (acc, s) => {
        acc[s.key] = s.value;
        return acc;
      },
      {} as Record<string, string>
    );

    if (config["MONDE_V2_SYNC_ENABLED"] !== "true") {
      return jsonResponse({ skipped: true, reason: "sync disabled" });
    }

    if (config["MONDE_V2_SYNC_DIRECTION"] === "inbound_only") {
      return jsonResponse({ skipped: true, reason: "inbound_only" });
    }

    // --- 2. Get credentials ---
    const auth = getMondeV2Credentials(config);
    if (!auth.login || !auth.password) {
      return jsonResponse({ error: "Monde V2 credentials not configured" }, 500);
    }

    // --- 3. Fetch pending queue events (deduplicated by contato_id) ---
    // Get distinct contato_ids with their earliest pending event
    const { data: pendingEvents, error: fetchError } = await supabase
      .from("monde_people_queue")
      .select("id, contato_id, event_type, changed_fields, attempts")
      .eq("status", "pending")
      .lt("attempts", MAX_ATTEMPTS)
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE * 3); // Fetch more to handle dedup

    if (fetchError) {
      console.error("[monde-people-dispatch] fetch error:", fetchError);
      return jsonResponse({ error: fetchError.message }, 500);
    }

    if (!pendingEvents || pendingEvents.length === 0) {
      return jsonResponse({ processed: 0, message: "no pending events" });
    }

    // Deduplicate: group by contato_id, keep only one event per contato
    const byContato = new Map<
      string,
      { ids: string[]; event_type: string; attempts: number }
    >();

    for (const evt of pendingEvents) {
      const existing = byContato.get(evt.contato_id);
      if (existing) {
        existing.ids.push(evt.id);
        // Prefer 'created' over 'updated' if both exist
        if (evt.event_type === "created") existing.event_type = "created";
      } else {
        byContato.set(evt.contato_id, {
          ids: [evt.id],
          event_type: evt.event_type,
          attempts: evt.attempts,
        });
      }
    }

    // Limit to BATCH_SIZE unique contatos
    const contatoIds = [...byContato.keys()].slice(0, BATCH_SIZE);
    const allEventIds = contatoIds.flatMap((id) => byContato.get(id)!.ids);

    // Mark as processing
    await supabase
      .from("monde_people_queue")
      .update({ status: "processing" })
      .in("id", allEventIds);

    // --- 4. Fetch contato data ---
    const { data: contatos } = await supabase
      .from("contatos")
      .select(
        "id, nome, sobrenome, email, telefone, telefone_normalizado, cpf, cpf_normalizado, rg, passaporte, passaporte_validade, data_nascimento, sexo, tipo_cliente, observacoes, endereco, monde_person_id"
      )
      .in("id", contatoIds)
      .is("deleted_at", null);

    if (!contatos || contatos.length === 0) {
      // Mark all as done (contatos deleted)
      await supabase
        .from("monde_people_queue")
        .update({ status: "done", processed_at: new Date().toISOString() })
        .in("id", allEventIds);
      return jsonResponse({ processed: 0, message: "no active contatos" });
    }

    // --- 5. Authenticate with Monde ---
    let token = await getMondeV2Token(auth);

    // --- 6. Process each contato ---
    const results: Array<{
      contato_id: string;
      status: "synced" | "skipped" | "error";
      monde_person_id?: string;
      error?: string;
    }> = [];

    for (const contato of contatos as ContatoRecord[]) {
      const queueEntry = byContato.get(contato.id)!;

      try {
        const payload = mapContatoToMondePerson(contato);

        if (!payload) {
          // Mark as done (skipped)
          await supabase
            .from("monde_people_queue")
            .update({
              status: "done",
              processed_at: new Date().toISOString(),
            })
            .in("id", queueEntry.ids);

          results.push({
            contato_id: contato.id,
            status: "skipped",
            error: "No valid name",
          });
          continue;
        }

        const isUpdate = !!contato.monde_person_id;
        const url = isUpdate
          ? `${auth.apiUrl}/people/${contato.monde_person_id}`
          : `${auth.apiUrl}/people`;
        const method = isUpdate ? "PATCH" : "POST";

        if (isUpdate) {
          (payload.data as Record<string, unknown>).id =
            contato.monde_person_id;
        }

        let response = await fetch(url, {
          method,
          headers: mondeV2Headers(token),
          body: JSON.stringify(payload),
        });

        // Retry on 401
        if (response.status === 401) {
          invalidateMondeV2Token();
          token = await getMondeV2Token(auth);
          response = await fetch(url, {
            method,
            headers: mondeV2Headers(token),
            body: JSON.stringify(payload),
          });
        }

        if (!response.ok) {
          const errorBody = await response.text();
          console.error(
            `[monde-people-dispatch] ${method} failed for ${contato.id}: ${response.status} ${errorBody.slice(0, 200)}`
          );

          // Mark as error with retry
          await supabase
            .from("monde_people_queue")
            .update({
              status:
                queueEntry.attempts + 1 >= MAX_ATTEMPTS ? "error" : "pending",
              attempts: queueEntry.attempts + 1,
              error_message: `${response.status}: ${errorBody.slice(0, 500)}`,
              processed_at: new Date().toISOString(),
            })
            .in("id", queueEntry.ids);

          results.push({
            contato_id: contato.id,
            status: "error",
            error: `${response.status}`,
          });
          continue;
        }

        const responseData = await response.json();
        const mondePersonId = responseData?.data?.id;

        // Update contato with monde_person_id + monde_last_sync
        if (mondePersonId) {
          // Set anti-loop flag before updating
          await supabase.rpc("set_monde_import_flag");

          await supabase
            .from("contatos")
            .update({
              monde_person_id: mondePersonId,
              monde_last_sync: new Date().toISOString(),
            })
            .eq("id", contato.id);
        }

        // Mark queue events as done
        await supabase
          .from("monde_people_queue")
          .update({
            status: "done",
            processed_at: new Date().toISOString(),
          })
          .in("id", queueEntry.ids);

        results.push({
          contato_id: contato.id,
          status: "synced",
          monde_person_id: mondePersonId,
        });

        console.log(
          `[monde-people-dispatch] ${isUpdate ? "Updated" : "Created"} ${contato.id} → ${mondePersonId}`
        );
      } catch (err) {
        console.error(
          `[monde-people-dispatch] Error for ${contato.id}:`,
          err
        );

        await supabase
          .from("monde_people_queue")
          .update({
            status: "error",
            error_message:
              err instanceof Error ? err.message : String(err),
            processed_at: new Date().toISOString(),
          })
          .in("id", queueEntry.ids);

        results.push({
          contato_id: contato.id,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const summary = {
      processed: results.length,
      synced: results.filter((r) => r.status === "synced").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      errors: results.filter((r) => r.status === "error").length,
      results,
    };

    console.log(
      `[monde-people-dispatch] Done: ${summary.synced} synced, ${summary.errors} errors`
    );

    return jsonResponse(summary);
  } catch (err) {
    console.error("[monde-people-dispatch] Unexpected error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : String(err) },
      500
    );
  }
});
