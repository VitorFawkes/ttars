-- ============================================================================
-- HANDOFF COMPARTILHADO — sobe a flag de etapa pra FASE
-- Date: 2026-05-18
--
-- CONTEXTO
-- Originalmente a feature foi implementada como flag por etapa
-- (pipeline_stages.handoff_compartilhado, migration 20260518a). Decisão do
-- Vitor: a flag deve ser por FASE (pipeline_phases). Razão: o conceito
-- "passagem de bastão" é da FASE inteira (Pós-venda recebe sem dono fixo),
-- e o admin configura uma vez por fase, não etapa por etapa.
--
-- ESTRATÉGIA SEM REESCREVER FUNÇÕES
-- Em vez de recriar mover_card, skip_stage_requirements_on_compartilhado e
-- materialize_stage_entry_tasks_for_card (que olham stage.handoff_compartilhado),
-- esta migration cria triggers de propagação:
--   - pipeline_phases UPDATE → propaga flag pra todos os stages da fase
--   - pipeline_stages INSERT/UPDATE de phase_id → herda da fase pai
-- Isso mantém todo o código backend funcionando sem rebase, e a "fonte de
-- verdade" semântica passa a ser pipeline_phases.handoff_compartilhado
-- (admin escreve aqui, sistema espelha em stages automaticamente).
-- ============================================================================

BEGIN;

-- ─── 1. Nova coluna em pipeline_phases ──────────────────────────────────────
ALTER TABLE public.pipeline_phases
  ADD COLUMN IF NOT EXISTS handoff_compartilhado boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pipeline_phases.handoff_compartilhado IS
  'Quando true: cards que entram em qualquer etapa desta fase chegam sem dono fixo. Todos os membros do time da fase enxergam no Kanban. Coordenação via tarefas delegadas. Propagado automaticamente para pipeline_stages.handoff_compartilhado via trigger.';

CREATE INDEX IF NOT EXISTS idx_pipeline_phases_compartilhado
  ON public.pipeline_phases(org_id)
  WHERE handoff_compartilhado = true;

-- Reclassifica a coluna em stages como derivada/espelho
COMMENT ON COLUMN public.pipeline_stages.handoff_compartilhado IS
  'Espelho de pipeline_phases.handoff_compartilhado (sincronizado via trigger). NÃO escrever direto — alterar a flag na fase pai. Lido por mover_card, skip_stage_requirements_on_compartilhado e materialize_stage_entry_tasks_for_card.';

-- ─── 2. Sincronização inicial: phase → stages ───────────────────────────────
-- Como a coluna em phases é nova (default false), nada a sincronizar agora.
-- Mas garante consistência: stages herdam o valor da fase atual (que é false).
UPDATE public.pipeline_stages s
SET handoff_compartilhado = COALESCE(ph.handoff_compartilhado, false)
FROM public.pipeline_phases ph
WHERE s.phase_id = ph.id
  AND s.handoff_compartilhado IS DISTINCT FROM COALESCE(ph.handoff_compartilhado, false);

-- ─── 3. Trigger AFTER UPDATE em pipeline_phases ─────────────────────────────
-- Quando admin liga/desliga a flag na fase, propaga pra todos os stages dela.
CREATE OR REPLACE FUNCTION public.sync_handoff_compartilhado_phase_to_stages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.handoff_compartilhado IS DISTINCT FROM OLD.handoff_compartilhado THEN
    UPDATE public.pipeline_stages
    SET handoff_compartilhado = NEW.handoff_compartilhado
    WHERE phase_id = NEW.id
      AND handoff_compartilhado IS DISTINCT FROM NEW.handoff_compartilhado;
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_sync_handoff_phase_to_stages ON public.pipeline_phases;
CREATE TRIGGER trg_sync_handoff_phase_to_stages
  AFTER UPDATE OF handoff_compartilhado ON public.pipeline_phases
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_handoff_compartilhado_phase_to_stages();

-- ─── 4. Trigger BEFORE INSERT/UPDATE em pipeline_stages ─────────────────────
-- Quando um stage é criado/movido pra outra fase, herda o flag da fase pai.
-- Impede que admin escreva direto em stages.handoff_compartilhado divergindo
-- da fase.
CREATE OR REPLACE FUNCTION public.inherit_handoff_compartilhado_from_phase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_phase_flag boolean;
BEGIN
  IF NEW.phase_id IS NULL THEN
    NEW.handoff_compartilhado := false;
    RETURN NEW;
  END IF;

  SELECT COALESCE(handoff_compartilhado, false) INTO v_phase_flag
  FROM public.pipeline_phases
  WHERE id = NEW.phase_id;

  -- Sempre força stage = phase (não permite divergência via DML direto)
  NEW.handoff_compartilhado := COALESCE(v_phase_flag, false);
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_inherit_handoff_from_phase ON public.pipeline_stages;
CREATE TRIGGER trg_inherit_handoff_from_phase
  BEFORE INSERT OR UPDATE OF phase_id, handoff_compartilhado ON public.pipeline_stages
  FOR EACH ROW
  EXECUTE FUNCTION public.inherit_handoff_compartilhado_from_phase();

COMMIT;

-- ─── Validação ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='pipeline_phases' AND column_name='handoff_compartilhado';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'pipeline_phases.handoff_compartilhado não foi criado';
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_trigger
  WHERE tgname IN ('trg_sync_handoff_phase_to_stages', 'trg_inherit_handoff_from_phase');
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'Triggers de sincronização não foram criados (esperado 2, encontrado %)', v_count;
  END IF;

  RAISE NOTICE 'handoff_compartilhado_por_fase: ok';
END $$;
