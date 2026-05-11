-- =============================================================================
-- Migration: Fix recalculate_contact_stats trigger function
--
-- A migração 20260128200000 sobrescreveu esta função com colunas erradas:
--   - "contato_principal_id" (não existe → correto: pessoa_principal_id)
--   - "total_viagens", "valor_total_ganho", "contato_id" (não existem na tabela)
--   - A tabela real tem: contact_id, total_trips, total_spend, last_trip_date, etc.
--
-- Esta migração restaura a lógica correta, considerando:
--   1. Cards via pessoa_principal_id (contato principal do card)
--   2. Cards via cards_contatos (viajante/participante)
--   3. Valor apenas de cards onde o contato é pessoa_principal_id
--   4. Destinos, grupo líder, datas
-- =============================================================================

CREATE OR REPLACE FUNCTION public.recalculate_contact_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    affected_contact_id UUID;
    v_total_trips INTEGER;
    v_total_spend NUMERIC;
    v_last_trip TIMESTAMPTZ;
    v_next_trip TIMESTAMPTZ;
    v_destinations JSONB;
    v_is_leader BOOLEAN;
BEGIN
    -- Determina qual contato atualizar baseado na tabela que disparou o trigger
    IF TG_TABLE_NAME = 'cards' THEN
        IF (TG_OP = 'DELETE') THEN
            affected_contact_id := OLD.pessoa_principal_id;
        ELSE
            affected_contact_id := NEW.pessoa_principal_id;
        END IF;

        -- Se mudou o pessoa_principal_id, recalcular o antigo também
        IF TG_OP = 'UPDATE' AND OLD.pessoa_principal_id IS DISTINCT FROM NEW.pessoa_principal_id AND OLD.pessoa_principal_id IS NOT NULL THEN
            -- Recalcular stats do contato antigo via chamada recursiva simplificada
            PERFORM recalculate_contact_stats_for(OLD.pessoa_principal_id);
        END IF;

    ELSIF TG_TABLE_NAME = 'cards_contatos' THEN
        IF (TG_OP = 'DELETE') THEN
            affected_contact_id := OLD.contato_id;
        ELSE
            affected_contact_id := NEW.contato_id;
        END IF;
    END IF;

    IF affected_contact_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    PERFORM recalculate_contact_stats_for(affected_contact_id);

    RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
    -- Não bloquear operação por erro na stat
    RAISE WARNING 'recalculate_contact_stats error: %', SQLERRM;
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Função auxiliar que calcula stats para um contato específico
-- Usada pelo trigger e pelo backfill
CREATE OR REPLACE FUNCTION public.recalculate_contact_stats_for(p_contact_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total_trips INTEGER;
    v_total_spend NUMERIC;
    v_last_trip TIMESTAMPTZ;
    v_next_trip TIMESTAMPTZ;
    v_destinations JSONB;
    v_is_leader BOOLEAN;
BEGIN
    -- Cards onde o contato é principal OU viajante (sem duplicar)
    WITH user_cards AS (
        SELECT id, valor_final, valor_estimado, data_viagem_inicio, data_viagem_fim,
               produto_data, is_group_parent, pessoa_principal_id
        FROM public.cards
        WHERE pessoa_principal_id = p_contact_id
          AND deleted_at IS NULL
        UNION
        SELECT c.id, c.valor_final, c.valor_estimado, c.data_viagem_inicio, c.data_viagem_fim,
               c.produto_data, c.is_group_parent, c.pessoa_principal_id
        FROM public.cards c
        JOIN public.cards_contatos cc ON c.id = cc.card_id
        WHERE cc.contato_id = p_contact_id
          AND c.deleted_at IS NULL
    )
    SELECT
        COUNT(DISTINCT id),
        COALESCE(SUM(
            CASE
                WHEN pessoa_principal_id = p_contact_id THEN COALESCE(valor_final, valor_estimado, 0)
                ELSE 0
            END
        ), 0),
        MAX(data_viagem_fim) FILTER (WHERE data_viagem_fim < NOW()),
        MIN(data_viagem_inicio) FILTER (WHERE data_viagem_inicio > NOW())
    INTO v_total_trips, v_total_spend, v_last_trip, v_next_trip
    FROM user_cards;

    -- Top destinos
    WITH user_cards AS (
        SELECT produto_data
        FROM public.cards
        WHERE pessoa_principal_id = p_contact_id AND deleted_at IS NULL
        UNION
        SELECT c.produto_data
        FROM public.cards c
        JOIN public.cards_contatos cc ON c.id = cc.card_id
        WHERE cc.contato_id = p_contact_id AND c.deleted_at IS NULL
    ),
    all_dests AS (
        SELECT jsonb_array_elements_text(
            CASE
                WHEN jsonb_typeof(produto_data->'destinos') = 'array' THEN produto_data->'destinos'
                ELSE '[]'::jsonb
            END
        ) as dest
        FROM user_cards
    )
    SELECT COALESCE(jsonb_agg(dest), '[]'::jsonb)
    INTO v_destinations
    FROM (
        SELECT dest FROM all_dests
        GROUP BY dest
        ORDER BY count(*) DESC
        LIMIT 5
    ) t;

    IF v_destinations IS NULL THEN
        v_destinations := '[]'::jsonb;
    END IF;

    -- Líder de grupo
    SELECT EXISTS (
        SELECT 1 FROM public.cards
        WHERE pessoa_principal_id = p_contact_id
        AND is_group_parent = true
        AND deleted_at IS NULL
    ) INTO v_is_leader;

    -- Upsert no contact_stats
    INSERT INTO public.contact_stats (
        contact_id, total_trips, total_spend, last_trip_date,
        next_trip_date, top_destinations, is_group_leader, updated_at
    )
    VALUES (
        p_contact_id, v_total_trips, v_total_spend, v_last_trip,
        v_next_trip, v_destinations, v_is_leader, NOW()
    )
    ON CONFLICT (contact_id) DO UPDATE SET
        total_trips = EXCLUDED.total_trips,
        total_spend = EXCLUDED.total_spend,
        last_trip_date = EXCLUDED.last_trip_date,
        next_trip_date = EXCLUDED.next_trip_date,
        top_destinations = EXCLUDED.top_destinations,
        is_group_leader = EXCLUDED.is_group_leader,
        updated_at = NOW();
END;
$$;

-- Garantir que os triggers estão corretos
DROP TRIGGER IF EXISTS trigger_recalc_stats_cards ON public.cards;
CREATE TRIGGER trigger_recalc_stats_cards
AFTER INSERT OR UPDATE OR DELETE ON public.cards
FOR EACH ROW EXECUTE FUNCTION public.recalculate_contact_stats();

DROP TRIGGER IF EXISTS trigger_recalc_stats_cards_contatos ON public.cards_contatos;
CREATE TRIGGER trigger_recalc_stats_cards_contatos
AFTER INSERT OR UPDATE OR DELETE ON public.cards_contatos
FOR EACH ROW EXECUTE FUNCTION public.recalculate_contact_stats();

-- Permissões
GRANT EXECUTE ON FUNCTION public.recalculate_contact_stats_for(UUID) TO authenticated;

-- =============================================================================
-- Backfill: Recalcular stats de TODOS os contatos que têm cards associados
-- =============================================================================
DO $$
DECLARE
    r RECORD;
    v_count INTEGER := 0;
BEGIN
    FOR r IN
        SELECT DISTINCT contact_id FROM (
            SELECT pessoa_principal_id AS contact_id
            FROM public.cards
            WHERE pessoa_principal_id IS NOT NULL AND deleted_at IS NULL
            UNION
            SELECT cc.contato_id AS contact_id
            FROM public.cards_contatos cc
            JOIN public.cards c ON c.id = cc.card_id
            WHERE c.deleted_at IS NULL
        ) all_contacts
    LOOP
        PERFORM public.recalculate_contact_stats_for(r.contact_id);
        v_count := v_count + 1;
    END LOOP;
    RAISE NOTICE 'Backfill complete: % contact stats recalculated', v_count;
END $$;
