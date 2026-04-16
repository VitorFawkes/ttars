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
 * monde-people-sync — OUTBOUND: CRM → Monde V2 People API
 *
 * Recebe contato_id, busca dados do contato, e cria/atualiza pessoa no Monde.
 * Se monde_person_id existe → PATCH (update). Senão → POST (create).
 * Salva monde_person_id retornado no contato.
 *
 * Invocação:
 *   POST /monde-people-sync { contato_id: "uuid" }
 *   POST /monde-people-sync { contato_ids: ["uuid1", "uuid2"] }  (batch)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface MondeSearchHit {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  mobilePhone: string | null;
  cpf: string | null;
}

/**
 * Busca pessoa no Monde por nome e retorna matches.
 * Usado para dedup antes de criar pessoa nova.
 */
async function searchMondeByName(
  apiUrl: string,
  token: string,
  name: string
): Promise<MondeSearchHit[]> {
  const url = `${apiUrl}/people?filter[search]=${encodeURIComponent(name)}&page[number]=1&page[size]=20`;
  const response = await fetch(url, { headers: mondeV2Headers(token) });
  if (!response.ok) return [];
  const json = await response.json();
  const people = json.data || [];
  return people.map(
    (p: { id: string; attributes: Record<string, unknown> }) => ({
      id: p.id,
      name: ((p.attributes.name as string) || "").trim(),
      email: ((p.attributes.email as string) || "").trim().toLowerCase() || null,
      phone: (p.attributes.phone as string) || null,
      mobilePhone: (p.attributes["mobile-phone"] as string) || null,
      cpf: (p.attributes.cpf as string) || null,
    })
  );
}

function normalizeDigits(s: string | null): string {
  return (s || "").replace(/\D/g, "");
}

/**
 * Encontra a melhor pessoa no Monde que bate com o contato do CRM.
 * Prioridade: CPF > email > telefone. Retorna monde_person_id ou null.
 */
function findBestMondeMatch(
  hits: MondeSearchHit[],
  contato: ContatoRecord
): string | null {
  if (hits.length === 0) return null;

  const contatoCpf = normalizeDigits(contato.cpf_normalizado || contato.cpf);
  const contatoEmail = (contato.email || "").trim().toLowerCase();
  const contatoPhone = normalizeDigits(contato.telefone);

  // 1. CPF match (mais confiável)
  if (contatoCpf.length === 11) {
    const match = hits.find((h) => normalizeDigits(h.cpf) === contatoCpf);
    if (match) return match.id;
  }

  // 2. Email match
  if (contatoEmail) {
    const match = hits.find((h) => h.email === contatoEmail);
    if (match) return match.id;
  }

  // 3. Telefone match (qualquer campo de phone no Monde)
  if (contatoPhone.length >= 10) {
    const match = hits.find(
      (h) =>
        normalizeDigits(h.phone) === contatoPhone ||
        normalizeDigits(h.mobilePhone) === contatoPhone
    );
    if (match) return match.id;
  }

  return null;
}

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

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // --- 1. Parse input ---
    const body = await req.json();
    const contatoIds: string[] = body.contato_ids
      ? body.contato_ids
      : body.contato_id
        ? [body.contato_id]
        : [];

    if (contatoIds.length === 0) {
      return jsonResponse(
        { error: "contato_id or contato_ids required" },
        400
      );
    }

    // --- 2. Check if sync is enabled ---
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

    const syncEnabled = config["MONDE_V2_SYNC_ENABLED"] === "true";
    const syncDirection = config["MONDE_V2_SYNC_DIRECTION"] || "bidirectional";

    if (!syncEnabled) {
      return jsonResponse({
        skipped: true,
        reason: "MONDE_V2_SYNC_ENABLED is false",
      });
    }

    if (syncDirection === "inbound_only") {
      return jsonResponse({
        skipped: true,
        reason: "Sync direction is inbound_only",
      });
    }

    // --- 3. Get Monde V2 credentials & authenticate ---
    const auth = getMondeV2Credentials(config);

    if (!auth.login || !auth.password) {
      return jsonResponse(
        {
          error: "Monde V2 credentials not configured",
          details:
            "Set MONDE_V2_LOGIN and MONDE_V2_PASSWORD (or MONDE_USERNAME/MONDE_PASSWORD) as secrets",
        },
        500
      );
    }

    let token = await getMondeV2Token(auth);

    // --- 4. Fetch contatos ---
    const { data: contatos, error: fetchError } = await supabase
      .from("contatos")
      .select(
        "id, nome, sobrenome, email, telefone, telefone_normalizado, cpf, cpf_normalizado, rg, passaporte, passaporte_validade, data_nascimento, sexo, tipo_cliente, observacoes, endereco, monde_person_id"
      )
      .in("id", contatoIds)
      .is("deleted_at", null);

    if (fetchError) {
      console.error("[monde-people-sync] fetch error:", fetchError);
      return jsonResponse({ error: "Failed to fetch contatos" }, 500);
    }

    if (!contatos || contatos.length === 0) {
      return jsonResponse({ error: "No contatos found" }, 404);
    }

    // --- 5. Sync each contato ---
    const results: Array<{
      contato_id: string;
      status: "created" | "updated" | "skipped" | "error";
      monde_person_id?: string;
      error?: string;
    }> = [];

    for (const contato of contatos as ContatoRecord[]) {
      try {
        const payload = mapContatoToMondePerson(contato);

        if (!payload) {
          results.push({
            contato_id: contato.id,
            status: "skipped",
            error: "Contato sem nome válido",
          });
          continue;
        }

        let mondeId = contato.monde_person_id;

        // Dedup: se não tem monde_person_id, buscar no Monde antes de criar
        if (!mondeId) {
          const fullName = [contato.nome, contato.sobrenome]
            .filter(Boolean)
            .join(" ");
          try {
            let hits = await searchMondeByName(auth.apiUrl, token, fullName);
            if (hits.length === 0 && contato.email) {
              // Fallback: buscar por email se nome não achou nada
              hits = await searchMondeByName(auth.apiUrl, token, contato.email);
            }
            const matchId = findBestMondeMatch(hits, contato);
            if (matchId) {
              mondeId = matchId;
              console.log(
                `[monde-people-sync] Dedup: encontrou ${matchId} no Monde para contato ${contato.id} (${fullName})`
              );
            }
          } catch (err) {
            console.warn(
              `[monde-people-sync] Dedup search failed for ${contato.id}, will create new:`,
              err
            );
          }
        }

        const isUpdate = !!mondeId;
        const url = isUpdate
          ? `${auth.apiUrl}/people/${mondeId}`
          : `${auth.apiUrl}/people`;
        const method = isUpdate ? "PATCH" : "POST";

        // If updating, include id in payload
        if (isUpdate) {
          (payload.data as Record<string, unknown>).id = mondeId;
        }

        let response = await fetch(url, {
          method,
          headers: mondeV2Headers(token),
          body: JSON.stringify(payload),
        });

        // Retry on 401 (token expired)
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
            `[monde-people-sync] ${method} failed for ${contato.id}:`,
            response.status,
            errorBody
          );
          results.push({
            contato_id: contato.id,
            status: "error",
            error: `Monde API ${response.status}: ${errorBody.slice(0, 200)}`,
          });
          continue;
        }

        const responseData = await response.json();
        const mondePersonId = responseData?.data?.id;

        // Save monde_person_id back to contato
        if (mondePersonId && mondePersonId !== contato.monde_person_id) {
          await supabase
            .from("contatos")
            .update({ monde_person_id: mondePersonId, monde_last_sync: new Date().toISOString() })
            .eq("id", contato.id);
        }

        results.push({
          contato_id: contato.id,
          status: isUpdate ? "updated" : "created",
          monde_person_id: mondePersonId,
        });

        console.log(
          `[monde-people-sync] ${isUpdate ? "Updated" : "Created"} person for contato ${contato.id} → ${mondePersonId}`
        );
      } catch (err) {
        console.error(
          `[monde-people-sync] Error syncing contato ${contato.id}:`,
          err
        );
        results.push({
          contato_id: contato.id,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const summary = {
      total: results.length,
      created: results.filter((r) => r.status === "created").length,
      updated: results.filter((r) => r.status === "updated").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      errors: results.filter((r) => r.status === "error").length,
      results,
    };

    console.log(
      `[monde-people-sync] Done: ${summary.created} created, ${summary.updated} updated, ${summary.errors} errors`
    );

    return jsonResponse(summary);
  } catch (err) {
    console.error("[monde-people-sync] Unexpected error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : String(err) },
      500
    );
  }
});
