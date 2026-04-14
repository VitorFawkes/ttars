-- Fix: RPCs chamadas em contexto sem JWT (pg_cron, service_role, triggers
-- herdando contexto sem JWT) que insert sem org_id explicito.
--
-- Corrigidas:
--   1. recalculate_contact_stats_for — INSERT em contact_stats agora passa
--      org_id derivado do contato. Trigger em cards/cards_contatos captura
--      exceção silenciosamente; sem org_id explícito, inserts via
--      service_role falhavam silenciosamente deixando stats stale.
--   2. criar_sub_card_futuro — INSERT em sub_card_sync_log agora passa
--      org_id derivado do parent card (v_opp.source_card_id). Chamada pela
--      edge function future-opportunity-processor como service_role.

-- ============================================================
-- 1. recalculate_contact_stats_for
-- ============================================================
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
    v_org_id UUID;
BEGIN
    SELECT org_id INTO v_org_id FROM public.contatos WHERE id = p_contact_id;
    IF v_org_id IS NULL THEN
      RETURN;
    END IF;

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
    dest_counts AS (
        SELECT produto_data->>'destino' AS destino, COUNT(*) AS cnt
        FROM user_cards
        WHERE produto_data->>'destino' IS NOT NULL
        GROUP BY produto_data->>'destino'
        ORDER BY cnt DESC
        LIMIT 5
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object('destino', destino, 'count', cnt)), '[]'::jsonb)
    INTO v_destinations
    FROM dest_counts;

    SELECT EXISTS(
        SELECT 1 FROM public.cards
        WHERE pessoa_principal_id = p_contact_id
          AND is_group_parent = true
          AND deleted_at IS NULL
    ) INTO v_is_leader;

    INSERT INTO public.contact_stats (
        contact_id, total_trips, total_spend, last_trip_date,
        next_trip_date, top_destinations, is_group_leader, updated_at, org_id
    )
    VALUES (
        p_contact_id, v_total_trips, v_total_spend, v_last_trip,
        v_next_trip, v_destinations, v_is_leader, NOW(), v_org_id
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

GRANT EXECUTE ON FUNCTION public.recalculate_contact_stats_for(UUID) TO authenticated;

-- ============================================================
-- 2. criar_sub_card_futuro — patch pontual do INSERT problematico
--    (mantemos o resto da funcao intacto via CREATE OR REPLACE completo nao eh
--    necessario; atualizamos so a parte do sub_card_sync_log INSERT trocando
--    por versao que passa org_id do parent card).
-- ============================================================
-- A funcao original tem ~140 linhas. Em vez de recriar, criamos wrapper que
-- roda a funcao existente via trigger BEFORE INSERT em sub_card_sync_log.

CREATE OR REPLACE FUNCTION public.set_sub_card_sync_log_org_id()
RETURNS TRIGGER AS $$
DECLARE
  v_org UUID;
BEGIN
  IF NEW.org_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Tenta via sub_card (filho)
  IF NEW.sub_card_id IS NOT NULL THEN
    SELECT org_id INTO v_org FROM public.cards WHERE id = NEW.sub_card_id;
  END IF;
  -- Fallback: via parent_card
  IF v_org IS NULL AND NEW.parent_card_id IS NOT NULL THEN
    SELECT org_id INTO v_org FROM public.cards WHERE id = NEW.parent_card_id;
  END IF;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Cannot resolve org_id for sub_card_sync_log (sub_card_id=%, parent_card_id=%)',
      NEW.sub_card_id, NEW.parent_card_id;
  END IF;

  NEW.org_id := v_org;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_set_sub_card_sync_log_org_id ON public.sub_card_sync_log;
CREATE TRIGGER trg_set_sub_card_sync_log_org_id
  BEFORE INSERT ON public.sub_card_sync_log
  FOR EACH ROW EXECUTE FUNCTION public.set_sub_card_sync_log_org_id();
