/**
 * enrich-flight — lookup de voos via AeroDataBox (RapidAPI).
 *
 * NÃO faz reservas. Apenas consulta um voo já fechado pelo operador
 * (ex: "LA8084 em 2026-05-15") e retorna companhia, aeroportos, horários
 * e aeronave para preencher um item de voo na proposta.
 *
 * Endpoint:
 *
 *   POST /enrich-flight  { flight_number: "LA8084", departure_date: "2026-05-15" }
 *     → { details: FlightDetails | null }
 *
 * Cache: TTL 1 dia (status pode mudar dia-a-dia, mas conteúdo estrutural não)
 *
 * Secrets necessários:
 *   RAPIDAPI_KEY  (chave única para todas as APIs do RapidAPI no projeto)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
    corsHeaders,
    getCached,
    getServiceClient,
    setCached,
} from "../_shared/provider-cache.ts";

const PROVIDER = "aerodatabox";
const RAPIDAPI_HOST = "aerodatabox.p.rapidapi.com";
const BASE_URL = `https://${RAPIDAPI_HOST}`;

interface RequestBody {
    flight_number: string;
    departure_date: string; // YYYY-MM-DD
}

interface AirportPoint {
    iata: string;
    name?: string;
    city?: string;
    country?: string;
    scheduledTime?: string;
    terminal?: string;
    gate?: string;
}

interface FlightDetails {
    flightNumber: string;
    departureDate: string;
    airline: { iata: string; name: string; logoUrl?: string };
    departure: AirportPoint;
    arrival: AirportPoint;
    durationMinutes?: number;
    aircraft?: string;
    status?: string;
    provider: typeof PROVIDER;
    fetchedAt: string;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const apiKey = Deno.env.get("RAPIDAPI_KEY");
    if (!apiKey) {
        return jsonResponse(
            { error: "RAPIDAPI_KEY not configured on this environment" },
            500,
        );
    }

    let body: RequestBody;
    try {
        body = await req.json();
    } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const flightNumber = (body.flight_number ?? "").trim().toUpperCase().replace(/\s+/g, "");
    const departureDate = (body.departure_date ?? "").trim();

    if (!flightNumber || !/^[A-Z0-9]{2,8}$/.test(flightNumber)) {
        return jsonResponse({ error: "flight_number inválido (use IATA, ex: LA8084)" }, 400);
    }
    if (!departureDate || !/^\d{4}-\d{2}-\d{2}$/.test(departureDate)) {
        return jsonResponse({ error: "departure_date deve ser YYYY-MM-DD" }, 400);
    }

    const supabase = getServiceClient();
    const cacheKey = `lookup:${flightNumber}:${departureDate}`;

    const cached = await getCached<{ details: FlightDetails | null }>(supabase, PROVIDER, cacheKey);
    if (cached) return jsonResponse({ ...cached, cached: true });

    try {
        const url = `${BASE_URL}/flights/number/${flightNumber}/${departureDate}?dateLocalRole=Departure&withAircraftImage=false&withLocation=true`;
        const r = await fetch(url, {
            headers: {
                "X-RapidAPI-Key": apiKey,
                "X-RapidAPI-Host": RAPIDAPI_HOST,
            },
        });

        if (r.status === 404) {
            const responseBody = { details: null };
            await setCached(supabase, PROVIDER, cacheKey, responseBody, 1);
            return jsonResponse({ ...responseBody, cached: false });
        }

        if (!r.ok) {
            const text = await r.text();
            throw new Error(`AeroDataBox returned ${r.status}: ${text.slice(0, 200)}`);
        }

        const payload = await r.json();
        const details = mapPayloadToDetails(flightNumber, departureDate, payload);

        const responseBody = { details };
        await setCached(supabase, PROVIDER, cacheKey, responseBody, 1);
        return jsonResponse({ ...responseBody, cached: false });
    } catch (err) {
        console.error("[enrich-flight] error:", err);
        return jsonResponse(
            {
                error: "Provider error",
                message: err instanceof Error ? err.message : String(err),
            },
            502,
        );
    }
});

// ─── mapping ────────────────────────────────────────────────────────────────

function mapPayloadToDetails(
    flightNumber: string,
    departureDate: string,
    payload: unknown,
): FlightDetails | null {
    // AeroDataBox retorna array de movimentos (1 voo pode ter múltiplos
    // segments quando tem escala). Pegamos o primeiro segmento utilizável.
    if (!Array.isArray(payload) || payload.length === 0) return null;

    const first = payload[0];
    if (typeof first !== "object" || first === null) return null;
    const f = first as Record<string, unknown>;

    const airline = (f.airline ?? {}) as Record<string, unknown>;
    const departure = (f.departure ?? {}) as Record<string, unknown>;
    const arrival = (f.arrival ?? {}) as Record<string, unknown>;

    const depAirport = mapAirport(departure);
    const arrAirport = mapAirport(arrival);
    if (!depAirport.iata || !arrAirport.iata) return null;

    const aircraft = (f.aircraft ?? {}) as Record<string, unknown>;
    const aircraftModel = pickString(aircraft, "model");

    const greatCircle = (f.greatCircleDistance ?? {}) as Record<string, unknown>;
    const distanceKm = pickNumber(greatCircle, "km");

    return {
        flightNumber,
        departureDate,
        airline: {
            iata: pickString(airline, "iata") ?? flightNumber.slice(0, 2),
            name: pickString(airline, "name") ?? "Companhia desconhecida",
            // AeroDataBox não fornece logo direto; o frontend pode usar
            // serviços como https://content.airhex.com/content/logos/airlines_{iata}_200_60_r.png
            logoUrl: undefined,
        },
        departure: depAirport,
        arrival: arrAirport,
        durationMinutes: estimateDurationMinutes(depAirport.scheduledTime, arrAirport.scheduledTime),
        aircraft: aircraftModel,
        status: pickString(f, "status"),
        provider: PROVIDER,
        fetchedAt: new Date().toISOString(),
        // distanceKm: not exposed in interface but we keep the field for future use
    } as FlightDetails;
}

function mapAirport(node: Record<string, unknown>): AirportPoint {
    const airport = (node.airport ?? {}) as Record<string, unknown>;
    const scheduled = (node.scheduledTime ?? {}) as Record<string, unknown>;

    return {
        iata: pickString(airport, "iata") ?? "",
        name: pickString(airport, "name"),
        city: pickString(airport, "municipalityName"),
        country: pickString(airport, "countryCode"),
        scheduledTime: pickString(scheduled, "utc") ?? pickString(scheduled, "local"),
        terminal: pickString(node, "terminal"),
        gate: pickString(node, "gate"),
    };
}

function estimateDurationMinutes(depIso?: string, arrIso?: string): number | undefined {
    if (!depIso || !arrIso) return undefined;
    const dep = Date.parse(depIso);
    const arr = Date.parse(arrIso);
    if (Number.isNaN(dep) || Number.isNaN(arr) || arr <= dep) return undefined;
    return Math.round((arr - dep) / 60000);
}

// ─── helpers ───────────────────────────────────────────────────────────────

function pickString(obj: Record<string, unknown>, key: string): string | undefined {
    const v = obj[key];
    return typeof v === "string" && v.length > 0 ? v : undefined;
}

function pickNumber(obj: Record<string, unknown>, key: string): number | undefined {
    const v = obj[key];
    return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}
