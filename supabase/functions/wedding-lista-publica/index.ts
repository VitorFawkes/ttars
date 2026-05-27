// Edge Function: wedding-lista-publica
//
// Endpoint público (verify_jwt = false) que serve a planilha de convidados
// do casal. Autenticação é pelo código de 6+ chars no path.
//
// Rotas (POST com action body, mais simples que routing):
//   POST /functions/v1/wedding-lista-publica
//     body: { action, codigo, ...args }
//
// Actions:
//   - get_lista                 → { casal, convites: [{ ..., pessoas: [] }] }
//   - upsert_convite            → { convite_id }  (cria se id null)
//   - delete_convite            → { ok }
//   - reorder_convites          → { ok }
//   - upsert_pessoa             → { guest_id }
//   - delete_pessoa             → { ok }
//
// Rate limit: limpo, 60 req/min por código + IP combinados.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

// ── Rate limit em memória (best-effort, sem persistência cross-instance) ──
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 60;
const buckets = new Map<string, number[]>();

function rateLimitHit(key: string): boolean {
  const now = Date.now();
  const arr = (buckets.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) {
    buckets.set(key, arr);
    return true;
  }
  arr.push(now);
  buckets.set(key, arr);
  return false;
}

function extractClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

// Valida o formato do código (A-Z0-9-, 4-16 chars)
function validCodigo(codigo: unknown): codigo is string {
  return typeof codigo === "string" &&
    /^[A-Z0-9-]{4,16}$/.test(codigo);
}

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const action = String(payload.action || "").trim();
  const codigo = String(payload.codigo || "").toUpperCase().trim();

  if (!action) return jsonResponse({ error: "missing_action" }, 400);
  if (!validCodigo(codigo)) {
    return jsonResponse({ error: "invalid_codigo" }, 400);
  }

  const ip = extractClientIp(req);
  if (rateLimitHit(`${codigo}|${ip}`)) {
    return jsonResponse({ error: "rate_limited" }, 429);
  }

  try {
    switch (action) {
      case "get_lista": {
        const { data, error } = await admin.rpc("wedding_casal_get_by_codigo", {
          p_codigo: codigo,
        });
        if (error) throw error;
        if (!data) return jsonResponse({ error: "not_found" }, 404);
        return jsonResponse(data);
      }

      case "upsert_convite": {
        const { convite_id, nome, posicao } = payload as {
          convite_id?: string | null;
          nome?: string;
          posicao?: number;
        };
        const { data, error } = await admin.rpc(
          "wedding_casal_upsert_convite",
          {
            p_codigo: codigo,
            p_convite_id: convite_id || null,
            p_nome: nome ?? null,
            p_posicao: typeof posicao === "number" ? posicao : null,
          },
        );
        if (error) throw error;
        return jsonResponse({ convite_id: data });
      }

      case "delete_convite": {
        const { convite_id } = payload as { convite_id: string };
        if (!convite_id) {
          return jsonResponse({ error: "missing_convite_id" }, 400);
        }
        const { data, error } = await admin.rpc(
          "wedding_casal_delete_convite",
          { p_codigo: codigo, p_convite_id: convite_id },
        );
        if (error) throw error;
        return jsonResponse({ ok: data === true });
      }

      case "reorder_convites": {
        const { ids } = payload as { ids: string[] };
        if (!Array.isArray(ids)) {
          return jsonResponse({ error: "ids_must_be_array" }, 400);
        }
        const { error } = await admin.rpc(
          "wedding_casal_reorder_convites",
          { p_codigo: codigo, p_ids: ids },
        );
        if (error) throw error;
        return jsonResponse({ ok: true });
      }

      case "upsert_pessoa": {
        const {
          convite_id,
          guest_id,
          nome,
          telefone,
          email,
          faixa,
          lado,
          tipo,
          observacoes,
          posicao,
        } = payload as Record<string, string | number | null | undefined>;

        if (!convite_id) {
          return jsonResponse({ error: "missing_convite_id" }, 400);
        }
        const { data, error } = await admin.rpc(
          "wedding_casal_upsert_pessoa",
          {
            p_codigo: codigo,
            p_convite_id: convite_id as string,
            p_guest_id: (guest_id as string) || null,
            p_nome: (nome as string) ?? null,
            p_telefone: (telefone as string) ?? null,
            p_email: (email as string) ?? null,
            p_faixa: (faixa as string) ?? "adulto",
            p_lado: (lado as string) ?? null,
            p_tipo: (tipo as string) ?? null,
            p_observacoes: (observacoes as string) ?? null,
            p_posicao: typeof posicao === "number" ? posicao : null,
          },
        );
        if (error) throw error;
        return jsonResponse({ guest_id: data });
      }

      case "delete_pessoa": {
        const { guest_id } = payload as { guest_id: string };
        if (!guest_id) {
          return jsonResponse({ error: "missing_guest_id" }, 400);
        }
        const { data, error } = await admin.rpc(
          "wedding_casal_delete_pessoa",
          { p_codigo: codigo, p_guest_id: guest_id },
        );
        if (error) throw error;
        return jsonResponse({ ok: data === true });
      }

      default:
        return jsonResponse({ error: "unknown_action", action }, 400);
    }
  } catch (e) {
    const err = e as Error & { code?: string };
    const code = err.code ?? "";
    const message = err.message ?? "internal_error";
    // Mapeia erros conhecidos do Postgres pra HTTP code
    if (code === "no_data_found" || /não encontrad/.test(message)) {
      return jsonResponse({ error: message }, 404);
    }
    if (code === "insufficient_privilege" || /encerrad/.test(message)) {
      return jsonResponse({ error: message }, 403);
    }
    console.error("wedding-lista-publica error:", e);
    return jsonResponse({ error: message }, 500);
  }
}

Deno.serve(handle);
