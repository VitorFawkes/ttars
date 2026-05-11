/**
 * Shared cache helper for the provider enrichment layer.
 *
 * Used by enrich-hotel and enrich-flight Edge Functions to avoid hammering
 * external APIs (SerpAPI, AeroDataBox) on every request. Cache is stored in
 * the `provider_cache` table created by 20260408_proposals_v2_provider_cache.sql.
 *
 * Usage:
 *   import { getCached, setCached } from "../_shared/provider-cache.ts";
 *   const cached = await getCached(supabase, "serpapi_google_hotels", "search:Copacabana Palace");
 *   if (cached) return cached;
 *   const fresh = await fetchFromApi();
 *   await setCached(supabase, "serpapi_google_hotels", "search:Copacabana Palace", fresh, 30);
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export function getServiceClient(): SupabaseClient {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Read a cached payload. Returns null on miss or expired entry.
 * Never throws — cache failures should not break the request.
 */
export async function getCached<T = unknown>(
    supabase: SupabaseClient,
    provider: string,
    cacheKey: string,
): Promise<T | null> {
    try {
        const { data, error } = await supabase
            .from("provider_cache")
            .select("payload, expires_at")
            .eq("provider", provider)
            .eq("cache_key", cacheKey)
            .maybeSingle();

        if (error || !data) return null;
        if (new Date(data.expires_at).getTime() < Date.now()) return null;
        return data.payload as T;
    } catch {
        return null;
    }
}

/**
 * Write a payload to cache with TTL in days.
 * Upserts on (provider, cache_key) primary key.
 * Never throws — cache failures should not break the request.
 */
export async function setCached(
    supabase: SupabaseClient,
    provider: string,
    cacheKey: string,
    payload: unknown,
    ttlDays: number,
): Promise<void> {
    try {
        const expiresAt = new Date(Date.now() + ttlDays * 86400 * 1000).toISOString();
        await supabase.from("provider_cache").upsert({
            provider,
            cache_key: cacheKey,
            payload,
            fetched_at: new Date().toISOString(),
            expires_at: expiresAt,
        });
    } catch {
        // swallow — cache miss is acceptable
    }
}

export const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};
