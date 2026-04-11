/**
 * ai-agent-from-wizard — Cria agente completo a partir dos dados do wizard.
 *
 * POST /functions/v1/ai-agent-from-wizard
 * Headers: Authorization: Bearer $SERVICE_ROLE_KEY
 *
 * Body: {
 *   template_id: UUID,
 *   wizard_data: {
 *     step1: { company_name, company_description, agent_name, agent_persona, tone, language },
 *     step2: { template_id },
 *     step3: { stages: QualificationStage[] },
 *     step4: { kb_items: KbItem[] },
 *     step5: { pricing_model, pricing_json, fee_presentation_timing, process_steps,
 *              methodology_text, has_secondary_contacts, secondary_contact_fields,
 *              special_scenarios: SpecialScenario[], form_data_fields, protected_fields,
 *              calendar_system, calendar_config },
 *     step6: { escalation_rules, escalation_triggers },
 *     step7: { phone_line_id, go_live }
 *   },
 *   draft_id?: UUID  // Se retomando um rascunho
 * }
 *
 * Returns: { agent_id, agent_name, status }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WizardData {
  step1: {
    company_name: string;
    company_description?: string;
    agent_name: string;
    agent_persona?: string;
    tone?: string;
    language?: string;
    produto?: string;
  };
  step2: {
    template_id: string;
  };
  step3: {
    stages: Array<{
      stage_name: string;
      stage_key?: string;
      question: string;
      subquestions?: string[];
      disqualification_triggers?: Array<{ trigger: string; message: string }>;
      advance_to_stage_id?: string;
      advance_condition?: string;
      response_options?: string[];
    }>;
  };
  step4: {
    kb_items?: Array<{ titulo: string; conteudo: string; tags?: string[] }>;
    kb_name?: string;
  };
  step5: {
    pricing_model?: string;
    pricing_json?: Record<string, unknown>;
    fee_presentation_timing?: string;
    process_steps?: string[];
    methodology_text?: string;
    has_secondary_contacts?: boolean;
    secondary_contact_role_name?: string;
    secondary_contact_fields?: string[];
    special_scenarios?: Array<{
      scenario_name: string;
      trigger_type: string;
      trigger_config: Record<string, unknown>;
      response_adjustment?: string;
      simplified_qualification?: unknown[];
      skip_fee_presentation?: boolean;
      skip_meeting_scheduling?: boolean;
      auto_assign_tag?: string;
      handoff_message?: string;
    }>;
    form_data_fields?: string[];
    protected_fields?: string[];
    calendar_system?: string;
    calendar_config?: Record<string, unknown>;
  };
  step6: {
    escalation_rules?: Array<Record<string, unknown>>;
    escalation_triggers?: Array<Record<string, unknown>>;
    fallback_message?: string;
  };
  step7: {
    phone_line_id?: string;
    go_live?: boolean;
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { template_id, wizard_data, draft_id, org_id } = await req.json() as {
      template_id: string;
      wizard_data: WizardData;
      draft_id?: string;
      org_id?: string;
    };

    // Resolve org_id: explicit > JWT > fallback
    const resolvedOrgId = org_id || "b0000000-0000-0000-0000-000000000001";

    const s1 = wizard_data.step1;
    const s3 = wizard_data.step3;
    const s4 = wizard_data.step4;
    const s5 = wizard_data.step5;
    const s6 = wizard_data.step6;
    const s7 = wizard_data.step7;

    // ── 1. Buscar template ──
    const { data: template, error: tmplErr } = await supabase
      .from("ai_agent_templates")
      .select("*")
      .eq("id", template_id)
      .single();

    if (tmplErr || !template) {
      return new Response(
        JSON.stringify({ error: "Template not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 2. Gerar system_prompt inline (combinando template + dados do wizard) ──
    // O router v2 gera prompts dinamicamente; aqui guardamos um prompt base
    const systemPrompt = `Voce e ${s1.agent_name}, ${s1.agent_persona || template.tipo} da ${s1.company_name}.
${s1.company_description ? `\nSobre a empresa: ${s1.company_description}` : ""}
Tom: ${s1.tone || "professional"}. Idioma: ${s1.language || "pt-BR"}.

${s5?.methodology_text ? `Metodologia: ${s5.methodology_text}` : ""}

Este agente usa o pipeline v2 (backoffice + data + persona + validator + formatter).
Os prompts detalhados sao gerados dinamicamente pelo ai-agent-router a partir das tabelas de configuracao.`;

    // ── 3. Criar agente ──
    const { data: agent, error: agentErr } = await supabase
      .from("ai_agents")
      .insert({
        org_id: resolvedOrgId,
        nome: s1.agent_name,
        descricao: s1.company_description,
        persona: s1.agent_persona,
        tipo: template.tipo,
        produto: s1.produto || "trips",
        modelo: "gpt-5.1",
        temperature: 0.7,
        max_tokens: 1024,
        system_prompt: systemPrompt,
        template_id: template_id,
        is_template_based: true,
        routing_criteria: template.default_routing_criteria || {},
        escalation_rules: s6?.escalation_rules || template.default_escalation_rules || [],
        fallback_message: s6?.fallback_message || "Desculpe, não consegui processar. Um agente humano vai ajudá-lo.",
        ativa: s7?.go_live || false,
      })
      .select("id, nome")
      .single();

    if (agentErr || !agent) {
      return new Response(
        JSON.stringify({ error: "Failed to create agent", details: agentErr?.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 4. Criar business config ──
    await supabase.from("ai_agent_business_config").insert({
      agent_id: agent.id,
      company_name: s1.company_name,
      company_description: s1.company_description,
      tone: s1.tone || "professional",
      language: s1.language || "pt-BR",
      pricing_model: s5?.pricing_model,
      pricing_json: s5?.pricing_json || {},
      fee_presentation_timing: s5?.fee_presentation_timing,
      process_steps: s5?.process_steps || [],
      methodology_text: s5?.methodology_text,
      calendar_system: s5?.calendar_system || "none",
      calendar_config: s5?.calendar_config || {},
      protected_fields: s5?.protected_fields || ["pessoa_principal_id", "produto_data", "valor_estimado"],
      form_data_fields: s5?.form_data_fields || [],
      has_secondary_contacts: s5?.has_secondary_contacts || false,
      secondary_contact_role_name: s5?.secondary_contact_role_name || "traveler",
      secondary_contact_fields: s5?.secondary_contact_fields || [],
      escalation_triggers: s6?.escalation_triggers || [],
    });

    // ── 5. Criar qualification flow ──
    if (s3?.stages?.length) {
      const flowRows = s3.stages.map((stage, i) => ({
        agent_id: agent.id,
        stage_order: i + 1,
        stage_name: stage.stage_name,
        stage_key: stage.stage_key,
        question: stage.question,
        subquestions: stage.subquestions || [],
        disqualification_triggers: stage.disqualification_triggers || [],
        advance_to_stage_id: stage.advance_to_stage_id,
        advance_condition: stage.advance_condition,
        response_options: stage.response_options,
      }));

      await supabase.from("ai_agent_qualification_flow").insert(flowRows);
    }

    // ── 6. Criar special scenarios ──
    if (s5?.special_scenarios?.length) {
      const scenarioRows = s5.special_scenarios.map((s) => ({
        agent_id: agent.id,
        scenario_name: s.scenario_name,
        trigger_type: s.trigger_type,
        trigger_config: s.trigger_config,
        response_adjustment: s.response_adjustment,
        simplified_qualification: s.simplified_qualification,
        skip_fee_presentation: s.skip_fee_presentation || false,
        skip_meeting_scheduling: s.skip_meeting_scheduling || false,
        auto_assign_tag: s.auto_assign_tag,
        handoff_message: s.handoff_message,
      }));

      await supabase.from("ai_agent_special_scenarios").insert(scenarioRows);
    }

    // ── 7. Criar knowledge base (se items fornecidos) ──
    if (s4?.kb_items?.length) {
      const { data: kb } = await supabase
        .from("ai_knowledge_bases")
        .insert({
          org_id: resolvedOrgId,
          nome: s4.kb_name || `KB - ${s1.agent_name}`,
          tipo: "faq",
          descricao: `Base de conhecimento do agente ${s1.agent_name}`,
        })
        .select("id")
        .single();

      if (kb) {
        const kbItems = s4.kb_items.map((item, i) => ({
          kb_id: kb.id,
          titulo: item.titulo,
          conteudo: item.conteudo,
          tags: item.tags || [],
          ordem: i,
        }));

        await supabase.from("ai_knowledge_base_items").insert(kbItems);
      }
    }

    // ── 8. Atribuir phone line (se fornecido) ──
    if (s7?.phone_line_id) {
      await supabase.from("ai_agent_phone_line_config").insert({
        agent_id: agent.id,
        phone_line_id: s7.phone_line_id,
        ativa: true,
        priority: 10,
      });
    }

    // ── 9. Marcar draft como completed (se existia) ──
    if (draft_id) {
      await supabase
        .from("ai_agent_wizard_drafts")
        .update({ status: "completed", agent_id: agent.id, updated_at: new Date().toISOString() })
        .eq("id", draft_id);
    }

    return new Response(
      JSON.stringify({
        agent_id: agent.id,
        agent_name: agent.nome,
        status: s7?.go_live ? "active" : "draft",
        template: template.nome,
        pipeline: "v2_5step",
      }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("ai-agent-from-wizard error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
