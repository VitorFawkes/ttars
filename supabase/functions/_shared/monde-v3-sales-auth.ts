/**
 * Monde V3 Sales API — Auth & HTTP helpers (INBOUND read)
 *
 * A API V3 de vendas usa HTTP Basic Auth com um TOKEN JÁ PRONTO (base64 de
 * `login:senha`) gerado no painel do Monde. Esse token vem no secret
 * `MONDE_V3_API_KEY` e é usado verbatim no header `Authorization: Basic <token>`.
 *
 * Gotchas confirmados (2026-06):
 *  - `Content-Type: application/json` é OBRIGATÓRIO (sem ele → 415 antes da auth).
 *  - O filtro `period_start`/`period_end` é pela DATA DA VIAGEM, não pela data da venda.
 *  - Sem filtro, a listagem vem ordenada por data da venda (mais recente primeiro).
 *  - Rate limit: 60 req / 3s por IP.
 */

const BASE_URL_DEFAULT = "https://web.monde.com.br/api/v3";

export interface MondeV3Auth {
  apiUrl: string;
  apiKey: string;
}

export interface MondeSalesPage {
  data: MondeSale[];
  pagination: {
    page: number;
    size: number;
    total: number;
    total_pages: number;
  };
}

// Estrutura parcial — só o que a importação consome.
export interface MondeSale {
  sale_id?: string;
  sale_number?: number | string;
  sale_date?: string | null;
  status?: string | null;
  observations?: string | null;
  totals?: {
    products?: number | null;
    taxes?: number | null;
    discount?: number | null;
    revenue?: number | null;
    final_value?: number | null;
  } | null;
  // arrays de produto (cada item é um produto com totals/supplier/passengers/datas)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [productArray: string]: any;
}

/** Lê a credencial V3 dos secrets. apiUrl pode ser sobrescrita por integration_settings. */
export function getMondeV3Auth(config: Record<string, string>): MondeV3Auth {
  const apiUrl = (config["MONDE_API_URL"] || BASE_URL_DEFAULT).replace(/\/+$/, "");
  const apiKey = (Deno.env.get("MONDE_V3_API_KEY") || "").trim();
  return { apiUrl, apiKey };
}

export function mondeV3Headers(apiKey: string): Record<string, string> {
  return {
    Authorization: `Basic ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

async function getJson(
  url: string,
  apiKey: string,
  attempt = 0
): Promise<Response> {
  const res = await fetch(url, { headers: mondeV3Headers(apiKey) });
  if (!res.ok && RETRYABLE.has(res.status) && attempt < 3) {
    // backoff: 1.5s, 3s, 6s — respeita rate limit
    await new Promise((r) => setTimeout(r, 1500 * Math.pow(2, attempt)));
    return getJson(url, apiKey, attempt + 1);
  }
  return res;
}

export interface SalesQuery {
  period_start?: string; // data da VIAGEM (ISO YYYY-MM-DD)
  period_end?: string;
  page?: number;
  size?: number;
}

/** Busca uma página de vendas. Lança em status não-ok não-retryável. */
export async function fetchSalesPage(
  auth: MondeV3Auth,
  q: SalesQuery
): Promise<MondeSalesPage> {
  const params = new URLSearchParams();
  if (q.period_start) params.set("period_start", q.period_start);
  if (q.period_end) params.set("period_end", q.period_end);
  params.set("page", String(q.page ?? 1));
  params.set("size", String(q.size ?? 100));
  const url = `${auth.apiUrl}/sales?${params.toString()}`;

  const res = await getJson(url, auth.apiKey);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Monde V3 GET /sales falhou (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  return {
    data: Array.isArray(json?.data) ? json.data : [],
    pagination: json?.pagination ?? { page: 1, size: 0, total: 0, total_pages: 0 },
  };
}

/** Lista de chaves de array de produto numa venda V3. */
export const PRODUCT_ARRAYS = [
  "insurances",
  "cruises",
  "hotels",
  "airline_tickets",
  "train_tickets",
  "ground_transportations",
  "car_rentals",
  "travel_packages",
] as const;
