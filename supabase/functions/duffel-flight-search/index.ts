/**
 * duffel-flight-search — busca voos com preços reais via Duffel API.
 *
 * Não faz reserva. Apenas devolve ofertas (carrier, horários, escalas, preço)
 * pra encher uma proposta no builder do WelcomeCRM.
 *
 * Endpoint único:
 *
 *   POST /duffel-flight-search
 *   {
 *     "slices": [
 *       { "origin": "GRU", "destination": "DPS", "departure_date": "2026-06-10" },
 *       { "origin": "DPS", "destination": "GRU", "departure_date": "2026-06-22" }
 *     ],
 *     "passengers": 2,
 *     "cabin_class": "business"     // economy | premium_economy | business | first
 *   }
 *
 *   → { offers: FlightOffer[], request_id: string }
 *
 * Secrets necessários (set via supabase secrets set):
 *   DUFFEL_TOKEN  (em modo test começa com "duffel_test_…", produção "duffel_live_…")
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const DUFFEL_BASE = "https://api.duffel.com";
const DUFFEL_VERSION = "v2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CabinClass = "economy" | "premium_economy" | "business" | "first";

interface SearchSlice {
    origin: string;
    destination: string;
    departure_date: string; // YYYY-MM-DD
}

interface SearchRequest {
    slices: SearchSlice[];
    passengers: number;
    cabin_class?: CabinClass;
    max_connections?: number;
    currency?: string;
}

// Estrutura normalizada que o front consome
interface FlightOffer {
    id: string;
    total_amount: number;
    total_currency: string;
    base_amount: number;
    tax_amount: number;
    owner: { iata_code: string; name: string; logo_url?: string };
    slices: Array<{
        origin: { iata_code: string; city_name?: string; airport_name?: string };
        destination: { iata_code: string; city_name?: string; airport_name?: string };
        departure_datetime: string;
        arrival_datetime: string;
        duration_minutes: number;
        stops: number;
        segments: Array<{
            origin_iata: string;
            destination_iata: string;
            departure_datetime: string;
            arrival_datetime: string;
            airline_iata: string;
            airline_name: string;
            flight_number: string;
            aircraft?: string;
            duration_minutes: number;
        }>;
    }>;
    cabin_class: CabinClass;
    baggage_summary?: string;
    expires_at: string;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const token = Deno.env.get("DUFFEL_TOKEN");
        if (!token) {
            return jsonError(
                503,
                "DUFFEL_TOKEN não configurado. Defina via `supabase secrets set DUFFEL_TOKEN=duffel_test_...`",
            );
        }

        const body = (await req.json()) as SearchRequest;
        if (!body?.slices?.length || !body.passengers) {
            return jsonError(400, "slices e passengers são obrigatórios");
        }

        const passengers = Array.from({ length: body.passengers }, () => ({
            type: "adult",
        }));

        const duffelBody = {
            data: {
                slices: body.slices.map((s) => ({
                    origin: s.origin.toUpperCase().trim(),
                    destination: s.destination.toUpperCase().trim(),
                    departure_date: s.departure_date,
                })),
                passengers,
                cabin_class: body.cabin_class ?? "economy",
                max_connections:
                    body.max_connections == null ? undefined : body.max_connections,
                // Welcome Trips opera em BRL — força conversão das ofertas.
                // Em modo live, Duffel converte usando câmbio do dia.
                currency: body.currency ?? "BRL",
            },
        };

        // Duffel: criar offer request retorna offers inline já
        const url = `${DUFFEL_BASE}/air/offer_requests?return_offers=true&supplier_timeout=15000`;
        const r = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Duffel-Version": DUFFEL_VERSION,
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify(duffelBody),
        });

        if (!r.ok) {
            const errBody = await r.text();
            return jsonError(
                r.status,
                `Duffel API falhou: ${errBody.slice(0, 300)}`,
            );
        }

        const payload = await r.json();
        const data = payload?.data ?? {};
        const requestId: string = data?.id ?? "";
        const rawOffers: any[] = Array.isArray(data?.offers) ? data.offers : [];

        // Ordenar por preço crescente e normalizar pro front
        rawOffers.sort(
            (a, b) =>
                Number(a.total_amount ?? 0) - Number(b.total_amount ?? 0),
        );

        const offers: FlightOffer[] = rawOffers.slice(0, 30).map(normalizeOffer);

        return new Response(
            JSON.stringify({
                offers,
                request_id: requestId,
                total: rawOffers.length,
            }),
            {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
        );
    } catch (err) {
        return jsonError(500, `Erro: ${(err as Error).message}`);
    }
});

function jsonError(status: number, message: string) {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

function normalizeOffer(o: any): FlightOffer {
    const slices = Array.isArray(o.slices) ? o.slices : [];
    const owner = o.owner ?? {};
    const baseAmount = Number(o.base_amount ?? 0);
    const taxAmount = Number(o.tax_amount ?? 0);

    return {
        id: String(o.id ?? ""),
        total_amount: Number(o.total_amount ?? 0),
        total_currency: String(o.total_currency ?? "BRL"),
        base_amount: baseAmount,
        tax_amount: taxAmount,
        owner: {
            iata_code: String(owner.iata_code ?? ""),
            name: String(owner.name ?? ""),
            logo_url: owner.logo_symbol_url ?? owner.logo_lockup_url ?? undefined,
        },
        cabin_class: String(o.cabin_class ?? "economy") as CabinClass,
        baggage_summary: extractBaggage(o),
        expires_at: String(o.expires_at ?? ""),
        slices: slices.map((s: any) => {
            const segments = Array.isArray(s.segments) ? s.segments : [];
            const firstSeg = segments[0] ?? {};
            const lastSeg = segments[segments.length - 1] ?? {};
            const totalDuration = sumDurations(segments);

            return {
                origin: {
                    iata_code: s.origin?.iata_code ?? "",
                    city_name: s.origin?.city_name,
                    airport_name: s.origin?.name,
                },
                destination: {
                    iata_code: s.destination?.iata_code ?? "",
                    city_name: s.destination?.city_name,
                    airport_name: s.destination?.name,
                },
                departure_datetime: firstSeg.departing_at ?? "",
                arrival_datetime: lastSeg.arriving_at ?? "",
                duration_minutes: totalDuration,
                stops: Math.max(0, segments.length - 1),
                segments: segments.map((seg: any) => ({
                    origin_iata: seg.origin?.iata_code ?? "",
                    destination_iata: seg.destination?.iata_code ?? "",
                    departure_datetime: seg.departing_at ?? "",
                    arrival_datetime: seg.arriving_at ?? "",
                    airline_iata: seg.operating_carrier?.iata_code ??
                        seg.marketing_carrier?.iata_code ?? "",
                    airline_name: seg.operating_carrier?.name ??
                        seg.marketing_carrier?.name ?? "",
                    flight_number: `${
                        seg.operating_carrier?.iata_code ??
                            seg.marketing_carrier?.iata_code ?? ""
                    }${seg.operating_carrier_flight_number ??
                        seg.marketing_carrier_flight_number ?? ""}`.trim(),
                    aircraft: seg.aircraft?.name,
                    duration_minutes: parseISODuration(seg.duration),
                })),
            };
        }),
    };
}

function parseISODuration(iso?: string): number {
    if (!iso || typeof iso !== "string") return 0;
    // Duffel devolve ISO 8601 (ex: "PT5H30M")
    const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
    if (!match) return 0;
    const hours = match[1] ? parseInt(match[1], 10) : 0;
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    return hours * 60 + minutes;
}

function sumDurations(segments: any[]): number {
    return segments.reduce(
        (acc, s) => acc + parseISODuration(s.duration),
        0,
    );
}

function extractBaggage(offer: any): string | undefined {
    // Duffel não tem campo direto. Tentar inferir do primeiro passageiro
    const slices = Array.isArray(offer.slices) ? offer.slices : [];
    const firstSlice = slices[0] ?? {};
    const segments = Array.isArray(firstSlice.segments)
        ? firstSlice.segments
        : [];
    const firstSeg = segments[0] ?? {};
    const passengers = Array.isArray(firstSeg.passengers)
        ? firstSeg.passengers
        : [];
    if (!passengers.length) return undefined;

    const bags = passengers[0]?.baggages ?? [];
    if (!Array.isArray(bags) || bags.length === 0) return "Sem bagagem incluída";

    const checked = bags.filter((b: any) => b.type === "checked").length;
    const carry = bags.filter((b: any) => b.type === "carry_on").length;
    const parts: string[] = [];
    if (checked > 0) parts.push(`${checked} mala despachada`);
    if (carry > 0) parts.push(`${carry} bagagem de mão`);
    return parts.length ? parts.join(" + ") : "Sem bagagem incluída";
}
