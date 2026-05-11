-- =====================================================
-- CORREÇÃO PROFISSIONAL: Trigger Functions
--
-- Autor: Revisão de segurança e performance
-- Data: 2026-01-28
--
-- PROBLEMAS IDENTIFICADOS:
-- 1. search_path="" (vazio) em 57 funções - causa "relation X does not exist"
-- 2. Múltiplos blocos EXCEPTION - overhead de savepoints
-- 3. RAISE WARNING pode ser perdido em produção
--
-- SOLUÇÃO PROFISSIONAL:
-- 1. search_path = public (explícito, seguro)
-- 2. Referências fully qualified (public.tabela)
-- 3. SECURITY DEFINER (necessário para triggers de sistema)
-- 4. UM ÚNICO bloco EXCEPTION por função (performance)
-- 5. Log estruturado de erros para audit_logs (observabilidade)
-- =====================================================

-- =====================================================
-- HELPER: Função para logar erros de triggers de forma segura
-- Nunca falha, mesmo se audit_logs não existir
-- =====================================================
CREATE OR REPLACE FUNCTION public.safe_log_trigger_error(
    p_function_name text,
    p_error_message text,
    p_context jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Tenta inserir no audit_logs com tipo especial 'trigger_error'
    INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, changed_by)
    VALUES (
        'trigger_errors',
        gen_random_uuid(),
        'ERROR',
        jsonb_build_object(
            'function', p_function_name,
            'error', p_error_message,
            'context', p_context,
            'timestamp', now()
        ),
        NULL,
        NULL
    );
EXCEPTION WHEN OTHERS THEN
    -- Se falhar, apenas loga warning (última linha de defesa)
    RAISE WARNING '[%] %: % | Context: %',
        now()::text, p_function_name, p_error_message, p_context::text;
END;
$$;

-- =====================================================
-- 1. log_card_created
-- Trigger: AFTER INSERT on cards
-- Propósito: Registrar criação de cards em activities
-- =====================================================
CREATE OR REPLACE FUNCTION public.log_card_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER  -- Necessário: trigger executa no contexto do sistema
SET search_path = public  -- Segurança: previne search_path hijacking
AS $$
BEGIN
    INSERT INTO public.activities (card_id, tipo, descricao, metadata, created_by)
    VALUES (
        NEW.id,
        'card_created',
        'Card criado: ' || COALESCE(NEW.titulo, 'Sem título'),
        jsonb_build_object(
            'titulo', NEW.titulo,
            'pipeline_id', NEW.pipeline_id,
            'stage_id', NEW.pipeline_stage_id,
            'produto', NEW.produto
        ),
        COALESCE(NEW.created_by, auth.uid())
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Log estruturado do erro, mas não bloqueia a criação do card
    PERFORM public.safe_log_trigger_error(
        'log_card_created',
        SQLERRM,
        jsonb_build_object('card_id', NEW.id, 'titulo', NEW.titulo)
    );
    RETURN NEW;
END;
$$;

-- =====================================================
-- 2. log_card_changes
-- Trigger: AFTER INSERT/UPDATE/DELETE on cards
-- Propósito: Auditoria completa de mudanças
-- =====================================================
CREATE OR REPLACE FUNCTION public.log_card_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, changed_by)
    VALUES (
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        TG_OP,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END,
        auth.uid()
    );

    RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
    PERFORM public.safe_log_trigger_error(
        'log_card_changes',
        SQLERRM,
        jsonb_build_object('operation', TG_OP, 'record_id', COALESCE(NEW.id, OLD.id))
    );
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- =====================================================
-- 3. log_card_deletion
-- Trigger: BEFORE DELETE on cards
-- Propósito: Registrar deleção antes de perder os dados
-- =====================================================
CREATE OR REPLACE FUNCTION public.log_card_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.activities (card_id, tipo, descricao, metadata, created_by)
    VALUES (
        OLD.id,
        'card_deleted',
        'Card removido: ' || COALESCE(OLD.titulo, 'Sem título'),
        jsonb_build_object(
            'titulo', OLD.titulo,
            'pipeline_id', OLD.pipeline_id,
            'stage_id', OLD.pipeline_stage_id,
            'produto', OLD.produto,
            'valor_final', OLD.valor_final
        ),
        auth.uid()
    );

    RETURN OLD;
EXCEPTION WHEN OTHERS THEN
    PERFORM public.safe_log_trigger_error(
        'log_card_deletion',
        SQLERRM,
        jsonb_build_object('card_id', OLD.id, 'titulo', OLD.titulo)
    );
    RETURN OLD;
END;
$$;

-- =====================================================
-- 4. log_card_update_activity
-- Trigger: AFTER UPDATE on cards
-- Propósito: Registrar mudanças significativas para timeline
--
-- OTIMIZAÇÃO: Coleta todas as mudanças e faz INSERT único
-- =====================================================
CREATE OR REPLACE FUNCTION public.log_card_update_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_activities jsonb[] := '{}';
    v_old_stage_name text;
    v_new_stage_name text;
    v_user_id uuid;
    v_old_data jsonb;
    v_new_data jsonb;
    v_activity jsonb;
BEGIN
    v_user_id := auth.uid();
    v_old_data := COALESCE(OLD.produto_data, '{}'::jsonb);
    v_new_data := COALESCE(NEW.produto_data, '{}'::jsonb);

    -- 1. Mudança de Etapa
    IF OLD.pipeline_stage_id IS DISTINCT FROM NEW.pipeline_stage_id THEN
        SELECT nome INTO v_old_stage_name FROM public.pipeline_stages WHERE id = OLD.pipeline_stage_id;
        SELECT nome INTO v_new_stage_name FROM public.pipeline_stages WHERE id = NEW.pipeline_stage_id;

        v_activities := array_append(v_activities, jsonb_build_object(
            'tipo', 'stage_changed',
            'descricao', 'Card movido de ' || COALESCE(v_old_stage_name, '?') || ' para ' || COALESCE(v_new_stage_name, '?'),
            'metadata', jsonb_build_object(
                'old_stage_id', OLD.pipeline_stage_id,
                'new_stage_id', NEW.pipeline_stage_id,
                'old_stage_name', v_old_stage_name,
                'new_stage_name', v_new_stage_name
            )
        ));
    END IF;

    -- 2. Mudança de Dono
    IF OLD.dono_atual_id IS DISTINCT FROM NEW.dono_atual_id THEN
        v_activities := array_append(v_activities, jsonb_build_object(
            'tipo', 'owner_changed',
            'descricao', 'Responsável alterado',
            'metadata', jsonb_build_object(
                'old_owner_id', OLD.dono_atual_id,
                'new_owner_id', NEW.dono_atual_id
            )
        ));
    END IF;

    -- 3. Mudança de Status
    IF OLD.status_comercial IS DISTINCT FROM NEW.status_comercial THEN
        v_activities := array_append(v_activities, jsonb_build_object(
            'tipo', 'status_changed',
            'descricao', 'Status alterado para ' || COALESCE(NEW.status_comercial, '?'),
            'metadata', jsonb_build_object(
                'old_status', OLD.status_comercial,
                'new_status', NEW.status_comercial
            )
        ));
    END IF;

    -- 4. Mudança de Valor
    IF OLD.valor_final IS DISTINCT FROM NEW.valor_final THEN
        v_activities := array_append(v_activities, jsonb_build_object(
            'tipo', 'value_changed',
            'descricao', 'Valor alterado de ' || COALESCE(OLD.valor_final::text, '0') || ' para ' || COALESCE(NEW.valor_final::text, '0'),
            'metadata', jsonb_build_object(
                'old_value', OLD.valor_final,
                'new_value', NEW.valor_final
            )
        ));
    END IF;

    -- 5. Mudanças em produto_data (apenas campos principais)
    IF v_old_data IS DISTINCT FROM v_new_data THEN
        -- Época da viagem
        IF (v_old_data->>'epoca_viagem') IS DISTINCT FROM (v_new_data->>'epoca_viagem') THEN
            v_activities := array_append(v_activities, jsonb_build_object(
                'tipo', 'period_changed',
                'descricao', 'Época da viagem alterada',
                'metadata', jsonb_build_object('old', v_old_data->'epoca_viagem', 'new', v_new_data->'epoca_viagem')
            ));
        END IF;

        -- Destinos
        IF (v_old_data->>'destinos') IS DISTINCT FROM (v_new_data->>'destinos') THEN
            v_activities := array_append(v_activities, jsonb_build_object(
                'tipo', 'destination_changed',
                'descricao', 'Destinos alterados',
                'metadata', jsonb_build_object('old', v_old_data->'destinos', 'new', v_new_data->'destinos')
            ));
        END IF;

        -- Pessoas
        IF (v_old_data->>'pessoas') IS DISTINCT FROM (v_new_data->>'pessoas') THEN
            v_activities := array_append(v_activities, jsonb_build_object(
                'tipo', 'traveler_changed',
                'descricao', 'Viajantes alterados',
                'metadata', jsonb_build_object('old', v_old_data->'pessoas', 'new', v_new_data->'pessoas')
            ));
        END IF;
    END IF;

    -- INSERT ÚNICO de todas as activities (performance)
    IF array_length(v_activities, 1) > 0 THEN
        INSERT INTO public.activities (card_id, tipo, descricao, metadata, created_by)
        SELECT
            NEW.id,
            (a->>'tipo')::text,
            (a->>'descricao')::text,
            (a->'metadata')::jsonb,
            v_user_id
        FROM unnest(v_activities) AS a;
    END IF;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    PERFORM public.safe_log_trigger_error(
        'log_card_update_activity',
        SQLERRM,
        jsonb_build_object('card_id', NEW.id, 'activities_count', array_length(v_activities, 1))
    );
    RETURN NEW;
END;
$$;

-- =====================================================
-- 5. recalculate_contact_stats
-- Trigger: AFTER INSERT/UPDATE/DELETE on cards
-- Propósito: Manter estatísticas de contatos atualizadas
-- =====================================================
CREATE OR REPLACE FUNCTION public.recalculate_contact_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_contato_id uuid;
BEGIN
    v_contato_id := COALESCE(NEW.contato_principal_id, OLD.contato_principal_id);

    IF v_contato_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Upsert de estatísticas com CTE (mais eficiente)
    WITH stats AS (
        SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE status_comercial = 'aberto') as abertas,
            COUNT(*) FILTER (WHERE status_comercial = 'ganho') as ganhas,
            COUNT(*) FILTER (WHERE status_comercial = 'perdido') as perdidas,
            COALESCE(SUM(valor_final) FILTER (WHERE status_comercial = 'ganho'), 0) as valor_total
        FROM public.cards
        WHERE contato_principal_id = v_contato_id
    )
    INSERT INTO public.contact_stats (
        contato_id, total_viagens, viagens_abertas, viagens_ganhas,
        viagens_perdidas, valor_total_ganho, updated_at
    )
    SELECT
        v_contato_id, total, abertas, ganhas, perdidas, valor_total, NOW()
    FROM stats
    ON CONFLICT (contato_id) DO UPDATE SET
        total_viagens = EXCLUDED.total_viagens,
        viagens_abertas = EXCLUDED.viagens_abertas,
        viagens_ganhas = EXCLUDED.viagens_ganhas,
        viagens_perdidas = EXCLUDED.viagens_perdidas,
        valor_total_ganho = EXCLUDED.valor_total_ganho,
        updated_at = NOW();

    RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
    PERFORM public.safe_log_trigger_error(
        'recalculate_contact_stats',
        SQLERRM,
        jsonb_build_object('contato_id', v_contato_id)
    );
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- =====================================================
-- 6. calculate_group_totals
-- Trigger: AFTER INSERT/UPDATE/DELETE on cards_contatos
-- Propósito: Atualizar totais de pessoas no card
-- =====================================================
CREATE OR REPLACE FUNCTION public.calculate_group_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_card_id uuid;
BEGIN
    v_card_id := COALESCE(NEW.card_id, OLD.card_id);

    IF v_card_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Update com subquery (mais eficiente que SELECT INTO + UPDATE separados)
    UPDATE public.cards
    SET produto_data = COALESCE(produto_data, '{}'::jsonb) || (
        SELECT jsonb_build_object(
            'pessoas', jsonb_build_object(
                'total', COUNT(*),
                'adultos', COUNT(*) FILTER (WHERE is_primary = true)
            )
        )
        FROM public.cards_contatos
        WHERE card_id = v_card_id
    )
    WHERE id = v_card_id;

    RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
    PERFORM public.safe_log_trigger_error(
        'calculate_group_totals',
        SQLERRM,
        jsonb_build_object('card_id', v_card_id)
    );
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- =====================================================
-- GRANTS: Garantir permissões corretas
-- =====================================================
GRANT EXECUTE ON FUNCTION public.safe_log_trigger_error(text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.safe_log_trigger_error(text, text, jsonb) TO service_role;

-- =====================================================
-- COMENTÁRIOS DE DOCUMENTAÇÃO
-- =====================================================
COMMENT ON FUNCTION public.safe_log_trigger_error IS
'Helper function para logar erros de triggers de forma segura. Nunca falha.';

COMMENT ON FUNCTION public.log_card_created IS
'Trigger function para logar criação de cards.
SECURITY DEFINER com search_path=public. Um único EXCEPTION handler.';

COMMENT ON FUNCTION public.log_card_changes IS
'Trigger function para auditoria de mudanças em cards.
SECURITY DEFINER com search_path=public. Um único EXCEPTION handler.';

COMMENT ON FUNCTION public.log_card_deletion IS
'Trigger function para logar deleção de cards antes de perder os dados.
SECURITY DEFINER com search_path=public. Um único EXCEPTION handler.';

COMMENT ON FUNCTION public.log_card_update_activity IS
'Trigger function para registrar mudanças significativas em cards para timeline.
OTIMIZADO: Coleta mudanças em array e faz INSERT único (performance).
SECURITY DEFINER com search_path=public. Um único EXCEPTION handler.';

COMMENT ON FUNCTION public.recalculate_contact_stats IS
'Trigger function para manter estatísticas de contatos atualizadas.
Usa CTE + UPSERT para eficiência.
SECURITY DEFINER com search_path=public. Um único EXCEPTION handler.';

COMMENT ON FUNCTION public.calculate_group_totals IS
'Trigger function para atualizar totais de pessoas no card.
Usa UPDATE com subquery para eficiência.
SECURITY DEFINER com search_path=public. Um único EXCEPTION handler.';
