-- ============================================================================
-- MIGRATION: trigger trg_cards_block_overdue_stage_move passa a usar a
-- configuração de "Campos por Etapa" (stage_field_config) em vez de
-- hardcode de fase.
-- Date: 2026-05-15
--
-- CONTEXTO
-- A migration anterior (20260515b) amarrou o trigger à fase 'planner' como
-- proxy de "campo é tracked aqui". O Vitor pediu pra remover o hardcode:
-- a fonte de verdade do "onde a Data Prevista importa" deve ser a tela do
-- admin (Pipeline Studio → Campos por Etapa). Se ele marcar o campo como
-- visível em outra etapa (ou desmarcar nas atuais), o trigger acompanha.
--
-- FIX
-- Substitui o lookup em pipeline_phases por um lookup em stage_field_config
-- com field_key='data_prevista_fechamento' AND is_visible=true para a etapa
-- de origem (OLD.pipeline_stage_id). Se não encontra, bypass — o campo não
-- é tracked nesta etapa segundo a config do admin.
--
-- COMPATIBILIDADE
-- - Mantém todos os bypasses existentes (GUC, service_role, ganho/perdido,
--   ganho_sdr/planner/pos false→true).
-- - Antes: bloqueava em qualquer etapa de T. Planner.
-- - Agora: bloqueia apenas onde o admin marcou is_visible=true.
-- - Pipeline Trips em produção hoje: 2 etapas marcadas (Proposta Enviada e
--   Reservas e Fechamento, ambas em T. Planner). Comportamento prático
--   permanece o mesmo até o admin alterar a config.
-- ============================================================================

BEGIN;

DROP TRIGGER IF EXISTS trg_cards_block_overdue_stage_move ON cards;
DROP FUNCTION IF EXISTS public.block_stage_move_if_overdue_data();

CREATE FUNCTION public.block_stage_move_if_overdue_data()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
DECLARE
    v_severity governance_overdue_severity;
    v_data_prevista DATE;
    v_field_tracked BOOLEAN;
BEGIN
    -- Bypass via GUC (mesmo mecanismo do quality gate existente)
    IF current_setting('app.bypass_stage_requirements', true) = 'true' THEN
        RETURN NEW;
    END IF;

    -- Bypass via service_role (edge functions, integrações, scripts admin)
    IF current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role' THEN
        RETURN NEW;
    END IF;

    -- Só interessa quando está mudando de etapa
    IF NEW.pipeline_stage_id IS NOT DISTINCT FROM OLD.pipeline_stage_id THEN
        RETURN NEW;
    END IF;

    -- Cards ganhos/perdidos: não bloqueia (permite arquivamento e correções)
    IF NEW.status_comercial IN ('ganho', 'perdido') THEN
        RETURN NEW;
    END IF;

    -- Marcação de milestone de ganho de seção (false→true): bypass.
    -- Mantido de 20260512o (fluxo "Venda Fechada" do Planner → Pós-venda).
    IF (NEW.ganho_sdr IS TRUE AND COALESCE(OLD.ganho_sdr, FALSE) IS FALSE)
       OR (NEW.ganho_planner IS TRUE AND COALESCE(OLD.ganho_planner, FALSE) IS FALSE)
       OR (NEW.ganho_pos IS TRUE AND COALESCE(OLD.ganho_pos, FALSE) IS FALSE)
    THEN
        RETURN NEW;
    END IF;

    -- NOVO (20260515c): consulta stage_field_config para saber se o campo
    -- data_prevista_fechamento está marcado como visível na etapa de ORIGEM.
    -- Se não está, o campo não é tracked aqui — bypass. A fonte de verdade
    -- é a tela "Campos por Etapa" do Pipeline Studio.
    SELECT TRUE INTO v_field_tracked
    FROM stage_field_config
    WHERE stage_id = OLD.pipeline_stage_id
      AND field_key = 'data_prevista_fechamento'
      AND is_visible = TRUE
    LIMIT 1;

    IF v_field_tracked IS NOT TRUE THEN
        RETURN NEW;
    END IF;

    -- Lê data prevista de produto_data
    v_data_prevista := NULLIF(NEW.produto_data->>'data_prevista_fechamento', '')::DATE;

    -- Data ausente ou no futuro: deixa passar
    IF v_data_prevista IS NULL OR v_data_prevista >= CURRENT_DATE THEN
        RETURN NEW;
    END IF;

    -- Busca severidade configurada do pipeline
    SELECT data_overdue_severity INTO v_severity
    FROM pipeline_governance_settings
    WHERE pipeline_id = NEW.pipeline_id;

    -- Default 'block_all' se não houver config (defesa em profundidade)
    v_severity := COALESCE(v_severity, 'block_all');

    -- warn_only não bloqueia no banco; só UI badge
    IF v_severity = 'warn_only' THEN
        RETURN NEW;
    END IF;

    -- block_move e block_all bloqueiam transição de etapa
    RAISE EXCEPTION 'DATA_PREVISTA_FECHAMENTO_OVERDUE'
        USING DETAIL = jsonb_build_object(
            'data_prevista', v_data_prevista,
            'severity', v_severity
        )::TEXT,
        HINT = format('Atualize a Data Prevista de Fechamento (atual: %s) para uma data futura antes de mover o card.', v_data_prevista),
        ERRCODE = 'check_violation';
END;
$fn$;

CREATE TRIGGER trg_cards_block_overdue_stage_move
    BEFORE UPDATE OF pipeline_stage_id ON cards
    FOR EACH ROW
    EXECUTE FUNCTION public.block_stage_move_if_overdue_data();

COMMENT ON FUNCTION public.block_stage_move_if_overdue_data() IS
    'Bloqueia transição de etapa quando produto_data.data_prevista_fechamento < CURRENT_DATE e severidade do pipeline_governance_settings é block_move ou block_all. Só atua quando o admin marcou data_prevista_fechamento como visível na etapa de ORIGEM em stage_field_config (Pipeline Studio → Campos por Etapa). Respeita bypass via app.bypass_stage_requirements GUC, role service_role, e marcação de milestone de ganho de seção (ganho_sdr/ganho_planner/ganho_pos false→true).';

COMMIT;
