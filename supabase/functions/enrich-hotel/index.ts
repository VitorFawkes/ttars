/**
 * enrich-hotel — busca conteúdo de hotéis via LiteAPI (Nuitée).
 *
 * NÃO faz reservas. NÃO cota preços para venda. Apenas extrai conteúdo
 * (nome, descrição, fotos HD, amenidades, rating) para preencher uma
 * proposta no builder do WelcomeCRM.
 *
 * LiteAPI tem base de 2.6M+ hotéis com fotos e descrições próprias.
 * Muito melhor cobertura que SerpAPI Google Hotels (especialmente Brasil).
 *
 * Endpoints:
 *
 *   POST /enrich-hotel  { mode: "search", query: "Copacabana Palace", country?: "BR" }
 *     → { results: HotelSummary[] }
 *
 *   POST /enrich-hotel  { mode: "details", hotelId: "lp1897" }
 *     → { details: HotelDetails }
 *
 * Cache:
 *   - search:    TTL 7 dias
 *   - details:   TTL 30 dias
 *
 * Secrets necessários (set via supabase secrets set):
 *   LITEAPI_KEY
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
    corsHeaders,
    getCached,
    getServiceClient,
    setCached,
} from "../_shared/provider-cache.ts";

const PROVIDER = "liteapi";
const LITEAPI_BASE = "https://api.liteapi.travel/v3.0";

interface SearchRequest {
    mode: "search";
    query: string;
    country?: string;
    city?: string;
    limit?: number;
}

interface DetailsRequest {
    mode: "details";
    hotelId: string;
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
    alt?: string;
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

    const apiKey = Deno.env.get("LITEAPI_KEY");
    if (!apiKey) {
        return jsonResponse(
            { error: "LITEAPI_KEY not configured on this environment" },
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

    // LiteAPI exige pelo menos countryCode. Se não informado, buscamos
    // em vários países comuns para agência de viagens brasileira.
    const country = (body.country ?? "").toUpperCase();
    const city = (body.city ?? "").trim();
    const limit = body.limit ?? 10;

    // Se country informado, busca direto. Senão, busca em múltiplos países.
    const countries = country ? [country] : ["BR", "IT", "FR", "GR", "PT", "ES", "US", "GB", "MX", "AR"];
    const cacheKey = `search:${country || "multi"}:${city}:${query.toLowerCase()}`;

    const cached = await getCached<{ results: HotelSummary[] }>(supabase, PROVIDER, cacheKey);
    if (cached) return jsonResponse({ ...cached, cached: true });

    // Buscar em paralelo em todos os países
    const allResults: HotelSummary[] = [];
    const fetches = countries.map(async (cc) => {
        const url = new URL(`${LITEAPI_BASE}/data/hotels`);
        url.searchParams.set("hotelName", query);
        url.searchParams.set("limit", String(Math.ceil(limit / countries.length) + 2));
        url.searchParams.set("countryCode", cc);
        if (city) url.searchParams.set("cityName", city);

        try {
            const r = await fetch(url.toString(), {
                headers: { "X-API-Key": apiKey, "Accept": "application/json" },
            });
            if (!r.ok) return;
            const payload = await r.json();
            if (payload?.error) return;
            const hotels: unknown[] = Array.isArray(payload?.data) ? payload.data : [];
            for (const h of hotels) {
                const s = mapHotelToSummary(h);
                if (s) allResults.push(s);
            }
        } catch {
            // silently skip failed country
        }
    });
    await Promise.all(fetches);

    // Dedup por externalId e limitar
    const seen = new Set<string>();
    const results = allResults.filter((r) => {
        if (seen.has(r.externalId)) return false;
        seen.add(r.externalId);
        return true;
    }).slice(0, limit);

    const responseBody = { results };
    await setCached(supabase, PROVIDER, cacheKey, responseBody, 7);
    return jsonResponse({ ...responseBody, cached: false });
}

function mapHotelToSummary(h: unknown): HotelSummary | null {
    if (typeof h !== "object" || h === null) return null;
    const obj = h as Record<string, unknown>;

    const id = pickString(obj, "id");
    const name = pickString(obj, "name");
    if (!id || !name) return null;

    return {
        externalId: id,
        name,
        address: pickString(obj, "address"),
        city: pickString(obj, "city"),
        country: pickString(obj, "country"),
        lat: pickNumber(obj, "latitude"),
        lng: pickNumber(obj, "longitude"),
        starRating: pickNumber(obj, "stars"),
        guestRating: pickNumber(obj, "rating"),
        reviewsCount: pickNumber(obj, "reviewCount"),
        thumbnailUrl: pickString(obj, "thumbnail") ?? pickString(obj, "main_photo"),
        provider: PROVIDER,
    };
}

// ─── DETAILS ───────────────────────────────────────────────────────────────

async function handleDetails(
    body: DetailsRequest,
    apiKey: string,
    supabase: ReturnType<typeof getServiceClient>,
): Promise<Response> {
    const hotelId = (body.hotelId ?? "").trim();
    if (!hotelId) return jsonResponse({ error: "hotelId is required" }, 400);

    const language = body.language ?? "en";
    const cacheKey = `details:${language}:${hotelId}`;

    const cached = await getCached<{ details: HotelDetails }>(supabase, PROVIDER, cacheKey);
    if (cached) return jsonResponse({ ...cached, cached: true });

    const url = new URL(`${LITEAPI_BASE}/data/hotel`);
    url.searchParams.set("hotelId", hotelId);
    if (language) url.searchParams.set("language", language);

    const r = await fetch(url.toString(), {
        headers: {
            "X-API-Key": apiKey,
            "Accept": "application/json",
        },
    });

    if (!r.ok) {
        const text = await r.text();
        throw new Error(`LiteAPI /data/hotel returned ${r.status}: ${text.slice(0, 200)}`);
    }

    const payload = await r.json();
    if (payload?.error) {
        throw new Error(`LiteAPI error: ${JSON.stringify(payload.error)}`);
    }

    const details = mapPayloadToDetails(hotelId, payload?.data);

    const responseBody = { details };
    await setCached(supabase, PROVIDER, cacheKey, responseBody, 30);
    return jsonResponse({ ...responseBody, cached: false });
}

function mapPayloadToDetails(hotelId: string, p: unknown): HotelDetails {
    if (typeof p !== "object" || p === null) {
        throw new Error("LiteAPI returned empty hotel data");
    }
    const obj = p as Record<string, unknown>;

    const name = pickString(obj, "name") ?? "Hotel sem nome";
    const description = pickString(obj, "hotelDescription");
    const address = pickString(obj, "address");
    const city = pickString(obj, "city");
    const country = pickString(obj, "country");
    const starRating = pickNumber(obj, "starRating");
    const guestRating = pickNumber(obj, "rating");
    const reviewsCount = pickNumber(obj, "reviewCount");

    const loc = (obj.location ?? null) as Record<string, unknown> | null;
    const lat = loc ? pickNumber(loc, "latitude") : pickNumber(obj, "latitude");
    const lng = loc ? pickNumber(loc, "longitude") : pickNumber(obj, "longitude");

    // Amenities: pode vir como hotelFacilities (string[]) ou facilities ({name}[])
    let amenities: string[] | undefined;
    if (Array.isArray(obj.hotelFacilities)) {
        amenities = (obj.hotelFacilities as unknown[]).filter(
            (a): a is string => typeof a === "string",
        );
    } else if (Array.isArray(obj.facilities)) {
        amenities = (obj.facilities as Array<Record<string, unknown>>)
            .map((f) => pickString(f, "name"))
            .filter((n): n is string => !!n);
    }

    // Photos: hotelImages[] com url, urlHd, caption
    const images = Array.isArray(obj.hotelImages) ? (obj.hotelImages as unknown[]) : [];
    const mainPhoto = pickString(obj, "main_photo");

    const photos: PhotoRef[] = [];
    if (mainPhoto) {
        photos.push({ url: mainPhoto, alt: name });
    }
    for (const img of images) {
        const photo = mapImageToPhoto(img);
        if (photo && photo.url !== mainPhoto) photos.push(photo);
    }

    return {
        externalId: hotelId,
        provider: PROVIDER,
        name,
        description,
        address,
        city,
        country,
        lat,
        lng,
        starRating,
        guestRating,
        reviewsCount,
        amenities,
        photos,
        thumbnailUrl: pickString(obj, "thumbnail") ?? mainPhoto,
        fetchedAt: new Date().toISOString(),
    };
}

function mapImageToPhoto(img: unknown): PhotoRef | null {
    if (typeof img !== "object" || img === null) return null;
    const obj = img as Record<string, unknown>;
    const urlHd = pickString(obj, "urlHd");
    const url = pickString(obj, "url");
    if (!url && !urlHd) return null;
    return {
        url: urlHd ?? url!,
        thumbnailUrl: url,
        alt: pickString(obj, "caption"),
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
