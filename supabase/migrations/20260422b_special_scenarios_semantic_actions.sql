-- ============================================================================
-- Migration: ai_agent_special_scenarios — trigger_description + auto actions
-- ============================================================================
-- Frente B: trigger_description — regra em linguagem natural que complementa
-- trigger_config.keywords. Runtime passa a avaliar semanticamente (via LLM)
-- em vez de depender só de match literal de substring.
--
-- Frente C: colunas estruturadas de ações automáticas. Runtime passa a executar
-- apply_tag / stage_transition / notify deterministicamente após detectar
-- match, em vez de depender do LLM chamar ferramenta no meio da resposta.
-- ============================================================================

ALTER TABLE public.ai_agent_special_scenarios
  ADD COLUMN IF NOT EXISTS trigger_description TEXT,
  ADD COLUMN IF NOT EXISTS auto_transition_stage_id UUID REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_notify_responsible BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.ai_agent_special_scenarios.trigger_description IS
'Regra em linguagem natural para match semântico (ex: "quando o casal menciona família, pais ou sogros ajudando a pagar"). Complementa trigger_config.keywords (match literal). Se preenchida, runtime injeta no prompt como critério semântico. Nullable para retrocompat.';

COMMENT ON COLUMN public.ai_agent_special_scenarios.auto_transition_stage_id IS
'Etapa para onde o card é movido automaticamente quando o cenário dispara. Runtime aplica deterministicamente (não depende do LLM). NULL = não muda etapa.';

COMMENT ON COLUMN public.ai_agent_special_scenarios.auto_notify_responsible IS
'Se TRUE, runtime cria notificação para o responsável do card quando o cenário dispara.';

-- Garantir que auto_transition_stage_id aponte para stage da mesma org
-- (prevenção de FK cross-org — ver CLAUDE.md §FK cross-org = bomba)
CREATE OR REPLACE FUNCTION public.enforce_scenario_stage_same_org()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent_org_id UUID;
  v_stage_org_id UUID;
BEGIN
  IF NEW.auto_transition_stage_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT org_id INTO v_agent_org_id FROM ai_agents WHERE id = NEW.agent_id;
  SELECT pip.org_id INTO v_stage_org_id
    FROM pipeline_stages s
    JOIN pipelines pip ON pip.id = s.pipeline_id
    WHERE s.id = NEW.auto_transition_stage_id;

  IF v_stage_org_id IS DISTINCT FROM v_agent_org_id THEN
    RAISE EXCEPTION 'auto_transition_stage_id pertence a outra org (% vs %)',
      v_stage_org_id, v_agent_org_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_scenario_stage_same_org ON public.ai_agent_special_scenarios;
CREATE TRIGGER trg_scenario_stage_same_org
  BEFORE INSERT OR UPDATE OF auto_transition_stage_id, agent_id
  ON public.ai_agent_special_scenarios
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_scenario_stage_same_org();
