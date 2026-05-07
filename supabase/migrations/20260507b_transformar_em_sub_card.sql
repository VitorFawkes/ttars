-- ============================================================================
-- MIGRATION: transformar_em_sub_card
-- Date: 2026-05-07
--
-- Contexto: hoje só dá pra CRIAR um sub-card via criar_sub_card(). Quando o
-- consultor já criou um card avulso por engano e percebe que ele é, na verdade,
-- uma mudança/adicional de outro card em pós-venda, precisa apagar e recriar.
-- Esta RPC pega um card EXISTENTE (standard, sem pai, sem filhos) e amarra
-- ele como sub-card de outro card que esteja em pós-venda.
--
-- Espelha as regras de criar_sub_card (20260424a):
--   - Mesma org, mesmo produto/pipeline
--   - Pai precisa estar em pós-venda (regra configurável via integration_settings)
--   - Não permite sub-card de sub-card
--   - Categoria default = 'change' (a maioria dos casos é mudança da viagem)
--
-- Adiciona também trigger BEFORE INSERT/UPDATE em parent_card_id como defesa
-- em profundidade (caso algum código futuro escreva direto na coluna sem RPC).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. RPC: transformar_em_sub_card
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS transformar_em_sub_card(UUID, UUID, TEXT, TEXT);

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
AS $$
DECLARE
    v_card RECORD;
    v_parent RECORD;
    v_user_id UUID;
    v_category TEXT;
    v_require_pos_venda BOOLEAN;
    v_account_id UUID;
    v_setting_value TEXT;
    v_parent_phase_slug TEXT;
    v_task_id UUID;
    v_caller_org UUID;
BEGIN
    v_user_id := auth.uid();
    v_caller_org := requesting_org_id();
    v_category := CASE WHEN p_category IN ('addition', 'change') THEN p_category ELSE 'change' END;

    -- Sanity: ids distintos
    IF p_card_id = p_parent_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Card e card pai não podem ser o mesmo');
    END IF;

    -- 1. Carregar card filho
    SELECT c.*
    INTO v_card
    FROM cards c
    WHERE c.id = p_card_id
      AND c.deleted_at IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Card não encontrado');
    END IF;

    -- Defesa em profundidade: caller só opera dentro da própria org
    IF v_caller_org IS NOT NULL AND v_card.org_id <> v_caller_org THEN
        RETURN jsonb_build_object('success', false, 'error', 'Card não encontrado');
    END IF;

    IF v_card.card_type <> 'standard' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Apenas cards comuns podem virar sub-card');
    END IF;

    IF v_card.parent_card_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Este card já está vinculado a outro');
    END IF;

    IF v_card.sub_card_status IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Este card já foi sub-card antes; não dá pra reusar');
    END IF;

    IF v_card.is_group_parent THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cards agrupadores não podem virar sub-card');
    END IF;

    -- Não pode ter filhos próprios
    IF EXISTS (SELECT 1 FROM cards WHERE parent_card_id = p_card_id AND deleted_at IS NULL) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Este card já tem sub-cards e não pode virar filho');
    END IF;

    -- 2. Carregar card pai (com phase_slug)
    SELECT c.*, pp.slug AS parent_phase_slug
    INTO v_parent
    FROM cards c
    JOIN pipeline_stages s ON c.pipeline_stage_id = s.id
    LEFT JOIN pipeline_phases pp ON pp.id = s.phase_id
    WHERE c.id = p_parent_id
      AND c.deleted_at IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Card pai não encontrado');
    END IF;

    IF v_caller_org IS NOT NULL AND v_parent.org_id <> v_caller_org THEN
        RETURN jsonb_build_object('success', false, 'error', 'Card pai não encontrado');
    END IF;

    IF v_parent.org_id <> v_card.org_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cards de organizações diferentes');
    END IF;

    IF v_parent.produto <> v_card.produto THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cards de produtos diferentes não podem ser vinculados');
    END IF;

    IF v_parent.pipeline_id <> v_card.pipeline_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cards em pipelines diferentes não podem ser vinculados');
    END IF;

    IF v_parent.card_type = 'sub_card' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Não é possível pendurar sub-card de outro sub-card');
    END IF;

    IF v_parent.card_type = 'future_opportunity' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Card pai não pode ser oportunidade futura');
    END IF;

    IF v_parent.is_group_parent THEN
        RETURN jsonb_build_object('success', false, 'error', 'Card agrupador não pode ser pai de sub-card');
    END IF;

    -- 3. Regra configurável: pai em pós-venda?
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
            'error', 'O card pai precisa estar em Pós-venda. Para afrouxar essa regra, ajuste em Gerenciador de Seções → Regras de Sub-Cards.'
        );
    END IF;

    -- 4. Mutação atômica do card filho
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

    -- 5. Log no sub_card_sync_log
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
            WHEN 'change' THEN 'Card vinculado como mudança da viagem: ' || COALESCE(v_card.titulo, '(sem título)')
            ELSE 'Card vinculado como item adicional: ' || COALESCE(v_card.titulo, '(sem título)')
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
        'Este card virou sub-card de: ' || COALESCE(v_parent.titulo, '(sem título)'),
        jsonb_build_object(
            'parent_card_id', p_parent_id,
            'parent_card_titulo', v_parent.titulo,
            'sub_card_category', v_category
        ),
        v_user_id, now(), v_card.org_id
    );

    -- 8. Tarefa solicitacao_mudanca no pai (se já estiver em pós-venda)
    IF v_parent_phase_slug = 'pos_venda' THEN
        INSERT INTO tarefas (
            card_id, tipo, titulo, descricao, responsavel_id,
            data_vencimento, prioridade, metadata, created_by, created_at, org_id
        )
        VALUES (
            p_parent_id,
            'solicitacao_mudanca',
            CASE v_category
                WHEN 'change' THEN 'Mudança: ' || COALESCE(v_card.titulo, 'sub-card vinculado')
                ELSE 'Item adicional: ' || COALESCE(v_card.titulo, 'sub-card vinculado')
            END,
            COALESCE(p_descricao, 'Sub-card vinculado a partir de card existente'),
            COALESCE(v_parent.pos_owner_id, v_parent.vendas_owner_id, v_user_id),
            now() + interval '3 days',
            'alta',
            jsonb_build_object(
                'sub_card_id', p_card_id,
                'sub_card_titulo', v_card.titulo,
                'sub_card_category', v_category,
                'origem', 'transformar_em_sub_card'
            ),
            v_user_id,
            now(),
            v_parent.org_id
        )
        RETURNING id INTO v_task_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'sub_card_id', p_card_id,
        'parent_id', p_parent_id,
        'mode', 'incremental',
        'category', v_category,
        'task_id', v_task_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION transformar_em_sub_card TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Trigger de defesa em profundidade no parent_card_id
--    Garante que UPDATEs diretos (fora da RPC) não corrompam a hierarquia.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_validate_parent_card_link()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_parent RECORD;
BEGIN
    IF NEW.parent_card_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.parent_card_id = NEW.id THEN
        RAISE EXCEPTION 'parent_card_id não pode apontar para o próprio card (id=%)', NEW.id
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT id, org_id, produto, pipeline_id, card_type
    INTO v_parent
    FROM cards
    WHERE id = NEW.parent_card_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Card pai % não existe', NEW.parent_card_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_parent.org_id <> NEW.org_id THEN
        RAISE EXCEPTION 'Hierarquia cross-org bloqueada: card % (org=%) → pai % (org=%)',
            NEW.id, NEW.org_id, NEW.parent_card_id, v_parent.org_id
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_parent.produto IS DISTINCT FROM NEW.produto THEN
        RAISE EXCEPTION 'Hierarquia cross-produto bloqueada: card produto=% → pai produto=%',
            NEW.produto, v_parent.produto
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_parent.pipeline_id IS DISTINCT FROM NEW.pipeline_id THEN
        RAISE EXCEPTION 'Hierarquia cross-pipeline bloqueada (pipeline_id divergente)'
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_parent.card_type = 'sub_card' THEN
        RAISE EXCEPTION 'Sub-card de sub-card não é permitido (parent=%)', NEW.parent_card_id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_parent_card_link ON cards;
CREATE TRIGGER trg_validate_parent_card_link
    BEFORE INSERT OR UPDATE OF parent_card_id ON cards
    FOR EACH ROW
    EXECUTE FUNCTION fn_validate_parent_card_link();

COMMIT;
