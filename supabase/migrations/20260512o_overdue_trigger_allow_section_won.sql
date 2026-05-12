-- ============================================================================
-- MIGRATION: trigger trg_cards_block_overdue_stage_move passa a permitir
-- transições que marcam ganho de seção (ganho_sdr/ganho_planner)
-- Date: 2026-05-12
--
-- BUG REPORTADO
-- T.Planners reportaram que "ao dar ganho e tentar selecionar a Pós-Venda
-- não está funcionando". Ao clicar "Venda Fechada" → "Sim, enviar para
-- Pós-Venda", a operação falhava com erro do banco:
--   DATA_PREVISTA_FECHAMENTO_OVERDUE
--   "Atualize a Data Prevista de Fechamento ... antes de mover o card."
--
-- CAUSA RAIZ
-- A migration 20260512c (governance_data_overdue) instalou um trigger BEFORE
-- UPDATE OF pipeline_stage_id que bloqueia transições de etapa quando
-- produto_data->>'data_prevista_fechamento' está no passado e o card ainda
-- não foi marcado como ganho/perdido.
--
-- No fluxo de ganho Planner→Pós-Venda, a RPC marcar_ganho move o card pra
-- primeira etapa de Pós-Venda mas NÃO seta status_comercial='ganho' nessa
-- transição (só seta o milestone ganho_planner=true — a venda continua
-- "aberta" durante todo o pós-venda, status='ganho' só vem com ganho_pos no
-- final da operação). Resultado: o trigger via o card como aberto e barrava
-- o move com base na data prevista atrasada.
--
-- O fluxo skip_pos_venda não era afetado porque lá o RPC seta
-- status_comercial='ganho' antes do UPDATE.
--
-- FIX
-- Adiciona ao trigger uma cláusula de bypass: quando o UPDATE está marcando
-- um milestone de ganho de seção (ganho_sdr ou ganho_planner mudando de
-- false→true), a transição é permitida independente de data prevista
-- atrasada. Justificativa de produto: quando o Travel Planner clica "Venda
-- Fechada", a venda foi efetivamente concluída — proteções pré-fechamento
-- não devem barrar o registro do ganho, mesmo que ele tenha vindo com
-- atraso versus a data prevista.
--
-- Triggers de UPDATE em campos do produto_data (validate_data_prevista_
-- fechamento, criado em 20260512a) continuam atuando normalmente — só não
-- bloqueamos o stage move durante a marcação de ganho.
--
-- IMPORTANTE
-- Esta migration NÃO toca em marcar_ganho (7 migrations anteriores, alto
-- risco de regressão). Só ajusta a função do trigger criada ontem
-- (20260512c) que tem 1 migration anterior.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.block_stage_move_if_overdue_data()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
DECLARE
    v_severity governance_overdue_severity;
    v_data_prevista DATE;
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

    -- NOVO: Marcação de milestone de ganho de seção (ganho_sdr/ganho_planner
    -- transicionando false→true) é um "fechamento" — a venda da seção foi
    -- concluída. Proteção pré-fechamento da Data Prevista deixa de fazer
    -- sentido aqui. Liberar a transição mesmo que a data esteja no passado.
    IF (NEW.ganho_sdr IS TRUE AND COALESCE(OLD.ganho_sdr, FALSE) IS FALSE)
       OR (NEW.ganho_planner IS TRUE AND COALESCE(OLD.ganho_planner, FALSE) IS FALSE)
       OR (NEW.ganho_pos IS TRUE AND COALESCE(OLD.ganho_pos, FALSE) IS FALSE)
    THEN
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

COMMENT ON FUNCTION public.block_stage_move_if_overdue_data() IS
    'Bloqueia transição de etapa quando produto_data.data_prevista_fechamento < CURRENT_DATE e severidade do pipeline_governance_settings é block_move ou block_all. Respeita bypass via app.bypass_stage_requirements GUC e role service_role. NÃO bloqueia transições que marcam milestone de ganho de seção (ganho_sdr/ganho_planner/ganho_pos false→true) — venda fechada não pode ser barrada por proteção pré-fechamento. NÃO bloqueia UPDATEs de outros campos — esses ficam por conta da UI quando severidade=block_all.';

COMMIT;
