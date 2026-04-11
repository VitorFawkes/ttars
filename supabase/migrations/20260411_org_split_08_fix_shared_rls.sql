-- Org Split: Fix RLS para tabelas compartilhadas no Welcome Group
--
-- Problema: teams, roles, pipelines, pipeline_stages, etc. têm org_id = Welcome Group
-- mas RLS usa requesting_org_id() que agora retorna a org filha (Welcome Trips/Weddings).
--
-- Solução: Expandir a policy SELECT dessas tabelas para incluir a org pai (holding).
-- Pattern: org_id = requesting_org_id() OR org_id = parent_org do JWT

-- Helper: busca parent_org_id da org do JWT (cached por statement)
CREATE OR REPLACE FUNCTION requesting_parent_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT parent_org_id FROM organizations WHERE id = requesting_org_id();
$$;

-- =========================================================================
-- 1. Teams — CRÍTICO (causa "usuários sumiram dos times")
-- =========================================================================
DROP POLICY IF EXISTS "teams_org_select" ON teams;
CREATE POLICY "teams_org_select" ON teams
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

DROP POLICY IF EXISTS "teams_org_admin_all" ON teams;
CREATE POLICY "teams_org_admin_all" ON teams
    FOR ALL TO authenticated
    USING ((org_id = requesting_org_id() OR org_id = requesting_parent_org_id()) AND is_admin());

-- =========================================================================
-- 2. Roles
-- =========================================================================
DROP POLICY IF EXISTS "roles_org_select" ON roles;
CREATE POLICY "roles_org_select" ON roles
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

-- =========================================================================
-- 3. Pipelines
-- =========================================================================
DROP POLICY IF EXISTS "pipelines_org_select" ON pipelines;
CREATE POLICY "pipelines_org_select" ON pipelines
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

-- =========================================================================
-- 4. Pipeline Phases
-- =========================================================================
DROP POLICY IF EXISTS "pipeline_phases_org_select" ON pipeline_phases;
CREATE POLICY "pipeline_phases_org_select" ON pipeline_phases
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

-- =========================================================================
-- 5. Pipeline Stages
-- =========================================================================
DROP POLICY IF EXISTS "pipeline_stages_org_select" ON pipeline_stages;
CREATE POLICY "pipeline_stages_org_select" ON pipeline_stages
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

-- =========================================================================
-- 6. Profiles — já corrigido (id = auth.uid()), mas garantir parent org
-- =========================================================================
DROP POLICY IF EXISTS "profiles_org_select" ON profiles;
CREATE POLICY "profiles_org_select" ON profiles
    FOR SELECT TO authenticated
    USING (
        id = auth.uid()
        OR org_id = requesting_org_id()
        OR org_id = requesting_parent_org_id()
    );

DROP POLICY IF EXISTS "profiles_admin_all" ON profiles;
CREATE POLICY "profiles_admin_all" ON profiles
    FOR ALL TO authenticated
    USING ((org_id = requesting_org_id() OR org_id = requesting_parent_org_id()) AND is_admin());

-- =========================================================================
-- 7. Demais tabelas compartilhadas — mesmo pattern
-- =========================================================================

-- card_creation_rules
DROP POLICY IF EXISTS "card_creation_rules_org_select" ON card_creation_rules;
CREATE POLICY "card_creation_rules_org_select" ON card_creation_rules
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

-- pipeline_card_settings
DROP POLICY IF EXISTS "pipeline_card_settings_org_select" ON pipeline_card_settings;
CREATE POLICY "pipeline_card_settings_org_select" ON pipeline_card_settings
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

-- stage_field_config
DROP POLICY IF EXISTS "stage_field_config_org_select" ON stage_field_config;
CREATE POLICY "stage_field_config_org_select" ON stage_field_config
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

-- sections
DROP POLICY IF EXISTS "sections_org_select" ON sections;
CREATE POLICY "sections_org_select" ON sections
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

-- system_fields
DROP POLICY IF EXISTS "system_fields_org_select" ON system_fields;
CREATE POLICY "system_fields_org_select" ON system_fields
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

-- motivos_perda
DROP POLICY IF EXISTS "motivos_perda_org_select" ON motivos_perda;
CREATE POLICY "motivos_perda_org_select" ON motivos_perda
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

-- departments
DROP POLICY IF EXISTS "departments_org_select" ON departments;
CREATE POLICY "departments_org_select" ON departments
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

-- card_tags
DROP POLICY IF EXISTS "card_tags_org_select" ON card_tags;
CREATE POLICY "card_tags_org_select" ON card_tags
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

-- cadence_templates
DROP POLICY IF EXISTS "cadence_templates_org_select" ON cadence_templates;
CREATE POLICY "cadence_templates_org_select" ON cadence_templates
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

-- cadence_steps
DROP POLICY IF EXISTS "cadence_steps_org_select" ON cadence_steps;
CREATE POLICY "cadence_steps_org_select" ON cadence_steps
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

-- automacao_regras
DROP POLICY IF EXISTS "automacao_regras_org_select" ON automacao_regras;
CREATE POLICY "automacao_regras_org_select" ON automacao_regras
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

-- automation_rules
DROP POLICY IF EXISTS "automation_rules_org_select" ON automation_rules;
CREATE POLICY "automation_rules_org_select" ON automation_rules
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

-- integration_settings
DROP POLICY IF EXISTS "integration_settings_org_select" ON integration_settings;
CREATE POLICY "integration_settings_org_select" ON integration_settings
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

-- reactivation_patterns
DROP POLICY IF EXISTS "reactivation_patterns_org_select" ON reactivation_patterns;
CREATE POLICY "reactivation_patterns_org_select" ON reactivation_patterns
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

-- email_templates
DROP POLICY IF EXISTS "email_templates_org_select" ON email_templates;
CREATE POLICY "email_templates_org_select" ON email_templates
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

-- mensagem_templates
DROP POLICY IF EXISTS "mensagem_templates_org_select" ON mensagem_templates;
CREATE POLICY "mensagem_templates_org_select" ON mensagem_templates
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

-- document_types
DROP POLICY IF EXISTS "document_types_org_select" ON document_types;
CREATE POLICY "document_types_org_select" ON document_types
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

-- destinations
DROP POLICY IF EXISTS "destinations_org_select" ON destinations;
CREATE POLICY "destinations_org_select" ON destinations
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

-- stage_transitions
DROP POLICY IF EXISTS "stage_transitions_org_select" ON stage_transitions;
CREATE POLICY "stage_transitions_org_select" ON stage_transitions
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

-- phase_visibility_rules
DROP POLICY IF EXISTS "phase_visibility_rules_org_select" ON phase_visibility_rules;
CREATE POLICY "phase_visibility_rules_org_select" ON phase_visibility_rules
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

-- notification_type_config
DROP POLICY IF EXISTS "notification_type_config_org_select" ON notification_type_config;
CREATE POLICY "notification_type_config_org_select" ON notification_type_config
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

-- card_alert_rules
DROP POLICY IF EXISTS "card_alert_rules_org_select" ON card_alert_rules;
CREATE POLICY "card_alert_rules_org_select" ON card_alert_rules
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

-- contato_meios
DROP POLICY IF EXISTS "contato_meios_org_select" ON contato_meios;
CREATE POLICY "contato_meios_org_select" ON contato_meios
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

-- invitations
DROP POLICY IF EXISTS "invitations_org_select" ON invitations;
CREATE POLICY "invitations_org_select" ON invitations
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

-- text_blocks
DROP POLICY IF EXISTS "text_blocks_org_select" ON text_blocks;
CREATE POLICY "text_blocks_org_select" ON text_blocks
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

-- configuracao_taxa_trips
DROP POLICY IF EXISTS "configuracao_taxa_trips_org_select" ON configuracao_taxa_trips;
CREATE POLICY "configuracao_taxa_trips_org_select" ON configuracao_taxa_trips
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

-- section_field_config
DROP POLICY IF EXISTS "section_field_config_org_select" ON section_field_config;
CREATE POLICY "section_field_config_org_select" ON section_field_config
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

-- stage_section_config
DROP POLICY IF EXISTS "stage_section_config_org_select" ON stage_section_config;
CREATE POLICY "stage_section_config_org_select" ON stage_section_config
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

-- api_keys
DROP POLICY IF EXISTS "api_keys_org_select" ON api_keys;
CREATE POLICY "api_keys_org_select" ON api_keys
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

-- integration_field_map
DROP POLICY IF EXISTS "integration_field_map_org_select" ON integration_field_map;
CREATE POLICY "integration_field_map_org_select" ON integration_field_map
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

-- integration_stage_map
DROP POLICY IF EXISTS "integration_stage_map_org_select" ON integration_stage_map;
CREATE POLICY "integration_stage_map_org_select" ON integration_stage_map
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

-- integration_inbound_triggers
DROP POLICY IF EXISTS "integration_inbound_triggers_org_select" ON integration_inbound_triggers;
CREATE POLICY "integration_inbound_triggers_org_select" ON integration_inbound_triggers
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());

-- integration_outbound_triggers
DROP POLICY IF EXISTS "integration_outbound_triggers_org_select" ON integration_outbound_triggers;
CREATE POLICY "integration_outbound_triggers_org_select" ON integration_outbound_triggers
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id());
