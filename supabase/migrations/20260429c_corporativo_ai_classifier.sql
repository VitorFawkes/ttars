-- ============================================================================
-- MIGRATION: Welcome Corporativo - IA classificadora (onda 2)
-- Date: 2026-04-29
--
-- Quando uma mensagem inbound chega num card CORP que ainda não tem
-- categoria_produto preenchida, dispara a edge function "classify-corp-category"
-- via pg_net. A edge function chama o GPT, classifica em uma das 7 categorias
-- e atualiza cards.produto_data.categoria_produto.
--
-- Toggle global: organizations.settings.corp_ai_classifier_enabled
-- (default true; admin pode pausar setando false)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Liga o classifier por padrão na Welcome Corporativo
-- ============================================================================
UPDATE organizations
SET settings = jsonb_set(
    COALESCE(settings, '{}'::jsonb),
    '{corp_ai_classifier_enabled}',
    'true'::jsonb,
    true
)
WHERE id = 'b0000000-0000-0000-0000-000000000003'
  AND (settings->>'corp_ai_classifier_enabled') IS NULL;

-- ============================================================================
-- 2. Trigger function: dispara classifier quando mensagem inbound chega
--    em card CORP sem categoria
-- ============================================================================
CREATE OR REPLACE FUNCTION public.trg_corp_classify_on_message_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
    v_produto TEXT;
    v_categoria TEXT;
    v_org_id UUID;
    v_classifier_enabled BOOLEAN;
    v_service_key TEXT;
BEGIN
    -- Só processa mensagens inbound (do cliente)
    IF NEW.direction IS DISTINCT FROM 'inbound' THEN
        RETURN NEW;
    END IF;

    -- Card_id obrigatório
    IF NEW.card_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Lookup card: produto + categoria já existente + org
    SELECT
        c.produto::TEXT,
        (c.produto_data->>'categoria_produto'),
        c.org_id
    INTO v_produto, v_categoria, v_org_id
    FROM cards c
    WHERE c.id = NEW.card_id
      AND c.deleted_at IS NULL;

    -- Não é card CORP, ignora
    IF v_produto IS DISTINCT FROM 'CORP' THEN
        RETURN NEW;
    END IF;

    -- Já tem categoria, respeita decisão (humana ou IA prévia)
    IF v_categoria IS NOT NULL AND length(v_categoria) > 0 THEN
        RETURN NEW;
    END IF;

    -- Toggle da org pode estar OFF
    SELECT (settings->>'corp_ai_classifier_enabled')::boolean
    INTO v_classifier_enabled
    FROM organizations
    WHERE id = v_org_id;

    IF v_classifier_enabled IS DISTINCT FROM TRUE THEN
        RETURN NEW;
    END IF;

    -- Recupera service_role_key do vault
    SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;

    IF v_service_key IS NULL THEN
        RAISE WARNING 'classify-corp-category: service_role_key não está no vault';
        RETURN NEW;
    END IF;

    -- Dispara edge function (assíncrono — não bloqueia o INSERT)
    PERFORM net.http_post(
        url := 'https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/classify-corp-category',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object('card_id', NEW.card_id)
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Nunca falhar o INSERT da mensagem por causa do classifier
    RAISE WARNING 'classify-corp-category trigger error: %', SQLERRM;
    RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.trg_corp_classify_on_message_fn IS
'Dispara edge function classify-corp-category quando mensagem inbound chega em card CORP sem categoria preenchida. Idempotente, não-bloqueante e tolerante a falhas.';

-- ============================================================================
-- 3. Trigger
-- ============================================================================
DROP TRIGGER IF EXISTS trg_corp_classify_on_message ON whatsapp_messages;
CREATE TRIGGER trg_corp_classify_on_message
    AFTER INSERT ON whatsapp_messages
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_corp_classify_on_message_fn();

-- ============================================================================
-- 4. Smoke check
-- ============================================================================
DO $smoke$
DECLARE
    v_workspace_id UUID := 'b0000000-0000-0000-0000-000000000003';
    v_enabled BOOLEAN;
BEGIN
    SELECT (settings->>'corp_ai_classifier_enabled')::boolean
    INTO v_enabled
    FROM organizations WHERE id = v_workspace_id;
    IF v_enabled IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'corp_ai_classifier_enabled não foi ligado na Welcome Corporativo';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_corp_classify_on_message'
    ) THEN
        RAISE EXCEPTION 'Trigger trg_corp_classify_on_message não foi criada';
    END IF;

    RAISE NOTICE '✅ Welcome Corporativo onda 2: classifier IA ativada (toggle: ON)';
END $smoke$;

COMMIT;
