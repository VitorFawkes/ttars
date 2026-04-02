-- H3-018: Fix provision_organization e unique constraints para multi-tenant
--
-- Corrige 4 bugs críticos encontrados na revisão:
-- 1. roles.name UNIQUE global → UNIQUE(org_id, name)
-- 2. sections.key UNIQUE global → UNIQUE(org_id, pipeline_id, key)
-- 3. provision_organization: RETURNING multi-row e enum 'MAIN' inválido
-- 4. H3-015 UPDATEs sem filtro de org_id

-- =============================================================================
-- 1. Fix UNIQUE constraints para multi-tenant
-- =============================================================================

-- roles: name deve ser unico POR ORG, nao global
ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_name_key;
DO $$ BEGIN
    ALTER TABLE roles ADD CONSTRAINT roles_org_name_key UNIQUE(org_id, name);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- sections: key deve ser unico POR ORG + PIPELINE, nao global
ALTER TABLE sections DROP CONSTRAINT IF EXISTS sections_key_key CASCADE;
DO $$ BEGIN
    ALTER TABLE sections ADD CONSTRAINT sections_org_pipeline_key_key UNIQUE(org_id, pipeline_id, key);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- =============================================================================
-- 2. Fix H3-015: UPDATEs devem filtrar por org_id Welcome Group
-- (idempotente — se já rodou sem filtro, o resultado é o mesmo para single-tenant)
-- =============================================================================
UPDATE pipeline_phases SET
    supports_win = true,
    win_action = 'advance_to_next',
    owner_field = 'sdr_owner_id',
    is_entry_phase = true,
    owner_label = 'SDR',
    accent_color = 'teal'
WHERE slug = 'sdr' AND org_id = 'a0000000-0000-0000-0000-000000000001';

UPDATE pipeline_phases SET
    supports_win = true,
    win_action = 'choose',
    owner_field = 'vendas_owner_id',
    owner_label = 'Planner',
    accent_color = 'indigo'
WHERE slug = 'planner' AND org_id = 'a0000000-0000-0000-0000-000000000001';

UPDATE pipeline_phases SET
    supports_win = false,
    is_terminal_phase = true,
    owner_field = 'pos_owner_id',
    owner_label = 'Pós-Venda',
    accent_color = 'amber'
WHERE slug = 'pos_venda' AND org_id = 'a0000000-0000-0000-0000-000000000001';

UPDATE pipeline_phases SET
    owner_field = 'concierge_owner_id',
    owner_label = 'Concierge',
    accent_color = 'rose'
WHERE slug = 'concierge' AND org_id = 'a0000000-0000-0000-0000-000000000001';

-- =============================================================================
-- 3. Recriar provision_organization com todos os bugs corrigidos
-- =============================================================================
CREATE OR REPLACE FUNCTION provision_organization(
    p_name TEXT,
    p_slug TEXT,
    p_admin_email TEXT,
    p_template TEXT DEFAULT 'generic_3phase',
    p_product_name TEXT DEFAULT 'Principal',
    p_product_slug TEXT DEFAULT 'TRIPS'  -- DEVE ser valor válido do enum app_product
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID;
    v_pipeline_id UUID;
    v_phase1_id UUID;
    v_phase2_id UUID;
    v_phase3_id UUID;
BEGIN
    -- 1. Criar organização
    INSERT INTO organizations (id, name, slug, active, branding, settings)
    VALUES (
        gen_random_uuid(), p_name, p_slug, true,
        '{"primary_color": "#4f46e5", "accent_color": "#0d9488"}',
        '{"default_currency": "BRL", "timezone": "America/Sao_Paulo", "date_format": "dd/MM/yyyy"}'
    )
    RETURNING id INTO v_org_id;

    -- 2. Criar roles padrão (sem RETURNING multi-row)
    INSERT INTO roles (name, display_name, description, permissions, is_system, org_id)
    VALUES
        ('admin', 'Administrador', 'Acesso total',
         '{"manage_users": true, "manage_pipeline": true, "manage_settings": true, "view_analytics": true}',
         true, v_org_id),
        ('sales', 'Vendedor', 'Acesso a pipeline e cards',
         '{"view_pipeline": true, "manage_cards": true}',
         true, v_org_id),
        ('support', 'Suporte', 'Acesso pós-venda',
         '{"view_pipeline": true, "manage_cards": true}',
         true, v_org_id);

    -- 3. Criar pipeline + fases + estágios
    v_pipeline_id := gen_random_uuid();

    IF p_template = 'generic_3phase' THEN
        INSERT INTO pipelines (id, produto, nome, descricao, ativo, org_id)
        VALUES (v_pipeline_id, p_product_slug, p_product_name, 'Pipeline principal', true, v_org_id);

        v_phase1_id := gen_random_uuid();
        v_phase2_id := gen_random_uuid();
        v_phase3_id := gen_random_uuid();

        INSERT INTO pipeline_phases (id, name, label, slug, color, order_index, active, org_id,
            supports_win, win_action, is_entry_phase, is_terminal_phase, owner_label, accent_color)
        VALUES
            (v_phase1_id, 'Pré-Venda', 'Pré-Venda', 'pre_venda', '#0d9488', 1, true, v_org_id,
             true, 'advance_to_next', true, false, 'Pré-Venda', 'teal'),
            (v_phase2_id, 'Vendas', 'Vendas', 'vendas', '#4f46e5', 2, true, v_org_id,
             true, 'choose', false, false, 'Vendas', 'indigo'),
            (v_phase3_id, 'Pós-Venda', 'Pós-Venda', 'pos_venda', '#f59e0b', 3, true, v_org_id,
             false, null, false, true, 'Pós-Venda', 'amber');

        INSERT INTO pipeline_stages (pipeline_id, phase_id, nome, ordem, ativo, org_id)
        VALUES
            (v_pipeline_id, v_phase1_id, 'Novo Lead', 1, true, v_org_id),
            (v_pipeline_id, v_phase1_id, 'Qualificação', 2, true, v_org_id),
            (v_pipeline_id, v_phase1_id, 'Reunião Agendada', 3, true, v_org_id),
            (v_pipeline_id, v_phase2_id, 'Proposta', 4, true, v_org_id),
            (v_pipeline_id, v_phase2_id, 'Negociação', 5, true, v_org_id),
            (v_pipeline_id, v_phase2_id, 'Fechamento', 6, true, v_org_id),
            (v_pipeline_id, v_phase3_id, 'Onboarding', 7, true, v_org_id),
            (v_pipeline_id, v_phase3_id, 'Acompanhamento', 8, true, v_org_id),
            (v_pipeline_id, v_phase3_id, 'Concluído', 9, true, v_org_id);

    ELSIF p_template = 'simple_2phase' THEN
        INSERT INTO pipelines (id, produto, nome, descricao, ativo, org_id)
        VALUES (v_pipeline_id, p_product_slug, p_product_name, 'Pipeline simples', true, v_org_id);

        v_phase1_id := gen_random_uuid();
        v_phase2_id := gen_random_uuid();

        INSERT INTO pipeline_phases (id, name, label, slug, color, order_index, active, org_id,
            supports_win, win_action, is_entry_phase, is_terminal_phase, owner_label, accent_color)
        VALUES
            (v_phase1_id, 'Vendas', 'Vendas', 'vendas', '#4f46e5', 1, true, v_org_id,
             true, 'advance_to_next', true, false, 'Vendas', 'indigo'),
            (v_phase2_id, 'Entrega', 'Entrega', 'entrega', '#0d9488', 2, true, v_org_id,
             false, null, false, true, 'Entrega', 'teal');

        INSERT INTO pipeline_stages (pipeline_id, phase_id, nome, ordem, ativo, org_id)
        VALUES
            (v_pipeline_id, v_phase1_id, 'Novo', 1, true, v_org_id),
            (v_pipeline_id, v_phase1_id, 'Em Andamento', 2, true, v_org_id),
            (v_pipeline_id, v_phase1_id, 'Proposta', 3, true, v_org_id),
            (v_pipeline_id, v_phase2_id, 'Executando', 4, true, v_org_id),
            (v_pipeline_id, v_phase2_id, 'Concluído', 5, true, v_org_id);
    END IF;

    -- 4. Criar produto
    INSERT INTO products (org_id, slug, name, name_short, icon_name, color_class,
        pipeline_id, deal_label, deal_plural, main_date_label, not_found_label, active, display_order)
    VALUES (
        v_org_id, p_product_slug, p_product_name, p_product_name,
        'Briefcase', 'text-indigo-500', v_pipeline_id,
        'Negócio', 'Negócios', 'Data Principal', 'Negócio não encontrado', true, 1
    );

    -- 5. Criar seções padrão (com ON CONFLICT para safety)
    INSERT INTO sections (key, label, position, order_index, is_governable, is_system, active, pipeline_id, org_id)
    VALUES
        ('info', 'Informações', 'left_column', 1, true, false, true, v_pipeline_id, v_org_id),
        ('notes', 'Observações', 'left_column', 2, true, false, true, v_pipeline_id, v_org_id),
        ('people', 'Pessoas', 'right_column', 1, false, true, true, v_pipeline_id, v_org_id),
        ('payment', 'Pagamento', 'right_column', 2, false, true, true, v_pipeline_id, v_org_id)
    ON CONFLICT (org_id, pipeline_id, key) DO NOTHING;

    -- 6. Motivos de perda padrão
    INSERT INTO motivos_perda (nome, ativo, org_id) VALUES
        ('Preço alto', true, v_org_id),
        ('Concorrente', true, v_org_id),
        ('Sem resposta', true, v_org_id),
        ('Sem necessidade', true, v_org_id),
        ('Timing inadequado', true, v_org_id);

    -- 7. Convite admin
    INSERT INTO invitations (email, role, token, expires_at, org_id) VALUES (
        p_admin_email, 'admin', encode(gen_random_bytes(32), 'hex'),
        now() + interval '7 days', v_org_id
    );

    -- 8. Departamento e team padrão
    INSERT INTO departments (name, slug, description, org_id)
    VALUES ('Geral', 'geral', 'Departamento principal', v_org_id);

    INSERT INTO teams (name, description, is_active, org_id)
    VALUES ('Time Principal', 'Time padrão da organização', true, v_org_id);

    RETURN v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION provision_organization(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
