import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  getMondeV2Credentials,
  getMondeV2Token,
  mondeV2Headers,
  invalidateMondeV2Token,
} from "../_shared/monde-v2-auth.ts";
import {
  mapMondePersonToContato,
  mergeContatoFields,
  type MondePersonResponse,
} from "../_shared/monde-people-mapper.ts";

/**
 * monde-people-import — INBOUND: Monde V2 People API → CRM
 *
 * Modos de operação:
 *   - auto (default): se bulk não completou → continua bulk. Se completou → maintenance.
 *   - bulk: força bulk import com cursor persistente.
 *   - maintenance: scan recentes (sort=-registered-at), para ao encontrar conhecidos.
 *   - reset: reseta cursor e recomeça bulk do zero.
 *
 * Invocação:
 *   POST {}                                    — modo auto (cron)
 *   POST { mode: "bulk", page_limit: 5 }       — bulk com limite de páginas
 *   POST { mode: "maintenance" }                — scan recentes
 *   POST { mode: "reset" }                      — reseta cursor
 *   POST { monde_person_id: "x" }               — importa 1 pessoa por UUID
 *   POST { search: "Nome" }                     — filtra por nome
 *   POST { debug: true }                        — retorna metadata sem importar
 *   POST { force_update: true, monde_person_id: "x" }  — sobrescreve campos
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BATCH_SIZE = 50; // Páginas por execução de bulk
const PAGE_SIZE = 50; // Contatos por página
const MAINTENANCE_STOP_THRESHOLD = 50; // Parar maintenance após N seguidos já importados

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface ImportResult {
  monde_person_id: string;
  contato_id?: string;
  status: "created" | "updated" | "skipped" | "error";
  match_type?: "monde_id" | "cpf" | "email" | "telefone" | "telefone_meios" | "nome" | "new";
  match_confidence?: "exact_link" | "high" | "low" | "new";
  error?: string;
}

// --- Helpers for cursor persistence ---

async function getSetting(
  supabase: ReturnType<typeof createClient>,
  key: string
): Promise<string | null> {
  const { data } = await supabase
    .from("integration_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return data?.value || null;
}

async function setSetting(
  supabase: ReturnType<typeof createClient>,
  key: string,
  value: string
): Promise<void> {
  // Check if key exists first (table may not have unique constraint on key)
  const { data: existing } = await supabase
    .from("integration_settings")
    .select("id")
    .eq("key", key)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("integration_settings")
      .update({ value })
      .eq("key", key);
  } else {
    await supabase
      .from("integration_settings")
      .insert({ key, value });
  }
}

// --- Process a single page of Monde people ---

async function processPage(
  supabase: ReturnType<typeof createClient>,
  people: MondePersonResponse["data"][],
  forceUpdate: boolean
): Promise<ImportResult[]> {
  const results: ImportResult[] = [];

  // Bulk check: which monde_person_ids already exist?
  const mondeIds = people.map((p) => p.id);
  const { data: existingByMondeId } = await supabase
    .from("contatos")
    .select("id, monde_person_id")
    .in("monde_person_id", mondeIds)
    .is("deleted_at", null);

  const linkedMap = new Map(
    (existingByMondeId || []).map((c) => [c.monde_person_id, c.id])
  );

  for (const mondePerson of people) {
    try {
      const mapped = mapMondePersonToContato(mondePerson);
      const mondePersonId = mondePerson.id;
      const now = new Date().toISOString();

      // Fast path: already linked by monde_person_id
      const existingId = linkedMap.get(mondePersonId);
      if (existingId) {
        if (forceUpdate) {
          // Force update: overwrite fields from Monde
          const updates: Record<string, unknown> = { ...mapped, monde_last_sync: now };
          delete updates.monde_person_id; // Don't overwrite the link
          const { error: updateError } = await supabase
            .from("contatos")
            .update(updates)
            .eq("id", existingId);

          results.push({
            monde_person_id: mondePersonId,
            contato_id: existingId,
            status: updateError ? "error" : "updated",
            match_type: "monde_id",
            match_confidence: "exact_link",
            error: updateError?.message,
          });
        } else {
          // Already linked, not forcing → skip
          results.push({
            monde_person_id: mondePersonId,
            contato_id: existingId,
            status: "skipped",
            match_type: "monde_id",
            match_confidence: "exact_link",
          });
        }
        continue;
      }

      // Slow path: dedup via RPC (only for unlinked contacts)
      let existingContato: Record<string, unknown> | null = null;
      let matchType: ImportResult["match_type"] = "new";
      let matchConfidence: ImportResult["match_confidence"] = "new";

      const { data: duplicates } = await supabase.rpc(
        "check_contact_duplicates",
        {
          p_cpf: mapped.cpf || null,
          p_email: mapped.email || null,
          p_telefone: mapped.telefone || null,
          p_nome: mapped.nome || null,
          p_sobrenome: mapped.sobrenome || null,
        }
      );

      if (duplicates && duplicates.length > 0) {
        const bestMatch = duplicates[0];
        matchType = bestMatch.match_type as ImportResult["match_type"];

        const highConfidenceTypes = ["cpf", "email", "telefone", "telefone_meios"];
        matchConfidence = highConfidenceTypes.includes(bestMatch.match_type)
          ? "high"
          : "low";

        const { data: fullContato } = await supabase
          .from("contatos")
          .select("*")
          .eq("id", bestMatch.contact_id)
          .maybeSingle();

        if (fullContato) {
          existingContato = fullContato;
        }
      }

      // UPDATE or CREATE
      if (existingContato) {
        // Guard: don't overwrite monde_person_id of contact already linked to different Monde person
        const existingMondeId = existingContato.monde_person_id as string | null;
        if (existingMondeId && existingMondeId !== mondePersonId) {
          results.push({
            monde_person_id: mondePersonId,
            contato_id: existingContato.id as string,
            status: "skipped",
            match_type: matchType,
            match_confidence: matchConfidence,
            error: `Contato já vinculado a monde_person_id diferente: ${existingMondeId}`,
          });
          continue;
        }

        const updates = forceUpdate
          ? { ...mapped, monde_last_sync: now }
          : { ...mergeContatoFields(existingContato as Partial<typeof mapped>, mapped), monde_last_sync: now };

        if (Object.keys(updates).length > 0) {
          const { error: updateError } = await supabase
            .from("contatos")
            .update(updates)
            .eq("id", existingContato.id);

          results.push({
            monde_person_id: mondePersonId,
            contato_id: existingContato.id as string,
            status: updateError ? "error" : "updated",
            match_type: matchType,
            match_confidence: matchConfidence,
            error: updateError?.message,
          });
        } else {
          results.push({
            monde_person_id: mondePersonId,
            contato_id: existingContato.id as string,
            status: "skipped",
            match_type: matchType,
            match_confidence: matchConfidence,
          });
        }
      } else {
        // Create new
        const {
          cpf_normalizado: _cpf,
          telefone_normalizado: _tel,
          id: _id,
          ...insertFields
        } = mapped;

        const { data: newContato, error: insertError } = await supabase
          .from("contatos")
          .insert({
            ...insertFields,
            monde_person_id: mondePersonId,
            monde_last_sync: now,
            origem: "monde",
            origem_detalhe: "Importado da API V2 Monde",
          })
          .select("id")
          .single();

        results.push({
          monde_person_id: mondePersonId,
          contato_id: newContato?.id,
          status: insertError ? "error" : "created",
          match_type: "new",
          match_confidence: "new",
          error: insertError?.message,
        });
      }
    } catch (err) {
      results.push({
        monde_person_id: mondePerson.id,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json().catch(() => ({}));
    const singlePersonId = body.monde_person_id || null;
    const searchName = body.search || null;
    const searchCode = body.code || null;
    const debugMode = body.debug === true;
    const forceUpdate = body.force_update === true;
    const requestedMode = body.mode || "auto";
    const pageLimit = body.page_limit || BATCH_SIZE;

    // --- Check sync enabled ---
    const { data: settings } = await supabase
      .from("integration_settings")
      .select("key, value")
      .in("key", [
        "MONDE_V2_API_URL",
        "MONDE_V2_SYNC_ENABLED",
        "MONDE_V2_SYNC_DIRECTION",
        "MONDE_IMPORT_LAST_PAGE",
        "MONDE_IMPORT_STATUS",
      ]);

    const config = (settings || []).reduce(
      (acc, s) => { acc[s.key] = s.value; return acc; },
      {} as Record<string, string>
    );

    const syncEnabled = config["MONDE_V2_SYNC_ENABLED"] === "true";
    const syncDirection = config["MONDE_V2_SYNC_DIRECTION"] || "bidirectional";

    if (!syncEnabled) {
      return jsonResponse({ skipped: true, reason: "MONDE_V2_SYNC_ENABLED is false" });
    }

    if (syncDirection === "outbound_only") {
      return jsonResponse({ skipped: true, reason: "Sync direction is outbound_only" });
    }

    // --- Authenticate ---
    const auth = getMondeV2Credentials(config);
    if (!auth.login || !auth.password) {
      return jsonResponse({ error: "Monde V2 credentials not configured" }, 500);
    }

    let token = await getMondeV2Token(auth);

    // --- Single person import ---
    if (singlePersonId) {
      const url = `${auth.apiUrl}/people/${singlePersonId}`;
      const response = await fetch(url, { headers: mondeV2Headers(token) });

      if (!response.ok) {
        return jsonResponse(
          { error: `Failed to fetch person ${singlePersonId}: ${response.status}` },
          response.status
        );
      }

      const json = await response.json();
      const results = await processPage(supabase, [json.data], forceUpdate);

      return jsonResponse({
        total_fetched: 1,
        created: results.filter((r) => r.status === "created").length,
        updated: results.filter((r) => r.status === "updated").length,
        skipped: results.filter((r) => r.status === "skipped").length,
        errors: results.filter((r) => r.status === "error").length,
        results,
      });
    }

    // --- Search mode (existing behavior) ---
    if (searchName || searchCode) {
      let url = `${auth.apiUrl}/people?page[number]=1&page[size]=${PAGE_SIZE}`;
      if (searchName) url += `&filter[search]=${encodeURIComponent(searchName)}`;
      if (searchCode) url += `&filter[code]=${encodeURIComponent(searchCode)}`;

      const response = await fetch(url, { headers: mondeV2Headers(token) });
      if (!response.ok) {
        return jsonResponse({ error: `Monde API error: ${response.status}` }, 502);
      }

      const json = await response.json();
      const people = json.data || [];

      if (debugMode) {
        return jsonResponse({
          debug: true,
          links: json.links,
          meta: json.meta,
          data_count: people.length,
          sample: people.slice(0, 3).map((p: { id: string; attributes: Record<string, unknown> }) => ({
            id: p.id,
            name: p.attributes?.name,
            code: p.attributes?.code,
            phone: p.attributes?.phone,
            email: p.attributes?.email,
          })),
          total_pages: json.links?.last
            ? new URL(json.links.last).searchParams.get("page[number]")
            : null,
        });
      }

      // Fetch remaining pages for search
      const allPeople = [...people];
      if (json.links?.next && people.length === PAGE_SIZE) {
        const maxSearchPages = Math.min(pageLimit, 10);
        for (let p = 2; p <= maxSearchPages; p++) {
          let pageUrl = `${auth.apiUrl}/people?page[number]=${p}&page[size]=${PAGE_SIZE}`;
          if (searchName) pageUrl += `&filter[search]=${encodeURIComponent(searchName)}`;
          if (searchCode) pageUrl += `&filter[code]=${encodeURIComponent(searchCode)}`;

          const pageResp = await fetch(pageUrl, { headers: mondeV2Headers(token) });
          if (!pageResp.ok) break;
          const pageJson = await pageResp.json();
          const pagePeople = pageJson.data || [];
          if (pagePeople.length === 0) break;
          allPeople.push(...pagePeople);
          if (pagePeople.length < PAGE_SIZE || !pageJson.links?.next) break;
          await new Promise((r) => setTimeout(r, 200));
        }
      }

      const results = await processPage(supabase, allPeople, forceUpdate);

      return jsonResponse({
        total_fetched: allPeople.length,
        created: results.filter((r) => r.status === "created").length,
        updated: results.filter((r) => r.status === "updated").length,
        skipped: results.filter((r) => r.status === "skipped").length,
        errors: results.filter((r) => r.status === "error").length,
        results,
      });
    }

    // --- Debug mode without search ---
    if (debugMode) {
      const url = `${auth.apiUrl}/people?page[number]=1&page[size]=${PAGE_SIZE}`;
      const response = await fetch(url, { headers: mondeV2Headers(token) });
      const json = await response.json();
      const people = json.data || [];

      return jsonResponse({
        debug: true,
        links: json.links,
        data_count: people.length,
        sample: people.slice(0, 3).map((p: { id: string; attributes: Record<string, unknown> }) => ({
          id: p.id,
          name: p.attributes?.name,
          code: p.attributes?.code,
          phone: p.attributes?.phone,
          email: p.attributes?.email,
        })),
        total_pages: json.links?.last
          ? new URL(json.links.last).searchParams.get("page[number]")
          : null,
      });
    }

    // --- Determine mode ---
    let mode = requestedMode;
    if (mode === "reset") {
      await setSetting(supabase, "MONDE_IMPORT_LAST_PAGE", "0");
      await setSetting(supabase, "MONDE_IMPORT_STATUS", "bulk");
      mode = "bulk";
    }

    if (mode === "auto") {
      const status = config["MONDE_IMPORT_STATUS"] || "idle";
      mode = status === "complete" ? "maintenance" : "bulk";
    }

    // --- BULK MODE ---
    if (mode === "bulk") {
      const lastPage = parseInt(config["MONDE_IMPORT_LAST_PAGE"] || "0", 10);
      const startPage = lastPage + 1;
      const maxPage = startPage + pageLimit - 1;

      await setSetting(supabase, "MONDE_IMPORT_STATUS", "bulk");

      const allResults: ImportResult[] = [];
      let currentPage = startPage;
      let totalFetched = 0;
      let reachedEnd = false;
      let pagesProcessed = 0;

      while (currentPage <= maxPage) {
        const url = `${auth.apiUrl}/people?page[number]=${currentPage}&page[size]=${PAGE_SIZE}&sort=-code`;

        let response = await fetch(url, { headers: mondeV2Headers(token) });

        if (response.status === 401) {
          invalidateMondeV2Token();
          token = await getMondeV2Token(auth);
          response = await fetch(url, { headers: mondeV2Headers(token) });
        }

        if (!response.ok) {
          console.error(`[monde-people-import] Page ${currentPage} failed: ${response.status}`);
          break;
        }

        const json = await response.json();
        const people = json.data || [];

        if (people.length === 0) {
          reachedEnd = true;
          break;
        }

        totalFetched += people.length;
        pagesProcessed++;
        const pageResults = await processPage(supabase, people, false);
        allResults.push(...pageResults);

        // Save cursor after each page
        await setSetting(supabase, "MONDE_IMPORT_LAST_PAGE", String(currentPage));

        if (people.length < PAGE_SIZE || !json.links?.next) {
          reachedEnd = true;
          break;
        }

        currentPage++;
        await new Promise((r) => setTimeout(r, 200));
      }

      if (reachedEnd) {
        await setSetting(supabase, "MONDE_IMPORT_STATUS", "complete");
      }

      const summary = {
        mode: "bulk",
        pages_processed: pagesProcessed,
        start_page: startPage,
        last_page: startPage + pagesProcessed - 1,
        reached_end: reachedEnd,
        total_fetched: totalFetched,
        created: allResults.filter((r) => r.status === "created").length,
        updated: allResults.filter((r) => r.status === "updated").length,
        skipped: allResults.filter((r) => r.status === "skipped").length,
        errors: allResults.filter((r) => r.status === "error").length,
      };

      console.log(`[monde-people-import] Bulk: pages ${startPage}-${currentPage}, ${summary.created} created, ${summary.updated} updated, ${summary.skipped} skipped`);

      return jsonResponse(summary);
    }

    // --- MAINTENANCE MODE ---
    if (mode === "maintenance") {
      const allResults: ImportResult[] = [];
      let consecutiveExisting = 0;
      let page = 1;
      let totalFetched = 0;
      const maxMaintenancePages = Math.min(pageLimit, 100);

      while (page <= maxMaintenancePages) {
        const url = `${auth.apiUrl}/people?page[number]=${page}&page[size]=${PAGE_SIZE}&sort=-registered-at`;

        let response = await fetch(url, { headers: mondeV2Headers(token) });

        if (response.status === 401) {
          invalidateMondeV2Token();
          token = await getMondeV2Token(auth);
          response = await fetch(url, { headers: mondeV2Headers(token) });
        }

        if (!response.ok) break;

        const json = await response.json();
        const people = json.data || [];

        if (people.length === 0) break;

        totalFetched += people.length;
        const pageResults = await processPage(supabase, people, false);
        allResults.push(...pageResults);

        // Count consecutive already-linked contacts
        for (const result of pageResults) {
          if (result.match_type === "monde_id" && result.status === "skipped") {
            consecutiveExisting++;
          } else {
            consecutiveExisting = 0;
          }
        }

        // Stop if we've seen enough consecutive existing contacts
        if (consecutiveExisting >= MAINTENANCE_STOP_THRESHOLD) {
          break;
        }

        if (people.length < PAGE_SIZE || !json.links?.next) break;

        page++;
        await new Promise((r) => setTimeout(r, 200));
      }

      const summary = {
        mode: "maintenance",
        pages_scanned: page,
        stopped_reason: consecutiveExisting >= MAINTENANCE_STOP_THRESHOLD
          ? "consecutive_existing_threshold"
          : "end_of_data",
        total_fetched: totalFetched,
        created: allResults.filter((r) => r.status === "created").length,
        updated: allResults.filter((r) => r.status === "updated").length,
        skipped: allResults.filter((r) => r.status === "skipped").length,
        errors: allResults.filter((r) => r.status === "error").length,
      };

      console.log(`[monde-people-import] Maintenance: ${page} pages, ${summary.created} created, ${summary.skipped} skipped, stopped: ${summary.stopped_reason}`);

      return jsonResponse(summary);
    }

    return jsonResponse({ error: `Unknown mode: ${mode}` }, 400);
  } catch (err) {
    console.error("[monde-people-import] Unexpected error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : String(err) },
      500
    );
  }
});
