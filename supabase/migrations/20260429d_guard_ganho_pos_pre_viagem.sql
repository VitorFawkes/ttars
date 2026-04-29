-- ============================================================================
-- MIGRATION: Guard contra ganho_pos=true em etapas pré-Pós-Viagem (Welcome Trips)
-- Date: 2026-04-29
--
-- Regra arquitetural (decisão 2026-04-27): ganho_pos só vira true após a viagem
-- realizada + NPS. No Welcome Trips, isso significa estar na etapa 05 da fase
-- Pós-venda ("Pós-viagem & Reativação"), ou em qualquer stage com is_pos_won=true.
--
-- Esta migration adiciona um trigger BEFORE INSERT OR UPDATE em cards que
-- bloqueia tentativas de setar ganho_pos=true em etapas pré-Pós-Viagem do
-- pipeline Welcome Trips. Pipelines de outros produtos (Weddings, Courses)
-- não são afetados.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_trips_ganho_pos_only_in_pos_viagem()
RETURNS TRIGGER AS $$
DECLARE
    v_is_pos_won BOOLEAN;
    v_stage_ordem INTEGER;
    v_phase_slug TEXT;
BEGIN
    -- Aplica apenas ao pipeline Welcome Trips
    IF NEW.pipeline_id <> 'c8022522-4a1d-411c-9387-efe03ca725ee' THEN
        RETURN NEW;
    END IF;

    -- Só valida se ganho_pos está sendo setado para TRUE agora
    -- (ignora INSERT/UPDATE que não muda ganho_pos ou que zera)
    IF NEW.ganho_pos IS NOT TRUE THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.ganho_pos IS TRUE AND OLD.pipeline_stage_id = NEW.pipeline_stage_id THEN
        -- Já era true e não mudou de stage → deixa passar (UPDATE de outras colunas)
        RETURN NEW;
    END IF;

    -- Lookup da etapa: aceita se for stage com is_pos_won=true OU ordem >= 5 na fase pos_venda
    SELECT s.is_pos_won, s.ordem, ph.slug
      INTO v_is_pos_won, v_stage_ordem, v_phase_slug
      FROM pipeline_stages s
      JOIN pipeline_phases ph ON ph.id = s.phase_id
     WHERE s.id = NEW.pipeline_stage_id;

    IF COALESCE(v_is_pos_won, false) IS TRUE THEN
        RETURN NEW;
    END IF;

    IF v_phase_slug = 'pos_venda' AND v_stage_ordem >= 5 THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = format(
            'ganho_pos=true não é permitido em etapas pré-Pós-Viagem (Welcome Trips). Card %s, etapa %s (fase=%s, ordem=%s). Use "Pós-viagem & Reativação".',
            NEW.id, NEW.pipeline_stage_id, COALESCE(v_phase_slug, '?'), COALESCE(v_stage_ordem::TEXT, '?')
        );
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_trips_ganho_pos_only_in_pos_viagem ON cards;

CREATE TRIGGER trg_enforce_trips_ganho_pos_only_in_pos_viagem
    BEFORE INSERT OR UPDATE OF ganho_pos, pipeline_stage_id ON cards
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_trips_ganho_pos_only_in_pos_viagem();

COMMENT ON FUNCTION public.enforce_trips_ganho_pos_only_in_pos_viagem() IS
    'Bloqueia ganho_pos=true em etapas pré-Pós-Viagem do pipeline Welcome Trips. Auditoria 2026-04-29.';

COMMIT;
