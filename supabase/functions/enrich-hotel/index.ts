/**
 * enrich-hotel — busca conteúdo de hotéis via SerpAPI Google Hotels.
 *
 * NÃO faz reservas. NÃO cota preços para venda. Apenas extrai conteúdo
 * (nome, descrição, fotos HD, amenidades, rating) para preencher uma
 * proposta no builder do WelcomeCRM.
 *
 * Endpoints:
 *
 *   POST /enrich-hotel  { mode: "search", query: "Copacabana Palace", country?: "BR" }
 *     → { results: HotelSummary[] }
 *
 *   POST /enrich-hotel  { mode: "details", property_token: "..." }
 *     → { details: HotelDetails }
 *
 * Cache:
 *   - search:    TTL 7 dias  (queries voláteis)
 *   - details:   TTL 30 dias (conteúdo de hotel raramente muda)
 *
 * Secrets necessários (set via supabase secrets set):
 *   SERPAPI_KEY
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
    corsHeaders,
    getCached,
    getServiceClient,
    setCached,
} from "../_shared/provider-cache.ts";

const PROVIDER = "serpapi_google_hotels";
const SERPAPI_BASE = "https://serpapi.com/search";

interface SearchRequest {
    mode: "search";
    query: string;
    country?: string;
    language?: string;
}

interface DetailsRequest {
    mode: "details";
    property_token: string;
    language?: string;
}

type RequestBody = SearchRequest | DetailsRequest;

interface HotelSummary {
    externalId: string;
    name: string;
    address?: string;
    city?: string;
    country?: string;
    lat?: number;
    lng?: number;
    starRating?: number;
    guestRating?: number;
    reviewsCount?: number;
    thumbnailUrl?: string;
    provider: typeof PROVIDER;
}

interface PhotoRef {
    url: string;
    thumbnailUrl?: string;
    width?: number;
    height?: number;
    alt?: string;
    section?: string;
}

interface HotelDetails extends HotelSummary {
    description?: string;
    amenities?: string[];
    phone?: string;
    website?: string;
    photos: PhotoRef[];
    fetchedAt: string;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const apiKey = Deno.env.get("SERPAPI_KEY");
    if (!apiKey) {
        return jsonResponse(
            { error: "SERPAPI_KEY not configured on this environment" },
            500,
        );
    }

    let body: RequestBody;
    try {
        body = await req.json();
    } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const supabase = getServiceClient();

    try {
        if (body.mode === "search") {
            return await handleSearch(body, apiKey, supabase);
        }
        if (body.mode === "details") {
            return await handleDetails(body, apiKey, supabase);
        }
        return jsonResponse({ error: "Invalid mode (use 'search' or 'details')" }, 400);
    } catch (err) {
        console.error("[enrich-hotel] error:", err);
        return jsonResponse(
            {
                error: "Provider error",
                message: err instanceof Error ? err.message : String(err),
            },
            502,
        );
    }
});

// ─── SEARCH ────────────────────────────────────────────────────────────────

async function handleSearch(
    body: SearchRequest,
    apiKey: string,
    supabase: ReturnType<typeof getServiceClient>,
): Promise<Response> {
    const query = (body.query ?? "").trim();
    if (!query) return jsonResponse({ error: "query is required" }, 400);

    const language = body.language ?? "pt-br";
    const country = (body.country ?? "br").toLowerCase();
    const cacheKey = `search:${language}:${country}:${query.toLowerCase()}`;

    const cached = await getCached<{ results: HotelSummary[] }>(supabase, PROVIDER, cacheKey);
    if (cached) return jsonResponse({ ...cached, cached: true });

    // Autocomplete: retorna sugestões + property_token sem precisar de datas
    const url = new URL(SERPAPI_BASE);
    url.searchParams.set("engine", "google_hotels_autocomplete");
    url.searchParams.set("q", query);
    url.searchParams.set("gl", country);
    url.searchParams.set("hl", language);
    url.searchParams.set("api_key", apiKey);

    const r = await fetch(url.toString());
    if (!r.ok) {
        const text = await r.text();
        throw new Error(`SerpAPI autocomplete returned ${r.status}: ${text.slice(0, 200)}`);
    }

    const payload = await r.json();
    const suggestions: unknown[] = Array.isArray(payload?.suggestions) ? payload.suggestions : [];

    const results: HotelSummary[] = suggestions
        .map((s) => mapSuggestionToSummary(s))
        .filter((x): x is HotelSummary => x !== null);

    const responseBody = { results };
    await setCached(supabase, PROVIDER, cacheKey, responseBody, 7);
    return jsonResponse({ ...responseBody, cached: false });
}

function mapSuggestionToSummary(s: unknown): HotelSummary | null {
    if (typeof s !== "object" || s === null) return null;
    const obj = s as Record<string, unknown>;
    const propertyToken = typeof obj.property_token === "string" ? obj.property_token : null;
    if (!propertyToken) return null;

    const value = typeof obj.value === "string" ? obj.value : "";
    const subValue = typeof obj.sub_value === "string" ? obj.sub_value : undefined;
    const thumbnail = typeof obj.thumbnail === "string" ? obj.thumbnail : undefined;

    if (!value) return null;

    return {
        externalId: propertyToken,
        name: value,
        address: subValue,
        thumbnailUrl: thumbnail,
        provider: PROVIDER,
    };
}

// ─── DETAILS ───────────────────────────────────────────────────────────────

async function handleDetails(
    body: DetailsRequest,
    apiKey: string,
    supabase: ReturnType<typeof getServiceClient>,
): Promise<Response> {
    const token = (body.property_token ?? "").trim();
    if (!token) return jsonResponse({ error: "property_token is required" }, 400);

    const language = body.language ?? "pt-br";
    const cacheKey = `details:${language}:${token}`;

    const cached = await getCached<{ details: HotelDetails }>(supabase, PROVIDER, cacheKey);
    if (cached) return jsonResponse({ ...cached, cached: true });

    // google_hotels engine exige check_in_date e check_out_date mesmo só
    // para metadata. Passamos datas dummy 30/31 dias no futuro — não usamos
    // o preço retornado, apenas o conteúdo (que não depende das datas).
    const today = new Date();
    const checkIn = new Date(today.getTime() + 30 * 86400 * 1000);
    const checkOut = new Date(today.getTime() + 31 * 86400 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const url = new URL(SERPAPI_BASE);
    url.searchParams.set("engine", "google_hotels");
    url.searchParams.set("property_token", token);
    url.searchParams.set("check_in_date", fmt(checkIn));
    url.searchParams.set("check_out_date", fmt(checkOut));
    url.searchParams.set("adults", "2");
    url.searchParams.set("currency", "BRL");
    url.searchParams.set("hl", language);
    url.searchParams.set("api_key", apiKey);

    const r = await fetch(url.toString());
    if (!r.ok) {
        const text = await r.text();
        throw new Error(`SerpAPI google_hotels returned ${r.status}: ${text.slice(0, 200)}`);
    }

    const payload = await r.json();
    const details = mapPayloadToDetails(token, payload);

    const responseBody = { details };
    await setCached(supabase, PROVIDER, cacheKey, responseBody, 30);
    return jsonResponse({ ...responseBody, cached: false });
}

function mapPayloadToDetails(token: string, payload: unknown): HotelDetails {
    if (typeof payload !== "object" || payload === null) {
        throw new Error("SerpAPI returned non-object payload");
    }
    const p = payload as Record<string, unknown>;

    const name = pickString(p, "name") ?? "Hotel sem nome";
    const description = pickString(p, "description");
    const address = pickString(p, "address");
    const phone = pickString(p, "phone") ?? pickString(p, "phone_local");
    const website = pickString(p, "link");
    const overallRating = pickNumber(p, "overall_rating");
    const reviews = pickNumber(p, "reviews");
    const hotelClass = pickNumber(p, "extracted_hotel_class");

    const gps = (p.gps_coordinates ?? null) as Record<string, unknown> | null;
    const lat = gps && typeof gps.latitude === "number" ? gps.latitude : undefined;
    const lng = gps && typeof gps.longitude === "number" ? gps.longitude : undefined;

    const amenities = Array.isArray(p.amenities)
        ? (p.amenities as unknown[]).filter((a): a is string => typeof a === "string")
        : undefined;

    const images = Array.isArray(p.images) ? (p.images as unknown[]) : [];
    const photos: PhotoRef[] = images
        .map((img) => mapImageToPhoto(img))
        .filter((x): x is PhotoRef => x !== null);

    return {
        externalId: token,
        provider: PROVIDER,
        name,
        description,
        address,
        phone,
        website,
        lat,
        lng,
        starRating: hotelClass,
        guestRating: overallRating,
        reviewsCount: reviews,
        amenities,
        photos,
        fetchedAt: new Date().toISOString(),
    };
}

function mapImageToPhoto(img: unknown): PhotoRef | null {
    if (typeof img !== "object" || img === null) return null;
    const obj = img as Record<string, unknown>;
    const original = pickString(obj, "original_image");
    const thumbnail = pickString(obj, "thumbnail");
    if (!original && !thumbnail) return null;
    return {
        url: original ?? thumbnail!,
        thumbnailUrl: thumbnail,
    };
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
