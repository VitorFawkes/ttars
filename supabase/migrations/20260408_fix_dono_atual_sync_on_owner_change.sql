-- ============================================================================
-- FIX: Sincronizar dono_atual_id quando role-specific owner muda
--
-- Problema: ao trocar vendas_owner_id (ou sdr/pos) SEM mudar de etapa,
-- o trigger handle_card_owner_phase_guard não dispara (só atua em mudança
-- de pipeline_stage_id). Resultado: dono_atual_id fica stale.
--
-- Solução:
--   1. Backfill dos 5 cards afetados na fase Planner
--   2. Trigger BEFORE UPDATE que detecta mudança em role-specific owner
--      e sincroniza dono_atual_id se o card está na fase correspondente
-- ============================================================================

-- ─── PASSO 1: Backfill dos cards inconsistentes ───

UPDATE cards c
SET dono_atual_id = c.vendas_owner_id
FROM pipeline_stages s
JOIN pipeline_phases pp ON pp.id = s.phase_id
WHERE c.pipeline_stage_id = s.id
  AND pp.slug = 'planner'
  AND c.vendas_owner_id IS NOT NULL
  AND c.dono_atual_id IS DISTINCT FROM c.vendas_owner_id
  AND c.status_comercial = 'aberto';

-- ─── PASSO 2: Trigger para manter sincronia futura ───

CREATE OR REPLACE FUNCTION public.handle_sync_dono_on_owner_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_phase_slug TEXT;
BEGIN
    -- Só atua quando um role-specific owner mudou
    IF OLD.sdr_owner_id IS NOT DISTINCT FROM NEW.sdr_owner_id
       AND OLD.vendas_owner_id IS NOT DISTINCT FROM NEW.vendas_owner_id
       AND OLD.pos_owner_id IS NOT DISTINCT FROM NEW.pos_owner_id
    THEN
        RETURN NEW;
    END IF;

    -- Se dono_atual_id já foi mudado neste statement, respeitar (caller sabe o que faz)
    IF NEW.dono_atual_id IS DISTINCT FROM OLD.dono_atual_id THEN
        RETURN NEW;
    END IF;

    -- Buscar fase atual do card
    SELECT pp.slug INTO v_phase_slug
    FROM pipeline_stages s
    JOIN pipeline_phases pp ON pp.id = s.phase_id
    WHERE s.id = NEW.pipeline_stage_id;

    -- Sincronizar dono_atual_id com o owner da fase atual
    CASE v_phase_slug
        WHEN 'sdr' THEN
            IF OLD.sdr_owner_id IS DISTINCT FROM NEW.sdr_owner_id AND NEW.sdr_owner_id IS NOT NULL THEN
                NEW.dono_atual_id := NEW.sdr_owner_id;
            END IF;
        WHEN 'planner' THEN
            IF OLD.vendas_owner_id IS DISTINCT FROM NEW.vendas_owner_id AND NEW.vendas_owner_id IS NOT NULL THEN
                NEW.dono_atual_id := NEW.vendas_owner_id;
            END IF;
        WHEN 'pos_venda' THEN
            IF OLD.pos_owner_id IS DISTINCT FROM NEW.pos_owner_id AND NEW.pos_owner_id IS NOT NULL THEN
                NEW.dono_atual_id := NEW.pos_owner_id;
            END IF;
        ELSE
            NULL;
    END CASE;

    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trigger_sync_dono_on_owner_change ON cards;

CREATE TRIGGER trigger_sync_dono_on_owner_change
    BEFORE UPDATE OF sdr_owner_id, vendas_owner_id, pos_owner_id
    ON cards
    FOR EACH ROW
    EXECUTE FUNCTION handle_sync_dono_on_owner_change();

COMMENT ON FUNCTION handle_sync_dono_on_owner_change IS
    'Sincroniza dono_atual_id quando role-specific owner muda sem mudança de etapa. Complementa handle_card_owner_phase_guard.';
