-- ============================================================================
-- MIGRATION: Auto-merge sub-card ao sair da primeira etapa de Pós-venda
-- Date: 2026-04-24
--
-- Regra de negócio: sub-cards (mudanças/vendas extras) nascem na fase Planner
-- e quando avançam pra Pós-venda caem na PRIMEIRA etapa (em TRIPS é "App &
-- Conteúdo em Montagem"). Quando o sub-card sai dessa etapa para outra etapa
-- de Pós-venda no mesmo pipeline, ele deve fundir com o card principal:
--
--   1. Itens (Produto - Vendas), passageiros, atividades, contatos do sub-card
--      vão pro card pai.
--   2. Sub-card é arquivado.
--   3. Se o card pai está aberto E em Pós-venda: mantém o pai onde está.
--   4. Se o pai NÃO está aberto OU NÃO está em Pós-venda: reabre o pai e
--      move para a etapa que o sub-card iria.
--
-- Implementação: trigger AFTER UPDATE OF pipeline_stage_id em cards (sub-card
-- ativo). Reaproveita a RPC fundir_cards para a fusão real.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION auto_merge_sub_card_on_leave_first_pos_venda()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_old_phase_slug TEXT;
    v_new_phase_slug TEXT;
    v_first_pos_venda_stage UUID;
    v_parent RECORD;
    v_parent_phase_slug TEXT;
    v_target_stage_nome TEXT;
    v_user_id UUID;
BEGIN
    -- Filtros básicos: sub-card ativo, com pai, mudança real de etapa
    IF NEW.card_type IS DISTINCT FROM 'sub_card' THEN RETURN NEW; END IF;
    IF NEW.sub_card_status IS DISTINCT FROM 'active' THEN RETURN NEW; END IF;
    IF NEW.parent_card_id IS NULL THEN RETURN NEW; END IF;
    IF OLD.pipeline_stage_id IS NOT DISTINCT FROM NEW.pipeline_stage_id THEN RETURN NEW; END IF;

    -- Slug das fases OLD e NEW
    SELECT pp.slug INTO v_old_phase_slug
      FROM pipeline_stages s JOIN pipeline_phases pp ON pp.id = s.phase_id
     WHERE s.id = OLD.pipeline_stage_id;

    SELECT pp.slug, s.nome INTO v_new_phase_slug, v_target_stage_nome
      FROM pipeline_stages s JOIN pipeline_phases pp ON pp.id = s.phase_id
     WHERE s.id = NEW.pipeline_stage_id;

    -- Só age na transição pos_venda → pos_venda dentro do mesmo pipeline
    IF v_old_phase_slug IS DISTINCT FROM 'pos_venda' THEN RETURN NEW; END IF;
    IF v_new_phase_slug IS DISTINCT FROM 'pos_venda' THEN RETURN NEW; END IF;

    -- Identificar a primeira etapa ativa de pos_venda no pipeline pai
    SELECT s.id INTO v_first_pos_venda_stage
      FROM pipeline_stages s
      JOIN pipeline_phases pp ON pp.id = s.phase_id
     WHERE s.pipeline_id = NEW.pipeline_id
       AND pp.slug = 'pos_venda'
       AND s.ativo = true
     ORDER BY s.ordem ASC
     LIMIT 1;

    -- Só age se OLD era a primeira etapa de pos_venda
    IF OLD.pipeline_stage_id IS DISTINCT FROM v_first_pos_venda_stage THEN
        RETURN NEW;
    END IF;

    -- Carregar estado do pai
    SELECT c.id, c.status_comercial, c.pipeline_stage_id, c.archived_at, c.deleted_at,
           pp.slug AS phase_slug
      INTO v_parent
      FROM cards c
      LEFT JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
      LEFT JOIN pipeline_phases pp ON pp.id = s.phase_id
     WHERE c.id = NEW.parent_card_id;

    IF v_parent.id IS NULL OR v_parent.deleted_at IS NOT NULL THEN
        RETURN NEW;  -- pai sumiu, abortar silencioso
    END IF;

    v_parent_phase_slug := v_parent.phase_slug;
    v_user_id := auth.uid();

    -- Reabrir/mover pai se necessário
    IF v_parent.status_comercial IS DISTINCT FROM 'aberto'
       OR v_parent_phase_slug IS DISTINCT FROM 'pos_venda'
       OR v_parent.archived_at IS NOT NULL THEN

        UPDATE cards
           SET status_comercial = 'aberto',
               pipeline_stage_id = NEW.pipeline_stage_id,
               stage_entered_at = NOW(),
               data_fechamento = NULL,
               archived_at = NULL,
               archived_by = NULL,
               motivo_perda_id = NULL,
               motivo_perda_comentario = NULL,
               updated_at = NOW()
         WHERE id = NEW.parent_card_id;

        INSERT INTO activities (card_id, tipo, descricao, metadata, created_by, created_at)
        VALUES (
            NEW.parent_card_id,
            'parent_reopened_by_sub_card',
            'Card reaberto e movido para "' || v_target_stage_nome || '" porque o sub-card "' ||
                COALESCE(NEW.titulo, 'sem título') || '" avançou nessa etapa.',
            jsonb_build_object(
                'sub_card_id', NEW.id,
                'sub_card_titulo', NEW.titulo,
                'previous_status', v_parent.status_comercial,
                'previous_phase_slug', v_parent_phase_slug,
                'new_stage_id', NEW.pipeline_stage_id
            ),
            v_user_id,
            NOW()
        );
    END IF;

    -- Setar JWT claim local com a org do sub-card pra que fundir_cards passe
    -- nas validações de requesting_org_id() quando chamado fora de contexto HTTP.
    IF NEW.org_id IS NOT NULL THEN
        PERFORM set_config(
            'request.jwt.claims',
            jsonb_build_object(
                'app_metadata', jsonb_build_object('org_id', NEW.org_id::TEXT)
            )::TEXT,
            true
        );
    END IF;

    -- Fundir o sub-card no pai. fundir_cards arquiva o sub e move tudo.
    BEGIN
        PERFORM fundir_cards(
            NEW.id,
            NEW.parent_card_id,
            'auto: sub-card avançou de "' || COALESCE(
                (SELECT s.nome FROM pipeline_stages s WHERE s.id = OLD.pipeline_stage_id),
                'etapa inicial'
            ) || '" para "' || v_target_stage_nome || '"'
        );
    EXCEPTION WHEN OTHERS THEN
        -- Não bloquear o UPDATE original se a fusão falhar; só registra.
        RAISE WARNING 'auto_merge_sub_card falhou para sub-card %: %', NEW.id, SQLERRM;
    END;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION auto_merge_sub_card_on_leave_first_pos_venda IS
  'Funde automaticamente um sub-card ativo no card pai quando ele sai da primeira etapa de Pós-venda do pipeline. Reabre o pai (e move para a nova etapa) se o pai estava fechado ou fora de Pós-venda.';

DROP TRIGGER IF EXISTS trg_auto_merge_sub_card_on_leave ON cards;
CREATE TRIGGER trg_auto_merge_sub_card_on_leave
    AFTER UPDATE OF pipeline_stage_id
    ON cards
    FOR EACH ROW
    WHEN (NEW.card_type = 'sub_card' AND NEW.sub_card_status = 'active' AND NEW.parent_card_id IS NOT NULL)
    EXECUTE FUNCTION auto_merge_sub_card_on_leave_first_pos_venda();

COMMIT;
