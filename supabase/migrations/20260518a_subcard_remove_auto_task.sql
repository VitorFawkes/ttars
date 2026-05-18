-- ============================================================================
-- MIGRATION: remove auto-criacao de tarefa 'solicitacao_mudanca' ao criar/transformar sub-card
-- Date: 2026-05-18
--
-- Contexto: ate hoje, criar_sub_card() e transformar_em_sub_card() inseriam
-- automaticamente uma tarefa do tipo 'solicitacao_mudanca' na tabela 'tarefas'
-- quando o card pai estava em Pos-venda (verificado via pipeline_phases.slug
-- = 'pos_venda'). Decisao de produto: a tarefa relacionada a mudanca / produto
-- extra deve ser criada manualmente pelo Travel Planner, caso a caso. Sub-card
-- nunca deve gerar tarefa automatica.
--
-- Mudancas:
--   1. criar_sub_card: rebase da versao 20260506a (copia acompanhantes) sem o
--      bloco 7 (INSERT em tarefas). Preserva TODAS as correcoes anteriores:
--        - lookup do default stage via pipelines.sub_card_default_stage_id
--        - filtro por pipeline_id no fallback de planner / pos_venda
--        - regra configuravel via integration_settings.card_rules.subcard_requires_pos_venda
--        - cascata de fallback ate v_parent.pipeline_stage_id
--        - replicacao de cards_contatos do pai para o filho
--        - remocao de numero_venda_monde / numeros_venda_monde_historico /
--          taxa_planejamento / orcamento do produto_data herdado
--   2. transformar_em_sub_card: rebase da versao 20260507b sem o bloco 8
--      (INSERT em tarefas). Retira a variavel v_task_id, deixa task_id NULL
--      no retorno (preserva o campo no JSON para nao quebrar o tipo TS).
--
-- Tarefas historicas nao sao tocadas. Para limpar manualmente, filtrar tarefas
-- onde metadata->>'sub_card_id' IS NOT NULL.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. criar_sub_card (sem bloco de tarefa)
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
AS $func$
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
        RETURN jsonb_build_object('success', false, 'error', 'Card principal nao encontrado');
    END IF;

    IF v_parent.card_type = 'sub_card' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nao e possivel criar sub-card de um sub-card');
    END IF;

    IF v_parent.is_group_parent THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nao e possivel criar item adicional em card agrupador');
    END IF;

    IF v_parent.card_type = 'future_opportunity' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nao e possivel criar sub-card de uma oportunidade futura');
    END IF;

    -- 1b. Regra configuravel via integration_settings (namespace card_rules.*)
    SELECT COALESCE(o.parent_org_id, o.id) INTO v_account_id
    FROM organizations o
    WHERE o.id = v_parent.org_id;

    SELECT value INTO v_setting_value
    FROM integration_settings
    WHERE key = 'card_rules.subcard_requires_pos_venda'
      AND org_id = v_account_id
      AND produto IS NULL
    LIMIT 1;

    v_require_pos_venda := (COALESCE(v_setting_value, 'true') = 'true');
    v_parent_phase_slug := v_parent.parent_phase_slug;

    IF v_require_pos_venda AND v_parent_phase_slug IS DISTINCT FROM 'pos_venda' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Sub-cards so podem ser criados quando o card principal esta em Pos-venda. Para afrouxar essa regra, ajuste em Gerenciador de Secoes -> Regras de Sub-Cards.'
        );
    END IF;

    -- 2. Determinar estagio inicial via cascata de fallbacks
    SELECT sub_card_default_stage_id INTO v_target_stage_id
    FROM pipelines WHERE id = v_parent.pipeline_id;

    IF v_target_stage_id IS NULL THEN
        SELECT s.id INTO v_target_stage_id
        FROM pipeline_stages s
        JOIN pipeline_phases ph ON ph.id = s.phase_id
        WHERE ph.slug = 'planner'
          AND s.pipeline_id = v_parent.pipeline_id
          AND s.ativo = true
          AND s.nome = 'Proposta em Construcao'
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
        RETURN jsonb_build_object('success', false, 'error', 'Nao foi possivel determinar a etapa inicial do sub-card');
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

    -- 4b. Copiar acompanhantes do card pai para o sub-card
    INSERT INTO cards_contatos (card_id, contato_id, tipo_viajante, ordem, tipo_vinculo, org_id, created_at)
    SELECT v_new_card_id, contato_id, tipo_viajante, ordem, tipo_vinculo, org_id, now()
    FROM cards_contatos
    WHERE card_id = p_parent_id
      AND contato_id IS DISTINCT FROM v_parent.pessoa_principal_id;

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
            WHEN 'change' THEN 'Mudanca na viagem: ' || p_titulo
            ELSE 'Item da viagem criado: ' || p_titulo
        END,
        jsonb_build_object('sub_card_id', v_new_card_id, 'sub_card_titulo', p_titulo, 'sub_card_category', v_category),
        v_user_id, now()
    );

    -- 7. Tarefa solicitacao_mudanca REMOVIDA (2026-05-18)
    --    Decisao de produto: Travel Planner cria tarefas manualmente, caso a caso.

    RETURN jsonb_build_object(
        'success', true,
        'sub_card_id', v_new_card_id,
        'mode', 'incremental',
        'category', v_category,
        'parent_id', p_parent_id
    );
END;
$func$;

GRANT EXECUTE ON FUNCTION criar_sub_card TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. transformar_em_sub_card (sem bloco de tarefa)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION transformar_em_sub_card(
    p_card_id UUID,
    p_parent_id UUID,
    p_category TEXT DEFAULT 'change',
    p_descricao TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
    v_card RECORD;
    v_parent RECORD;
    v_user_id UUID;
    v_category TEXT;
    v_require_pos_venda BOOLEAN;
    v_account_id UUID;
    v_setting_value TEXT;
    v_parent_phase_slug TEXT;
    v_caller_org UUID;
BEGIN
    v_user_id := auth.uid();
    v_caller_org := requesting_org_id();
    v_category := CASE WHEN p_category IN ('addition', 'change') THEN p_category ELSE 'change' END;

    IF p_card_id = p_parent_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Card e card pai nao podem ser o mesmo');
    END IF;

    -- 1. Carregar card filho
    SELECT c.*
    INTO v_card
    FROM cards c
    WHERE c.id = p_card_id
      AND c.deleted_at IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Card nao encontrado');
    END IF;

    IF v_caller_org IS NOT NULL AND v_card.org_id <> v_caller_org THEN
        RETURN jsonb_build_object('success', false, 'error', 'Card nao encontrado');
    END IF;

    IF v_card.card_type <> 'standard' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Apenas cards comuns podem virar sub-card');
    END IF;

    IF v_card.parent_card_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Este card ja esta vinculado a outro');
    END IF;

    IF v_card.sub_card_status IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Este card ja foi sub-card antes; nao da pra reusar');
    END IF;

    IF v_card.is_group_parent THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cards agrupadores nao podem virar sub-card');
    END IF;

    IF EXISTS (SELECT 1 FROM cards WHERE parent_card_id = p_card_id AND deleted_at IS NULL) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Este card ja tem sub-cards e nao pode virar filho');
    END IF;

    -- 2. Carregar card pai
    SELECT c.*, pp.slug AS parent_phase_slug
    INTO v_parent
    FROM cards c
    JOIN pipeline_stages s ON c.pipeline_stage_id = s.id
    LEFT JOIN pipeline_phases pp ON pp.id = s.phase_id
    WHERE c.id = p_parent_id
      AND c.deleted_at IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Card pai nao encontrado');
    END IF;

    IF v_caller_org IS NOT NULL AND v_parent.org_id <> v_caller_org THEN
        RETURN jsonb_build_object('success', false, 'error', 'Card pai nao encontrado');
    END IF;

    IF v_parent.org_id <> v_card.org_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cards de organizacoes diferentes');
    END IF;

    IF v_parent.produto <> v_card.produto THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cards de produtos diferentes nao podem ser vinculados');
    END IF;

    IF v_parent.pipeline_id <> v_card.pipeline_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cards em pipelines diferentes nao podem ser vinculados');
    END IF;

    IF v_parent.card_type = 'sub_card' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nao e possivel pendurar sub-card de outro sub-card');
    END IF;

    IF v_parent.card_type = 'future_opportunity' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Card pai nao pode ser oportunidade futura');
    END IF;

    IF v_parent.is_group_parent THEN
        RETURN jsonb_build_object('success', false, 'error', 'Card agrupador nao pode ser pai de sub-card');
    END IF;

    -- 3. Regra configuravel: pai em pos-venda?
    SELECT COALESCE(o.parent_org_id, o.id) INTO v_account_id
    FROM organizations o
    WHERE o.id = v_parent.org_id;

    SELECT value INTO v_setting_value
    FROM integration_settings
    WHERE key = 'card_rules.subcard_requires_pos_venda'
      AND org_id = v_account_id
      AND produto IS NULL
    LIMIT 1;

    v_require_pos_venda := (COALESCE(v_setting_value, 'true') = 'true');
    v_parent_phase_slug := v_parent.parent_phase_slug;

    IF v_require_pos_venda AND v_parent_phase_slug IS DISTINCT FROM 'pos_venda' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'O card pai precisa estar em Pos-venda. Para afrouxar essa regra, ajuste em Gerenciador de Secoes -> Regras de Sub-Cards.'
        );
    END IF;

    -- 4. Mutacao atomica do card filho
    UPDATE cards
       SET parent_card_id = p_parent_id,
           card_type = 'sub_card',
           sub_card_mode = 'incremental',
           sub_card_status = 'active',
           sub_card_category = v_category,
           sub_card_agregado_em = NULL,
           updated_at = now(),
           updated_by = v_user_id
     WHERE id = p_card_id;

    -- 5. Log
    INSERT INTO sub_card_sync_log (
        sub_card_id, parent_card_id, action, new_value, metadata, created_by, org_id
    )
    VALUES (
        p_card_id, p_parent_id, 'transformed',
        jsonb_build_object(
            'mode', 'incremental',
            'category', v_category,
            'previous_card_type', v_card.card_type,
            'previous_pipeline_stage_id', v_card.pipeline_stage_id
        ),
        jsonb_build_object(
            'source', 'transformar_em_sub_card',
            'descricao', p_descricao
        ),
        v_user_id,
        v_parent.org_id
    );

    -- 6. Activity no pai
    INSERT INTO activities (card_id, tipo, descricao, metadata, created_by, created_at, org_id)
    VALUES (
        p_parent_id, 'sub_card_vinculado',
        CASE v_category
            WHEN 'change' THEN 'Card vinculado como mudanca da viagem: ' || COALESCE(v_card.titulo, '(sem titulo)')
            ELSE 'Card vinculado como item adicional: ' || COALESCE(v_card.titulo, '(sem titulo)')
        END,
        jsonb_build_object(
            'sub_card_id', p_card_id,
            'sub_card_titulo', v_card.titulo,
            'sub_card_category', v_category,
            'origem', 'transformar_em_sub_card'
        ),
        v_user_id, now(), v_parent.org_id
    );

    -- 7. Activity no filho
    INSERT INTO activities (card_id, tipo, descricao, metadata, created_by, created_at, org_id)
    VALUES (
        p_card_id, 'tornou_sub_card',
        'Este card virou sub-card de: ' || COALESCE(v_parent.titulo, '(sem titulo)'),
        jsonb_build_object(
            'parent_card_id', p_parent_id,
            'parent_card_titulo', v_parent.titulo,
            'sub_card_category', v_category
        ),
        v_user_id, now(), v_card.org_id
    );

    -- 8. Tarefa solicitacao_mudanca REMOVIDA (2026-05-18)
    --    Decisao de produto: Travel Planner cria tarefas manualmente, caso a caso.

    RETURN jsonb_build_object(
        'success', true,
        'sub_card_id', p_card_id,
        'parent_id', p_parent_id,
        'mode', 'incremental',
        'category', v_category,
        'task_id', NULL
    );
END;
$func$;

GRANT EXECUTE ON FUNCTION transformar_em_sub_card TO authenticated;

COMMIT;
