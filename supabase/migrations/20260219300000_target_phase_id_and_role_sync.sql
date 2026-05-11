-- Migration: Times como Fonte da Verdade para Secao do Pipeline
--
-- Mudancas:
-- M1. Adiciona pipeline_stages.target_phase_id (UUID FK) — substitui target_role para handoff
-- M2. Cria trigger sync_role_from_team — mantem profiles.role consistente com time
-- M3. Torna tipo_responsavel nullable — campo deprecated, nao precisa mais de valor fake

-- =============================================================================
-- M1. Nova coluna target_phase_id com backfill
-- =============================================================================

ALTER TABLE pipeline_stages
    ADD COLUMN IF NOT EXISTS target_phase_id UUID REFERENCES pipeline_phases(id);

-- Backfill: mapear target_role (string) para target_phase_id (UUID FK)
-- sdr → fase com slug 'sdr'
-- vendas → fase com slug 'planner' (a dualidade vendas/planner e resolvida aqui)
-- pos_venda → fase com slug 'pos_venda'
-- concierge/financeiro → NULL (fail-open: modal mostra todos os usuarios)
UPDATE pipeline_stages ps
SET target_phase_id = pp.id
FROM pipeline_phases pp
WHERE pp.slug = CASE ps.target_role
    WHEN 'sdr' THEN 'sdr'
    WHEN 'vendas' THEN 'planner'
    WHEN 'pos_venda' THEN 'pos_venda'
    ELSE NULL
  END
  AND ps.target_role IS NOT NULL
  AND ps.target_phase_id IS NULL;

COMMENT ON COLUMN pipeline_stages.target_role IS
    '@deprecated Usar target_phase_id FK. Mantido para backward compat.';

COMMENT ON COLUMN pipeline_stages.target_phase_id IS
    'FK para pipeline_phases. Define qual fase deve ser dona do card ao entrar neste stage. NULL = sem requisito de handoff.';

-- =============================================================================
-- M2. Trigger de sync: profiles.role <- teams.phase_id
-- Garante que profiles.role (legacy) permanece consistente com o time do usuario.
-- Necessario porque:
-- - Funcoes WhatsApp leem profiles.role para v_sender_role
-- - RLS em destinations checa role IN ('vendas', 'concierge')
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sync_role_from_team()
RETURNS trigger AS $$
DECLARE
    v_phase_slug TEXT;
BEGIN
    -- Apenas executar quando team_id realmente muda
    IF NEW.team_id IS NOT NULL AND (OLD.team_id IS DISTINCT FROM NEW.team_id) THEN
        SELECT pp.slug INTO v_phase_slug
        FROM public.teams t
        JOIN public.pipeline_phases pp ON t.phase_id = pp.id
        WHERE t.id = NEW.team_id;

        -- Mapear phase slug para app_role legacy
        IF v_phase_slug IS NOT NULL THEN
            NEW.role := CASE v_phase_slug
                WHEN 'sdr' THEN 'sdr'::public.app_role
                WHEN 'planner' THEN 'vendas'::public.app_role
                WHEN 'pos_venda' THEN 'pos_venda'::public.app_role
                ELSE NEW.role  -- Fase sem mapeamento (ex: resolucao) — manter role atual
            END;
        END IF;
        -- Se time sem phase_id, manter role atual (nao limpar)
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Dropar trigger se ja existir (idempotente)
DROP TRIGGER IF EXISTS trg_sync_role_from_team ON public.profiles;

CREATE TRIGGER trg_sync_role_from_team
    BEFORE UPDATE OF team_id ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_role_from_team();

-- =============================================================================
-- M3. Tornar tipo_responsavel nullable
-- Campo deprecated (comentario em StudioStructure.tsx) mas tinha NOT NULL constraint
-- =============================================================================

ALTER TABLE pipeline_stages ALTER COLUMN tipo_responsavel DROP NOT NULL;

-- =============================================================================
-- M4. Garantir is_admin=true para todos com role='admin' ou 'gestor'
-- Prerequisito para simplificar checks de admin no frontend
-- =============================================================================

UPDATE profiles
SET is_admin = true
WHERE role IN ('admin', 'gestor') AND (is_admin IS NULL OR is_admin = false);
