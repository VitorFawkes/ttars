-- ============================================================================
-- MIGRATION: Registrar mudanças de Contato Principal e Viajantes na Atividade
-- Date: 2026-05-07
--
-- Problema: a aba "Atividade" do card não mostrava quem trocou o Contato
-- Principal (cards.pessoa_principal_id) nem quem adicionou/removeu viajantes
-- (cards_contatos). Ambos eventos eram silenciosos.
--
-- Solução (sem rebase de log_card_update_activity, para evitar reverter
-- correções incrementais — ver memory/feedback_function_rebase_cuidado.md):
--
-- A) Função NOVA log_card_primary_contact_change() em trigger DEDICADO,
--    AFTER UPDATE OF pessoa_principal_id em cards.
-- B) Função NOVA log_cards_contatos_activity() + trigger AFTER INSERT/UPDATE/
--    DELETE em cards_contatos. Idempotente (DROP TRIGGER IF EXISTS).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- A) log_card_primary_contact_change — trigger dedicado para
--    cards.pessoa_principal_id. Não toca log_card_update_activity.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_card_primary_contact_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_user_id uuid;
    v_source_text text;
    v_source_is_system boolean;
    v_source_tag jsonb;
    v_old_nome text;
    v_new_nome text;
    v_descricao text;
    v_system_sources text[] := ARRAY[
      'auto_calc', 'cron', 'automacao', 'integration',
      'monde', 'active_campaign', 'n8n', 'webhook',
      'ai_agent', 'ai_agent_router', 'ai_outbound_trigger',
      'whatsapp_inbound', 'whatsapp_outbound'
    ];
BEGIN
    -- Sai cedo se nada mudou
    IF OLD.pessoa_principal_id IS NOT DISTINCT FROM NEW.pessoa_principal_id THEN
        RETURN NEW;
    END IF;

    v_user_id := auth.uid();
    v_source_text := COALESCE(current_setting('app.update_source', true), '');
    v_source_is_system := v_source_text = ANY(v_system_sources);

    -- Mesma regra de log_card_update_activity (20260506b): se o source é de
    -- sistema/automação, ignora auth.uid() e classifica como integração.
    IF v_source_is_system THEN
        v_user_id := NULL;
    END IF;

    v_source_tag := CASE
        WHEN v_user_id IS NOT NULL THEN '{}'::jsonb
        WHEN v_source_text <> '' THEN jsonb_build_object('source', v_source_text)
        ELSE '{}'::jsonb
    END;

    SELECT nome INTO v_old_nome FROM public.contatos WHERE id = OLD.pessoa_principal_id;
    SELECT nome INTO v_new_nome FROM public.contatos WHERE id = NEW.pessoa_principal_id;

    v_descricao := CASE
        WHEN OLD.pessoa_principal_id IS NULL
            THEN 'Contato principal definido: ' || COALESCE(v_new_nome, 'desconhecido')
        WHEN NEW.pessoa_principal_id IS NULL
            THEN 'Contato principal removido (era ' || COALESCE(v_old_nome, 'desconhecido') || ')'
        ELSE
            'Contato principal: ' || COALESCE(v_old_nome, 'desconhecido') || ' → ' || COALESCE(v_new_nome, 'desconhecido')
    END;

    INSERT INTO public.activities (card_id, tipo, descricao, metadata, created_by)
    VALUES (
        NEW.id,
        'primary_contact_changed',
        v_descricao,
        jsonb_build_object(
            'old_contato_id', OLD.pessoa_principal_id,
            'new_contato_id', NEW.pessoa_principal_id,
            'old_nome', v_old_nome,
            'new_nome', v_new_nome
        ) || v_source_tag,
        v_user_id
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    PERFORM public.safe_log_trigger_error(
        'log_card_primary_contact_change',
        SQLERRM,
        jsonb_build_object(
            'card_id', NEW.id,
            'old_contato_id', OLD.pessoa_principal_id,
            'new_contato_id', NEW.pessoa_principal_id
        )
    );
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS card_primary_contact_change_trigger ON public.cards;
CREATE TRIGGER card_primary_contact_change_trigger
AFTER UPDATE OF pessoa_principal_id ON public.cards
FOR EACH ROW
WHEN (OLD.pessoa_principal_id IS DISTINCT FROM NEW.pessoa_principal_id)
EXECUTE FUNCTION public.log_card_primary_contact_change();

-- ----------------------------------------------------------------------------
-- B) log_cards_contatos_activity — re-instalar (idempotente)
--    A definição original morava em migration arquivada e dependia de o trigger
--    ainda existir em prod (drift entre código e banco). Esta migration garante
--    o estado: função e trigger estão instalados.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_cards_contatos_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_contato_nome text;
    v_card_org_id uuid;
    v_user_id uuid;
    v_source_text text;
    v_source_is_system boolean;
    v_source_tag jsonb;
    v_card_id uuid;
    v_contato_id uuid;
    v_system_sources text[] := ARRAY[
      'auto_calc', 'cron', 'automacao', 'integration',
      'monde', 'active_campaign', 'n8n', 'webhook',
      'ai_agent', 'ai_agent_router', 'ai_outbound_trigger',
      'whatsapp_inbound', 'whatsapp_outbound'
    ];
BEGIN
    v_card_id := COALESCE(NEW.card_id, OLD.card_id);
    v_contato_id := COALESCE(NEW.contato_id, OLD.contato_id);

    v_user_id := auth.uid();
    v_source_text := COALESCE(current_setting('app.update_source', true), '');
    v_source_is_system := v_source_text = ANY(v_system_sources);

    IF v_source_is_system THEN
        v_user_id := NULL;
    END IF;

    v_source_tag := CASE
        WHEN v_user_id IS NOT NULL THEN '{}'::jsonb
        WHEN v_source_text <> '' THEN jsonb_build_object('source', v_source_text)
        ELSE '{}'::jsonb
    END;

    SELECT nome INTO v_contato_nome FROM public.contatos WHERE id = v_contato_id;
    SELECT org_id INTO v_card_org_id FROM public.cards WHERE id = v_card_id;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.activities (card_id, tipo, descricao, metadata, created_by, org_id)
        VALUES (
            NEW.card_id,
            'traveler_added',
            'Viajante adicionado: ' || COALESCE(v_contato_nome, 'desconhecido'),
            jsonb_build_object(
                'contato_id', NEW.contato_id,
                'contato_nome', v_contato_nome
            ) || v_source_tag,
            v_user_id,
            v_card_org_id
        );
        RETURN NEW;

    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO public.activities (card_id, tipo, descricao, metadata, created_by, org_id)
        VALUES (
            OLD.card_id,
            'traveler_removed',
            'Viajante removido: ' || COALESCE(v_contato_nome, 'desconhecido'),
            jsonb_build_object(
                'contato_id', OLD.contato_id,
                'contato_nome', v_contato_nome
            ) || v_source_tag,
            v_user_id,
            v_card_org_id
        );
        RETURN OLD;

    ELSIF TG_OP = 'UPDATE' THEN
        -- Logamos só quando o contato em si muda (raro). Outros campos
        -- (ordem, tipo_viajante) tendem a ser ruído no feed.
        IF OLD.contato_id IS DISTINCT FROM NEW.contato_id THEN
            INSERT INTO public.activities (card_id, tipo, descricao, metadata, created_by, org_id)
            VALUES (
                NEW.card_id,
                'traveler_updated',
                'Viajante alterado: ' || COALESCE(v_contato_nome, 'desconhecido'),
                jsonb_build_object(
                    'old_contato_id', OLD.contato_id,
                    'new_contato_id', NEW.contato_id,
                    'contato_nome', v_contato_nome
                ) || v_source_tag,
                v_user_id,
                v_card_org_id
            );
        END IF;
        RETURN NEW;
    END IF;

    RETURN NULL;
EXCEPTION WHEN OTHERS THEN
    PERFORM public.safe_log_trigger_error(
        'log_cards_contatos_activity',
        SQLERRM,
        jsonb_build_object(
            'op', TG_OP,
            'card_id', v_card_id,
            'contato_id', v_contato_id
        )
    );
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS cards_contatos_activity_trigger ON public.cards_contatos;
CREATE TRIGGER cards_contatos_activity_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.cards_contatos
FOR EACH ROW EXECUTE FUNCTION public.log_cards_contatos_activity();

COMMIT;
