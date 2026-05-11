-- H3-011: Add org_id guards to remaining business RPCs
-- Functions: marcar_perdido, reabrir_card, criar_sub_card, set_card_primary_contact
--
-- Pattern (same as h3_009):
--   - Add c.org_id = requesting_org_id() to WHERE clauses querying cards
--   - Add org_id column to INSERT INTO activities/tarefas
--   - Add org_id column to INSERT INTO cards (criar_sub_card)
--
-- NOTE: marcar_ganho was already updated in h3_009 — NOT included here.

BEGIN;

-- =============================================================================
-- 1. marcar_perdido — Add org guards
-- Source: 20260324_remove_ganho_perdido_pos_venda.sql
-- =============================================================================
CREATE OR REPLACE FUNCTION public.marcar_perdido(
    p_card_id UUID,
    p_motivo_perda_id UUID DEFAULT NULL,
    p_motivo_perda_comentario TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
    -- Validar card + ORG GUARD
    IF NOT EXISTS (
        SELECT 1 FROM cards
        WHERE id = p_card_id
          AND org_id = requesting_org_id()
          AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Card não encontrado, deletado ou acesso negado: %', p_card_id;
    END IF;

    -- Validar que não está já fechado
    IF EXISTS (
        SELECT 1 FROM cards
        WHERE id = p_card_id
          AND org_id = requesting_org_id()
          AND status_comercial IN ('ganho', 'perdido')
    ) THEN
        RAISE EXCEPTION 'Card já está fechado (ganho ou perdido)';
    END IF;

    -- Bloquear em Pós-Venda/Resolução — fase de execução, sem perdido
    IF EXISTS (
        SELECT 1 FROM cards c
        JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
        JOIN pipeline_phases pp ON pp.id = s.phase_id
        WHERE c.id = p_card_id
          AND c.org_id = requesting_org_id()
          AND pp.slug IN ('pos_venda', 'resolucao')
    ) THEN
        RAISE EXCEPTION 'Pós-Venda não suporta ação de perdido';
    END IF;

    -- Marcar como perdido — card PERMANECE na etapa atual
    UPDATE cards SET
        status_comercial = 'perdido',
        data_fechamento = CURRENT_DATE,
        motivo_perda_id = p_motivo_perda_id,
        motivo_perda_comentario = p_motivo_perda_comentario,
        updated_at = NOW()
    WHERE id = p_card_id
      AND org_id = requesting_org_id();

    -- Registrar activity
    INSERT INTO activities (card_id, tipo, descricao, metadata, org_id)
    VALUES (
        p_card_id,
        'card_lost',
        'Card marcado como perdido',
        jsonb_build_object(
            'motivo_perda_id', p_motivo_perda_id,
            'motivo_perda_comentario', p_motivo_perda_comentario,
            'stage_id', (SELECT pipeline_stage_id FROM cards WHERE id = p_card_id AND org_id = requesting_org_id())
        ),
        requesting_org_id()
    );
END;
$fn$;

-- =============================================================================
-- 2. reabrir_card — Add org guards
-- Source: 20260324_remove_ganho_perdido_pos_venda.sql
-- =============================================================================
CREATE OR REPLACE FUNCTION public.reabrir_card(p_card_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_phase_slug TEXT;
BEGIN
    -- Validar card + ORG GUARD
    IF NOT EXISTS (
        SELECT 1 FROM cards
        WHERE id = p_card_id
          AND org_id = requesting_org_id()
          AND deleted_at IS NULL
          AND status_comercial IN ('ganho', 'perdido')
    ) THEN
        RAISE EXCEPTION 'Card não encontrado, deletado, não está fechado, ou acesso negado: %', p_card_id;
    END IF;

    -- Descobrir fase atual do card para limpar o milestone correto
    SELECT pp.slug INTO v_phase_slug
    FROM cards c
    JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
    JOIN pipeline_phases pp ON pp.id = s.phase_id
    WHERE c.id = p_card_id
      AND c.org_id = requesting_org_id();

    -- Reabrir — limpar campos de fechamento + milestone da fase atual
    UPDATE cards SET
        status_comercial = 'aberto',
        data_fechamento = NULL,
        motivo_perda_id = NULL,
        motivo_perda_comentario = NULL,
        -- Limpar milestone da fase onde o card está para não poluir relatórios
        ganho_sdr = CASE WHEN v_phase_slug = 'sdr' THEN false ELSE ganho_sdr END,
        ganho_sdr_at = CASE WHEN v_phase_slug = 'sdr' THEN NULL ELSE ganho_sdr_at END,
        ganho_planner = CASE WHEN v_phase_slug = 'planner' THEN false ELSE ganho_planner END,
        ganho_planner_at = CASE WHEN v_phase_slug = 'planner' THEN NULL ELSE ganho_planner_at END,
        ganho_pos = CASE WHEN v_phase_slug IN ('pos_venda', 'resolucao') THEN false ELSE ganho_pos END,
        ganho_pos_at = CASE WHEN v_phase_slug IN ('pos_venda', 'resolucao') THEN NULL ELSE ganho_pos_at END,
        updated_at = NOW()
    WHERE id = p_card_id
      AND org_id = requesting_org_id();

    -- Registrar activity
    INSERT INTO activities (card_id, tipo, descricao, metadata, org_id)
    VALUES (
        p_card_id,
        'card_reopened',
        'Card reaberto',
        jsonb_build_object('phase', v_phase_slug),
        requesting_org_id()
    );
END;
$fn$;

COMMENT ON FUNCTION reabrir_card IS
    'Reabre card ganho/perdido. Limpa status, data de fechamento e milestone da fase atual.';

-- =============================================================================
-- 3. criar_sub_card — Add org guards
-- Source: 20260326_fix_criar_sub_card_definitive.sql
-- =============================================================================

-- Drop overloads (same as original migration)
DROP FUNCTION IF EXISTS criar_sub_card(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS criar_sub_card(UUID, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS criar_sub_card(UUID, TEXT, TEXT, TEXT, JSONB, TEXT);
DROP FUNCTION IF EXISTS criar_sub_card(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, NUMERIC);

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
    v_planner_phase_id UUID;
    v_target_stage_id UUID;
    v_new_card_id UUID;
    v_user_id UUID;
    v_sub_produto_data JSONB;
    v_category TEXT;
    v_valor NUMERIC;
BEGIN
    v_user_id := auth.uid();
    v_category := CASE WHEN p_category IN ('addition', 'change') THEN p_category ELSE 'addition' END;
    v_valor := COALESCE(p_valor_estimado, 0);

    -- 1. Validar card pai + ORG GUARD
    SELECT c.*, s.fase, s.phase_id, c.pipeline_id
    INTO v_parent
    FROM cards c
    JOIN pipeline_stages s ON c.pipeline_stage_id = s.id
    WHERE c.id = p_parent_id
      AND c.org_id = requesting_org_id()
      AND c.deleted_at IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Card principal não encontrado ou acesso negado');
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

    -- 2. Determinar estágio inicial
    SELECT sub_card_default_stage_id INTO v_target_stage_id
    FROM pipelines WHERE id = v_parent.pipeline_id;

    IF v_target_stage_id IS NULL THEN
        SELECT pp.id INTO v_planner_phase_id
        FROM pipeline_phases pp
        JOIN pipeline_stages ps ON ps.phase_id = pp.id
        WHERE pp.slug = 'planner'
          AND ps.pipeline_id = v_parent.pipeline_id
        LIMIT 1;

        IF v_planner_phase_id IS NOT NULL THEN
            SELECT id INTO v_target_stage_id
            FROM pipeline_stages
            WHERE phase_id = v_planner_phase_id
              AND pipeline_id = v_parent.pipeline_id
              AND nome = 'Proposta em Construção'
            LIMIT 1;

            IF v_target_stage_id IS NULL THEN
                SELECT id INTO v_target_stage_id
                FROM pipeline_stages
                WHERE phase_id = v_planner_phase_id
                  AND pipeline_id = v_parent.pipeline_id
                ORDER BY ordem ASC
                LIMIT 1;
            END IF;
        END IF;
    END IF;

    IF v_target_stage_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nenhuma etapa encontrada na fase Planner');
    END IF;

    -- 3. Preparar produto_data
    v_sub_produto_data := COALESCE(v_parent.produto_data, '{}'::jsonb);
    v_sub_produto_data := v_sub_produto_data
        - 'numero_venda_monde'
        - 'numeros_venda_monde_historico'
        - 'taxa_planejamento'
        - 'orcamento';

    -- 4. Criar o sub-card (with org_id)
    INSERT INTO cards (
        titulo, card_type, sub_card_mode, sub_card_status, sub_card_category, parent_card_id,
        pipeline_id, pipeline_stage_id, stage_entered_at,
        pessoa_principal_id, produto, produto_data, moeda,
        data_viagem_inicio, data_viagem_fim, valor_estimado,
        dono_atual_id, sdr_owner_id, vendas_owner_id, pos_owner_id, concierge_owner_id,
        status_comercial, created_by, created_at, updated_at,
        org_id
    )
    VALUES (
        p_titulo, 'sub_card', 'incremental', 'active', v_category, p_parent_id,
        v_parent.pipeline_id, v_target_stage_id, now(),
        v_parent.pessoa_principal_id, v_parent.produto, v_sub_produto_data, v_parent.moeda,
        v_parent.data_viagem_inicio, v_parent.data_viagem_fim, v_valor,
        COALESCE(v_parent.vendas_owner_id, v_user_id), v_parent.sdr_owner_id,
        v_parent.vendas_owner_id, v_parent.pos_owner_id, v_parent.concierge_owner_id,
        'aberto', v_user_id, now(), now(),
        requesting_org_id()
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

    -- 6. Activity no pai (with org_id)
    INSERT INTO activities (card_id, tipo, descricao, metadata, created_by, created_at, org_id)
    VALUES (
        p_parent_id, 'sub_card_created',
        CASE v_category
            WHEN 'change' THEN 'Mudança na viagem: ' || p_titulo
            ELSE 'Item da viagem criado: ' || p_titulo
        END,
        jsonb_build_object('sub_card_id', v_new_card_id, 'sub_card_titulo', p_titulo, 'sub_card_category', v_category),
        v_user_id, now(),
        requesting_org_id()
    );

    -- 7. Tarefa solicitacao_mudanca (só quando pai em Pós-Venda)
    -- IMPORTANTE: fase no banco é 'Pós-venda' (com acento e maiúscula)
    IF v_parent.fase = 'Pós-venda' THEN
        INSERT INTO tarefas (
            card_id, tipo, titulo, descricao, responsavel_id,
            data_vencimento, prioridade, metadata, created_by, created_at,
            org_id
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
            now(),
            requesting_org_id()
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

-- =============================================================================
-- 4. set_card_primary_contact — Add org guard
-- Source: 20260310_fix_set_card_primary_contact.sql
-- =============================================================================
CREATE OR REPLACE FUNCTION public.set_card_primary_contact(p_card_id uuid, p_contact_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.cards
    SET pessoa_principal_id = p_contact_id
    WHERE id = p_card_id
      AND org_id = requesting_org_id();
END;
$$;

COMMIT;
