-- ============================================================================
-- INVARIANTE: dono_atual_id DEVE bater com role-specific owner da fase atual
--
-- Regra: quando o card está em fase SDR/Planner/Pós-venda, o dono_atual é SEMPRE
-- o owner daquela fase (sdr_owner_id / vendas_owner_id / pos_owner_id). Se o
-- role-specific existir, ele é a fonte da verdade.
--
-- Contexto: triggers anteriores (handle_card_owner_phase_guard e
-- handle_sync_dono_on_owner_change) têm uma cláusula "respeitar caller" que
-- permite UPDATEs passarem dono_atual_id dessincronizado. Uma integração (AC
-- webhook) estava explorando isso ao sobrescrever dono_atual_id com owner
-- calculado a partir de um estágio antigo. Resultado: cards apareciam na
-- "Minha Fila" da pessoa errada.
--
-- Solução: trigger BEFORE UPDATE que roda POR ÚLTIMO (nome alfabeticamente
-- maior) e ENFORCA a invariante, sobrescrevendo qualquer valor divergente.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_dono_phase_owner_invariant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_phase_slug TEXT;
    v_role_owner UUID;
BEGIN
    -- Buscar slug da fase atual
    SELECT pp.slug INTO v_phase_slug
    FROM pipeline_stages s
    JOIN pipeline_phases pp ON pp.id = s.phase_id
    WHERE s.id = NEW.pipeline_stage_id;

    -- Determinar role-specific owner esperado para a fase
    v_role_owner := CASE v_phase_slug
        WHEN 'sdr'       THEN NEW.sdr_owner_id
        WHEN 'planner'   THEN NEW.vendas_owner_id
        WHEN 'pos_venda' THEN NEW.pos_owner_id
        ELSE NULL
    END;

    -- Se fase é sdr/planner/pos_venda E role-specific está preenchido E dono
    -- está divergente → forçar invariante.
    -- Fases sem owner canônico (entrega, resolucao, concierge) mantêm caller.
    IF v_role_owner IS NOT NULL AND NEW.dono_atual_id IS DISTINCT FROM v_role_owner THEN
        NEW.dono_atual_id := v_role_owner;
    END IF;

    RETURN NEW;
END;
$fn$;

-- Drop se já existe (idempotente)
DROP TRIGGER IF EXISTS zz_enforce_dono_phase_owner ON cards;

-- Nome com prefixo 'zz_' garante execução ALFABÉTICAMENTE DEPOIS dos outros
-- triggers BEFORE UPDATE (trigger_card_owner_phase_guard,
-- trigger_sync_dono_on_owner_change). Último a rodar → palavra final.
CREATE TRIGGER zz_enforce_dono_phase_owner
    BEFORE INSERT OR UPDATE OF
        dono_atual_id,
        sdr_owner_id,
        vendas_owner_id,
        pos_owner_id,
        pipeline_stage_id
    ON cards
    FOR EACH ROW
    EXECUTE FUNCTION enforce_dono_phase_owner_invariant();

COMMENT ON FUNCTION enforce_dono_phase_owner_invariant IS
    'Enforca invariante: dono_atual_id = role-specific owner quando fase é sdr/planner/pos_venda. Defesa final contra callers que tentam dessincronizar (ex: AC webhook).';
