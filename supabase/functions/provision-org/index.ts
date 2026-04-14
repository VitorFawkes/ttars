import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Verificar JWT do usuário
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Decodar JWT localmente (evita roundtrip /auth/v1/user que pode falhar
    //    com session_not_found quando a sessão foi invalidada via admin API).
    let userId: string | null = null;
    let claimIsPlatformAdmin = false;
    try {
      const token = authHeader.replace(/^Bearer\s+/i, "");
      const payload = JSON.parse(atob(token.split(".")[1]));
      userId = payload.sub ?? null;
      claimIsPlatformAdmin = payload?.app_metadata?.is_platform_admin === true;
    } catch (_) {
      // JWT malformado
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: "JWT inválido" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Criar cliente com o JWT do usuário (para queries que precisam de RLS)
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // 4. Double-check: confirmar is_platform_admin no banco (claim do JWT
    //    pode estar stale se o usuário foi revogado após emissão do token).
    const { data: profile, error: profileError } = await supabaseUser
      .from("profiles")
      .select("id, is_platform_admin")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "Perfil não encontrado", details: profileError?.message }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!profile.is_platform_admin) {
      return new Response(
        JSON.stringify({ error: "Acesso restrito a platform admins" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Criar cliente service_role para operações sem restrição de RLS
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ==========================================================================
    // GET /provision-org — listar todas as organizações com stats
    // ==========================================================================
    if (req.method === "GET") {
      const { data: orgs, error: orgsError } = await supabase
        .from("organizations")
        .select("id, name, slug, active, created_at")
        .order("created_at", { ascending: false });

      if (orgsError) throw orgsError;

      // Buscar stats: usuários e cards por org
      const orgIds = orgs?.map((o) => o.id) ?? [];

      const [usersRes, cardsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("org_id")
          .in("org_id", orgIds),
        supabase
          .from("cards")
          .select("org_id, status_comercial")
          .in("org_id", orgIds)
          .neq("status_comercial", "perdido"),
      ]);

      // Agregar contagens por org
      const userCount: Record<string, number> = {};
      const cardCount: Record<string, number> = {};

      for (const p of usersRes.data ?? []) {
        userCount[p.org_id] = (userCount[p.org_id] ?? 0) + 1;
      }
      for (const c of cardsRes.data ?? []) {
        cardCount[c.org_id] = (cardCount[c.org_id] ?? 0) + 1;
      }

      const result = (orgs ?? []).map((org) => ({
        ...org,
        user_count: userCount[org.id] ?? 0,
        active_card_count: cardCount[org.id] ?? 0,
      }));

      return new Response(JSON.stringify({ organizations: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ==========================================================================
    // POST /provision-org — criar nova organização
    // ==========================================================================
    if (req.method === "POST") {
      const body = await req.json();
      const { name, slug, adminEmail, template, productName, productSlug } = body;

      if (!name || !slug || !adminEmail) {
        return new Response(
          JSON.stringify({ error: "name, slug e adminEmail são obrigatórios" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verificar se slug já existe (maybeSingle para não erroar quando não existe)
      const { data: existing } = await supabase
        .from("organizations")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();

      if (existing) {
        return new Response(
          JSON.stringify({ error: `Slug '${slug}' já está em uso` }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Chamar provision_account_with_workspace — cria account (parent) +
      // primeiro workspace (filho) atomicamente + invite admin pro workspace.
      // A RPC grava audit log "account.create" e retorna IDs + token do invite.
      const { data: provisionResult, error: provisionError } = await supabase.rpc(
        "provision_account_with_workspace",
        {
          p_account_name: name,
          p_account_slug: slug,
          p_admin_email: adminEmail,
          p_workspace_name: name,
          p_workspace_slug: `${slug}-main`,
          p_template: template ?? "generic_3phase",
          p_product_name: productName ?? "Principal",
          p_product_slug: productSlug ?? "TRIPS",
        }
      );

      if (provisionError) {
        console.error("[provision-org] Erro:", provisionError);
        return new Response(
          JSON.stringify({ error: provisionError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const orgId = provisionResult?.account_id as string;
      const workspaceId = provisionResult?.workspace_id as string | undefined;
      const inviteToken = provisionResult?.invite_token as string | null | undefined;

      const appUrl = Deno.env.get("APP_URL") ?? "https://crm.welcomegroup.com.br";
      const inviteUrl = inviteToken ? `${appUrl}/invite/${inviteToken}` : null;
      const invite = inviteToken ? { token: inviteToken, email: adminEmail } : null;

      // Enviar email de convite + boas-vindas automaticamente (best-effort)
      let emailStatus: "sent" | "failed" | "dry_run" | "skipped" = "skipped";
      let emailError: string | null = null;

      if (invite?.token) {
        try {
          const emailRes = await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                to: adminEmail,
                org_id: orgId,
                template_key: "invite",
                variables: {
                  org_name: name,
                  role_name: "Administrador",
                  token: invite.token,
                  inviter_name: "Equipe WelcomeCRM",
                },
              }),
            }
          );

          const emailData = await emailRes.json();
          if (emailRes.ok) {
            emailStatus = emailData.dry_run ? "dry_run" : "sent";
          } else {
            emailStatus = "failed";
            emailError = emailData.error ?? "Unknown error";
          }
        } catch (err) {
          emailStatus = "failed";
          emailError = String(err);
          console.error("[provision-org] email dispatch failed:", err);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          orgId,
          workspaceId,
          inviteToken: invite?.token ?? null,
          inviteUrl,
          email: {
            status: emailStatus,
            error: emailError,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Método não suportado" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[provision-org] Erro inesperado:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
