/**
 * export-org-data — LGPD Art. 18 data export
 *
 * Gera um dump JSON completo dos dados da organização do usuário autenticado.
 * Apenas admins podem solicitar.
 *
 * Tabelas exportadas (todas filtradas por org_id = JWT org):
 *   - organizations
 *   - profiles (sem password_hash)
 *   - products
 *   - pipelines, pipeline_phases, pipeline_stages
 *   - cards, contatos, cards_contatos
 *   - tarefas, activities, mensagens
 *   - proposals, proposal_items
 *   - motivos_perda, card_tags
 *   - sections, system_fields
 *   - integration_settings (tokens redactados)
 *   - audit_logs (últimos 90 dias)
 *
 * Retorno: JSON streamed. Para exports muito grandes, considerar S3 signed URL.
 *
 * Chamada típica pelo frontend:
 *   const { data } = await supabase.functions.invoke('export-org-data')
 *   download(data, 'welcomecrm-export.json')
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXPORTABLE_TABLES = [
  "organizations",
  "profiles",
  "products",
  "pipelines",
  "pipeline_phases",
  "pipeline_stages",
  "sections",
  "system_fields",
  "stage_field_config",
  "section_field_config",
  "cards",
  "contatos",
  "cards_contatos",
  "card_tags",
  "card_tag_assignments",
  "tarefas",
  "activities",
  "mensagens",
  "reunioes",
  "arquivos",
  "proposals",
  "proposal_sections",
  "proposal_items",
  "motivos_perda",
  "departments",
  "teams",
  "roles",
  "automation_rules",
  "cadence_templates",
  "cadence_instances",
  "integration_settings",
  "integration_field_map",
  "integration_stage_map",
  "historico_fases",
];

// Campos sensíveis a remover/redactar antes do export
const REDACT_FIELDS: Record<string, string[]> = {
  profiles: ["raw_user_meta_data", "raw_app_meta_data"],
  integration_settings: ["value"], // Tokens/secrets — redactados
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cliente com JWT do usuário para verificar permissões
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData } = await supabaseUser.auth.getUser();
    if (!userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verificar que é admin
    const { data: profile, error: profileError } = await supabaseUser
      .from("profiles")
      .select("id, is_admin, role, org_id, nome, email")
      .eq("id", userData.user.id)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isAdmin = profile.is_admin === true || profile.role === "admin";
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Apenas administradores podem exportar dados da organização (LGPD Art. 18)" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const orgId = profile.org_id;
    if (!orgId) {
      return new Response(JSON.stringify({ error: "User without org_id" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cliente service_role para fazer a exportação sem limitações de RLS
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Exportar cada tabela filtrando por org_id
    const exportData: Record<string, unknown> = {
      _metadata: {
        org_id: orgId,
        exported_at: new Date().toISOString(),
        exported_by: {
          id: profile.id,
          nome: profile.nome,
          email: profile.email,
        },
        lgpd_notice:
          "Este arquivo contém todos os dados pessoais tratados pelo WelcomeCRM para sua organização, conforme Art. 18 da LGPD. Campos sensíveis (tokens de integração) foram redactados. Mantenha este arquivo em local seguro.",
        version: "1.0",
      },
    };

    const errors: string[] = [];

    for (const tableName of EXPORTABLE_TABLES) {
      try {
        // profiles e organizations têm filtro ligeiramente diferente
        let query = supabase.from(tableName).select("*");

        if (tableName === "organizations") {
          query = query.eq("id", orgId);
        } else {
          query = query.eq("org_id", orgId);
        }

        const { data, error } = await query.limit(10000); // safety cap

        if (error) {
          errors.push(`${tableName}: ${error.message}`);
          exportData[tableName] = { _error: error.message };
          continue;
        }

        // Redact campos sensíveis
        const redactFields = REDACT_FIELDS[tableName] ?? [];
        const sanitized = (data ?? []).map((row: Record<string, unknown>) => {
          const clean = { ...row };
          for (const field of redactFields) {
            if (field in clean) {
              clean[field] = "[REDACTED]";
            }
          }
          return clean;
        });

        exportData[tableName] = sanitized;
      } catch (err) {
        errors.push(`${tableName}: ${String(err)}`);
        exportData[tableName] = { _error: String(err) };
      }
    }

    // Audit logs (últimos 90 dias)
    try {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const { data: audits } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("org_id", orgId)
        .gte("created_at", ninetyDaysAgo.toISOString())
        .limit(10000);

      exportData.audit_logs_last_90_days = audits ?? [];
    } catch (err) {
      errors.push(`audit_logs: ${String(err)}`);
    }

    // Terms acceptance
    try {
      const { data: terms } = await supabase
        .from("terms_acceptance")
        .select("*")
        .eq("org_id", orgId);
      exportData.terms_acceptance = terms ?? [];
    } catch (err) {
      errors.push(`terms_acceptance: ${String(err)}`);
    }

    if (errors.length > 0) {
      (exportData._metadata as Record<string, unknown>).export_errors = errors;
    }

    // Registrar no audit log que o export foi feito
    try {
      await supabase
        .from("audit_logs")
        .insert({
          org_id: orgId,
          table_name: "organizations",
          record_id: orgId,
          action: "data_export",
          changed_by: profile.id,
          new_data: { tables_exported: EXPORTABLE_TABLES.length, errors: errors.length },
        });
    } catch {
      // Não bloqueia o export
    }

    const filename = `welcomecrm-export-${orgId}-${new Date().toISOString().split("T")[0]}.json`;

    return new Response(JSON.stringify(exportData, null, 2), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("[export-org-data] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
