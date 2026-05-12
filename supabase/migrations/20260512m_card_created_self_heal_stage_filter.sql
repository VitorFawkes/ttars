-- ============================================================================
-- SELF-HEAL: card_created trigger applicable_stage_ids vs event_config legado
-- ============================================================================
-- Contexto: o editor visual V2 antigo gravava o filtro de etapa em
-- event_config.initial_stage_id (JSONB), enquanto o dispatcher SQL
-- process_cadence_entry_on_card_create filtra pela coluna
-- applicable_stage_ids (UUID[]). Quando o nome do campo nao casa, a coluna
-- fica NULL e o IS NULL do dispatcher trata como "qualquer etapa" — a
-- automacao dispara pra todos os cards novos, ignorando o filtro do user.
--
-- O backfill 20260512a copiou os triggers existentes em 2026-05-11, mas um
-- save do editor depois disso pode regredir a coluna pra NULL (config em
-- memoria ainda tem initial_stage_id, persistence.ts antigo nao
-- propagava). Esta migration:
--
--  1. Re-roda o backfill pra capturar regressoes posteriores ao primeiro.
--  2. Adiciona um BEFORE INSERT/UPDATE em cadence_event_triggers que migra
--     automaticamente o campo legado, garantindo que NENHUM caminho de
--     escrita (UI, API, n8n, script manual) consiga gravar o trigger no
--     formato bugado de novo.
--  3. Expoe RPC cadence_triggers_legacy_card_created_count usada pelo smoke
--     test pra detectar regressao no save.
--
-- Idempotente. Tolera ambiente sem a tabela cadence_event_triggers (staging
-- nao tem todas as tabelas — guards pulam sem erro).
-- ============================================================================

DO $migration$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'cadence_event_triggers') THEN
        RAISE NOTICE 'cadence_event_triggers ausente — pulando migration (ambiente nao-completo).';
        RETURN;
    END IF;

    -- ------------------------------------------------------------------------
    -- 1) Backfill retroativo (idempotente — so atualiza linhas legadas)
    -- ------------------------------------------------------------------------
    UPDATE cadence_event_triggers
    SET applicable_stage_ids = ARRAY[(event_config->>'initial_stage_id')::UUID],
        event_config = event_config - 'initial_stage_id'
    WHERE event_type = 'card_created'
      AND (applicable_stage_ids IS NULL OR array_length(applicable_stage_ids, 1) IS NULL)
      AND event_config ? 'initial_stage_id'
      AND event_config->>'initial_stage_id' IS NOT NULL
      AND event_config->>'initial_stage_id' <> '';

    DECLARE v_count INTEGER;
    BEGIN
        SELECT COUNT(*) INTO v_count
        FROM cadence_event_triggers
        WHERE event_type = 'card_created'
          AND applicable_stage_ids IS NOT NULL
          AND array_length(applicable_stage_ids, 1) > 0;
        RAISE NOTICE 'card_created triggers com applicable_stage_ids preenchido: %', v_count;
    END;
END $migration$;

-- ----------------------------------------------------------------------------
-- 2) Self-heal trigger: migra legacy initial_stage_id em qualquer INSERT/UPDATE
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_card_created_stage_filter()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
BEGIN
    IF NEW.event_type = 'card_created'
       AND (NEW.applicable_stage_ids IS NULL OR array_length(NEW.applicable_stage_ids, 1) IS NULL)
       AND NEW.event_config IS NOT NULL
       AND NEW.event_config ? 'initial_stage_id'
       AND NEW.event_config->>'initial_stage_id' IS NOT NULL
       AND NEW.event_config->>'initial_stage_id' <> ''
    THEN
        BEGIN
            NEW.applicable_stage_ids := ARRAY[(NEW.event_config->>'initial_stage_id')::UUID];
            NEW.event_config := NEW.event_config - 'initial_stage_id';
        EXCEPTION WHEN invalid_text_representation THEN
            RAISE WARNING 'sync_card_created_stage_filter: initial_stage_id invalido em trigger %, ignorando migracao', NEW.id;
        END;
    END IF;
    RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.sync_card_created_stage_filter() IS
'Migra automaticamente event_config.initial_stage_id (campo legado do editor V2 antigo) para applicable_stage_ids (coluna que o dispatcher SQL filtra) em INSERT/UPDATE de cadence_event_triggers do tipo card_created. Garante que nenhum caminho de escrita consiga gravar trigger no formato bugado.';

-- Trigger so cria se a tabela existe (staging nao tem).
DO $install_trigger$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'cadence_event_triggers') THEN
        DROP TRIGGER IF EXISTS trg_sync_card_created_stage_filter ON public.cadence_event_triggers;
        CREATE TRIGGER trg_sync_card_created_stage_filter
            BEFORE INSERT OR UPDATE ON public.cadence_event_triggers
            FOR EACH ROW
            EXECUTE FUNCTION public.sync_card_created_stage_filter();
        RAISE NOTICE 'trg_sync_card_created_stage_filter instalado em cadence_event_triggers.';
    ELSE
        RAISE NOTICE 'cadence_event_triggers ausente — pulando install do trigger.';
    END IF;
END $install_trigger$;

-- ----------------------------------------------------------------------------
-- 3) RPC de auditoria pro smoke test (retorna count de regressoes)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cadence_triggers_legacy_card_created_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_count INTEGER;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'cadence_event_triggers') THEN
        RETURN 0;
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM cadence_event_triggers
    WHERE event_type = 'card_created'
      AND (applicable_stage_ids IS NULL OR array_length(applicable_stage_ids, 1) IS NULL)
      AND event_config ? 'initial_stage_id'
      AND event_config->>'initial_stage_id' IS NOT NULL
      AND event_config->>'initial_stage_id' <> '';
    RETURN v_count;
END;
$fn$;

COMMENT ON FUNCTION public.cadence_triggers_legacy_card_created_count() IS
'Conta triggers card_created com filtro de etapa no campo legado event_config.initial_stage_id mas applicable_stage_ids vazio. Esperado: 0. Smoke test usa pra detectar regressao no editor V2.';

GRANT EXECUTE ON FUNCTION public.cadence_triggers_legacy_card_created_count() TO authenticated, anon, service_role;

-- ----------------------------------------------------------------------------
-- 4) Auditoria final: confirma 0 triggers no padrao bugado apos a migration
-- ----------------------------------------------------------------------------
DO $audit$
DECLARE v_legacy_left INTEGER;
BEGIN
    SELECT public.cadence_triggers_legacy_card_created_count() INTO v_legacy_left;

    IF v_legacy_left > 0 THEN
        RAISE EXCEPTION 'Restam % triggers card_created no padrao legado apos migration', v_legacy_left;
    END IF;
    RAISE NOTICE 'Auditoria OK: 0 triggers card_created com filtro de etapa em campo legado';
END $audit$;
