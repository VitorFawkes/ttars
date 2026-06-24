-- Prazo de Planejamento CONFIGURÁVEL por workspace (Welcome Weddings) — F1.
-- O "relógio de 45 dias" deixa de ser literal no código: vira um número editável
-- por workspace (default) + override por casamento (cards.produto_data).
--
-- Clone fiel de pipeline_governance_settings (20260512c): tabela por-pipeline,
-- RLS por org, seed dos pipelines WEDDING existentes + auto-seed em novos.
-- O default NÃO vai em organization_settings (tabela GLOBAL, key UNIQUE sem
-- org_id — colidiria entre Trips/Weddings/Courses).
--
-- Pareia com 20260623f (carimba ww_planej_pos_venda_em na ENTRADA = início do
-- relógio, D-P5) e com o frontend (useWeddingPlanningPrazo).

BEGIN;

-- ─── 1. Tabela wedding_planning_settings ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wedding_planning_settings (
    pipeline_id UUID PRIMARY KEY REFERENCES public.pipelines(id) ON DELETE CASCADE,
    org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    prazo_dias  INTEGER NOT NULL DEFAULT 45 CHECK (prazo_dias BETWEEN 1 AND 365),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wps_org_id ON public.wedding_planning_settings(org_id);

ALTER TABLE public.wedding_planning_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wps_org_all ON public.wedding_planning_settings;
CREATE POLICY wps_org_all ON public.wedding_planning_settings TO authenticated
    USING (org_id = requesting_org_id())
    WITH CHECK (org_id = requesting_org_id());

DROP POLICY IF EXISTS wps_service_all ON public.wedding_planning_settings;
CREATE POLICY wps_service_all ON public.wedding_planning_settings TO service_role
    USING (TRUE) WITH CHECK (TRUE);

COMMENT ON TABLE public.wedding_planning_settings IS
    'Prazo-alvo do Planejamento (dias) por pipeline WEDDING — default por workspace. Override por casamento em cards.produto_data.ww_planej_prazo_dias. Início do relógio = produto_data.ww_planej_pos_venda_em (entrada no planejamento). Clone de pipeline_governance_settings.';

-- ─── 2. org_id carimbado a partir do pipeline (frontend pode omitir) ─────────
CREATE OR REPLACE FUNCTION public.wedding_planning_settings_strict_org()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  SELECT p.org_id INTO NEW.org_id FROM public.pipelines p WHERE p.id = NEW.pipeline_id;
  IF NEW.org_id IS NULL THEN
    RAISE EXCEPTION 'wedding_planning_settings: pipeline % sem org_id', NEW.pipeline_id;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_wps_strict_org ON public.wedding_planning_settings;
CREATE TRIGGER trg_wps_strict_org
  BEFORE INSERT OR UPDATE OF pipeline_id ON public.wedding_planning_settings
  FOR EACH ROW EXECUTE FUNCTION public.wedding_planning_settings_strict_org();

-- ─── 3. updated_at automático ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_wps_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END;
$fn$;

DROP TRIGGER IF EXISTS trg_wps_updated_at ON public.wedding_planning_settings;
CREATE TRIGGER trg_wps_updated_at
  BEFORE UPDATE ON public.wedding_planning_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_wps_updated_at();

-- ─── 4. Seed dos pipelines WEDDING existentes (default 45) ───────────────────
INSERT INTO public.wedding_planning_settings (pipeline_id, org_id, prazo_dias)
SELECT p.id, p.org_id, 45
  FROM public.pipelines p
 WHERE p.produto::TEXT = 'WEDDING'
ON CONFLICT (pipeline_id) DO NOTHING;

-- ─── 5. Auto-seed em pipelines WEDDING novos (sem rebase de provision_workspace) ─
CREATE OR REPLACE FUNCTION public.auto_seed_wedding_planning_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.produto::TEXT = 'WEDDING' THEN
    INSERT INTO public.wedding_planning_settings (pipeline_id, org_id, prazo_dias)
    VALUES (NEW.id, NEW.org_id, 45)
    ON CONFLICT (pipeline_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_pipelines_auto_wedding_planning_seed ON public.pipelines;
CREATE TRIGGER trg_pipelines_auto_wedding_planning_seed
  AFTER INSERT ON public.pipelines
  FOR EACH ROW EXECUTE FUNCTION public.auto_seed_wedding_planning_settings();

COMMIT;

-- ─── Validação ──────────────────────────────────────────────────────────────
DO $$
DECLARE v_rows INT;
BEGIN
  SELECT count(*) INTO v_rows
    FROM public.wedding_planning_settings wps
    JOIN public.pipelines p ON p.id = wps.pipeline_id
   WHERE p.produto::TEXT = 'WEDDING';
  IF v_rows < 1 THEN
    RAISE EXCEPTION 'wedding_planning_settings: nenhum pipeline WEDDING semeado (achei %)', v_rows;
  END IF;
  RAISE NOTICE 'wedding_planning_settings: OK (% pipeline(s) WEDDING)', v_rows;
END $$;
