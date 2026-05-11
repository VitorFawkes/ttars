-- ============================================================
-- Fix: Trigger sync_role_from_team deve rodar em INSERT + UPDATE
--
-- Problema: O trigger original só rodava em UPDATE OF team_id.
-- Profiles criados com team_id direto (ou setados antes do trigger existir)
-- ficaram com role desyncado.
--
-- Também faz backfill de roles desyncados encontrados.
-- ============================================================

BEGIN;

-- 1. Recriar função com suporte a INSERT (OLD pode ser NULL)
CREATE OR REPLACE FUNCTION public.sync_role_from_team()
RETURNS trigger AS $$
DECLARE
    v_phase_slug TEXT;
BEGIN
    -- Em INSERT: sempre sincronizar se tem team_id
    -- Em UPDATE: só sincronizar se team_id mudou
    IF NEW.team_id IS NOT NULL
       AND (TG_OP = 'INSERT' OR OLD.team_id IS DISTINCT FROM NEW.team_id)
    THEN
        SELECT pp.slug INTO v_phase_slug
        FROM public.teams t
        JOIN public.pipeline_phases pp ON t.phase_id = pp.id
        WHERE t.id = NEW.team_id;

        IF v_phase_slug IS NOT NULL THEN
            NEW.role := CASE v_phase_slug
                WHEN 'sdr' THEN 'sdr'::public.app_role
                WHEN 'planner' THEN 'vendas'::public.app_role
                WHEN 'pos_venda' THEN 'pos_venda'::public.app_role
                ELSE NEW.role
            END;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Recriar trigger para INSERT + UPDATE
DROP TRIGGER IF EXISTS trg_sync_role_from_team ON public.profiles;

CREATE TRIGGER trg_sync_role_from_team
    BEFORE INSERT OR UPDATE OF team_id ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_role_from_team();

-- 3. Backfill: corrigir Julia Jardim (sdr) e qualquer outro desync
UPDATE profiles p
SET role = CASE pp.slug
    WHEN 'sdr' THEN 'sdr'::public.app_role
    WHEN 'planner' THEN 'vendas'::public.app_role
    WHEN 'pos_venda' THEN 'pos_venda'::public.app_role
END
FROM teams t
JOIN pipeline_phases pp ON t.phase_id = pp.id
WHERE p.team_id = t.id
  AND pp.slug IN ('sdr', 'planner', 'pos_venda')
  AND p.role != CASE pp.slug
    WHEN 'sdr' THEN 'sdr'::public.app_role
    WHEN 'planner' THEN 'vendas'::public.app_role
    WHEN 'pos_venda' THEN 'pos_venda'::public.app_role
  END;

COMMIT;
