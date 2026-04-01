/**
 * Shared org context helper for Edge Functions.
 * Extracts org_id from JWT or falls back to Welcome Group UUID.
 *
 * Usage:
 *   import { getOrgId, getOrgIdFromCard } from "../_shared/org-context.ts";
 *
 *   // From authenticated request (JWT in Authorization header)
 *   const orgId = getOrgId(req);
 *
 *   // From a card record (when processing webhooks without JWT)
 *   const orgId = await getOrgIdFromCard(supabase, cardId);
 */

const DEFAULT_ORG_ID = "a0000000-0000-0000-0000-000000000001";

/**
 * Extract org_id from the JWT in the Authorization header.
 * Falls back to the default Welcome Group UUID if no JWT or no org_id claim.
 */
export function getOrgId(req: Request): string {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return DEFAULT_ORG_ID;

    const parts = token.split(".");
    if (parts.length !== 3) return DEFAULT_ORG_ID;

    const payload = JSON.parse(atob(parts[1]));
    return payload?.app_metadata?.org_id ?? DEFAULT_ORG_ID;
  } catch {
    return DEFAULT_ORG_ID;
  }
}

/**
 * Get org_id from a card record in the database.
 * Used by webhook handlers that don't have a user JWT.
 */
export async function getOrgIdFromCard(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  cardId: string
): Promise<string> {
  try {
    const { data } = await supabase
      .from("cards")
      .select("org_id")
      .eq("id", cardId)
      .single();
    return data?.org_id ?? DEFAULT_ORG_ID;
  } catch {
    return DEFAULT_ORG_ID;
  }
}

/**
 * Get org_id from an integration configuration.
 * Used by webhook handlers that process external events.
 */
export async function getOrgIdFromIntegration(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  integrationId: string
): Promise<string> {
  try {
    const { data } = await supabase
      .from("integrations")
      .select("org_id")
      .eq("id", integrationId)
      .single();
    return data?.org_id ?? DEFAULT_ORG_ID;
  } catch {
    return DEFAULT_ORG_ID;
  }
}

export { DEFAULT_ORG_ID };
