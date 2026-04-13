-- Platform Admin: provision_workspace()
--
-- Cria nova workspace (org filha) dentro de um tenant existente.
-- Baseado em provision_organization(), com uma diferença crítica:
-- INSERT em organizations inclui parent_org_id = p_tenant_id.

CREATE OR REPLACE FUNCTION public.provision_workspace(
    p_tenant_id UUID,
    p_name TEXT,
    p_slug TEXT,
    p_admin_email TEXT,
    p_template TEXT DEFAULT 'generic_3phase',
    p_product_name TEXT DEFAULT 'Principal',
    p_product_slug TEXT DEFAULT 'TRIPS'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_workspace_id UUID;
    v_pipeline_id UUID;
    v_phase1_id UUID;
    v_phase2_id UUID;
    v_phase3_id UUID;
    v_product_enum app_product;
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'permission denied: platform admin required'
            USING ERRCODE = '42501';
    END IF;

    -- Validar tenant existe
    IF NOT EXISTS(SELECT 1 FROM organizations WHERE id = p_tenant_id AND parent_org_id IS NULL) THEN
        RAISE EXCEPTION 'tenant not found: %', p_tenant_id
            USING ERRCODE = 'P0002';
    END IF;

    -- Validar que o slug do produto está no enum
    BEGIN
        v_product_enum := p_product_slug::app_product;
    EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Produto slug % não está no enum app_product. Chame ensure_app_product_value(%) primeiro.', p_product_slug, p_product_slug;
    END;

    -- =========================================================================
    -- 1. Criar organização (WORKSPACE - com parent_org_id)
    -- =========================================================================
    INSERT INTO organizations (id, name, slug, parent_org_id, active, branding, settings)
    VALUES (
        gen_random_uuid(), p_name, p_slug, p_tenant_id, true,
        '{"primary_color": "#4f46e5", "accent_color": "#0d9488"}',
        '{"default_currency": "BRL", "timezone": "America/Sao_Paulo", "date_format": "dd/MM/yyyy"}'
    )
    RETURNING id INTO v_workspace_id;

    -- =========================================================================
    -- 2. Criar roles padrão
    -- =========================================================================
    INSERT INTO roles (name, display_name, description, permissions, is_system, org_id)
    VALUES
        ('admin', 'Administrador', 'Acesso total ao sistema',
         '{"manage_users": true, "manage_pipeline": true, "manage_settings": true, "view_analytics": true}',
         true, v_workspace_id),
        ('sales', 'Vendedor', 'Acesso a pipeline e cards',
         '{"view_pipeline": true, "manage_cards": true}',
         true, v_workspace_id),
        ('support', 'Suporte', 'Acesso pós-venda',
         '{"view_pipeline": true, "manage_cards": true}',
         true, v_workspace_id);

    -- =========================================================================
    -- 3. Criar pipeline + fases + estágios
    -- =========================================================================
    v_pipeline_id := gen_random_uuid();

    IF p_template = 'generic_3phase' THEN
        INSERT INTO pipelines (id, produto, nome, descricao, ativo, org_id)
        VALUES (v_pipeline_id, v_product_enum, p_product_name, 'Pipeline principal', true, v_workspace_id);

        v_phase1_id := gen_random_uuid();
        v_phase2_id := gen_random_uuid();
        v_phase3_id := gen_random_uuid();

        INSERT INTO pipeline_phases (id, name, label, slug, color, order_index, active, org_id,
            supports_win, win_action, is_entry_phase, is_terminal_phase, owner_label, accent_color)
        VALUES
            (v_phase1_id, 'Pré-Venda', 'Pré-Venda', 'pre_venda', '#0d9488', 1, true, v_workspace_id,
             true, 'advance_to_next', true, false, 'Pré-Venda', 'teal'),
            (v_phase2_id, 'Vendas', 'Vendas', 'vendas', '#4f46e5', 2, true, v_workspace_id,
             true, 'choose', false, false, 'Vendas', 'indigo'),
            (v_phase3_id, 'Pós-Venda', 'Pós-Venda', 'pos_venda', '#f59e0b', 3, true, v_workspace_id,
             false, null, false, true, 'Pós-Venda', 'amber');

        INSERT INTO pipeline_stages (pipeline_id, phase_id, nome, ordem, ativo, org_id)
        VALUES
            (v_pipeline_id, v_phase1_id, 'Novo Lead', 1, true, v_workspace_id),
            (v_pipeline_id, v_phase1_id, 'Qualificação', 2, true, v_workspace_id),
            (v_pipeline_id, v_phase1_id, 'Reunião Agendada', 3, true, v_workspace_id),
            (v_pipeline_id, v_phase2_id, 'Proposta', 4, true, v_workspace_id),
            (v_pipeline_id, v_phase2_id, 'Negociação', 5, true, v_workspace_id),
            (v_pipeline_id, v_phase2_id, 'Fechamento', 6, true, v_workspace_id),
            (v_pipeline_id, v_phase3_id, 'Onboarding', 7, true, v_workspace_id),
            (v_pipeline_id, v_phase3_id, 'Acompanhamento', 8, true, v_workspace_id),
            (v_pipeline_id, v_phase3_id, 'Concluído', 9, true, v_workspace_id);

    ELSIF p_template = 'simple_2phase' THEN
        INSERT INTO pipelines (id, produto, nome, descricao, ativo, org_id)
        VALUES (v_pipeline_id, v_product_enum, p_product_name, 'Pipeline simples', true, v_workspace_id);

        v_phase1_id := gen_random_uuid();
        v_phase2_id := gen_random_uuid();

        INSERT INTO pipeline_phases (id, name, label, slug, color, order_index, active, org_id,
            supports_win, win_action, is_entry_phase, is_terminal_phase, owner_label, accent_color)
        VALUES
            (v_phase1_id, 'Vendas', 'Vendas', 'vendas', '#4f46e5', 1, true, v_workspace_id,
             true, 'advance_to_next', true, false, 'Vendas', 'indigo'),
            (v_phase2_id, 'Entrega', 'Entrega', 'entrega', '#0d9488', 2, true, v_workspace_id,
             false, null, false, true, 'Entrega', 'teal');

        INSERT INTO pipeline_stages (pipeline_id, phase_id, nome, ordem, ativo, org_id)
        VALUES
            (v_pipeline_id, v_phase1_id, 'Novo', 1, true, v_workspace_id),
            (v_pipeline_id, v_phase1_id, 'Em Andamento', 2, true, v_workspace_id),
            (v_pipeline_id, v_phase1_id, 'Proposta', 3, true, v_workspace_id),
            (v_pipeline_id, v_phase2_id, 'Executando', 4, true, v_workspace_id),
            (v_pipeline_id, v_phase2_id, 'Concluído', 5, true, v_workspace_id);
    END IF;

    -- =========================================================================
    -- 4. Criar produto
    -- =========================================================================
    INSERT INTO products (org_id, slug, name, name_short, icon_name, color_class,
        pipeline_id, deal_label, deal_plural, main_date_label, not_found_label, active, display_order)
    VALUES (
        v_workspace_id, v_product_enum, p_product_name, p_product_name,
        'Briefcase', 'text-indigo-500', v_pipeline_id,
        'Negócio', 'Negócios', 'Data Principal', 'Negócio não encontrado', true, 1
    );

    -- =========================================================================
    -- 5. Seções padrão
    -- =========================================================================
    INSERT INTO sections (key, label, position, order_index, is_governable, is_system, active, pipeline_id, org_id)
    VALUES
        ('info', 'Informações', 'left_column', 1, true, false, true, v_pipeline_id, v_workspace_id),
        ('notes', 'Observações', 'left_column', 2, true, false, true, v_pipeline_id, v_workspace_id),
        ('people', 'Pessoas', 'right_column', 1, false, true, true, v_pipeline_id, v_workspace_id),
        ('payment', 'Pagamento', 'right_column', 2, false, true, true, v_pipeline_id, v_workspace_id)
    ON CONFLICT (org_id, pipeline_id, key) DO NOTHING;

    -- =========================================================================
    -- 6. Motivos de perda padrão
    -- =========================================================================
    INSERT INTO motivos_perda (nome, ativo, org_id) VALUES
        ('Preço alto', true, v_workspace_id),
        ('Concorrente', true, v_workspace_id),
        ('Sem resposta', true, v_workspace_id),
        ('Sem necessidade', true, v_workspace_id),
        ('Timing inadequado', true, v_workspace_id);

    -- =========================================================================
    -- 7. Convite admin
    -- =========================================================================
    INSERT INTO invitations (email, role, token, expires_at, org_id) VALUES (
        p_admin_email, 'admin', encode(gen_random_bytes(32), 'hex'),
        now() + interval '7 days', v_workspace_id
    );

    -- =========================================================================
    -- 8. Departamento e team padrão
    -- =========================================================================
    INSERT INTO departments (name, slug, description, org_id)
    VALUES ('Geral', 'geral', 'Departamento principal', v_workspace_id);

    INSERT INTO teams (name, description, is_active, org_id)
    VALUES ('Time Principal', 'Time padrão da organização', true, v_workspace_id);

    -- =========================================================================
    -- 9. Audit log
    -- =========================================================================
    INSERT INTO platform_audit_log (actor_id, action, target_type, target_id, metadata)
    VALUES (
        auth.uid(),
        'workspace.create',
        'organization',
        v_workspace_id,
        jsonb_build_object(
            'tenant_id', p_tenant_id,
            'workspace_name', p_name,
            'product_slug', p_product_slug,
            'template', p_template
        )
    );

    RETURN v_workspace_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.provision_workspace(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
