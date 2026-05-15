-- ============================================================================
-- MIGRATION: trigger trg_cards_block_overdue_stage_move passa a só valer
-- quando o card está numa etapa da fase T. Planner.
-- Date: 2026-05-15
--
-- BUG REPORTADO
-- Consultora reportou que um card em Pós-venda (Pré-Embarque <<< 30 dias)
-- continua mostrando alerta/bloqueio de "Data Prevista de Fechamento" — mas
-- esse campo só é configurado como visível nas etapas Proposta Enviada e
-- Reservas e Fechamento (ambas em T. Planner). Configuração e UX dizem que
-- o campo é exclusivo de T. Planner, mas o trigger de proteção fechava o
-- card mesmo após ele migrar para Pós-venda com data lá do passado.
--
-- CAUSA RAIZ
-- A função block_stage_move_if_overdue_data (criada em 20260512c, ajustada
-- em 20260512o pra liberar marcação de ganho) só testa:
--   - status_comercial NOT IN (ganho/perdido)
--   - milestone de ganho de seção mudando false→true
--   - data prevista < hoje
--   - severidade do pipeline_governance_settings
-- Não verifica em qual fase o card está. Cards em Pós-venda costumam ter
-- status_comercial='aberto' (status só vira 'ganho' no fim da operação) e
-- ganho_planner já é true (não há transição false→true em moves dentro de
-- Pós-venda). Resultado: trigger barra moves entre etapas de Pós-venda
-- quando a data antiga ficou pra trás.
--
-- FIX
-- Antes de avaliar a data, busca a fase da etapa de origem (OLD.pipeline_
-- stage_id). Se a fase de origem NÃO é 'planner', a proteção não se aplica
-- — o campo data_prevista deixou de ser tracked quando o card saiu do
-- planner, então não bloqueia o move.
--
-- COMPATIBILIDADE COM MIGRATIONS ANTERIORES (já lidas + preservadas):
--   20260512c → cria a função, todos os bypasses iniciais (GUC, service_role,
--               stage change, ganho/perdido, severity warn_only)
--   20260512o → adiciona bypass para ganho_sdr/ganho_planner/ganho_pos
--               false→true (necessário para marcar_ganho funcionar)
-- Esta migração mantém TODOS esses comportamentos e adiciona o phase guard.
--
-- Não usa CREATE OR REPLACE para deixar explícito o ciclo drop+create
-- (revisão consciente vs rebase fantasma).
-- ============================================================================

BEGIN;

-- Drop trigger primeiro (depende da função). Função recriada logo abaixo,
-- trigger reanexado no final.
DROP TRIGGER IF EXISTS trg_cards_block_overdue_stage_move ON cards;
DROP FUNCTION IF EXISTS public.block_stage_move_if_overdue_data();

CREATE FUNCTION public.block_stage_move_if_overdue_data()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
DECLARE
    v_severity governance_overdue_severity;
    v_data_prevista DATE;
    v_old_phase_slug TEXT;
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

    -- NOVO (20260515b): data_prevista_fechamento só é tracked em T. Planner.
    -- Se a etapa de ORIGEM não está na fase 'planner', a proteção não se
    -- aplica — o campo deixou de ser visível na UI quando o card saiu do
    -- planner. Isso libera moves dentro de Pós-venda (App Montagem →
    -- Pré-embarque etc.) sem exigir "limpar" a data antiga.
    SELECT pp.slug INTO v_old_phase_slug
    FROM pipeline_stages ps
    JOIN pipeline_phases pp ON pp.id = ps.phase_id
    WHERE ps.id = OLD.pipeline_stage_id;

    IF v_old_phase_slug IS DISTINCT FROM 'planner' THEN
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

-- Reanexa o trigger (mesmo nome, mesma posição alfabética que 20260512c).
CREATE TRIGGER trg_cards_block_overdue_stage_move
    BEFORE UPDATE OF pipeline_stage_id ON cards
    FOR EACH ROW
    EXECUTE FUNCTION public.block_stage_move_if_overdue_data();

COMMENT ON FUNCTION public.block_stage_move_if_overdue_data() IS
    'Bloqueia transição de etapa quando produto_data.data_prevista_fechamento < CURRENT_DATE e severidade do pipeline_governance_settings é block_move ou block_all. Só atua quando a etapa de ORIGEM (OLD.pipeline_stage_id) está na fase ''planner'' — Data Prevista é conceito exclusivo de T. Planner; em outras fases o campo nem aparece nas configs. Respeita bypass via app.bypass_stage_requirements GUC, role service_role, e marcação de milestone de ganho de seção (ganho_sdr/ganho_planner/ganho_pos false→true).';

COMMIT;
