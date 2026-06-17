-- ============================================================================
-- WEDDINGS ↔ ACTIVECAMPAIGN — vincular card a deal EXISTENTE pelo e-mail
-- ============================================================================
-- Contexto: a criação de leads de Weddings migrou para o ttars (Leadster/manual),
-- então cards nascem sem `external_id` (sem deal do AC amarrado) e NÃO participam
-- do sync de passagem de etapa (o trigger de saída log_outbound_card_event aborta
-- quando external_id IS NULL; o inbound casa o deal ao card pelo external_id).
--
-- Decisão de negócio: NÃO criar nada no AC. Apenas VINCULAR cada card de Weddings
-- a um deal JÁ EXISTENTE no AC, casando pelo e-mail do contato (best-effort).
--
-- Esta migration cria só o enfileiramento (going-forward) + kill-switch. O trabalho
-- de buscar o deal no AC e gravar cards.external_id é feito pela edge function
-- integration-dispatch (novo handler 'link_by_email'), drenada pelo cron existente.
-- O backfill dos cards antigos é enfileirado num passo separado, após validação.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Kill-switch em integration_settings (org Welcome Weddings)
--    Evita o trap do ON CONFLICT (unique varia) usando INSERT WHERE NOT EXISTS.
-- ----------------------------------------------------------------------------
INSERT INTO public.integration_settings (org_id, key, value, produto, description)
SELECT
    'b0000000-0000-0000-0000-000000000002'::uuid,
    'WW_AC_LINK_BY_EMAIL_ENABLED',
    'true',
    NULL,
    'Liga/desliga o vínculo automático de cards Weddings a deals existentes do AC pelo e-mail do contato.'
WHERE NOT EXISTS (
    SELECT 1 FROM public.integration_settings
    WHERE org_id = 'b0000000-0000-0000-0000-000000000002'::uuid
      AND key = 'WW_AC_LINK_BY_EMAIL_ENABLED'
);

-- ----------------------------------------------------------------------------
-- 2) Função de enfileiramento (AFTER INSERT em cards, escopo WEDDING)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_ac_link_by_email_on_card_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_integration_id UUID;
    v_flag TEXT;
BEGIN
    -- Só INSERT
    IF TG_OP <> 'INSERT' THEN RETURN NEW; END IF;

    -- Cards criados pelo inbound (integration-process) já vêm com external_id
    IF current_setting('app.update_source', TRUE) = 'integration' THEN RETURN NEW; END IF;

    -- Já vinculado / sub-card / fora de escopo / sem contato
    IF NEW.external_id IS NOT NULL THEN RETURN NEW; END IF;
    IF COALESCE(NEW.card_type, 'standard') = 'sub_card' THEN RETURN NEW; END IF;
    IF NEW.produto::TEXT <> 'WEDDING' THEN RETURN NEW; END IF;
    IF NEW.pessoa_principal_id IS NULL THEN RETURN NEW; END IF;

    -- Kill-switch: desliga se houver linha explícita 'false' (org do card ou global)
    SELECT value INTO v_flag
    FROM public.integration_settings
    WHERE key = 'WW_AC_LINK_BY_EMAIL_ENABLED'
      AND (org_id = NEW.org_id OR produto IS NULL)
    ORDER BY (org_id = NEW.org_id) DESC
    LIMIT 1;
    IF v_flag = 'false' THEN RETURN NEW; END IF;

    -- Integração AC (provider = 'active_campaign')
    SELECT id INTO v_integration_id
    FROM public.integrations
    WHERE provider = 'active_campaign'
    LIMIT 1;
    IF v_integration_id IS NULL THEN RETURN NEW; END IF;

    -- Enfileira job de vínculo (external_id NULL — preenchido pelo dispatch se achar)
    INSERT INTO public.integration_outbound_queue (
        card_id, integration_id, external_id, event_type, payload, status, triggered_by
    ) VALUES (
        NEW.id, v_integration_id, NULL, 'link_by_email',
        jsonb_build_object('reason', 'card_created'),
        'pending', 'system'
    );

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Nunca bloquear a criação do card por causa do enfileiramento
        RAISE WARNING 'enqueue_ac_link_by_email_on_card_insert falhou: %', SQLERRM;
        RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enqueue_ac_link_by_email_on_card_insert() IS
'Enfileira evento link_by_email em integration_outbound_queue quando um card WEDDING é criado sem external_id, para que o integration-dispatch tente vinculá-lo a um deal existente do AC pelo e-mail do contato. Best-effort, não cria nada no AC.';

-- ----------------------------------------------------------------------------
-- 3) Trigger
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS tr_enqueue_ac_link_by_email ON public.cards;
CREATE TRIGGER tr_enqueue_ac_link_by_email
    AFTER INSERT ON public.cards
    FOR EACH ROW
    EXECUTE FUNCTION public.enqueue_ac_link_by_email_on_card_insert();

NOTIFY pgrst, 'reload schema';
