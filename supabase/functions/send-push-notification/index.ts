/**
 * SEND-PUSH-NOTIFICATION
 * ======================
 * Edge Function para enviar Web Push Notifications.
 * Chamada via pg_net (triggers/cron) com service_role_key.
 *
 * Payload:
 * {
 *   user_ids: string[],
 *   title: string,
 *   body: string,
 *   url?: string,
 *   type?: string
 * }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth: requer service_role ou JWT válido
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // VAPID keys — setar via `supabase secrets set`
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:tech@welcomecrm.com";

    if (!vapidPublicKey || !vapidPrivateKey) {
      return new Response(
        JSON.stringify({ error: "VAPID keys not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { user_ids, title, body, url, type } = await req.json();

    if (!user_ids?.length || !title) {
      return new Response(
        JSON.stringify({ error: "user_ids and title are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Checar preferências dos usuários (se type informado)
    const notificationType = type || "general";
    let allowedUserIds = [...user_ids];

    if (notificationType !== "general") {
      const { data: prefs } = await supabase
        .from("push_notification_preferences")
        .select("user_id, enabled, " + notificationType)
        .in("user_id", user_ids);

      if (prefs?.length) {
        const blockedUsers = new Set(
          prefs
            .filter((p: Record<string, unknown>) => !p.enabled || p[notificationType] === false)
            .map((p: Record<string, unknown>) => p.user_id)
        );
        allowedUserIds = user_ids.filter((id: string) => !blockedUsers.has(id));
      }
      // Se user não tem row de preferências, envia (backward compat)
    }

    if (!allowedUserIds.length) {
      return new Response(
        JSON.stringify({ sent: 0, failed: 0, skipped: user_ids.length, message: "All users opted out" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar subscriptions dos usuários permitidos
    const { data: subscriptions, error: fetchError } = await supabase
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth")
      .in("user_id", allowedUserIds);

    if (fetchError) {
      throw new Error(`Failed to fetch subscriptions: ${fetchError.message}`);
    }

    if (!subscriptions?.length) {
      return new Response(
        JSON.stringify({ sent: 0, failed: 0, message: "No subscriptions found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload = JSON.stringify({
      title,
      body,
      url: url || "/",
      type: type || "general",
      tag: type || "general",
    });

    let sent = 0;
    let failed = 0;
    const staleIds: string[] = [];

    // Enviar push para cada subscription
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          const result = await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload
          );
          console.log(`[push] Sent to ${sub.user_id} — status: ${result.statusCode}`);
          sent++;
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          const errBody = (err as { body?: string })?.body;
          console.error(`[push] Failed for ${sub.user_id} — status: ${statusCode}, body: ${errBody}`);
          if (statusCode === 410 || statusCode === 404) {
            // Subscription expirada — marcar para remoção
            staleIds.push(sub.id);
          }
          failed++;
        }
      })
    );

    // Limpar subscriptions expiradas
    if (staleIds.length > 0) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .in("id", staleIds);
    }

    return new Response(
      JSON.stringify({
        sent,
        failed,
        stale_removed: staleIds.length,
        total_subscriptions: subscriptions.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[send-push-notification] Error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
