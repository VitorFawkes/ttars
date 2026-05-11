/**
 * send-email — Edge Function genérica de email transacional via Resend.
 *
 * Modos de uso:
 *   1. Interno (trigger/RPC): service role chama com { template_key, to, variables }
 *   2. Direto (raw): admin chama com { to, subject, html, text }
 *
 * Templates suportados (definidos em templates.ts):
 *   - invite           : convite para novo usuário de uma org
 *   - password_reset   : link de reset de senha (usado pelo Supabase Auth)
 *   - lead_assigned    : notificação quando card é atribuído
 *   - org_welcome      : boas-vindas após provisionamento de org
 *
 * Env vars necessárias:
 *   - RESEND_API_KEY   : chave de API do Resend (https://resend.com)
 *   - RESEND_FROM      : "WelcomeCRM <noreply@seudominio.com>" (padrão: "WelcomeCRM <onboarding@resend.dev>")
 *   - APP_URL          : URL base do app (ex: https://crm.empresa.com) usada em links
 *
 * Se RESEND_API_KEY não estiver configurada, a função roda em "dry-run" e
 * apenas loga o email (útil para dev). Em produção, retorna erro 500 se faltar.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getTemplate, type TemplateKey, type TemplateVariables } from "./templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendEmailRequest {
  // Modo 1: template-based
  template_key?: TemplateKey;
  variables?: TemplateVariables;

  // Modo 2: raw
  subject?: string;
  html?: string;
  text?: string;

  // Comum
  to: string | string[];
  org_id?: string;
  reply_to?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Autenticação: service role OU usuário autenticado (admin da org)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as SendEmailRequest;
    const { template_key, variables, subject, html, text, to, reply_to } = body;

    if (!to) {
      return new Response(JSON.stringify({ error: "Missing 'to' field" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolver conteúdo do email: template ou raw
    let finalSubject = subject;
    let finalHtml = html;
    let finalText = text;

    if (template_key) {
      const tpl = getTemplate(template_key, variables ?? {});
      finalSubject = tpl.subject;
      finalHtml = tpl.html;
      finalText = tpl.text;
    }

    if (!finalSubject || !finalHtml) {
      return new Response(
        JSON.stringify({ error: "Missing subject/html or template_key" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const resendFrom = Deno.env.get("RESEND_FROM") ?? "WelcomeCRM <onboarding@resend.dev>";
    const toArray = Array.isArray(to) ? to : [to];

    // Log no email_log (para auditoria e retry) — best-effort
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Dry-run em dev (sem Resend configurado)
    if (!resendApiKey) {
      console.log("[send-email] DRY-RUN (RESEND_API_KEY não configurada):");
      console.log("  to:", toArray);
      console.log("  subject:", finalSubject);
      console.log("  template:", template_key ?? "raw");

      return new Response(
        JSON.stringify({
          dry_run: true,
          message:
            "RESEND_API_KEY não configurada. Email não foi enviado (modo dry-run). Configure a env var para habilitar envio real.",
          to: toArray,
          subject: finalSubject,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Envio via Resend API
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: resendFrom,
        to: toArray,
        subject: finalSubject,
        html: finalHtml,
        text: finalText,
        reply_to,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error("[send-email] Resend error:", resendData);

      // Log de falha (best-effort, não bloqueia)
      await supabase
        .from("email_log")
        .insert({
          to_email: toArray.join(", "),
          template_key: template_key ?? "raw",
          subject: finalSubject,
          status: "failed",
          error: JSON.stringify(resendData),
        })
        .then(() => {}, () => {});

      return new Response(
        JSON.stringify({ error: "Failed to send email", details: resendData }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log de sucesso
    await supabase
      .from("email_log")
      .insert({
        to_email: toArray.join(", "),
        template_key: template_key ?? "raw",
        subject: finalSubject,
        status: "sent",
        provider_id: resendData.id,
        sent_at: new Date().toISOString(),
      })
      .then(() => {}, () => {});

    return new Response(
      JSON.stringify({ success: true, id: resendData.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[send-email] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
