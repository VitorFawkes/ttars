-- ============================================================================
-- MIGRATION: card lifecycle activities — criação, arquivamento, restauração
-- Date: 2026-05-04
--
-- Eventos silenciosos que o feed do card não mostra hoje:
--   1. Card criado — nenhum log; o card "nasce" sem registro no feed
--   2. Card arquivado — soft delete via deleted_at; sem log
--   3. Card desarquivado — restauração; sem log
--
-- Esta migration adiciona 2 triggers para cobrir esses 3 momentos.
-- A autoria é inferida automaticamente pelo trigger enrich_activity_actor
-- (migration 20260504p).
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Trigger AFTER INSERT em cards → log card_created
-- ============================================================================
CREATE OR REPLACE FUNCTION public.log_card_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();

    INSERT INTO public.activities (card_id, tipo, descricao, metadata, created_by)
    VALUES (
        NEW.id,
        'card_created',
        CASE
            WHEN NEW.titulo IS NOT NULL AND NEW.titulo <> '' THEN 'Card criado: ' || NEW.titulo
            ELSE 'Card criado'
        END,
        jsonb_build_object(
            'origem', NEW.origem,
            'lead_entry_path', NEW.lead_entry_path,
            'pipeline_stage_id', NEW.pipeline_stage_id
        ),
        v_user_id
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Não bloqueia criação do card se o log falhar
    PERFORM public.safe_log_trigger_error(
        'log_card_created',
        SQLERRM,
        jsonb_build_object('card_id', NEW.id)
    );
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_log_card_created ON public.cards;
CREATE TRIGGER trg_log_card_created
    AFTER INSERT ON public.cards
    FOR EACH ROW
    EXECUTE FUNCTION public.log_card_created();

-- ============================================================================
-- 2. Trigger AFTER UPDATE em cards.deleted_at → log card_archived/restored
-- ============================================================================
CREATE OR REPLACE FUNCTION public.log_card_archived_restored()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();

    -- Arquivado: deleted_at vai de NULL para algo
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        INSERT INTO public.activities (card_id, tipo, descricao, metadata, created_by)
        VALUES (
            NEW.id,
            'card_archived',
            'Card arquivado',
            jsonb_build_object('archived_at', NEW.deleted_at),
            v_user_id
        );

    -- Restaurado: deleted_at vai de algo para NULL
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
        INSERT INTO public.activities (card_id, tipo, descricao, metadata, created_by)
        VALUES (
            NEW.id,
            'card_restored',
            'Card desarquivado',
            jsonb_build_object('previously_archived_at', OLD.deleted_at),
            v_user_id
        );
    END IF;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    PERFORM public.safe_log_trigger_error(
        'log_card_archived_restored',
        SQLERRM,
        jsonb_build_object('card_id', NEW.id)
    );
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_log_card_archived_restored ON public.cards;
CREATE TRIGGER trg_log_card_archived_restored
    AFTER UPDATE OF deleted_at ON public.cards
    FOR EACH ROW
    WHEN (OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
    EXECUTE FUNCTION public.log_card_archived_restored();

COMMIT;
