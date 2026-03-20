-- ============================================================================
-- TRIGGER: Guarda de dono em mudanças cross-phase
--
-- Problema: 5+ caminhos movem cards entre fases sem atualizar dono_atual_id
-- (auto-advance, cadence engine, mover_card RPC, bulk move, integrations)
--
-- Solução: BEFORE UPDATE trigger que detecta mudança de fase e auto-corrige
-- o dono_atual_id para o owner correto da fase destino.
--
-- Lógica:
--   1. Se caller JÁ mudou dono_atual_id → respeitar, sincronizar role-specific
--   2. Se dono pertence a time da fase destino → manter (frontend 2-step pattern)
--   3. Senão → auto-corrigir com role-specific owner (vendas_owner_id etc.)
--   4. Se role-specific é NULL → fail-open (não bloquear)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_card_owner_phase_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_src_phase_id  UUID;
    v_dst_phase_id  UUID;
    v_dst_slug      TEXT;
    v_role_owner    UUID;
    v_dono_in_phase BOOLEAN;
BEGIN
    -- Só atua quando pipeline_stage_id realmente mudou
    IF OLD.pipeline_stage_id IS NOT DISTINCT FROM NEW.pipeline_stage_id THEN
        RETURN NEW;
    END IF;

    -- Buscar phase_id da etapa origem e destino
    SELECT s.phase_id INTO v_src_phase_id
    FROM pipeline_stages s WHERE s.id = OLD.pipeline_stage_id;

    SELECT s.phase_id INTO v_dst_phase_id
    FROM pipeline_stages s WHERE s.id = NEW.pipeline_stage_id;

    -- Se mesma fase ou fase não encontrada → sair
    IF v_src_phase_id IS NOT DISTINCT FROM v_dst_phase_id THEN
        RETURN NEW;
    END IF;

    -- Buscar slug da fase destino
    SELECT pp.slug INTO v_dst_slug
    FROM pipeline_phases pp WHERE pp.id = v_dst_phase_id;

    -- Fase de resolução (perdido/ganho) não muda dono
    IF v_dst_slug = 'resolucao' OR v_dst_slug IS NULL THEN
        RETURN NEW;
    END IF;

    -- Determinar o role-specific owner para a fase destino
    v_role_owner := CASE v_dst_slug
        WHEN 'sdr'       THEN NEW.sdr_owner_id
        WHEN 'planner'   THEN NEW.vendas_owner_id
        WHEN 'pos_venda' THEN NEW.pos_owner_id
        ELSE NULL
    END;

    -- ─── CASO 1: Caller JÁ mudou dono_atual_id neste statement ───
    IF NEW.dono_atual_id IS DISTINCT FROM OLD.dono_atual_id THEN
        -- Respeitar a escolha do caller. Sincronizar o campo role-specific.
        CASE v_dst_slug
            WHEN 'sdr'       THEN NEW.sdr_owner_id       := NEW.dono_atual_id;
            WHEN 'planner'   THEN NEW.vendas_owner_id     := NEW.dono_atual_id;
            WHEN 'pos_venda' THEN NEW.pos_owner_id        := NEW.dono_atual_id;
            ELSE NULL; -- slug desconhecido, não sincronizar
        END CASE;
        RETURN NEW;
    END IF;

    -- ─── CASO 2: dono_atual_id NÃO mudou — verificar se já pertence à fase ───
    -- (Pattern do frontend: 1º UPDATE seta dono, 2º UPDATE muda stage)
    SELECT EXISTS(
        SELECT 1 FROM profiles p
        JOIN teams t ON t.id = p.team_id
        WHERE p.id = NEW.dono_atual_id
          AND t.phase_id = v_dst_phase_id
    ) INTO v_dono_in_phase;

    IF v_dono_in_phase THEN
        -- Dono já pertence à fase destino. Sincronizar role-specific.
        CASE v_dst_slug
            WHEN 'sdr'       THEN NEW.sdr_owner_id       := NEW.dono_atual_id;
            WHEN 'planner'   THEN NEW.vendas_owner_id     := NEW.dono_atual_id;
            WHEN 'pos_venda' THEN NEW.pos_owner_id        := NEW.dono_atual_id;
            ELSE NULL;
        END CASE;
        RETURN NEW;
    END IF;

    -- ─── CASO 3: Dono NÃO pertence à fase destino — auto-corrigir ───
    IF v_role_owner IS NOT NULL THEN
        NEW.dono_atual_id := v_role_owner;
        -- role-specific já está correto (é a fonte)
        RETURN NEW;
    END IF;

    -- ─── CASO 4: Fail-open — sem role-specific owner, manter dono atual ───
    RETURN NEW;
END;
$fn$;

-- Dropar trigger se já existir (idempotente)
DROP TRIGGER IF EXISTS trigger_card_owner_phase_guard ON cards;

CREATE TRIGGER trigger_card_owner_phase_guard
    BEFORE UPDATE OF pipeline_stage_id
    ON cards
    FOR EACH ROW
    EXECUTE FUNCTION handle_card_owner_phase_guard();

COMMENT ON FUNCTION handle_card_owner_phase_guard IS
    'Auto-corrige dono_atual_id quando card muda de fase. Cobre todos os paths: RPC, triggers, edge functions, integrations.';
