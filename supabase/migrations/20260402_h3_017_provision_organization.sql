-- H3-017: provision_organization — setup automático de nova empresa
-- Cria org, pipeline, fases, estágios, produtos, roles, seções e convite admin.
--
-- Templates disponíveis:
--   'generic_3phase' — 3 fases (Pré-Venda, Vendas, Pós-Venda) com estágios padrão
--   'simple_2phase'  — 2 fases (Vendas, Entrega)
--
-- Uso:
--   SELECT provision_organization('Minha Empresa', 'minha-empresa', 'admin@empresa.com', 'generic_3phase');

CREATE OR REPLACE FUNCTION provision_organization(
    p_name TEXT,
    p_slug TEXT,
    p_admin_email TEXT,
    p_template TEXT DEFAULT 'generic_3phase',
    p_product_name TEXT DEFAULT 'Principal',
    p_product_slug TEXT DEFAULT 'MAIN'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID;
    v_pipeline_id UUID;
    v_product_id UUID;
    v_phase1_id UUID;
    v_phase2_id UUID;
    v_phase3_id UUID;
    v_stage_id UUID;
    v_role_admin_id UUID;
    v_role_sales_id UUID;
    v_role_support_id UUID;
BEGIN
    -- =========================================================================
    -- 1. Criar organização
    -- =========================================================================
    INSERT INTO organizations (id, name, slug, active, branding, settings)
    VALUES (
        gen_random_uuid(),
        p_name,
        p_slug,
        true,
        '{"primary_color": "#4f46e5", "accent_color": "#0d9488"}',
        '{"default_currency": "BRL", "timezone": "America/Sao_Paulo", "date_format": "dd/MM/yyyy"}'
    )
    RETURNING id INTO v_org_id;

    -- =========================================================================
    -- 2. Criar roles padrão
    -- =========================================================================
    INSERT INTO roles (id, name, display_name, description, permissions, is_system, org_id)
    VALUES
        (gen_random_uuid(), 'admin', 'Administrador', 'Acesso total ao sistema',
         '{"manage_users": true, "manage_pipeline": true, "manage_settings": true, "view_analytics": true}',
         true, v_org_id),
        (gen_random_uuid(), 'sales', 'Vendedor', 'Acesso a pipeline e cards',
         '{"view_pipeline": true, "manage_cards": true, "view_analytics": false}',
         true, v_org_id),
        (gen_random_uuid(), 'support', 'Suporte', 'Acesso pós-venda',
         '{"view_pipeline": true, "manage_cards": true, "view_analytics": false}',
         true, v_org_id)
    RETURNING id INTO v_role_admin_id;

    SELECT id INTO v_role_admin_id FROM roles WHERE org_id = v_org_id AND name = 'admin';
    SELECT id INTO v_role_sales_id FROM roles WHERE org_id = v_org_id AND name = 'sales';
    SELECT id INTO v_role_support_id FROM roles WHERE org_id = v_org_id AND name = 'support';

    -- =========================================================================
    -- 3. Criar pipeline + fases + estágios (baseado no template)
    -- =========================================================================
    v_pipeline_id := gen_random_uuid();

    IF p_template = 'generic_3phase' THEN
        -- Pipeline
        INSERT INTO pipelines (id, produto, nome, descricao, ativo, org_id)
        VALUES (v_pipeline_id, p_product_slug, p_product_name, 'Pipeline principal', true, v_org_id);

        -- Fases
        v_phase1_id := gen_random_uuid();
        v_phase2_id := gen_random_uuid();
        v_phase3_id := gen_random_uuid();

        INSERT INTO pipeline_phases (id, name, label, slug, color, order_index, active, org_id,
            supports_win, win_action, owner_field, is_entry_phase, is_terminal_phase, owner_label, accent_color)
        VALUES
            (v_phase1_id, 'Pré-Venda', 'Pré-Venda', 'pre_venda', '#0d9488', 1, true, v_org_id,
             true, 'advance_to_next', null, true, false, 'Pré-Venda', 'teal'),
            (v_phase2_id, 'Vendas', 'Vendas', 'vendas', '#4f46e5', 2, true, v_org_id,
             true, 'choose', null, false, false, 'Vendas', 'indigo'),
            (v_phase3_id, 'Pós-Venda', 'Pós-Venda', 'pos_venda', '#f59e0b', 3, true, v_org_id,
             false, null, null, false, true, 'Pós-Venda', 'amber');

        -- Estágios
        INSERT INTO pipeline_stages (id, pipeline_id, phase_id, nome, ordem, ativo, org_id)
        VALUES
            -- Pré-Venda
            (gen_random_uuid(), v_pipeline_id, v_phase1_id, 'Novo Lead', 1, true, v_org_id),
            (gen_random_uuid(), v_pipeline_id, v_phase1_id, 'Qualificação', 2, true, v_org_id),
            (gen_random_uuid(), v_pipeline_id, v_phase1_id, 'Reunião Agendada', 3, true, v_org_id),
            -- Vendas
            (gen_random_uuid(), v_pipeline_id, v_phase2_id, 'Proposta', 4, true, v_org_id),
            (gen_random_uuid(), v_pipeline_id, v_phase2_id, 'Negociação', 5, true, v_org_id),
            (gen_random_uuid(), v_pipeline_id, v_phase2_id, 'Fechamento', 6, true, v_org_id),
            -- Pós-Venda
            (gen_random_uuid(), v_pipeline_id, v_phase3_id, 'Onboarding', 7, true, v_org_id),
            (gen_random_uuid(), v_pipeline_id, v_phase3_id, 'Acompanhamento', 8, true, v_org_id),
            (gen_random_uuid(), v_pipeline_id, v_phase3_id, 'Concluído', 9, true, v_org_id);

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

        INSERT INTO pipeline_stages (id, pipeline_id, phase_id, nome, ordem, ativo, org_id)
        VALUES
            (gen_random_uuid(), v_pipeline_id, v_phase1_id, 'Novo', 1, true, v_org_id),
            (gen_random_uuid(), v_pipeline_id, v_phase1_id, 'Em Andamento', 2, true, v_org_id),
            (gen_random_uuid(), v_pipeline_id, v_phase1_id, 'Proposta', 3, true, v_org_id),
            (gen_random_uuid(), v_pipeline_id, v_phase2_id, 'Executando', 4, true, v_org_id),
            (gen_random_uuid(), v_pipeline_id, v_phase2_id, 'Concluído', 5, true, v_org_id);
    END IF;

    -- =========================================================================
    -- 4. Criar produto
    -- =========================================================================
    INSERT INTO products (id, org_id, slug, name, name_short, icon_name, color_class,
        pipeline_id, deal_label, deal_plural, main_date_label, not_found_label, active, display_order)
    VALUES (
        gen_random_uuid(), v_org_id, p_product_slug, p_product_name, p_product_name,
        'Briefcase', 'text-indigo-500', v_pipeline_id,
        'Negócio', 'Negócios', 'Data Principal', 'Negócio não encontrado',
        true, 1
    )
    RETURNING id INTO v_product_id;

    -- =========================================================================
    -- 5. Criar seções padrão
    -- =========================================================================
    INSERT INTO sections (key, label, position, order_index, is_governable, is_system, active, pipeline_id, org_id)
    VALUES
        ('info', 'Informações', 'left_column', 1, true, false, true, v_pipeline_id, v_org_id),
        ('notes', 'Observações', 'left_column', 2, true, false, true, v_pipeline_id, v_org_id),
        ('people', 'Pessoas', 'right_column', 1, false, true, true, v_pipeline_id, v_org_id),
        ('payment', 'Pagamento', 'right_column', 2, false, true, true, v_pipeline_id, v_org_id);

    -- =========================================================================
    -- 6. Criar motivos de perda padrão
    -- =========================================================================
    INSERT INTO motivos_perda (nome, ativo, org_id)
    VALUES
        ('Preço alto', true, v_org_id),
        ('Concorrente', true, v_org_id),
        ('Sem resposta', true, v_org_id),
        ('Sem necessidade', true, v_org_id),
        ('Timing inadequado', true, v_org_id);

    -- =========================================================================
    -- 7. Criar convite para admin
    -- =========================================================================
    INSERT INTO invitations (email, role, token, expires_at, org_id)
    VALUES (
        p_admin_email,
        'admin',
        encode(gen_random_bytes(32), 'hex'),
        now() + interval '7 days',
        v_org_id
    );

    -- =========================================================================
    -- 8. Criar departamento e team padrão
    -- =========================================================================
    INSERT INTO departments (name, slug, description, org_id)
    VALUES ('Geral', 'geral', 'Departamento principal', v_org_id);

    INSERT INTO teams (name, description, is_active, org_id)
    VALUES ('Time Principal', 'Time padrão da organização', true, v_org_id);

    RETURN v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION provision_organization(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION provision_organization IS
    'Provisiona uma nova organização com pipeline, fases, estágios, roles, seções e convite admin. '
    'Templates: generic_3phase (Pré-Venda/Vendas/Pós-Venda), simple_2phase (Vendas/Entrega).';
