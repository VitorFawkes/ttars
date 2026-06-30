-- ============================================================================
-- MIGRATION: Oportunidade Futura — não duplicar cards
-- Date: 2026-06-30
--
-- Problema (reportado): cards de "Oportunidade Futura" duplicam o card original.
-- Mecanismo: ao marcar um card como perdido, o usuário agenda uma oportunidade
-- futura (future_opportunities, status='pending'). O cron diário
-- (future-opportunity-processor) cria um card NOVO independente quando a data
-- chega. Mas se o time REABRE o card perdido original (perdido→aberto) ou ele é
-- GANHO antes do disparo, nada cancela a oportunidade pendente — o cron dispara
-- mesmo assim e nasce um segundo card ativo pro mesmo cliente.
--
-- Em 30/06/2026: 4 pares duplicados vivos + 5 oportunidades pending cuja fonte
-- já está 'aberto' (viram duplicado no próximo cron).
--
-- Fix (sem reescrever o RPC criar_card_oportunidade_futura — segue o padrão de
-- 20260507a: trigger defensivo em vez de recriar função e arriscar regressão):
--
--   1. TRIGGER em cards: quando o card SAI de 'perdido' (reaberto ou ganho),
--      cancela toda future_opportunity pending/failed daquele card. Cobre TODOS
--      os caminhos (frontend, RPC reabrir_card, marcar_ganho, integração, edição
--      manual). Impede o card duplicado de nascer. + o RPC já filtra
--      status='pending', então uma opp cancelada nunca é processada.
--
--   2. BACKFILL pontual: cancela as oportunidades pending/failed cuja fonte já
--      está não-perdida ou deletada AGORA (backlog que o trigger não pega
--      retroativamente — foram reabertas antes do trigger existir). NÃO toca em
--      nenhum card existente, só desarma o agendamento que duplicaria.
--
-- NÃO toca em criar_card_oportunidade_futura nem criar_sub_card_futuro.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Trigger: cancelar oportunidade futura pendente ao card SAIR de 'perdido'
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_cancel_future_opps_on_unlost()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_count INT;
BEGIN
    UPDATE future_opportunities
    SET status = 'cancelled',
        cancelled_at = NOW(),
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'cancel_reason', 'source_card_left_lost',
            'from_status', OLD.status_comercial,
            'to_status', NEW.status_comercial
        )
    WHERE source_card_id = NEW.id
      AND status IN ('pending', 'failed');

    GET DIAGNOSTICS v_count = ROW_COUNT;

    IF v_count > 0 THEN
        INSERT INTO activities (card_id, tipo, descricao, metadata, created_at)
        VALUES (
            NEW.id,
            'future_opportunity_cancelled',
            'Oportunidade futura cancelada: card deixou de estar perdido',
            jsonb_build_object('cancelled_count', v_count, 'new_status', NEW.status_comercial),
            NOW()
        );
    END IF;

    RETURN NULL; -- AFTER trigger
END;
$fn$;

COMMENT ON FUNCTION public.fn_cancel_future_opps_on_unlost() IS
  'Cancela future_opportunities pending/failed quando o card-fonte sai de perdido (reaberto ou ganho). Impede o cron de criar card de oportunidade futura duplicado pro mesmo cliente. Ver migration 20260630c.';

DROP TRIGGER IF EXISTS trg_cancel_future_opps_on_unlost ON cards;

CREATE TRIGGER trg_cancel_future_opps_on_unlost
AFTER UPDATE ON cards
FOR EACH ROW
WHEN (
    OLD.status_comercial = 'perdido'
    AND NEW.status_comercial IS DISTINCT FROM 'perdido'
)
EXECUTE FUNCTION public.fn_cancel_future_opps_on_unlost();

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Backfill: desarmar o backlog que duplicaria no próximo cron
--    (oportunidades pending/failed cuja fonte JÁ não está mais perdida ou foi
--    deletada). Não cria nem apaga cards — só cancela o agendamento.
-- ────────────────────────────────────────────────────────────────────────────
WITH desarmadas AS (
    UPDATE future_opportunities fo
    SET status = 'cancelled',
        cancelled_at = NOW(),
        metadata = COALESCE(fo.metadata, '{}'::jsonb) || jsonb_build_object(
            'cancel_reason', 'backfill_source_not_lost_20260630c',
            'source_status', c.status_comercial,
            'source_deleted', (c.deleted_at IS NOT NULL)
        )
    FROM cards c
    WHERE fo.source_card_id = c.id
      AND fo.status IN ('pending', 'failed')
      AND (c.status_comercial IS DISTINCT FROM 'perdido' OR c.deleted_at IS NOT NULL)
    RETURNING fo.id, fo.source_card_id
)
INSERT INTO activities (card_id, tipo, descricao, metadata, created_at)
SELECT source_card_id,
       'future_opportunity_cancelled',
       'Oportunidade futura cancelada (limpeza): card-fonte não está mais perdido',
       jsonb_build_object('future_opportunity_id', id, 'backfill', '20260630c'),
       NOW()
FROM desarmadas;

COMMIT;
