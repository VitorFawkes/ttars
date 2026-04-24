-- ============================================================================
-- MIGRATION: Mover regra "sub-card exige Pós-venda" para integration_settings
-- Date: 2026-04-24
--
-- Contexto: a regra vivia em organizations.settings->>'sub_card_requires_pos_venda'
-- (migration 20260423e). Movida para integration_settings com namespace
-- card_rules.* para ficar no mesmo padrão das regras configuráveis via
-- "Gerenciador de Seções" (SectionManager), junto com date_features.*.
--
-- Mudanças:
--   1. Seed: 1 linha por ACCOUNT (organizations com parent_org_id IS NULL).
--      Workspaces filhos leem via RLS parent_org_id fallback.
--   2. criar_sub_card: lê integration_settings em vez de organizations.settings.
--      Resolve account pai quando o card está em workspace filho.
--   3. Cleanup: remove chave antiga de organizations.settings (não deixa lixo).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Seed em integration_settings (1 linha por account)
-- ---------------------------------------------------------------------------
INSERT INTO integration_settings (key, value, description, org_id, produto)
SELECT
  'card_rules.subcard_requires_pos_venda',
  'true',
  'Exige card principal em Pós-venda para criar sub-card (mudanças e vendas extras)',
  o.id,
  NULL
FROM organizations o
WHERE o.parent_org_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM integration_settings s
    WHERE s.key = 'card_rules.subcard_requires_pos_venda'
      AND s.org_id = o.id
      AND s.produto IS NULL
  );

-- ---------------------------------------------------------------------------
-- 2. criar_sub_card lê de integration_settings (com resolução de account)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION criar_sub_card(
    p_parent_id UUID,
    p_titulo TEXT,
    p_descricao TEXT,
    p_mode TEXT DEFAULT 'incremental',
    p_merge_config JSONB DEFAULT NULL,
    p_category TEXT DEFAULT 'addition',
    p_valor_estimado NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_parent RECORD;
    v_target_stage_id UUID;
    v_new_card_id UUID;
    v_user_id UUID;
    v_sub_produto_data JSONB;
    v_category TEXT;
    v_valor NUMERIC;
    v_require_pos_venda BOOLEAN;
    v_parent_phase_slug TEXT;
    v_account_id UUID;
    v_setting_value TEXT;
BEGIN
    v_user_id := auth.uid();
    v_category := CASE WHEN p_category IN ('addition', 'change') THEN p_category ELSE 'addition' END;
    v_valor := COALESCE(p_valor_estimado, 0);

    -- 1. Validar card pai (carrega slug da fase do pai)
    SELECT c.*, s.fase, s.phase_id, c.pipeline_id, pp.slug AS parent_phase_slug
    INTO v_parent
    FROM cards c
    JOIN pipeline_stages s ON c.pipeline_stage_id = s.id
    LEFT JOIN pipeline_phases pp ON pp.id = s.phase_id
    WHERE c.id = p_parent_id
      AND c.deleted_at IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Card principal não encontrado');
    END IF;

    IF v_parent.card_type = 'sub_card' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Não é possível criar sub-card de um sub-card');
    END IF;

    IF v_parent.is_group_parent THEN
        RETURN jsonb_build_object('success', false, 'error', 'Não é possível criar item adicional em card agrupador');
    END IF;

    IF v_parent.card_type = 'future_opportunity' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Não é possível criar sub-card de uma oportunidade futura');
    END IF;

    -- 1b. Regra configurável via integration_settings (namespace card_rules.*)
    --     Setting vive 1 linha por ACCOUNT. Se o card está em workspace filho,
    --     resolve para a account pai antes de consultar.
    SELECT COALESCE(o.parent_org_id, o.id) INTO v_account_id
    FROM organizations o
    WHERE o.id = v_parent.org_id;

    SELECT value INTO v_setting_value
    FROM integration_settings
    WHERE key = 'card_rules.subcard_requires_pos_venda'
      AND org_id = v_account_id
      AND produto IS NULL
    LIMIT 1;

    -- DEFAULT TRUE quando setting ausente
    v_require_pos_venda := (COALESCE(v_setting_value, 'true') = 'true');

    v_parent_phase_slug := v_parent.parent_phase_slug;

    IF v_require_pos_venda AND v_parent_phase_slug IS DISTINCT FROM 'pos_venda' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Sub-cards só podem ser criados quando o card principal está em Pós-venda. Para afrouxar essa regra, ajuste em Gerenciador de Seções → Regras de Sub-Cards.'
        );
    END IF;

    -- 2. Determinar estágio inicial via cascata de fallbacks
    SELECT sub_card_default_stage_id INTO v_target_stage_id
    FROM pipelines WHERE id = v_parent.pipeline_id;

    IF v_target_stage_id IS NULL THEN
        SELECT s.id INTO v_target_stage_id
        FROM pipeline_stages s
        JOIN pipeline_phases ph ON ph.id = s.phase_id
        WHERE ph.slug = 'planner'
          AND s.pipeline_id = v_parent.pipeline_id
          AND s.ativo = true
          AND s.nome = 'Proposta em Construção'
        LIMIT 1;

        IF v_target_stage_id IS NULL THEN
            SELECT s.id INTO v_target_stage_id
            FROM pipeline_stages s
            JOIN pipeline_phases ph ON ph.id = s.phase_id
            WHERE ph.slug = 'planner'
              AND s.pipeline_id = v_parent.pipeline_id
              AND s.ativo = true
            ORDER BY s.ordem ASC
            LIMIT 1;
        END IF;
    END IF;

    IF v_target_stage_id IS NULL THEN
        SELECT s.id INTO v_target_stage_id
        FROM pipeline_stages s
        JOIN pipeline_phases ph ON ph.id = s.phase_id
        WHERE ph.slug = 'pos_venda'
          AND s.pipeline_id = v_parent.pipeline_id
          AND s.ativo = true
        ORDER BY s.ordem ASC
        LIMIT 1;
    END IF;

    IF v_target_stage_id IS NULL THEN
        v_target_stage_id := v_parent.pipeline_stage_id;
    END IF;

    IF v_target_stage_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Não foi possível determinar a etapa inicial do sub-card');
    END IF;

    -- 3. Preparar produto_data
    v_sub_produto_data := COALESCE(v_parent.produto_data, '{}'::jsonb);
    v_sub_produto_data := v_sub_produto_data
        - 'numero_venda_monde'
        - 'numeros_venda_monde_historico'
        - 'taxa_planejamento'
        - 'orcamento';

    -- 4. Criar o sub-card
    INSERT INTO cards (
        titulo, card_type, sub_card_mode, sub_card_status, sub_card_category, parent_card_id,
        pipeline_id, pipeline_stage_id, stage_entered_at,
        pessoa_principal_id, produto, produto_data, moeda,
        data_viagem_inicio, data_viagem_fim, valor_estimado,
        dono_atual_id, sdr_owner_id, vendas_owner_id, pos_owner_id, concierge_owner_id,
        status_comercial, created_by, created_at, updated_at
    )
    VALUES (
        p_titulo, 'sub_card', 'incremental', 'active', v_category, p_parent_id,
        v_parent.pipeline_id, v_target_stage_id, now(),
        v_parent.pessoa_principal_id, v_parent.produto, v_sub_produto_data, v_parent.moeda,
        v_parent.data_viagem_inicio, v_parent.data_viagem_fim, v_valor,
        COALESCE(v_parent.vendas_owner_id, v_user_id), v_parent.sdr_owner_id,
        v_parent.vendas_owner_id, v_parent.pos_owner_id, v_parent.concierge_owner_id,
        'aberto', v_user_id, now(), now()
    )
    RETURNING id INTO v_new_card_id;

    -- 5. Log
    INSERT INTO sub_card_sync_log (sub_card_id, parent_card_id, action, new_value, metadata, created_by)
    VALUES (
        v_new_card_id, p_parent_id, 'created',
        jsonb_build_object('titulo', p_titulo, 'mode', 'incremental', 'category', v_category, 'valor_estimado', v_valor),
        jsonb_build_object('target_stage_id', v_target_stage_id),
        v_user_id
    );

    -- 6. Activity no pai
    INSERT INTO activities (card_id, tipo, descricao, metadata, created_by, created_at)
    VALUES (
        p_parent_id, 'sub_card_created',
        CASE v_category
            WHEN 'change' THEN 'Mudança na viagem: ' || p_titulo
            ELSE 'Item da viagem criado: ' || p_titulo
        END,
        jsonb_build_object('sub_card_id', v_new_card_id, 'sub_card_titulo', p_titulo, 'sub_card_category', v_category),
        v_user_id, now()
    );

    -- 7. Tarefa só se pai está realmente em Pós-venda
    IF v_parent_phase_slug = 'pos_venda' THEN
        INSERT INTO tarefas (
            card_id, tipo, titulo, descricao, responsavel_id,
            data_vencimento, prioridade, metadata, created_by, created_at
        )
        VALUES (
            p_parent_id,
            'solicitacao_mudanca',
            CASE v_category
                WHEN 'change' THEN 'Mudança: ' || p_titulo
                ELSE 'Produto extra: ' || p_titulo
            END,
            COALESCE(p_descricao, 'Sub-card criado pelo Planner'),
            COALESCE(v_parent.pos_owner_id, v_parent.vendas_owner_id, v_user_id),
            now() + interval '3 days',
            'alta',
            jsonb_build_object(
                'sub_card_id', v_new_card_id,
                'sub_card_titulo', p_titulo,
                'sub_card_category', v_category,
                'created_by', v_user_id
            ),
            v_user_id,
            now()
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'sub_card_id', v_new_card_id,
        'mode', 'incremental',
        'category', v_category,
        'parent_id', p_parent_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION criar_sub_card TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Cleanup: remove chave antiga de organizations.settings
-- ---------------------------------------------------------------------------
UPDATE organizations
   SET settings = settings - 'sub_card_requires_pos_venda'
 WHERE settings ? 'sub_card_requires_pos_venda';

COMMIT;
