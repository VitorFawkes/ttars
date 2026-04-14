/**
 * send-password-reset — gera link de recovery via Supabase Admin e envia email
 * customizado via send-email (Resend). Substitui supabase.auth.resetPasswordForEmail
 * quando a app quer controle total sobre o template.
 *
 * Fluxo:
 *  1. Recebe { email, redirect_to? }
 *  2. Chama supabase.auth.admin.generateLink({ type: 'recovery', email })
 *  3. Invoca send-email com template password_reset + link gerado
 *
 * Fallback: se RESEND_API_KEY não estiver configurada, cai no fluxo nativo do
 * Supabase Auth (pelo menos o reset continua funcionando enquanto a app não
 * tiver Resend configurado).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const email = (body.email as string | undefined)?.trim().toLowerCase();
    const redirectTo = (body.redirect_to as string | undefined) ||
      `${Deno.env.get("APP_URL") ?? "https://welcomecrm.vercel.app"}/reset-password`;

    if (!email) {
      return new Response(JSON.stringify({ error: "Missing email" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Buscar nome do usuário (best-effort)
    const { data: profile } = await supabase
      .from("profiles")
      .select("nome")
      .eq("email", email)
      .maybeSingle();

    // Não expor se email existe ou não (security)
    if (!profile) {
      return new Response(JSON.stringify({ success: true, sent: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Gerar link de recovery via admin API
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error("[send-password-reset] generateLink error:", linkError);
      return new Response(
        JSON.stringify({ error: "Failed to generate recovery link" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const recoveryLink = linkData.properties.action_link;

    // Se RESEND não estiver configurado, fallback para nativo
    const hasResend = !!Deno.env.get("RESEND_API_KEY");
    if (!hasResend) {
      // Usa o fluxo nativo do Supabase Auth (emails via SMTP default do Supabase,
      // template default, mas ao menos chega no usuário).
      const { error: nativeErr } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      if (nativeErr) {
        return new Response(
          JSON.stringify({ error: nativeErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          success: true,
          sent: true,
          fallback_native: true,
          hint: "RESEND_API_KEY não configurada — email enviado via Supabase nativo.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Enviar email custom via send-email
    const sendRes = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: email,
          template_key: "password_reset",
          variables: {
            user_name: profile.nome ?? email.split("@")[0],
            link: recoveryLink,
          },
        }),
      }
    );

    const sendData = await sendRes.json();

    if (!sendRes.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: sendData }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, sent: true, provider_id: sendData.id ?? null }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[send-password-reset] unexpected:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
