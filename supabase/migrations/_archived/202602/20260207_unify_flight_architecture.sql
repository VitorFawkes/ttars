-- ============================================================
-- FASE 7: Unificação da Arquitetura de Voos
-- ============================================================
-- Problema: Builder V4 escreve em proposal_items.rich_content.flights
--           mas proposal_flights existe separadamente (usado pelo Monde)
--           Triggers de receita somam AMBAS tabelas = duplicação
--
-- Solução:
--   1. Trigger que sincroniza proposal_items → proposal_flights
--   2. Atualizar triggers/RPCs para usar proposal_items + voos legados
--   3. proposal_flights vira "espelho" para Monde Integration
--
-- Voos LEGADOS: proposal_flights onde section_id IS NULL (inseridos antes)
-- Voos NOVOS: proposal_items.base_price (já calculado de rich_content)
-- ============================================================

-- 1. TRIGGER: Sincronizar proposal_items (flight) → proposal_flights
-- ============================================================
-- Versão corrigida para lidar com datas vazias
CREATE OR REPLACE FUNCTION sync_flight_item_to_flights()
RETURNS TRIGGER AS $$
DECLARE
    v_rich_content JSONB;
    v_flights_data JSONB;
    v_leg JSONB;
    v_option JSONB;
    v_proposal_id UUID;
    v_segment_order INT;
    v_date TEXT;
    v_departure_time TEXT;
    v_arrival_time TEXT;
    v_departure_dt TIMESTAMP;
    v_arrival_dt TIMESTAMP;
BEGIN
    IF NEW.item_type != 'flight' THEN
        RETURN NEW;
    END IF;

    SELECT p.id INTO v_proposal_id
    FROM proposal_sections ps
    JOIN proposal_versions pv ON ps.version_id = pv.id
    JOIN proposals p ON pv.proposal_id = p.id
    WHERE ps.id = NEW.section_id;

    IF v_proposal_id IS NULL THEN
        RETURN NEW;
    END IF;

    v_rich_content := NEW.rich_content;
    v_flights_data := v_rich_content->'flights';

    -- Deleta voos antigos deste section (apenas os que têm section_id)
    DELETE FROM proposal_flights
    WHERE proposal_id = v_proposal_id
      AND section_id = NEW.section_id;

    IF v_flights_data IS NOT NULL AND v_flights_data->'legs' IS NOT NULL THEN
        v_segment_order := 1;

        FOR v_leg IN SELECT * FROM jsonb_array_elements(v_flights_data->'legs')
        LOOP
            FOR v_option IN SELECT * FROM jsonb_array_elements(COALESCE(v_leg->'options', '[]'::jsonb))
            LOOP
                IF COALESCE((v_option->>'enabled')::boolean, true) THEN
                    -- Tratar datas vazias para evitar erro de conversão
                    v_date := NULLIF(TRIM(v_leg->>'date'), '');
                    v_departure_time := NULLIF(TRIM(v_option->>'departure_time'), '');
                    v_arrival_time := NULLIF(TRIM(v_option->>'arrival_time'), '');

                    v_departure_dt := NULL;
                    v_arrival_dt := NULL;

                    IF v_date IS NOT NULL AND LENGTH(v_date) >= 10 AND v_departure_time IS NOT NULL AND LENGTH(v_departure_time) >= 4 THEN
                        BEGIN
                            v_departure_dt := (v_date || 'T' || v_departure_time)::timestamp;
                        EXCEPTION WHEN OTHERS THEN
                            v_departure_dt := NULL;
                        END;
                    END IF;

                    IF v_date IS NOT NULL AND LENGTH(v_date) >= 10 AND v_arrival_time IS NOT NULL AND LENGTH(v_arrival_time) >= 4 THEN
                        BEGIN
                            v_arrival_dt := (v_date || 'T' || v_arrival_time)::timestamp;
                        EXCEPTION WHEN OTHERS THEN
                            v_arrival_dt := NULL;
                        END;
                    END IF;

                    INSERT INTO proposal_flights (
                        proposal_id, section_id, trip_leg, segment_order,
                        origin_airport, origin_city, destination_airport, destination_city,
                        airline_code, airline_name, flight_number,
                        departure_datetime, arrival_datetime,
                        cabin_class, baggage_included,
                        price_per_person, price_total, currency,
                        is_recommended, supplier_cost, ordem
                    ) VALUES (
                        v_proposal_id, NEW.section_id,
                        COALESCE(v_leg->>'leg_type', 'outbound'),
                        v_segment_order,
                        COALESCE(v_leg->>'origin_code', ''),
                        COALESCE(v_leg->>'origin_city', ''),
                        COALESCE(v_leg->>'destination_code', ''),
                        COALESCE(v_leg->>'destination_city', ''),
                        COALESCE(v_option->>'airline_code', ''),
                        COALESCE(v_option->>'airline_name', ''),
                        COALESCE(v_option->>'flight_number', ''),
                        v_departure_dt,
                        v_arrival_dt,
                        COALESCE(v_option->>'cabin_class', 'economy'),
                        COALESCE(v_option->>'baggage', ''),
                        COALESCE((v_option->>'price')::numeric, 0),
                        COALESCE((v_option->>'price')::numeric, 0),
                        COALESCE(v_option->>'currency', 'BRL'),
                        COALESCE((v_option->>'is_recommended')::boolean, false),
                        COALESCE(NEW.supplier_cost, 0),
                        v_segment_order
                    );
                    v_segment_order := v_segment_order + 1;
                END IF;
            END LOOP;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger em proposal_items
DROP TRIGGER IF EXISTS trg_sync_flight_items ON proposal_items;
CREATE TRIGGER trg_sync_flight_items
    AFTER INSERT OR UPDATE ON proposal_items
    FOR EACH ROW
    WHEN (NEW.item_type = 'flight')
    EXECUTE FUNCTION sync_flight_item_to_flights();


-- 2. ATUALIZAR TRIGGER: sync_proposal_revenue_to_card
-- ============================================================
-- Soma proposal_items + voos LEGADOS (section_id IS NULL)
-- Voos com section_id preenchido já estão em proposal_items.base_price
CREATE OR REPLACE FUNCTION sync_proposal_revenue_to_card()
RETURNS TRIGGER AS $$
DECLARE
    v_card_id UUID;
    v_version_id UUID;
    v_total_faturamento NUMERIC;
    v_total_custo NUMERIC;
    v_total_receita NUMERIC;
    v_flights_legados_faturamento NUMERIC;
    v_flights_legados_custo NUMERIC;
BEGIN
    IF NEW.status = 'accepted' AND (OLD.status IS NULL OR OLD.status != 'accepted') THEN
        v_card_id := NEW.card_id;
        v_version_id := COALESCE(NEW.accepted_version_id, NEW.active_version_id);

        -- Calcular de proposal_items (inclui voos com base_price calculado)
        SELECT
            COALESCE(SUM(pi.base_price), 0),
            COALESCE(SUM(pi.supplier_cost), 0)
        INTO v_total_faturamento, v_total_custo
        FROM proposal_items pi
        JOIN proposal_sections ps ON pi.section_id = ps.id
        WHERE ps.version_id = v_version_id;

        -- Somar voos LEGADOS (section_id IS NULL = inseridos antes do trigger)
        -- Não soma voos com section_id preenchido (já contabilizados em proposal_items)
        SELECT
            COALESCE(SUM(pf.price_total), 0),
            COALESCE(SUM(pf.supplier_cost), 0)
        INTO v_flights_legados_faturamento, v_flights_legados_custo
        FROM proposal_flights pf
        WHERE pf.proposal_id = NEW.id
          AND pf.section_id IS NULL;

        v_total_faturamento := v_total_faturamento + v_flights_legados_faturamento;
        v_total_custo := v_total_custo + v_flights_legados_custo;
        v_total_receita := v_total_faturamento - v_total_custo;

        UPDATE cards
        SET
            valor_final = v_total_faturamento,
            receita = CASE
                WHEN receita_source = 'manual' THEN receita
                ELSE v_total_receita
            END,
            receita_source = CASE
                WHEN receita_source = 'manual' THEN 'manual'
                ELSE 'calculated'
            END,
            updated_at = NOW()
        WHERE id = v_card_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- 3. ATUALIZAR RPC: recalcular_receita_card
-- ============================================================
-- Soma proposal_items + voos LEGADOS
CREATE OR REPLACE FUNCTION recalcular_receita_card(p_card_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_proposal RECORD;
    v_version_id UUID;
    v_total_faturamento NUMERIC;
    v_total_custo NUMERIC;
    v_total_receita NUMERIC;
    v_margem_percent NUMERIC;
    v_flights_legados_faturamento NUMERIC;
    v_flights_legados_custo NUMERIC;
BEGIN
    -- Busca proposta aceita mais recente
    SELECT p.id, p.accepted_version_id, p.active_version_id
    INTO v_proposal
    FROM proposals p
    WHERE p.card_id = p_card_id AND p.status = 'accepted'
    ORDER BY p.accepted_at DESC
    LIMIT 1;

    IF v_proposal IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nenhuma proposta aceita');
    END IF;

    v_version_id := COALESCE(v_proposal.accepted_version_id, v_proposal.active_version_id);

    -- Calcular de proposal_items
    SELECT
        COALESCE(SUM(pi.base_price), 0),
        COALESCE(SUM(pi.supplier_cost), 0)
    INTO v_total_faturamento, v_total_custo
    FROM proposal_items pi
    JOIN proposal_sections ps ON pi.section_id = ps.id
    WHERE ps.version_id = v_version_id;

    -- Somar voos LEGADOS (section_id IS NULL)
    SELECT
        COALESCE(SUM(pf.price_total), 0),
        COALESCE(SUM(pf.supplier_cost), 0)
    INTO v_flights_legados_faturamento, v_flights_legados_custo
    FROM proposal_flights pf
    WHERE pf.proposal_id = v_proposal.id
      AND pf.section_id IS NULL;

    v_total_faturamento := v_total_faturamento + v_flights_legados_faturamento;
    v_total_custo := v_total_custo + v_flights_legados_custo;
    v_total_receita := v_total_faturamento - v_total_custo;

    v_margem_percent := CASE
        WHEN v_total_faturamento > 0 THEN ROUND((v_total_receita / v_total_faturamento) * 100, 2)
        ELSE 0
    END;

    UPDATE cards
    SET
        valor_final = v_total_faturamento,
        receita = v_total_receita,
        receita_source = 'calculated',
        updated_at = NOW()
    WHERE id = p_card_id;

    RETURN jsonb_build_object(
        'success', true,
        'valor_final', v_total_faturamento,
        'faturamento', v_total_faturamento,
        'custo', v_total_custo,
        'receita', v_total_receita,
        'margem_percent', v_margem_percent
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. FUNÇÃO AUXILIAR: Calcular base_price de voos
-- ============================================================
CREATE OR REPLACE FUNCTION calculate_flight_base_price(p_rich_content JSONB)
RETURNS NUMERIC AS $$
DECLARE
    v_total NUMERIC := 0;
    v_leg JSONB;
    v_options JSONB;
    v_recommended JSONB;
    v_first_option JSONB;
    v_price NUMERIC;
BEGIN
    IF p_rich_content IS NULL OR p_rich_content->'flights' IS NULL THEN
        RETURN 0;
    END IF;

    FOR v_leg IN SELECT * FROM jsonb_array_elements(p_rich_content->'flights'->'legs')
    LOOP
        v_options := v_leg->'options';
        IF v_options IS NOT NULL AND jsonb_array_length(v_options) > 0 THEN
            SELECT opt INTO v_recommended
            FROM jsonb_array_elements(v_options) opt
            WHERE (opt->>'is_recommended')::boolean = true
            LIMIT 1;

            IF v_recommended IS NULL THEN
                v_first_option := v_options->0;
                v_price := COALESCE((v_first_option->>'price')::numeric, 0);
            ELSE
                v_price := COALESCE((v_recommended->>'price')::numeric, 0);
            END IF;

            v_total := v_total + v_price;
        END IF;
    END LOOP;

    RETURN v_total;
END;
$$ LANGUAGE plpgsql;


-- 5. COMENTÁRIO: Arquitetura Final
-- ============================================================
--
-- FLUXO UNIFICADO:
--
-- [FlightEditor / FlightImageExtractor]
--       ↓
-- proposal_items (item_type='flight', rich_content.flights)
--       ↓
-- [TRIGGER sync_flight_item_to_flights]
--       ↓
-- proposal_flights (espelho para Monde, section_id preenchido)
--       ↓
-- [Monde pode criar vendas com proposal_flight_id]
--
-- RECEITA (evita duplicação):
-- - proposal_items.base_price (voos já calculados)
-- - proposal_flights onde section_id IS NULL (legados)
-- - Voos com section_id preenchido NÃO são somados (espelho)
--
