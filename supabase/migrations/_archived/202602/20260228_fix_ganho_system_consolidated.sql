-- ============================================================================
-- MIGRATION: Fix Sistema de Ganhos (Consolidada)
-- Date: 2026-02-28
-- Priority: P0 - Integridade de Dados
--
-- Consolida 3 migrations pendentes + correções de dados:
--   - 20260206: Fix is_won em "Viagem Confirmada (Ganho)"
--   - 20260210: Enforcement de status_comercial + trigger column list
--   - 20260211: Preservar timestamps pré-setados em imports
--   - NOVO: Auto-set data_fechamento em ganho/perdido
--   - NOVO: Permitir 'pausado' como status válido
--   - DATA: Corrigir 4 cards anômalos + normalizar status + backfill data_fechamento
--
-- Regras de Negócio:
--   - GANHO TOTAL (status_comercial='ganho') = SOMENTE "Viagem Concluída" (is_won=true)
--   - "Viagem Confirmada (Ganho)" = marco do Planner (is_planner_won=true, NÃO is_won)
--   - "Taxa Paga" = marco do SDR (is_sdr_won=true)
--   - "Fechado - Perdido" = perda (is_lost=true, status='perdido')
--   - Todos outros stages = status='aberto' ou 'pausado'
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. FIX STAGE FLAGS: Remove is_won de "Viagem Confirmada (Ganho)"
--    É marco do Planner, NÃO ganho total. Só "Viagem Concluída" é ganho total.
--    Impacto: ZERO — os 2913 imports estão em "Viagem Concluída", não aqui.
--    Os 2 cards aqui (teste) já têm status=aberto.
-- ============================================================================

UPDATE pipeline_stages
SET is_won = false
WHERE id = 'cba42c81-7a3e-40bf-bf66-990d9c09b8d3'
  AND is_won = true;

-- ============================================================================
-- 2. TRIGGER: Versão definitiva de handle_card_status_automation
--    Combina: enforcement + preservar timestamps + data_fechamento + pausado
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_card_status_automation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_stage RECORD;
BEGIN
    -- Buscar dados da nova etapa
    SELECT is_won, is_lost, is_sdr_won, is_planner_won, is_pos_won
    INTO v_stage
    FROM pipeline_stages
    WHERE id = NEW.pipeline_stage_id;

    -- Se não encontrou a etapa, manter comportamento padrão
    IF v_stage IS NULL THEN
        IF NEW.status_comercial IS NULL THEN
            NEW.status_comercial := 'aberto';
        END IF;
        RETURN NEW;
    END IF;

    -- GANHO TOTAL: somente stages com is_won=true (Viagem Concluída)
    IF v_stage.is_won = true THEN
        NEW.status_comercial := 'ganho';
        -- Auto-set data_fechamento se não preenchido
        IF NEW.data_fechamento IS NULL THEN
            NEW.data_fechamento := CURRENT_DATE;
        END IF;

    -- PERDA: somente stages com is_lost=true (Fechado - Perdido)
    ELSIF v_stage.is_lost = true THEN
        NEW.status_comercial := 'perdido';
        -- Auto-set data_fechamento se não preenchido
        IF NEW.data_fechamento IS NULL THEN
            NEW.data_fechamento := CURRENT_DATE;
        END IF;

    -- TODOS OS OUTROS STAGES: status deve ser 'aberto' ou 'pausado'
    -- Bloqueia: 'ganho', 'perdido' (controlados pelas flags do stage)
    -- Normaliza: NULL, 'em_andamento', 'em_aberto', 'qualificado' → 'aberto'
    ELSE
        IF NEW.status_comercial IS NULL
           OR NEW.status_comercial NOT IN ('aberto', 'pausado') THEN
            NEW.status_comercial := 'aberto';
        END IF;
    END IF;

    -- MARCOS por seção (NÃO alteram status_comercial, apenas marcam o card)
    -- Preservam timestamps pré-setados (ex: importação com data histórica)
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

    RETURN NEW;
END;
$function$;

-- ============================================================================
-- 3. RECREATE TRIGGER: Fire on pipeline_stage_id AND status_comercial
--    Sem status_comercial na lista, updates diretos (StatusSelector) bypass
--    a trigger. Isso permitiu os 4 cards anômalos com ganho indevido.
--    PostgreSQL BEFORE triggers NÃO recursionam — seguro.
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_card_status_automation ON cards;

CREATE TRIGGER trigger_card_status_automation
    BEFORE INSERT OR UPDATE OF pipeline_stage_id, status_comercial
    ON cards
    FOR EACH ROW
    EXECUTE FUNCTION handle_card_status_automation();

-- ============================================================================
-- 4. SOFT-DELETE: 2 cards de teste em "Viagem Confirmada (Ganho)"
--    - "Lua de Mel Paris" (seed de populate_crm_examples.sql)
--    - "Família Silva" (UUID sequencial a1b2c3d4... de teste)
-- ============================================================================

UPDATE cards
SET deleted_at = NOW(), updated_at = NOW()
WHERE id IN (
    'b809eee4-1a1b-4e36-ad22-b7d23d78cdf8',
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
) AND deleted_at IS NULL;

-- ============================================================================
-- 5. FIX DATA: 4 cards com status='ganho' em stages não-won
--    Evidência: ZERO valor_final, ZERO data_fechamento, ZERO flags de ganho
--    Cards: Illana/Europa, Rafael/Cancun, Elias/Cancun, Giselle/Escocia
--    Condições de segurança: só reseta cards sem NENHUMA evidência de deal real
-- ============================================================================

UPDATE cards c
SET status_comercial = 'aberto', updated_at = NOW()
FROM pipeline_stages s
WHERE c.pipeline_stage_id = s.id
  AND c.status_comercial = 'ganho'
  AND COALESCE(s.is_won, false) = false
  AND c.deleted_at IS NULL
  AND c.valor_final IS NULL
  AND c.data_fechamento IS NULL
  AND COALESCE(c.ganho_planner, false) = false
  AND COALESCE(c.ganho_pos, false) = false;

-- ============================================================================
-- 6. NORMALIZE: Status não-padrão → 'aberto'
--    Causa: CreateCardModal/CreateGroupModal hardcoded 'em_andamento'
--    5 cards com 'em_andamento', possíveis resíduos de 'em_aberto'/'qualificado'
-- ============================================================================

UPDATE cards
SET status_comercial = 'aberto', updated_at = NOW()
WHERE status_comercial IN ('em_andamento', 'em_aberto', 'qualificado')
  AND deleted_at IS NULL;

-- ============================================================================
-- 7. BACKFILL: data_fechamento para ~555 cards perdidos
--    stage_entered_at = momento que entrou em "Fechado - Perdido" = data real da perda
--    Sem isso: ciclo de venda retorna NULL, analytics timeseries ignora,
--    filtro por mês no Kanban não encontra
-- ============================================================================

UPDATE cards
SET data_fechamento = COALESCE(stage_entered_at::date, updated_at::date)
WHERE status_comercial = 'perdido'
  AND data_fechamento IS NULL
  AND deleted_at IS NULL;

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO (rodar após aplicar)
-- ============================================================================
--
-- 1. Flags corretas:
-- SELECT nome, is_won, is_planner_won FROM pipeline_stages
-- WHERE nome IN ('Viagem Confirmada (Ganho)', 'Viagem Concluída');
--
-- 2. Zero status anômalos:
-- SELECT status_comercial, COUNT(*) FROM cards
-- WHERE deleted_at IS NULL AND status_comercial NOT IN ('aberto','ganho','perdido','pausado')
-- GROUP BY status_comercial;
--
-- 3. Zero ganhos em stages não-won:
-- SELECT COUNT(*) FROM cards c JOIN pipeline_stages s ON c.pipeline_stage_id = s.id
-- WHERE c.status_comercial = 'ganho' AND COALESCE(s.is_won, false) = false AND c.deleted_at IS NULL;
--
-- 4. Trigger cobre status_comercial:
-- SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname = 'trigger_card_status_automation';
--
-- 5. Perdidos com data_fechamento:
-- SELECT COUNT(*) FROM cards WHERE status_comercial = 'perdido' AND data_fechamento IS NULL AND deleted_at IS NULL;
-- ============================================================================
