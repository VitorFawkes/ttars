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
 * Busca todas as pessoas do Monde (paginado) e faz upsert nos contatos.
 * Dedup: monde_person_id → CPF normalizado → email.
 * Merge inteligente: só preenche campos vazios no contato existente.
 *
 * Invocação:
 *   POST /monde-people-import {}                     — importa tudo
 *   POST /monde-people-import { page_limit: 5 }      — limita páginas (teste)
 *   POST /monde-people-import { monde_person_id: "x"} — importa 1 pessoa
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGES = 100; // Safety limit: 5000 pessoas max

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
    const pageLimit = body.page_limit || MAX_PAGES;
    const singlePersonId = body.monde_person_id || null;

    // --- 1. Check sync enabled ---
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

    if (syncDirection === "outbound_only") {
      return jsonResponse({
        skipped: true,
        reason: "Sync direction is outbound_only",
      });
    }

    // --- 2. Authenticate ---
    const auth = getMondeV2Credentials(config);

    if (!auth.login || !auth.password) {
      return jsonResponse(
        {
          error: "Monde V2 credentials not configured",
          details: "Set MONDE_V2_LOGIN/MONDE_V2_PASSWORD secrets",
        },
        500
      );
    }

    let token = await getMondeV2Token(auth);

    // --- 3. Fetch people from Monde ---
    const allPeople: MondePersonResponse["data"][] = [];

    if (singlePersonId) {
      // Fetch single person
      const url = `${auth.apiUrl}/people/${singlePersonId}`;
      const response = await fetch(url, {
        headers: mondeV2Headers(token),
      });

      if (!response.ok) {
        return jsonResponse(
          {
            error: `Failed to fetch person ${singlePersonId}: ${response.status}`,
          },
          response.status
        );
      }

      const json = await response.json();
      allPeople.push(json.data);
    } else {
      // Paginated fetch
      let page = 1;
      let hasMore = true;

      while (hasMore && page <= pageLimit) {
        const url = `${auth.apiUrl}/people?page[number]=${page}&page[size]=${DEFAULT_PAGE_SIZE}`;

        let response = await fetch(url, {
          headers: mondeV2Headers(token),
        });

        // Retry on 401
        if (response.status === 401) {
          invalidateMondeV2Token();
          token = await getMondeV2Token(auth);
          response = await fetch(url, {
            headers: mondeV2Headers(token),
          });
        }

        if (!response.ok) {
          console.error(
            `[monde-people-import] Page ${page} failed: ${response.status}`
          );
          break;
        }

        const json = await response.json();
        const people = json.data || [];

        if (people.length === 0) {
          hasMore = false;
        } else {
          allPeople.push(...people);
          page++;

          // Check if there's a next page via links
          if (!json.links?.last || people.length < DEFAULT_PAGE_SIZE) {
            hasMore = false;
          }
        }

        // Rate limit: max 60 req / 3 sec → ~20 req/sec. Be conservative.
        if (hasMore) {
          await new Promise((r) => setTimeout(r, 200));
        }
      }
    }

    console.log(
      `[monde-people-import] Fetched ${allPeople.length} people from Monde`
    );

    // --- 4. Upsert each person into contatos ---
    // Nota: set_monde_import_flag() não funciona aqui pois set_config é transaction-local
    // e cada .update() do Supabase JS é uma transação separada (pgbouncer).
    // O anti-loop é garantido pelo trigger: INSERTs com monde_person_id já preenchido
    // são ignorados, e UPDATEs só enfileiram campos de negócio (não monde_person_id/monde_last_sync).
    const results: ImportResult[] = [];

    for (const mondePerson of allPeople) {
      try {
        const mapped = mapMondePersonToContato(mondePerson);
        const mondePersonId = mondePerson.id;
        const now = new Date().toISOString();

        // === DEDUP STEP 1: Link direto por monde_person_id ===
        let existingContato: Record<string, unknown> | null = null;
        let matchType: ImportResult["match_type"] = "new";
        let matchConfidence: ImportResult["match_confidence"] = "new";

        const { data: byMondeId } = await supabase
          .from("contatos")
          .select("*")
          .eq("monde_person_id", mondePersonId)
          .is("deleted_at", null)
          .maybeSingle();

        if (byMondeId) {
          existingContato = byMondeId;
          matchType = "monde_id";
          matchConfidence = "exact_link";
        }

        // === DEDUP STEP 2: Usar RPC check_contact_duplicates (5 níveis de match) ===
        if (!existingContato) {
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
            // Pegar o match de maior confiança (primeiro resultado — RPC retorna em ordem de prioridade)
            const bestMatch = duplicates[0];
            matchType = bestMatch.match_type as ImportResult["match_type"];

            // Classificar confiança
            const highConfidenceTypes = ["cpf", "email", "telefone", "telefone_meios"];
            matchConfidence = highConfidenceTypes.includes(bestMatch.match_type) ? "high" : "low";

            // Buscar contato completo para merge
            const { data: fullContato } = await supabase
              .from("contatos")
              .select("*")
              .eq("id", bestMatch.contact_id)
              .maybeSingle();

            if (fullContato) {
              existingContato = fullContato;
            }
          }
        }

        // === AÇÃO: UPDATE ou CREATE ===
        if (existingContato) {
          // Bug 2 guard: não sobrescrever monde_person_id de contato já vinculado a outro Monde person
          const existingMondeId = existingContato.monde_person_id as string | null;
          if (existingMondeId && existingMondeId !== mondePersonId) {
            console.warn(
              `[monde-people-import] Conflito: contato ${existingContato.id} já vinculado a ${existingMondeId}, pulando monde_person_id=${mondePersonId}`
            );
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

          const updates = mergeContatoFields(
            existingContato as Partial<typeof mapped>,
            mapped
          );
          updates.monde_last_sync = now;

          if (Object.keys(updates).length > 0) {
            const { error: updateError } = await supabase
              .from("contatos")
              .update(updates)
              .eq("id", existingContato.id);

            if (updateError) {
              results.push({
                monde_person_id: mondePersonId,
                contato_id: existingContato.id as string,
                status: "error",
                match_type: matchType,
                match_confidence: matchConfidence,
                error: updateError.message,
              });
              continue;
            }

            results.push({
              monde_person_id: mondePersonId,
              contato_id: existingContato.id as string,
              status: "updated",
              match_type: matchType,
              match_confidence: matchConfidence,
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
          // Create new contato (exclude generated columns)
          const {
            cpf_normalizado: _cpf,
            telefone_normalizado: _tel,
            id: _id,
            ...insertFields
          } = mapped;

          // Skip contacts without phone (required by DB constraint)
          if (!insertFields.telefone) {
            results.push({
              monde_person_id: mondePersonId,
              status: "skipped",
              match_type: "new",
              match_confidence: "new",
              error: "Sem telefone — obrigatório para criar contato",
            });
            continue;
          }

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

          if (insertError) {
            results.push({
              monde_person_id: mondePersonId,
              status: "error",
              match_type: "new",
              match_confidence: "new",
              error: insertError.message,
            });
            continue;
          }

          results.push({
            monde_person_id: mondePersonId,
            contato_id: newContato?.id,
            status: "created",
            match_type: "new",
            match_confidence: "new",
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

    const summary = {
      total_fetched: allPeople.length,
      created: results.filter((r) => r.status === "created").length,
      updated: results.filter((r) => r.status === "updated").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      errors: results.filter((r) => r.status === "error").length,
      results,
    };

    console.log(
      `[monde-people-import] Done: ${summary.created} created, ${summary.updated} updated, ${summary.skipped} skipped, ${summary.errors} errors`
    );

    return jsonResponse(summary);
  } catch (err) {
    console.error("[monde-people-import] Unexpected error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : String(err) },
      500
    );
  }
});
