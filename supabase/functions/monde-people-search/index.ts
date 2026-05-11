import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  getMondeV2Credentials,
  getMondeV2Token,
  mondeV2Headers,
  invalidateMondeV2Token,
} from "../_shared/monde-v2-auth.ts";

/**
 * monde-people-search — Busca leve no Monde V2 People API
 *
 * Retorna resultados do Monde SEM importar no CRM.
 * Usado pelo frontend para "Buscar no Monde" quando contato não é encontrado localmente.
 *
 * POST /monde-people-search
 *   { "search": "Luiza Mara", "limit": 10 }
 *   → [{ monde_person_id, name, email, phone, cpf, code }]
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface MondePersonResult {
  monde_person_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  cpf: string | null;
  code: number | null;
  registered_at: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const searchTerm = body.search?.trim();
    const limit = Math.min(body.limit || 10, 50);

    if (!searchTerm || searchTerm.length < 2) {
      return jsonResponse({ error: "search must be at least 2 characters" }, 400);
    }

    // Get sync config
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: settings } = await supabase
      .from("integration_settings")
      .select("key, value")
      .in("key", ["MONDE_V2_API_URL", "MONDE_V2_SYNC_ENABLED"]);

    const config = (settings || []).reduce(
      (acc, s) => { acc[s.key] = s.value; return acc; },
      {} as Record<string, string>
    );

    if (config["MONDE_V2_SYNC_ENABLED"] !== "true") {
      return jsonResponse({ error: "Monde sync is disabled" }, 503);
    }

    // Authenticate
    const auth = getMondeV2Credentials(config);
    if (!auth.login || !auth.password) {
      return jsonResponse({ error: "Monde V2 credentials not configured" }, 500);
    }

    let token = await getMondeV2Token(auth);

    // Search Monde API
    const pageSize = Math.min(limit, 50);
    const url = `${auth.apiUrl}/people?filter[search]=${encodeURIComponent(searchTerm)}&page[number]=1&page[size]=${pageSize}`;

    let response = await fetch(url, { headers: mondeV2Headers(token) });

    // Retry on 401
    if (response.status === 401) {
      invalidateMondeV2Token();
      token = await getMondeV2Token(auth);
      response = await fetch(url, { headers: mondeV2Headers(token) });
    }

    if (!response.ok) {
      return jsonResponse(
        { error: `Monde API error: ${response.status}` },
        response.status === 429 ? 429 : 502
      );
    }

    const json = await response.json();
    const people = json.data || [];

    // Map to clean response format
    const results: MondePersonResult[] = people.map(
      (p: { id: string; attributes: Record<string, unknown> }) => ({
        monde_person_id: p.id,
        name: (p.attributes.name as string) || "",
        email: (p.attributes.email as string) || null,
        phone:
          (p.attributes["mobile-phone"] as string) ||
          (p.attributes.phone as string) ||
          (p.attributes["business-phone"] as string) ||
          null,
        cpf: (p.attributes.cpf as string) || null,
        code: (p.attributes.code as number) || null,
        registered_at: (p.attributes["registered-at"] as string) || null,
      })
    );

    // Check which monde_person_ids already exist in CRM
    const mondeIds = results.map((r) => r.monde_person_id);
    const { data: existingContatos } = await supabase
      .from("contatos")
      .select("id, monde_person_id")
      .in("monde_person_id", mondeIds)
      .is("deleted_at", null);

    const existingMap = new Map(
      (existingContatos || []).map((c) => [c.monde_person_id, c.id])
    );

    // Enrich results with CRM status
    const enrichedResults = results.map((r) => ({
      ...r,
      already_in_crm: existingMap.has(r.monde_person_id),
      crm_contato_id: existingMap.get(r.monde_person_id) || null,
    }));

    return jsonResponse({
      results: enrichedResults,
      total_in_monde: people.length,
      search_term: searchTerm,
    });
  } catch (err) {
    console.error("[monde-people-search] Error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : String(err) },
      500
    );
  }
});
