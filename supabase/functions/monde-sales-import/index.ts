import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  getMondeV3Auth,
  fetchSalesPage,
  PRODUCT_ARRAYS,
  type MondeSale,
  type MondeV3Auth,
} from "../_shared/monde-v3-sales-auth.ts";

/**
 * monde-sales-import — INBOUND: Monde V3 Sales API → CRM
 *
 * Lê vendas da API v3 do Monde e reconcilia em card_financial_items via a RPC
 * `bulk_import_financial_items` (v13), a MESMA máquina que processa a planilha.
 *
 * Os valores oficiais da venda (`totals.final_value` / `totals.revenue`) foram
 * validados 100% contra o relatório do Monde. A decomposição por produto usa
 * `totals.amount` como peso e ALOCA o valor/receita oficiais proporcionalmente,
 * garantindo que o total do card bata exatamente com o oficial.
 *
 * Modos (POST body):
 *   { mode: "probe" }                       — testa acesso, retorna total + amostra
 *   { mode: "window", pages?: N }           — varre as N páginas mais recentes (cron)
 *   { mode: "single", card_id: "uuid" }     — puxa só as vendas de um card (botão)
 *   { dry_run: true }                       — calcula tudo mas NÃO grava (teste seguro)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Welcome Trips (workspace) — onde vivem os cards com venda Monde.
const TRIPS_ORG_DEFAULT = "b0000000-0000-0000-0000-000000000001";
const DEFAULT_WINDOW_PAGES = 10; // 10 x 100 = 1000 vendas mais recentes

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isoDate = (v: unknown): string | null =>
  v ? String(v).slice(0, 10) : null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

const TYPE_LABEL: Record<string, string> = {
  insurances: "Seguro viagem",
  cruises: "Cruzeiro",
  hotels: "Hospedagem",
  airline_tickets: "Passagem aérea",
  train_tickets: "Bilhete de trem",
  ground_transportations: "Transporte terrestre",
  car_rentals: "Locação de veículo",
  travel_packages: "Pacote",
};

function productDescription(arr: string, p: AnyObj): string {
  return (
    p.package_name ||
    p.name ||
    p.accommodation_kind ||
    (typeof p.destination === "string" && p.destination !== "national" && p.destination !== "international"
      ? p.destination
      : null) ||
    TYPE_LABEL[arr] ||
    "Produto"
  );
}

function segDates(p: AnyObj): { ini: string | null; fim: string | null } {
  const segs: AnyObj[] = Array.isArray(p.segments) ? p.segments : [];
  const dates = segs
    .map((s) => s.departure_date || s.date || s.arrival_date)
    .filter(Boolean)
    .map((d) => isoDate(d))
    .sort();
  return { ini: dates[0] ?? null, fim: dates[dates.length - 1] ?? null };
}

function productDates(arr: string, p: AnyObj): { ini: string | null; fim: string | null } {
  switch (arr) {
    case "hotels":
      return { ini: isoDate(p.check_in), fim: isoDate(p.check_out) };
    case "insurances":
    case "travel_packages":
      return { ini: isoDate(p.begin_date), fim: isoDate(p.end_date) };
    case "cruises":
      return { ini: isoDate(p.departure_date), fim: isoDate(p.arrival_date) };
    case "car_rentals":
      return { ini: isoDate(p.pickup_date), fim: isoDate(p.dropoff_date) };
    case "airline_tickets":
    case "train_tickets":
    case "ground_transportations":
      return segDates(p);
    default:
      return { ini: null, fim: null };
  }
}

const PAX_FEE_FIELDS = [
  "fees", "boarding_fee", "booking_fee", "tip", "other_fees",
  "service_fee", "agency_fee", "rav_fee", "du_fee",
];

/** Valor do produto p/ usar como PESO na alocação. Prefere totals.amount. */
function productWeight(p: AnyObj): number {
  const t = p.totals as AnyObj | null;
  if (t && t.amount != null) return Number(t.amount) || 0;
  const paxes: AnyObj[] = Array.isArray(p.passengers) ? p.passengers : [];
  return paxes.reduce((sum, px) => {
    const base = Number(px.amount) || 0;
    const fees = PAX_FEE_FIELDS.reduce((a, f) => a + (Number(px[f]) || 0), 0);
    return sum + base + fees;
  }, 0);
}

function passengerNames(p: AnyObj): string[] {
  const paxes: AnyObj[] = Array.isArray(p.passengers) ? p.passengers : [];
  return paxes
    .map((px) => px?.person?.name)
    .filter((n: unknown): n is string => typeof n === "string" && n.trim().length > 0);
}

interface BulkProduct {
  description: string;
  sale_value: number;
  supplier_cost: number;
  fornecedor: string | null;
  representante: string | null;
  documento: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  data_cancelamento: string | null;
  passageiros: string[];
}

/** Ajusta resíduo de arredondamento no MAIOR item para a soma bater no alvo. */
function fixResidual(values: number[], target: number): number[] {
  if (values.length === 0) return values;
  const sum = round2(values.reduce((a, b) => a + b, 0));
  const diff = round2(target - sum);
  if (Math.abs(diff) >= 0.01) {
    let maxIdx = 0;
    for (let i = 1; i < values.length; i++) if (values[i] > values[maxIdx]) maxIdx = i;
    values[maxIdx] = round2(values[maxIdx] + diff);
  }
  return values;
}

/** Transforma uma venda V3 no payload por produto da bulk_import. */
function transformSale(sale: MondeSale): { monde_venda_num: string; products: BulkProduct[] } {
  const num = String(sale.sale_number ?? "");
  const totals = (sale.totals ?? {}) as AnyObj;
  const finalValue = Number(totals.final_value ?? 0);
  const revenue = Number(totals.revenue ?? 0);

  const raw: { arr: string; p: AnyObj }[] = [];
  for (const arr of PRODUCT_ARRAYS) {
    const list = (sale as AnyObj)[arr];
    if (Array.isArray(list)) for (const p of list) raw.push({ arr, p });
  }

  // Venda sem produtos detalhados: 1 item sintético com o total oficial.
  if (raw.length === 0) {
    if (!finalValue) return { monde_venda_num: num, products: [] };
    return {
      monde_venda_num: num,
      products: [{
        description: `Venda Monde ${num}`,
        sale_value: round2(finalValue),
        supplier_cost: round2(finalValue - revenue),
        fornecedor: null, representante: null, documento: null,
        data_inicio: null, data_fim: null, data_cancelamento: null, passageiros: [],
      }],
    };
  }

  const weights = raw.map(({ p }) => productWeight(p));
  const sumW = weights.reduce((a, b) => a + b, 0);
  const shares = raw.map((_, i) => (sumW > 0 ? weights[i] / sumW : 1 / raw.length));

  // Aloca valor e receita oficiais proporcionalmente; ajusta resíduo p/ bater exato.
  const saleValues = fixResidual(shares.map((s) => round2(finalValue * s)), round2(finalValue));
  const receitas = fixResidual(shares.map((s) => round2(revenue * s)), round2(revenue));

  const products: BulkProduct[] = raw.map(({ arr, p }, i) => {
    const { ini, fim } = productDates(arr, p);
    const cancelado = p.canceled_at
      ? isoDate(p.canceled_at)
      : (typeof p.status === "string" && /cancel/i.test(p.status) ? isoDate(sale.sale_date) : null);
    return {
      description: productDescription(arr, p),
      sale_value: saleValues[i],
      supplier_cost: round2(saleValues[i] - receitas[i]),
      fornecedor: (p.supplier && p.supplier.name) || null,
      representante: (p.representative && p.representative.name) || null,
      documento: p.booking_number || p.locator || null,
      data_inicio: ini,
      data_fim: fim,
      data_cancelamento: cancelado,
      passageiros: passengerNames(p),
    };
  });

  return { monde_venda_num: num, products };
}

function collectVendaNums(pd: AnyObj): string[] {
  const out = new Set<string>();
  const clean = (v: unknown) => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s || null;
  };
  const primary = clean(pd?.numero_venda_monde);
  if (primary) out.add(primary);
  const hist = pd?.numeros_venda_monde_historico;
  if (Array.isArray(hist)) for (const e of hist) {
    const n = clean(e?.numero);
    if (n) out.add(n);
  }
  return [...out];
}

/** Busca vendas por números: tenta janela de viagem; cai p/ varredura recente. */
async function findSalesByNumbers(
  auth: MondeV3Auth,
  vendaNums: string[],
  ini: string | null,
  fim: string | null
): Promise<MondeSale[]> {
  const want = new Set(vendaNums);
  const found: MondeSale[] = [];
  const got = new Set<string>();
  const collect = (sales: MondeSale[]) => {
    for (const s of sales) {
      const n = String(s.sale_number ?? "");
      if (want.has(n) && !got.has(n)) { got.add(n); found.push(s); }
    }
  };

  // 1) Janela de viagem (rápido), se o card tem datas
  if (ini && fim) {
    const pad = (d: string, days: number) => {
      const dt = new Date(d + "T00:00:00Z");
      dt.setUTCDate(dt.getUTCDate() + days);
      return dt.toISOString().slice(0, 10);
    };
    const start = pad(ini, -30), end = pad(fim, 30);
    for (let pg = 1; pg <= 8 && got.size < want.size; pg++) {
      const page = await fetchSalesPage(auth, { period_start: start, period_end: end, page: pg, size: 100 });
      collect(page.data);
      if (page.data.length === 0 || pg >= (page.pagination?.total_pages ?? pg)) break;
      await sleep(250);
    }
  }

  // 2) Fallback: varredura recente sem filtro
  for (let pg = 1; pg <= 30 && got.size < want.size; pg++) {
    const page = await fetchSalesPage(auth, { page: pg, size: 100 });
    collect(page.data);
    if (page.data.length === 0 || pg >= (page.pagination?.total_pages ?? pg)) break;
    await sleep(250);
  }
  return found;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Use POST" }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as AnyObj;
    const mode: string = body.mode || "window";
    const dryRun: boolean = body.dry_run === true;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Config de integration_settings
    const { data: cfgRows } = await supabase
      .from("integration_settings")
      .select("key, value")
      .in("key", ["MONDE_API_URL", "MONDE_V3_SYNC_ENABLED", "MONDE_V3_IMPORT_PAGES", "MONDE_V3_IMPORT_ORG_ID"]);
    const config: Record<string, string> = Object.fromEntries(
      (cfgRows ?? []).map((r: AnyObj) => [r.key, r.value])
    );

    const auth = getMondeV3Auth(config);
    if (!auth.apiKey) return jsonResponse({ error: "MONDE_V3_API_KEY ausente nos secrets" }, 500);
    const orgId = config["MONDE_V3_IMPORT_ORG_ID"] || TRIPS_ORG_DEFAULT;

    // --- probe ---
    if (mode === "probe") {
      const page = await fetchSalesPage(auth, { page: 1, size: 3 });
      return jsonResponse({
        ok: true,
        total_vendas: page.pagination.total,
        sample: page.data.map((s) => ({
          sale_number: s.sale_number,
          status: s.status,
          final_value: s.totals?.final_value,
          revenue: s.totals?.revenue,
        })),
      });
    }

    // Kill-switch (não bloqueia probe/single manual; bloqueia só o cron 'window')
    if (mode === "window" && config["MONDE_V3_SYNC_ENABLED"] === "false") {
      return jsonResponse({ skipped: true, reason: "MONDE_V3_SYNC_ENABLED=false" });
    }

    // --- coletar vendas ---
    let sales: MondeSale[] = [];
    let singleCardId: string | null = null;

    if (mode === "single") {
      singleCardId = body.card_id;
      if (!singleCardId) return jsonResponse({ error: "card_id obrigatório no modo single" }, 400);
      const { data: card } = await supabase
        .from("cards")
        .select("produto_data, archived_at")
        .eq("id", singleCardId)
        .maybeSingle();
      if (!card) return jsonResponse({ error: "card não encontrado" }, 404);
      if ((card as AnyObj).archived_at) return jsonResponse({ error: "card arquivado" }, 400);
      const pd = ((card as AnyObj).produto_data ?? {}) as AnyObj;
      const vendaNums = collectVendaNums(pd);
      if (vendaNums.length === 0) return jsonResponse({ ok: true, message: "card sem número de venda Monde", sales_fetched: 0 });
      sales = await findSalesByNumbers(auth, vendaNums, isoDate(pd.data_viagem_inicio), isoDate(pd.data_viagem_fim));
    } else {
      // window (cron): N páginas mais recentes por data da venda
      const pages = Number(config["MONDE_V3_IMPORT_PAGES"] || body.pages || DEFAULT_WINDOW_PAGES);
      for (let pg = 1; pg <= pages; pg++) {
        const page = await fetchSalesPage(auth, { page: pg, size: 100 });
        sales.push(...page.data);
        if (page.data.length === 0 || pg >= (page.pagination?.total_pages ?? pg)) break;
        await sleep(250);
      }
    }

    // --- transformar + agrupar por venda ---
    const vendaToProducts = new Map<string, BulkProduct[]>();
    for (const s of sales) {
      const t = transformSale(s);
      if (t.products.length > 0) vendaToProducts.set(t.monde_venda_num, t.products);
    }
    const uniqueVendas = [...vendaToProducts.keys()];

    // --- montar payload de cards ---
    const cardPayload: AnyObj[] = [];
    let unmatched: string[] = [];

    if (mode === "single") {
      for (const [venda, products] of vendaToProducts) {
        cardPayload.push({ card_id: singleCardId, monde_venda_num: venda, products });
      }
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: hits, error: findErr } = await (supabase as any).rpc("find_cards_by_monde_vendas", {
        p_venda_nums: uniqueVendas,
        p_org_id: orgId,
      });
      if (findErr) return jsonResponse({ error: `find_cards falhou: ${findErr.message}` }, 500);
      const seen = new Set<string>();
      for (const h of (hits ?? []) as AnyObj[]) {
        if (seen.has(h.venda_num)) continue;
        seen.add(h.venda_num);
        cardPayload.push({ card_id: h.card_id, monde_venda_num: h.venda_num, products: vendaToProducts.get(h.venda_num) });
      }
      unmatched = uniqueVendas.filter((v) => !seen.has(v));
    }

    // --- dry-run: não grava nada ---
    if (dryRun) {
      return jsonResponse({
        dry_run: true,
        mode,
        sales_fetched: sales.length,
        vendas_com_produto: uniqueVendas.length,
        cards_a_atualizar: cardPayload.length,
        unmatched_count: unmatched.length,
        sample: cardPayload.slice(0, 3),
      });
    }

    // --- reconciliar via bulk_import_financial_items (v13) ---
    let result: AnyObj = {};
    if (cardPayload.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("bulk_import_financial_items", {
        p_cards: cardPayload,
      });
      if (error) return jsonResponse({ error: `bulk_import falhou: ${error.message}` }, 500);
      result = data ?? {};
    }

    // --- log ---
    await supabase.from("monde_import_logs").insert({
      file_name: `API Monde v3 (${mode})`,
      total_rows: sales.length,
      matched_cards: cardPayload.length,
      unmatched_vendas: unmatched.length,
      products_imported: result.products_inserted ?? 0,
      products_cancelled: result.products_cancelled ?? 0,
      products_reactivated: result.products_reactivated ?? 0,
      status: "completed",
      org_id: orgId,
    });

    return jsonResponse({
      ok: true,
      mode,
      sales_fetched: sales.length,
      cards_updated: result.cards_updated ?? cardPayload.length,
      products_inserted: result.products_inserted ?? 0,
      products_updated: result.products_updated ?? 0,
      products_unchanged: result.products_unchanged ?? 0,
      products_archived: result.products_archived ?? 0,
      products_cancelled: result.products_cancelled ?? 0,
      products_reactivated: result.products_reactivated ?? 0,
      unmatched_count: unmatched.length,
      unmatched_sample: unmatched.slice(0, 10),
    });
  } catch (e) {
    return jsonResponse({ error: String((e as Error)?.message || e) }, 500);
  }
});
