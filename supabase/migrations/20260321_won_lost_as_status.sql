-- ============================================================================
-- MIGRATION: Ganho/Perdido como STATUS (não etapas)
-- Date: 2026-03-21
-- Priority: P0 — Mudança arquitetural
--
-- Mudança:
--   ANTES: Ganho/Perdido eram etapas terminais (is_won/is_lost em pipeline_stages)
--          Cards arrastados para essas etapas recebiam status_comercial via trigger
--   DEPOIS: Ganho/Perdido são ações de status, aplicáveis em qualquer etapa
--          Ganho em SDR → move para 1ª etapa de Planner
--          Ganho em Planner → move para 1ª etapa de Pós-venda
--          Ganho em Pós-venda → deal fechado (status_comercial='ganho')
--          Perdido em qualquer etapa → card fica na etapa, status='perdido'
--
-- Componentes:
--   1. RPC marcar_ganho — marca ganho por seção, auto-avança
--   2. RPC marcar_perdido — marca perdido na etapa atual
--   3. RPC reabrir_card — reabre card ganho/perdido
--   4. Reescrita do trigger handle_card_status_automation (desacoplado de is_won/is_lost)
--   5. Migração de dados: cards em etapas terminais → etapas reais
--   6. Desativação de etapas terminais (ativo=false)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. RPC marcar_ganho
-- ============================================================================

CREATE OR REPLACE FUNCTION public.marcar_ganho(
    p_card_id UUID,
    p_novo_dono_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_card RECORD;
    v_phase_slug TEXT;
    v_phase_order INT;
    v_next_phase RECORD;
    v_first_stage_id UUID;
    v_result JSONB;
BEGIN
    -- Buscar card com dados da etapa e fase atual
    SELECT
        c.id,
        c.pipeline_stage_id,
        c.status_comercial,
        c.dono_atual_id,
        c.sdr_owner_id,
        c.vendas_owner_id,
        c.pos_owner_id,
        c.ganho_sdr,
        c.ganho_planner,
        c.ganho_pos,
        s.pipeline_id,
        pp.slug AS phase_slug,
        pp.order_index AS phase_order
    INTO v_card
    FROM cards c
    JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
    JOIN pipeline_phases pp ON pp.id = s.phase_id
    WHERE c.id = p_card_id
      AND c.deleted_at IS NULL;

    IF v_card IS NULL THEN
        RAISE EXCEPTION 'Card não encontrado ou deletado: %', p_card_id;
    END IF;

    IF v_card.status_comercial IN ('ganho', 'perdido') THEN
        RAISE EXCEPTION 'Card já está com status %', v_card.status_comercial;
    END IF;

    v_phase_slug := v_card.phase_slug;

    -- ─── GANHO FINAL: Pós-venda ou Resolução ───
    IF v_phase_slug IN ('pos_venda', 'resolucao') THEN
        UPDATE cards SET
            status_comercial = 'ganho',
            data_fechamento = CURRENT_DATE,
            ganho_pos = true,
            ganho_pos_at = COALESCE(ganho_pos_at, NOW()),
            updated_at = NOW()
        WHERE id = p_card_id;

        v_result := jsonb_build_object(
            'action', 'won_final',
            'phase', v_phase_slug,
            'milestone', 'ganho_pos'
        );

    -- ─── GANHO SDR: Avança para primeira etapa de Planner ───
    ELSIF v_phase_slug = 'sdr' THEN
        -- Buscar próxima fase (planner) via stages do mesmo pipeline
        SELECT DISTINCT pp.id, pp.slug INTO v_next_phase
        FROM pipeline_phases pp
        JOIN pipeline_stages s2 ON s2.phase_id = pp.id
        WHERE s2.pipeline_id = v_card.pipeline_id
          AND pp.slug = 'planner'
        LIMIT 1;

        IF v_next_phase IS NULL THEN
            RAISE EXCEPTION 'Fase planner não encontrada para o pipeline do card';
        END IF;

        -- Buscar primeira etapa ativa da fase planner
        SELECT s.id INTO v_first_stage_id
        FROM pipeline_stages s
        WHERE s.phase_id = v_next_phase.id
          AND s.ativo = true
          AND COALESCE(s.is_won, false) = false
          AND COALESCE(s.is_lost, false) = false
        ORDER BY s.ordem ASC
        LIMIT 1;

        IF v_first_stage_id IS NULL THEN
            RAISE EXCEPTION 'Nenhuma etapa ativa encontrada na fase planner';
        END IF;

        -- Setar milestone + dono + mover (o UPDATE de pipeline_stage_id dispara owner guard)
        UPDATE cards SET
            ganho_sdr = true,
            ganho_sdr_at = COALESCE(ganho_sdr_at, NOW()),
            dono_atual_id = COALESCE(p_novo_dono_id, vendas_owner_id, dono_atual_id),
            pipeline_stage_id = v_first_stage_id,
            stage_entered_at = NOW(),
            updated_at = NOW()
        WHERE id = p_card_id;

        v_result := jsonb_build_object(
            'action', 'won_section',
            'phase', v_phase_slug,
            'milestone', 'ganho_sdr',
            'moved_to_stage', v_first_stage_id,
            'moved_to_phase', 'planner'
        );

    -- ─── GANHO PLANNER: Avança para primeira etapa de Pós-venda ───
    ELSIF v_phase_slug = 'planner' THEN
        -- Buscar próxima fase (pos_venda) via stages do mesmo pipeline
        SELECT DISTINCT pp.id, pp.slug INTO v_next_phase
        FROM pipeline_phases pp
        JOIN pipeline_stages s2 ON s2.phase_id = pp.id
        WHERE s2.pipeline_id = v_card.pipeline_id
          AND pp.slug = 'pos_venda'
        LIMIT 1;

        IF v_next_phase IS NULL THEN
            RAISE EXCEPTION 'Fase pos_venda não encontrada para o pipeline do card';
        END IF;

        -- Buscar primeira etapa ativa da fase pos_venda
        SELECT s.id INTO v_first_stage_id
        FROM pipeline_stages s
        WHERE s.phase_id = v_next_phase.id
          AND s.ativo = true
          AND COALESCE(s.is_won, false) = false
          AND COALESCE(s.is_lost, false) = false
        ORDER BY s.ordem ASC
        LIMIT 1;

        IF v_first_stage_id IS NULL THEN
            RAISE EXCEPTION 'Nenhuma etapa ativa encontrada na fase pos_venda';
        END IF;

        -- Setar milestone + dono + mover
        UPDATE cards SET
            ganho_planner = true,
            ganho_planner_at = COALESCE(ganho_planner_at, NOW()),
            dono_atual_id = COALESCE(p_novo_dono_id, pos_owner_id, dono_atual_id),
            pipeline_stage_id = v_first_stage_id,
            stage_entered_at = NOW(),
            updated_at = NOW()
        WHERE id = p_card_id;

        v_result := jsonb_build_object(
            'action', 'won_section',
            'phase', v_phase_slug,
            'milestone', 'ganho_planner',
            'moved_to_stage', v_first_stage_id,
            'moved_to_phase', 'pos_venda'
        );

    ELSE
        RAISE EXCEPTION 'Fase % não suporta ação de ganho', v_phase_slug;
    END IF;

    RETURN v_result;
END;
$fn$;

COMMENT ON FUNCTION marcar_ganho IS
    'Marca card como ganho na seção atual. SDR→Planner, Planner→Pós-venda (auto-move), Pós-venda→deal fechado.';

GRANT EXECUTE ON FUNCTION marcar_ganho TO authenticated;

-- ============================================================================
-- 2. RPC marcar_perdido
-- ============================================================================

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
    -- Validar card
    IF NOT EXISTS (
        SELECT 1 FROM cards
        WHERE id = p_card_id AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Card não encontrado ou deletado: %', p_card_id;
    END IF;

    -- Validar que não está já fechado
    IF EXISTS (
        SELECT 1 FROM cards
        WHERE id = p_card_id AND status_comercial IN ('ganho', 'perdido')
    ) THEN
        RAISE EXCEPTION 'Card já está fechado (ganho ou perdido)';
    END IF;

    -- Marcar como perdido — card PERMANECE na etapa atual
    UPDATE cards SET
        status_comercial = 'perdido',
        data_fechamento = CURRENT_DATE,
        motivo_perda_id = p_motivo_perda_id,
        motivo_perda_comentario = p_motivo_perda_comentario,
        updated_at = NOW()
    WHERE id = p_card_id;
END;
$fn$;

COMMENT ON FUNCTION marcar_perdido IS
    'Marca card como perdido na etapa atual. Card não move — fica onde estava.';

GRANT EXECUTE ON FUNCTION marcar_perdido TO authenticated;

-- ============================================================================
-- 3. RPC reabrir_card
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reabrir_card(p_card_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
    -- Validar card
    IF NOT EXISTS (
        SELECT 1 FROM cards
        WHERE id = p_card_id
          AND deleted_at IS NULL
          AND status_comercial IN ('ganho', 'perdido')
    ) THEN
        RAISE EXCEPTION 'Card não encontrado, deletado, ou não está fechado: %', p_card_id;
    END IF;

    -- Reabrir — limpar campos de fechamento
    UPDATE cards SET
        status_comercial = 'aberto',
        data_fechamento = NULL,
        motivo_perda_id = NULL,
        motivo_perda_comentario = NULL,
        updated_at = NOW()
    WHERE id = p_card_id;
END;
$fn$;

COMMENT ON FUNCTION reabrir_card IS
    'Reabre um card ganho ou perdido. Card permanece na etapa atual com status aberto.';

GRANT EXECUTE ON FUNCTION reabrir_card TO authenticated;

-- ============================================================================
-- 4. Reescrever trigger handle_card_status_automation
--    DESACOPLA status_comercial de is_won/is_lost do stage
--    Status agora é controlado pelos RPCs, trigger só:
--    - Normaliza NULL → 'aberto' em novos cards
--    - Seta milestones de seção (ganho_sdr, ganho_planner, ganho_pos)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_card_status_automation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_stage RECORD;
BEGIN
    -- Default: novo card sem status → 'aberto'
    IF NEW.status_comercial IS NULL THEN
        NEW.status_comercial := 'aberto';
    END IF;

    -- Buscar flags da nova etapa (para milestones de seção)
    IF NEW.pipeline_stage_id IS NOT NULL THEN
        SELECT is_sdr_won, is_planner_won, is_pos_won
        INTO v_stage
        FROM pipeline_stages
        WHERE id = NEW.pipeline_stage_id;

        -- MARCOS por seção (NÃO alteram status_comercial, apenas marcam o card)
        IF v_stage IS NOT NULL THEN
            IF v_stage.is_sdr_won = true THEN
                IF OLD IS NULL OR OLD.ganho_sdr IS NULL OR OLD.ganho_sdr = false THEN
                    NEW.ganho_sdr := true;
                    IF NEW.ganho_sdr_at IS NULL THEN
                        NEW.ganho_sdr_at := NOW();
                    END IF;
                END IF;
            END IF;

            IF v_stage.is_planner_won = true THEN
                IF OLD IS NULL OR OLD.ganho_planner IS NULL OR OLD.ganho_planner = false THEN
                    NEW.ganho_planner := true;
                    IF NEW.ganho_planner_at IS NULL THEN
                        NEW.ganho_planner_at := NOW();
                    END IF;
                END IF;
            END IF;

            IF v_stage.is_pos_won = true THEN
                IF OLD IS NULL OR OLD.ganho_pos IS NULL OR OLD.ganho_pos = false THEN
                    NEW.ganho_pos := true;
                    IF NEW.ganho_pos_at IS NULL THEN
                        NEW.ganho_pos_at := NOW();
                    END IF;
                END IF;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

-- Trigger continua disparando nos mesmos eventos
DROP TRIGGER IF EXISTS trigger_card_status_automation ON cards;

CREATE TRIGGER trigger_card_status_automation
    BEFORE INSERT OR UPDATE OF pipeline_stage_id, status_comercial
    ON cards
    FOR EACH ROW
    EXECUTE FUNCTION handle_card_status_automation();

-- ============================================================================
-- 5. Migrar cards existentes em etapas terminais para etapas reais
-- ============================================================================

-- 5A. Cards GANHOS (em etapas is_won=true):
-- Mover para última etapa ativa de pos_venda do mesmo pipeline
-- Preservar status_comercial='ganho', data_fechamento, milestones
UPDATE cards c
SET
    pipeline_stage_id = sub.target_stage_id,
    updated_at = NOW()
FROM (
    SELECT
        c2.id AS card_id,
        (
            SELECT s2.id
            FROM pipeline_stages s2
            JOIN pipeline_phases pp2 ON pp2.id = s2.phase_id
            WHERE s2.pipeline_id = s_cur.pipeline_id
              AND pp2.slug = 'pos_venda'
              AND s2.ativo = true
              AND COALESCE(s2.is_won, false) = false
              AND COALESCE(s2.is_lost, false) = false
            ORDER BY s2.ordem DESC
            LIMIT 1
        ) AS target_stage_id
    FROM cards c2
    JOIN pipeline_stages s_cur ON s_cur.id = c2.pipeline_stage_id
    WHERE COALESCE(s_cur.is_won, false) = true
      AND c2.deleted_at IS NULL
) sub
WHERE c.id = sub.card_id
  AND sub.target_stage_id IS NOT NULL;

-- 5B. Cards PERDIDOS (em etapas is_lost=true):
-- Buscar etapa anterior via activities (tipo='stage_changed')
-- Fallback: primeira etapa ativa de SDR
UPDATE cards c
SET
    pipeline_stage_id = COALESCE(
        -- Buscar old_stage_id da activity que moveu para a etapa perdida
        (
            SELECT (a.metadata->>'old_stage_id')::UUID
            FROM activities a
            WHERE a.card_id = c.id
              AND a.tipo = 'stage_changed'
              AND (a.metadata->>'new_stage_id')::UUID = c.pipeline_stage_id
            ORDER BY a.created_at DESC
            LIMIT 1
        ),
        -- Fallback: primeira etapa ativa de SDR do mesmo pipeline
        (
            SELECT s2.id
            FROM pipeline_stages s2
            JOIN pipeline_phases pp2 ON pp2.id = s2.phase_id
            WHERE s2.pipeline_id = s_cur.pipeline_id
              AND pp2.slug = 'sdr'
              AND s2.ativo = true
              AND COALESCE(s2.is_won, false) = false
              AND COALESCE(s2.is_lost, false) = false
            ORDER BY s2.ordem ASC
            LIMIT 1
        )
    ),
    updated_at = NOW()
FROM pipeline_stages s_cur
WHERE s_cur.id = c.pipeline_stage_id
  AND COALESCE(s_cur.is_lost, false) = true
  AND c.deleted_at IS NULL;

-- 5C. Verificar se sobrou algum card em etapa terminal
-- (Se sobrou, é porque não achamos target — listar para debug)
-- SELECT c.id, c.titulo, s.nome, s.is_won, s.is_lost
-- FROM cards c JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
-- WHERE (s.is_won = true OR s.is_lost = true) AND c.deleted_at IS NULL;

-- ============================================================================
-- 6. Desativar etapas terminais
-- ============================================================================

UPDATE pipeline_stages
SET ativo = false, updated_at = NOW()
WHERE (is_won = true OR is_lost = true)
  AND ativo = true;

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO (rodar após aplicar)
-- ============================================================================
--
-- 1. Zero cards em etapas terminais:
-- SELECT COUNT(*) FROM cards c
-- JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
-- WHERE (s.is_won = true OR s.is_lost = true) AND c.deleted_at IS NULL;
--
-- 2. RPCs existem:
-- SELECT proname FROM pg_proc WHERE proname IN ('marcar_ganho', 'marcar_perdido', 'reabrir_card');
--
-- 3. Etapas terminais desativadas:
-- SELECT nome, ativo, is_won, is_lost FROM pipeline_stages WHERE is_won = true OR is_lost = true;
--
-- 4. Trigger atualizado (não força status por stage):
-- SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'handle_card_status_automation';
-- ============================================================================
