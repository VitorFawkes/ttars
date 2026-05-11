-- ============================================================================
-- provision_workspace: seed de system_fields + stage_section_config
--
-- Motivação: quando uma nova empresa-cliente (ex: Jair Viagens) chama
-- provision_workspace, o workspace nasce sem nenhum system_fields próprio.
-- Hoje isso "funciona por acidente" porque Welcome Group (account pai) tem
-- 147 fields e o RLS faz fallback para parent_org_id. Para qualquer empresa
-- que não seja filha de Welcome Group, os formulários nasceriam vazios.
--
-- Correção: copiar da Welcome Group os system_fields relevantes ao produto
-- do workspace (produto_exclusivo IS NULL OR produto_exclusivo = produto),
-- atribuindo org_id = workspace novo.
--
-- Fonte de verdade: a.account Welcome Group (a0000000-0000-0000-0000-000000000001).
-- Estratégia adotada pelo usuário (2026-04-22): manter system_fields per-org,
-- com seed per-produto na criação do workspace.
-- ============================================================================

BEGIN;

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
    v_source_account UUID := 'a0000000-0000-0000-0000-000000000001'; -- Welcome Group
    v_fields_copied INT := 0;
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
    -- 9. Seed de system_fields — copiar de Welcome Group, filtrando por produto
    --
    -- Copia os campos universais (produto_exclusivo IS NULL) e os do produto
    -- deste workspace. O workspace fica com catálogo próprio e não depende
    -- mais de RLS fallback para parent_org_id.
    -- =========================================================================
    INSERT INTO system_fields (
        key, label, type, options, active, section, is_system,
        section_id, order_index, produto_exclusivo, org_id
    )
    SELECT
        sf.key,
        sf.label,
        sf.type,
        sf.options,
        sf.active,
        sf.section,
        sf.is_system,
        NULL, -- section_id local será populado quando admin mapear seções
        sf.order_index,
        sf.produto_exclusivo,
        v_workspace_id
    FROM system_fields sf
    WHERE sf.org_id = v_source_account
      AND (sf.produto_exclusivo IS NULL OR sf.produto_exclusivo = p_product_slug)
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS v_fields_copied = ROW_COUNT;

    -- =========================================================================
    -- 10. Seed de stage_section_config — todas seções visíveis em todas etapas
    --
    -- Estabelece baseline previsível: admin vê todas as seções em todas as
    -- etapas e pode desligar seletivamente depois via Pipeline Studio.
    -- =========================================================================
    INSERT INTO stage_section_config (stage_id, section_key, is_visible, default_collapsed, org_id)
    SELECT s.id, sec.key, true, false, v_workspace_id
    FROM pipeline_stages s
    CROSS JOIN (VALUES ('info'), ('notes'), ('people'), ('payment')) AS sec(key)
    WHERE s.pipeline_id = v_pipeline_id
    ON CONFLICT DO NOTHING;

    -- =========================================================================
    -- 11. Audit log
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
            'template', p_template,
            'system_fields_copied', v_fields_copied
        )
    );

    RETURN v_workspace_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.provision_workspace(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.provision_workspace IS
'Cria workspace filho (org com parent_org_id). Semeia roles, pipeline+fases+etapas, produto, seções default, motivos de perda, convite admin, team/departamento, system_fields filtrados pelo produto (copiados da account Welcome Group) e stage_section_config visível para as seções default.';

COMMIT;
