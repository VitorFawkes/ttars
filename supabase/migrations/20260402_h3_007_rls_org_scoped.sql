-- H3-007: Replace existing RLS policies with org-scoped policies
-- Strategy: additive-then-swap — create new org-scoped policies,
-- then drop old permissive policies.
--
-- IMPORTANT: This migration uses requesting_org_id() from H3-001.
-- If issues occur, emergency rollback: ALTER TABLE {t} DISABLE ROW LEVEL SECURITY;
--
-- ROLLBACK: Restore original policies from schema-baseline-20260331.sql

-- =============================================================================
-- CARDS — Replace existing permissive policies with org-scoped
-- =============================================================================

-- Ensure RLS is enabled
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;

-- Drop old policies (baseline names)
DROP POLICY IF EXISTS "Cards delete by admin" ON cards;
DROP POLICY IF EXISTS "Cards insert by authenticated" ON cards;
DROP POLICY IF EXISTS "Cards update by authenticated" ON cards;
DROP POLICY IF EXISTS "Cards viewable by authenticated" ON cards;
-- (baseline names match — no additional drops needed)

-- New org-scoped policies
CREATE POLICY "cards_org_select" ON cards
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());

CREATE POLICY "cards_org_insert" ON cards
  FOR INSERT TO authenticated
  WITH CHECK (org_id = requesting_org_id());

CREATE POLICY "cards_org_update" ON cards
  FOR UPDATE TO authenticated
  USING (org_id = requesting_org_id());

CREATE POLICY "cards_org_delete" ON cards
  FOR DELETE TO authenticated
  USING (org_id = requesting_org_id() AND EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_admin = true OR role = 'admin')
  ));

CREATE POLICY "cards_service_all" ON cards
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- CONTATOS
-- =============================================================================
ALTER TABLE contatos ENABLE ROW LEVEL SECURITY;

-- Guessed names (keep for safety with IF EXISTS)
DROP POLICY IF EXISTS "Contatos viewable by authenticated" ON contatos;
DROP POLICY IF EXISTS "Contatos editable by authenticated" ON contatos;
DROP POLICY IF EXISTS "contatos_select_authenticated" ON contatos;
DROP POLICY IF EXISTS "contatos_all_authenticated" ON contatos;
-- Actual baseline names
DROP POLICY IF EXISTS "Usuarios autenticados podem ver todos os contatos" ON contatos;
DROP POLICY IF EXISTS "Usuarios autenticados podem criar contatos" ON contatos;
DROP POLICY IF EXISTS "Usuarios autenticados podem atualizar contatos" ON contatos;
DROP POLICY IF EXISTS "Usuarios autenticados podem deletar contatos" ON contatos;

CREATE POLICY "contatos_org_select" ON contatos
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());

CREATE POLICY "contatos_org_insert" ON contatos
  FOR INSERT TO authenticated
  WITH CHECK (org_id = requesting_org_id());

CREATE POLICY "contatos_org_update" ON contatos
  FOR UPDATE TO authenticated
  USING (org_id = requesting_org_id());

CREATE POLICY "contatos_org_delete" ON contatos
  FOR DELETE TO authenticated
  USING (org_id = requesting_org_id());

CREATE POLICY "contatos_service_all" ON contatos
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- PIPELINES
-- =============================================================================
ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Pipelines viewable by authenticated" ON pipelines;

CREATE POLICY "pipelines_org_select" ON pipelines
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());

CREATE POLICY "pipelines_org_admin_all" ON pipelines
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id() AND is_admin());

CREATE POLICY "pipelines_service_all" ON pipelines
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- PIPELINE_STAGES
-- =============================================================================
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access" ON pipeline_stages;
DROP POLICY IF EXISTS "Etapas viewable by authenticated" ON pipeline_stages;

CREATE POLICY "pipeline_stages_org_select" ON pipeline_stages
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());

CREATE POLICY "pipeline_stages_org_admin_all" ON pipeline_stages
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id() AND is_admin());

CREATE POLICY "pipeline_stages_service_all" ON pipeline_stages
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- PIPELINE_PHASES
-- =============================================================================
ALTER TABLE pipeline_phases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow insert/delete for admins" ON pipeline_phases;
DROP POLICY IF EXISTS "Allow read access for authenticated users" ON pipeline_phases;
DROP POLICY IF EXISTS "Allow update for authenticated users" ON pipeline_phases;

CREATE POLICY "pipeline_phases_org_select" ON pipeline_phases
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());

CREATE POLICY "pipeline_phases_org_admin_all" ON pipeline_phases
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id() AND is_admin());

CREATE POLICY "pipeline_phases_service_all" ON pipeline_phases
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- DEPARTMENTS
-- =============================================================================
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "departments_select_authenticated" ON departments;

CREATE POLICY "departments_org_select" ON departments
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());

CREATE POLICY "departments_org_admin_all" ON departments
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id() AND is_admin());

CREATE POLICY "departments_service_all" ON departments
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- TEAMS
-- =============================================================================
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage teams" ON teams;
DROP POLICY IF EXISTS "teams_select_authenticated" ON teams;

CREATE POLICY "teams_org_select" ON teams
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());

CREATE POLICY "teams_org_admin_all" ON teams
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id() AND is_admin());

CREATE POLICY "teams_service_all" ON teams
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- PROFILES — Already has org_id, add org-scoped policy
-- =============================================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Guessed names (keep for safety)
DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON profiles;
DROP POLICY IF EXISTS "profiles_select_authenticated" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
-- Actual baseline names
DROP POLICY IF EXISTS "Allow authenticated users to view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;

CREATE POLICY "profiles_org_select" ON profiles
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());

CREATE POLICY "profiles_self_update" ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() AND org_id = requesting_org_id());

CREATE POLICY "profiles_admin_all" ON profiles
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id() AND is_admin());

CREATE POLICY "profiles_service_all" ON profiles
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- INVITATIONS
-- =============================================================================
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and managers can create invitations" ON invitations;
DROP POLICY IF EXISTS "Admins and managers can delete invitations" ON invitations;
DROP POLICY IF EXISTS "Admins and managers can view invitations" ON invitations;

CREATE POLICY "invitations_org_select" ON invitations
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());

CREATE POLICY "invitations_org_admin_all" ON invitations
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id() AND is_admin());

CREATE POLICY "invitations_service_all" ON invitations
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- ROLES
-- =============================================================================
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

-- Guessed names (keep for safety)
DROP POLICY IF EXISTS "Roles viewable by authenticated" ON roles;
DROP POLICY IF EXISTS "roles_select_authenticated" ON roles;
-- Actual baseline names
DROP POLICY IF EXISTS "Admins can manage roles" ON roles;
DROP POLICY IF EXISTS "Authenticated users can read roles" ON roles;

CREATE POLICY "roles_org_select" ON roles
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());

CREATE POLICY "roles_org_admin_all" ON roles
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id() AND is_admin());

CREATE POLICY "roles_service_all" ON roles
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- MOTIVOS_PERDA
-- =============================================================================
ALTER TABLE motivos_perda ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage motivos_perda" ON motivos_perda;
DROP POLICY IF EXISTS "Authenticated users can read motivos_perda" ON motivos_perda;
DROP POLICY IF EXISTS "Motivos viewable by authenticated" ON motivos_perda;

CREATE POLICY "motivos_perda_org_select" ON motivos_perda
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());

CREATE POLICY "motivos_perda_org_admin_all" ON motivos_perda
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id() AND is_admin());

CREATE POLICY "motivos_perda_service_all" ON motivos_perda
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- ARQUIVOS — CRITICAL: replacing USING(true)
-- =============================================================================
ALTER TABLE arquivos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Arquivos editable by authenticated" ON arquivos;
DROP POLICY IF EXISTS "Arquivos viewable by authenticated" ON arquivos;
DROP POLICY IF EXISTS "arquivos_select" ON arquivos;
DROP POLICY IF EXISTS "arquivos_insert" ON arquivos;

CREATE POLICY "arquivos_org_select" ON arquivos
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());

CREATE POLICY "arquivos_org_all" ON arquivos
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

CREATE POLICY "arquivos_service_all" ON arquivos
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- ACTIVITIES
-- =============================================================================
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert activities" ON activities;
DROP POLICY IF EXISTS "Users can view activities" ON activities;

CREATE POLICY "activities_org_select" ON activities
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());

CREATE POLICY "activities_org_insert" ON activities
  FOR INSERT TO authenticated
  WITH CHECK (org_id = requesting_org_id());

CREATE POLICY "activities_service_all" ON activities
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- TAREFAS
-- =============================================================================
ALTER TABLE tarefas ENABLE ROW LEVEL SECURITY;

-- Guessed names (keep for safety)
DROP POLICY IF EXISTS "Tarefas viewable by authenticated" ON tarefas;
DROP POLICY IF EXISTS "Tarefas editable by authenticated" ON tarefas;
DROP POLICY IF EXISTS "tarefas_select_authenticated" ON tarefas;
DROP POLICY IF EXISTS "tarefas_all_authenticated" ON tarefas;
-- Actual baseline names
DROP POLICY IF EXISTS "Tarefas delete by owner or admin" ON tarefas;
DROP POLICY IF EXISTS "Tarefas insert by authenticated" ON tarefas;
DROP POLICY IF EXISTS "Tarefas update by authenticated" ON tarefas;

CREATE POLICY "tarefas_org_select" ON tarefas
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());

CREATE POLICY "tarefas_org_all" ON tarefas
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

CREATE POLICY "tarefas_service_all" ON tarefas
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- REUNIOES
-- =============================================================================
ALTER TABLE reunioes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own meetings" ON reunioes;

CREATE POLICY "reunioes_org_select" ON reunioes
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());

CREATE POLICY "reunioes_org_all" ON reunioes
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

CREATE POLICY "reunioes_service_all" ON reunioes
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- PROPOSALS
-- =============================================================================
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view proposals by token" ON proposals;
DROP POLICY IF EXISTS "Users can delete own draft proposals" ON proposals;
DROP POLICY IF EXISTS "Users can insert proposals" ON proposals;
DROP POLICY IF EXISTS "Users can update proposals" ON proposals;
DROP POLICY IF EXISTS "Users can view proposals" ON proposals;

CREATE POLICY "proposals_org_select" ON proposals
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());

-- Public access via token (anonymous users viewing proposals)
CREATE POLICY "proposals_public_by_token" ON proposals
  FOR SELECT TO anon
  USING (public_token IS NOT NULL);

CREATE POLICY "proposals_org_all" ON proposals
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

CREATE POLICY "proposals_service_all" ON proposals
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- HISTORICO_FASES
-- =============================================================================
ALTER TABLE historico_fases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Historico viewable by authenticated" ON historico_fases;

CREATE POLICY "historico_fases_org_select" ON historico_fases
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());

CREATE POLICY "historico_fases_service_all" ON historico_fases
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- MENSAGENS
-- =============================================================================
ALTER TABLE mensagens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Mensagens editable by authenticated" ON mensagens;
-- Actual baseline name (also has a SELECT policy)
DROP POLICY IF EXISTS "Mensagens viewable by authenticated" ON mensagens;

CREATE POLICY "mensagens_org_select" ON mensagens
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());

CREATE POLICY "mensagens_org_all" ON mensagens
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

CREATE POLICY "mensagens_service_all" ON mensagens
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- CARDS_CONTATOS
-- =============================================================================
ALTER TABLE cards_contatos ENABLE ROW LEVEL SECURITY;

-- Guessed names (keep for safety)
DROP POLICY IF EXISTS "cards_contatos viewable by authenticated" ON cards_contatos;
DROP POLICY IF EXISTS "cards_contatos editable by authenticated" ON cards_contatos;
DROP POLICY IF EXISTS "cards_contatos_select_authenticated" ON cards_contatos;
DROP POLICY IF EXISTS "cards_contatos_all_authenticated" ON cards_contatos;
-- Actual baseline names
DROP POLICY IF EXISTS "Usuarios autenticados podem ver cards_contatos" ON cards_contatos;
DROP POLICY IF EXISTS "Usuarios autenticados podem criar cards_contatos" ON cards_contatos;
DROP POLICY IF EXISTS "Usuarios autenticados podem atualizar cards_contatos" ON cards_contatos;
DROP POLICY IF EXISTS "Usuarios autenticados podem deletar cards_contatos" ON cards_contatos;

CREATE POLICY "cards_contatos_org_select" ON cards_contatos
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());

CREATE POLICY "cards_contatos_org_all" ON cards_contatos
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

CREATE POLICY "cards_contatos_service_all" ON cards_contatos
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- CARD_FINANCIAL_ITEMS
-- =============================================================================
ALTER TABLE card_financial_items ENABLE ROW LEVEL SECURITY;

-- Guessed names (keep for safety)
DROP POLICY IF EXISTS "card_financial_items_all" ON card_financial_items;
DROP POLICY IF EXISTS "Authenticated users can manage financial items" ON card_financial_items;
-- Actual baseline names
DROP POLICY IF EXISTS "card_financial_items_select" ON card_financial_items;
DROP POLICY IF EXISTS "card_financial_items_insert" ON card_financial_items;
DROP POLICY IF EXISTS "card_financial_items_update" ON card_financial_items;
DROP POLICY IF EXISTS "card_financial_items_delete" ON card_financial_items;

CREATE POLICY "card_financial_items_org_select" ON card_financial_items
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());

CREATE POLICY "card_financial_items_org_all" ON card_financial_items
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

CREATE POLICY "card_financial_items_service_all" ON card_financial_items
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- CARD_TEAM_MEMBERS
-- =============================================================================
ALTER TABLE card_team_members ENABLE ROW LEVEL SECURITY;

-- Guessed names (keep for safety)
DROP POLICY IF EXISTS "card_team_members_select" ON card_team_members;
DROP POLICY IF EXISTS "card_team_members_all" ON card_team_members;
-- Actual baseline name
DROP POLICY IF EXISTS "Authenticated users can manage card team" ON card_team_members;

CREATE POLICY "card_team_members_org_select" ON card_team_members
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());

CREATE POLICY "card_team_members_org_all" ON card_team_members
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

CREATE POLICY "card_team_members_service_all" ON card_team_members
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- FUTURE_OPPORTUNITIES
-- =============================================================================
ALTER TABLE future_opportunities ENABLE ROW LEVEL SECURITY;

-- Guessed names (keep for safety)
DROP POLICY IF EXISTS "future_opportunities_select" ON future_opportunities;
DROP POLICY IF EXISTS "future_opportunities_all" ON future_opportunities;
DROP POLICY IF EXISTS "authenticated can read future_opportunities" ON future_opportunities;
DROP POLICY IF EXISTS "authenticated can manage future_opportunities" ON future_opportunities;
-- Actual baseline names
DROP POLICY IF EXISTS "future_opp_select" ON future_opportunities;
DROP POLICY IF EXISTS "future_opp_insert" ON future_opportunities;
DROP POLICY IF EXISTS "future_opp_update" ON future_opportunities;
DROP POLICY IF EXISTS "future_opp_service" ON future_opportunities;

CREATE POLICY "future_opportunities_org_select" ON future_opportunities
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());

CREATE POLICY "future_opportunities_org_all" ON future_opportunities
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

CREATE POLICY "future_opportunities_service_all" ON future_opportunities
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- NOTIFICATIONS
-- =============================================================================
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
-- Guessed names (keep for safety)
DROP POLICY IF EXISTS "notifications_select_own" ON notifications;
DROP POLICY IF EXISTS "notifications_update_own" ON notifications;
-- Actual baseline name (service insert policy)
DROP POLICY IF EXISTS "Service can insert notifications" ON notifications;

CREATE POLICY "notifications_org_select" ON notifications
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id() AND user_id = auth.uid());

CREATE POLICY "notifications_org_update" ON notifications
  FOR UPDATE TO authenticated
  USING (org_id = requesting_org_id() AND user_id = auth.uid());

CREATE POLICY "notifications_service_all" ON notifications
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- TEXT_BLOCKS
-- =============================================================================
ALTER TABLE text_blocks ENABLE ROW LEVEL SECURITY;

-- Guessed names (keep for safety)
DROP POLICY IF EXISTS "text_blocks_select" ON text_blocks;
DROP POLICY IF EXISTS "text_blocks_all" ON text_blocks;
-- Actual baseline names
DROP POLICY IF EXISTS "Users can view own and global text_blocks" ON text_blocks;
DROP POLICY IF EXISTS "Users can insert own text_blocks" ON text_blocks;
DROP POLICY IF EXISTS "Users can update own text_blocks" ON text_blocks;
DROP POLICY IF EXISTS "Users can delete own text_blocks" ON text_blocks;

CREATE POLICY "text_blocks_org_select" ON text_blocks
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());

CREATE POLICY "text_blocks_org_all" ON text_blocks
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

CREATE POLICY "text_blocks_service_all" ON text_blocks
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- CARD_CREATION_RULES
-- =============================================================================
ALTER TABLE card_creation_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "card_creation_rules_select" ON card_creation_rules;
-- Guessed name (keep for safety)
DROP POLICY IF EXISTS "card_creation_rules_admin_all" ON card_creation_rules;
-- Actual baseline names (individual admin policies)
DROP POLICY IF EXISTS "card_creation_rules_admin_delete" ON card_creation_rules;
DROP POLICY IF EXISTS "card_creation_rules_admin_insert" ON card_creation_rules;
DROP POLICY IF EXISTS "card_creation_rules_admin_update" ON card_creation_rules;

CREATE POLICY "card_creation_rules_org_select" ON card_creation_rules
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());

CREATE POLICY "card_creation_rules_org_admin_all" ON card_creation_rules
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id() AND is_admin());

CREATE POLICY "card_creation_rules_service_all" ON card_creation_rules
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- INTEGRATION_SETTINGS — org-scoped
-- =============================================================================
ALTER TABLE integration_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "integration_settings_admin_all" ON integration_settings;
DROP POLICY IF EXISTS "integration_settings_admin_select" ON integration_settings;
DROP POLICY IF EXISTS "integration_settings_service_role" ON integration_settings;

CREATE POLICY "integration_settings_org_select" ON integration_settings
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());

CREATE POLICY "integration_settings_org_admin_all" ON integration_settings
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id() AND is_admin());

CREATE POLICY "integration_settings_service_all" ON integration_settings
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- SECTIONS — org-scoped
-- =============================================================================
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;

-- Guessed names (keep for safety)
DROP POLICY IF EXISTS "sections_select_authenticated" ON sections;
DROP POLICY IF EXISTS "sections_admin_all" ON sections;
DROP POLICY IF EXISTS "Sections viewable by authenticated" ON sections;
-- Actual baseline names
DROP POLICY IF EXISTS "Admin delete sections" ON sections;
DROP POLICY IF EXISTS "Admin insert sections" ON sections;
DROP POLICY IF EXISTS "Admin update sections" ON sections;
DROP POLICY IF EXISTS "Public read sections" ON sections;

CREATE POLICY "sections_org_select" ON sections
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());

CREATE POLICY "sections_org_admin_all" ON sections
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id() AND is_admin());

CREATE POLICY "sections_service_all" ON sections
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- CARD_TAGS — org-scoped
-- =============================================================================
ALTER TABLE card_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "card_tags_select" ON card_tags;
-- Guessed name (keep for safety)
DROP POLICY IF EXISTS "card_tags_admin_all" ON card_tags;
-- Actual baseline name
DROP POLICY IF EXISTS "card_tags_admin_write" ON card_tags;

CREATE POLICY "card_tags_org_select" ON card_tags
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());

CREATE POLICY "card_tags_org_admin_all" ON card_tags
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id() AND is_admin());

CREATE POLICY "card_tags_service_all" ON card_tags
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- SYSTEM_FIELDS — org-scoped
-- =============================================================================
ALTER TABLE system_fields ENABLE ROW LEVEL SECURITY;

-- Guessed names (keep for safety)
DROP POLICY IF EXISTS "system_fields_select" ON system_fields;
DROP POLICY IF EXISTS "system_fields_admin_all" ON system_fields;
-- Actual baseline names
DROP POLICY IF EXISTS "Everyone can read system_fields" ON system_fields;
DROP POLICY IF EXISTS "Authenticated users can manage system_fields" ON system_fields;

CREATE POLICY "system_fields_org_select" ON system_fields
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());

CREATE POLICY "system_fields_org_admin_all" ON system_fields
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id() AND is_admin());

CREATE POLICY "system_fields_service_all" ON system_fields
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- SECTION_FIELD_CONFIG — org-scoped
-- =============================================================================
ALTER TABLE section_field_config ENABLE ROW LEVEL SECURITY;

-- Guessed names (keep for safety)
DROP POLICY IF EXISTS "section_field_config_select" ON section_field_config;
DROP POLICY IF EXISTS "section_field_config_admin_all" ON section_field_config;
-- Actual baseline names
DROP POLICY IF EXISTS "Admin full access" ON section_field_config;
DROP POLICY IF EXISTS "Public read access" ON section_field_config;

CREATE POLICY "section_field_config_org_select" ON section_field_config
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());

CREATE POLICY "section_field_config_org_admin_all" ON section_field_config
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id() AND is_admin());

CREATE POLICY "section_field_config_service_all" ON section_field_config
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- ORGANIZATIONS — keep read-only for all authenticated, admin can manage
-- =============================================================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organizations_read_authenticated" ON organizations;
-- Additional baseline name
DROP POLICY IF EXISTS "authenticated_read_orgs" ON organizations;

CREATE POLICY "organizations_own_select" ON organizations
  FOR SELECT TO authenticated
  USING (id = requesting_org_id());

CREATE POLICY "organizations_service_all" ON organizations
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- PRODUCTS — org-scoped
-- =============================================================================
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_read_authenticated" ON products;
-- Additional baseline name
DROP POLICY IF EXISTS "authenticated_read_products" ON products;

CREATE POLICY "products_org_select" ON products
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());

CREATE POLICY "products_org_admin_all" ON products
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id() AND is_admin());

CREATE POLICY "products_service_all" ON products
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
