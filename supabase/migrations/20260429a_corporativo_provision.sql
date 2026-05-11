-- ============================================================================
-- MIGRATION: Welcome Corporativo - novo workspace + produto CORP
-- Date: 2026-04-29
--
-- Cria a 4ª org filha de Welcome Group (irmã de Trips/Weddings/Courses).
-- Produto CORP é simples: 1 fase única com 2 etapas (Aberto/Fechado).
-- O fechamento se reflete em status_comercial (ganho/perdido) + a trigger
-- "trg_corp_auto_move_to_fechado" garante que o card vá visualmente pra
-- coluna "Fechado" quando o usuário marca ganho ou perdido.
--
-- IDEMPOTENTE: pode ser reaplicada (deleta o que já existe e recria).
-- ============================================================================

BEGIN;

DO $migration$
DECLARE
    v_account_id UUID := 'a0000000-0000-0000-0000-000000000001';   -- Welcome Group
    v_workspace_id UUID := 'b0000000-0000-0000-0000-000000000003'; -- nova: Welcome Corporativo
    v_vitor_id UUID := 'dfdc4512-d842-4487-be80-11df91f24057';     -- admin inicial
    v_pipeline_id UUID := 'c0000000-0000-0000-0000-000000000003';
    v_phase_atendimento_id UUID := 'd0000000-0000-0000-0000-000000000003';
    v_stage_aberto_id UUID := 'e0000000-0000-0000-0000-000000000031';
    v_stage_fechado_id UUID := 'e0000000-0000-0000-0000-000000000032';
BEGIN

-- ============================================================================
-- 0. Limpeza idempotente (deleta tudo que essa migration cria, em ordem reversa)
-- ============================================================================
DELETE FROM org_members WHERE org_id = v_workspace_id;
DELETE FROM pipeline_card_settings WHERE phase_id = v_phase_atendimento_id;
DELETE FROM stage_field_config WHERE org_id = v_workspace_id;
DELETE FROM stage_section_config WHERE org_id = v_workspace_id;
DELETE FROM section_field_config
  WHERE org_id = v_workspace_id
    AND section_key IN ('info', 'notes', 'people');
DELETE FROM sections WHERE org_id = v_workspace_id;
DELETE FROM motivos_perda WHERE org_id = v_workspace_id;
DELETE FROM teams WHERE org_id = v_workspace_id;
DELETE FROM departments WHERE org_id = v_workspace_id;
DELETE FROM roles WHERE org_id = v_workspace_id;
DELETE FROM products WHERE org_id = v_workspace_id;
DELETE FROM pipeline_stages WHERE pipeline_id = v_pipeline_id;
DELETE FROM pipeline_phases WHERE org_id = v_workspace_id;
DELETE FROM pipelines WHERE id = v_pipeline_id;
DELETE FROM system_fields WHERE org_id = v_workspace_id;
DELETE FROM organizations WHERE id = v_workspace_id;

-- ============================================================================
-- 1. Criar a organização (workspace filho de Welcome Group)
-- ============================================================================
INSERT INTO organizations (id, name, slug, parent_org_id, active, branding, settings)
VALUES (
    v_workspace_id,
    'Welcome Corporativo',
    'welcome-corporativo',
    v_account_id,
    true,
    '{"primary_color": "#4f46e5", "accent_color": "#A176E3"}',
    '{"default_currency": "BRL", "timezone": "America/Sao_Paulo", "date_format": "dd/MM/yyyy"}'
);

-- ============================================================================
-- 2. Roles padrão
-- ============================================================================
INSERT INTO roles (name, display_name, description, permissions, is_system, org_id) VALUES
    ('admin',   'Administrador', 'Acesso total ao workspace',
     '{"manage_users": true, "manage_pipeline": true, "manage_settings": true, "view_analytics": true}',
     true, v_workspace_id),
    ('sales',   'Atendente',     'Atende e converte demandas em vendas',
     '{"view_pipeline": true, "manage_cards": true}',
     true, v_workspace_id),
    ('support', 'Suporte',       'Acompanha pós-atendimento',
     '{"view_pipeline": true, "manage_cards": true}',
     true, v_workspace_id);

-- ============================================================================
-- 3. Departamento e Time padrão
-- ============================================================================
INSERT INTO departments (name, slug, description, org_id)
VALUES ('Atendimento', 'atendimento', 'Equipe de atendimento corporativo', v_workspace_id);

INSERT INTO teams (name, description, is_active, org_id)
VALUES ('Time Corporativo', 'Atendentes do produto Corporativo', true, v_workspace_id);

-- ============================================================================
-- 4. Membership do Vitor (admin inicial)
-- ============================================================================
INSERT INTO org_members (user_id, org_id, role)
VALUES (v_vitor_id, v_workspace_id, 'admin')
ON CONFLICT (user_id, org_id) DO UPDATE SET role = EXCLUDED.role;

-- ============================================================================
-- 5. Pipeline Welcome Corporativo
--    NOTE: usamos slug 'planner' na fase para reusar marcar_ganho()
--    (que é hardcoded em fases sdr/planner/pos_venda). Com win_action='direct'
--    o ganho não tenta avançar pra próxima fase.
-- ============================================================================
INSERT INTO pipelines (id, produto, nome, descricao, ativo, org_id)
VALUES (
    v_pipeline_id,
    'CORP'::app_product,
    'Pipeline Welcome Corporativo',
    'Atendimentos corporativos: aberto → fechado',
    true,
    v_workspace_id
);

-- ============================================================================
-- 6. Fase única "Atendimento"
-- ============================================================================
INSERT INTO pipeline_phases (
    id, name, label, slug, color, order_index, active, org_id,
    supports_win, win_action, is_entry_phase, is_terminal_phase,
    owner_label, accent_color, visible_in_card, owner_field
)
VALUES (
    v_phase_atendimento_id,
    'Atendimento',
    'Atendimento',
    'planner',           -- slug reusa lógica existente de marcar_ganho
    '#A176E3',           -- roxo Corp
    1,
    true,
    v_workspace_id,
    true,
    'direct',            -- ganho fecha direto, sem próxima fase
    true,
    true,
    'Atendente',
    'purple',
    true,
    'vendas_owner_id'
);

-- ============================================================================
-- 7. Etapas: "Aberto" (entrada) e "Fechado" (terminal)
-- ============================================================================
INSERT INTO pipeline_stages (
    id, pipeline_id, phase_id, nome, ordem, ativo, org_id,
    is_won, is_lost
)
VALUES
    (v_stage_aberto_id,  v_pipeline_id, v_phase_atendimento_id,
     'Aberto',  1, true, v_workspace_id, false, false),
    (v_stage_fechado_id, v_pipeline_id, v_phase_atendimento_id,
     'Fechado', 2, true, v_workspace_id, false, false);
-- is_won/is_lost ficam FALSE em ambas: a coluna "Fechado" recebe TANTO ganhos
-- quanto perdidos. O badge visual (verde/vermelho) vem de card.status_comercial.

-- ============================================================================
-- 8. Produto CORP em products
-- ============================================================================
INSERT INTO products (
    org_id, slug, name, name_short, icon_name, color_class,
    pipeline_id, deal_label, deal_plural, main_date_label, not_found_label,
    active, display_order
)
VALUES (
    v_workspace_id,
    'CORP'::app_product,
    'Welcome Corporativo',
    'Corporativo',
    'Building2',
    'text-purple-500',
    v_pipeline_id,
    'Atendimento',
    'Atendimentos',
    'Data do atendimento',
    'Atendimento não encontrado',
    true,
    1
);

-- ============================================================================
-- 9. Sections básicas (mínimo necessário no CardDetail do Corporativo)
-- ============================================================================
INSERT INTO sections (key, label, position, order_index, is_governable, is_system, active, pipeline_id, org_id)
VALUES
    ('info',    'Informações', 'left_column',  1, true,  false, true, v_pipeline_id, v_workspace_id),
    ('notes',   'Observações', 'left_column',  2, true,  false, true, v_pipeline_id, v_workspace_id),
    ('people',  'Empresa',     'right_column', 1, false, true,  true, v_pipeline_id, v_workspace_id)
ON CONFLICT (org_id, pipeline_id, key) DO NOTHING;

-- ============================================================================
-- 10. Stage_section_config — todas as 3 sections visíveis em ambas as etapas
-- ============================================================================
INSERT INTO stage_section_config (stage_id, section_key, is_visible, org_id)
VALUES
    (v_stage_aberto_id,  'info',   true, v_workspace_id),
    (v_stage_aberto_id,  'notes',  true, v_workspace_id),
    (v_stage_aberto_id,  'people', true, v_workspace_id),
    (v_stage_fechado_id, 'info',   true, v_workspace_id),
    (v_stage_fechado_id, 'notes',  true, v_workspace_id),
    (v_stage_fechado_id, 'people', true, v_workspace_id)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 11. Pipeline_card_settings — campos visíveis no Kanban (Corporativo simples)
-- ============================================================================
INSERT INTO pipeline_card_settings (phase_id, campos_kanban, ordem_kanban, usuario_id, fase, org_id)
VALUES (
    v_phase_atendimento_id,
    '["pessoa_nome", "task_status", "created_at", "orcamento"]'::jsonb,
    '["pessoa_nome", "task_status", "created_at", "orcamento"]'::jsonb,
    NULL,
    'Atendimento',
    v_workspace_id
)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 12. Motivos de perda do Corporativo
-- ============================================================================
INSERT INTO motivos_perda (nome, ativo, org_id, produto) VALUES
    ('Oportunidade futura',                  true, v_workspace_id, 'CORP'),
    ('Cliente cancelou a viagem',            true, v_workspace_id, 'CORP'),
    ('Sem orçamento aprovado pela empresa',  true, v_workspace_id, 'CORP'),
    ('Outros',                               true, v_workspace_id, 'CORP');

-- ============================================================================
-- 13. System_fields — copia campos UNIVERSAIS da Welcome Group (produto_exclusivo IS NULL)
-- ============================================================================
INSERT INTO system_fields (
    org_id, key, label, type, section, active, produto_exclusivo,
    options, order_index, section_id, is_system
)
SELECT
    v_workspace_id,
    sf.key, sf.label, sf.type, sf.section, sf.active, sf.produto_exclusivo,
    sf.options, sf.order_index,
    NULL,                      -- section_id reset (sections de Welcome Group não pertencem a Corp)
    sf.is_system
FROM system_fields sf
WHERE sf.org_id = v_account_id
  AND sf.produto_exclusivo IS NULL
  AND COALESCE(sf.active, true) = true
ON CONFLICT (org_id, key) DO NOTHING;

END $migration$;

-- ============================================================================
-- 14. Trigger: ao marcar card Corporativo como ganho/perdido,
--     mover automaticamente para a etapa "Fechado".
-- ============================================================================
CREATE OR REPLACE FUNCTION public.corp_auto_move_to_fechado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_is_corp BOOLEAN;
    v_fechado_stage_id UUID;
BEGIN
    IF NEW.status_comercial NOT IN ('ganho', 'perdido') THEN
        RETURN NEW;
    END IF;
    IF OLD.status_comercial = NEW.status_comercial THEN
        RETURN NEW;
    END IF;

    SELECT (p.produto::text = 'CORP') INTO v_is_corp
    FROM pipeline_stages s
    JOIN pipelines p ON p.id = s.pipeline_id
    WHERE s.id = NEW.pipeline_stage_id;

    IF NOT COALESCE(v_is_corp, false) THEN
        RETURN NEW;
    END IF;

    SELECT s.id INTO v_fechado_stage_id
    FROM pipeline_stages s
    JOIN pipelines p ON p.id = s.pipeline_id
    WHERE p.produto::text = 'CORP'
      AND p.org_id = NEW.org_id
      AND s.ativo = true
      AND lower(s.nome) = 'fechado'
    LIMIT 1;

    IF v_fechado_stage_id IS NOT NULL AND NEW.pipeline_stage_id IS DISTINCT FROM v_fechado_stage_id THEN
        NEW.pipeline_stage_id := v_fechado_stage_id;
        NEW.stage_entered_at := NOW();
    END IF;

    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_corp_auto_move_to_fechado ON cards;
CREATE TRIGGER trg_corp_auto_move_to_fechado
    BEFORE UPDATE OF status_comercial ON cards
    FOR EACH ROW
    EXECUTE FUNCTION public.corp_auto_move_to_fechado();

COMMENT ON FUNCTION public.corp_auto_move_to_fechado IS
'Move cards do produto CORP para a etapa "Fechado" quando status_comercial vira ganho ou perdido. Necessário porque o pipeline CORP tem 2 colunas visuais (Aberto/Fechado) mas marcar_ganho com win_action=direct não troca de etapa.';

-- ============================================================================
-- 15. Smoke check inline
-- ============================================================================
DO $smoke$
DECLARE
    v_workspace_id UUID := 'b0000000-0000-0000-0000-000000000003';
    v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count FROM organizations WHERE id = v_workspace_id;
    IF v_count <> 1 THEN RAISE EXCEPTION 'Welcome Corporativo não foi criada'; END IF;

    SELECT COUNT(*) INTO v_count FROM products WHERE org_id = v_workspace_id AND slug = 'CORP';
    IF v_count <> 1 THEN RAISE EXCEPTION 'Produto CORP não foi criado'; END IF;

    SELECT COUNT(*) INTO v_count FROM pipelines WHERE org_id = v_workspace_id AND ativo = true;
    IF v_count <> 1 THEN RAISE EXCEPTION 'Pipeline Corporativo não foi criado'; END IF;

    SELECT COUNT(*) INTO v_count FROM pipeline_phases WHERE org_id = v_workspace_id AND active = true;
    IF v_count <> 1 THEN RAISE EXCEPTION 'Fase Atendimento não foi criada (esperado 1, encontrei %)', v_count; END IF;

    SELECT COUNT(*) INTO v_count FROM pipeline_stages s
        JOIN pipelines p ON p.id = s.pipeline_id
        WHERE p.org_id = v_workspace_id AND s.ativo = true;
    IF v_count <> 2 THEN RAISE EXCEPTION 'Esperado 2 etapas (Aberto/Fechado), encontrei %', v_count; END IF;

    SELECT COUNT(*) INTO v_count FROM motivos_perda WHERE org_id = v_workspace_id AND produto = 'CORP';
    IF v_count <> 4 THEN RAISE EXCEPTION 'Esperado 4 motivos CORP, encontrei %', v_count; END IF;

    RAISE NOTICE '✅ Welcome Corporativo provisionada: 1 org, 1 produto, 1 pipeline, 1 fase, 2 etapas, 4 motivos.';
END $smoke$;

COMMIT;
