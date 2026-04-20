-- Sprint C — Paridade UI↔REST + validação cross-org em cadence_event_triggers
--
-- Contexto: CLAUDE.md seção "FK cross-org = bomba" — RLS isola leitura/escrita
-- por org_id, mas não impede que uma linha aponte para outra linha em outra
-- org. Se acontece, vira 406 na UI porque RLS esconde a referência na hora de
-- carregar (ex: trigger de Trips apontando para template de Weddings → quando
-- a UI tenta buscar o template, não aparece, UX quebra).
--
-- cadence_steps (filho de cadence_templates) já tem essa proteção via
-- 20260414_h3_029_cadence_steps_strict_template_org.sql. Esta migration
-- estende o mesmo padrão para cadence_event_triggers — a outra porta de
-- entrada para automações.
--
-- Pré-voo confirmou 0 órfãos cross-org hoje em prod.

BEGIN;

CREATE OR REPLACE FUNCTION public.cadence_event_triggers_enforce_same_org()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_tpl_org UUID;
  v_stage_pipeline_org UUID;
  v_tag_org UUID;
  v_bad_pipeline_id UUID;
  v_bad_user_id UUID;
BEGIN
  -- 1) start_cadence → target_template_id precisa ser da mesma org.
  IF NEW.action_type = 'start_cadence' AND NEW.target_template_id IS NOT NULL THEN
    SELECT org_id INTO v_tpl_org
    FROM public.cadence_templates
    WHERE id = NEW.target_template_id;

    IF v_tpl_org IS NULL THEN
      RAISE EXCEPTION 'target_template_id % não existe em cadence_templates', NEW.target_template_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_tpl_org IS DISTINCT FROM NEW.org_id THEN
      RAISE EXCEPTION 'target_template_id pertence a outra empresa (%). Escolha uma cadência da empresa atual (%).', v_tpl_org, NEW.org_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- 2) change_stage → action_config.target_stage_id precisa apontar para um
  -- stage cujo pipeline é da mesma org.
  IF NEW.action_type = 'change_stage'
     AND NEW.action_config ? 'target_stage_id'
     AND COALESCE(NULLIF(TRIM(NEW.action_config->>'target_stage_id'), ''), NULL) IS NOT NULL THEN
    SELECT p.org_id INTO v_stage_pipeline_org
    FROM public.pipeline_stages ps
    JOIN public.pipelines p ON p.id = ps.pipeline_id
    WHERE ps.id = (NEW.action_config->>'target_stage_id')::uuid;

    IF v_stage_pipeline_org IS NULL THEN
      RAISE EXCEPTION 'target_stage_id % não existe ou não está ligado a um pipeline', NEW.action_config->>'target_stage_id'
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_stage_pipeline_org IS DISTINCT FROM NEW.org_id THEN
      RAISE EXCEPTION 'target_stage_id aponta para pipeline de outra empresa (%). Escolha uma etapa da empresa atual (%).', v_stage_pipeline_org, NEW.org_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- 3) add_tag/remove_tag → action_config.tag_id precisa ser da mesma org.
  IF NEW.action_type IN ('add_tag', 'remove_tag')
     AND NEW.action_config ? 'tag_id'
     AND COALESCE(NULLIF(TRIM(NEW.action_config->>'tag_id'), ''), NULL) IS NOT NULL THEN
    SELECT org_id INTO v_tag_org
    FROM public.card_tags
    WHERE id = (NEW.action_config->>'tag_id')::uuid;

    IF v_tag_org IS NULL THEN
      RAISE EXCEPTION 'tag_id % não existe em card_tags', NEW.action_config->>'tag_id'
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_tag_org IS DISTINCT FROM NEW.org_id THEN
      RAISE EXCEPTION 'tag_id pertence a outra empresa (%). Escolha uma tag da empresa atual (%).', v_tag_org, NEW.org_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- 4) applicable_pipeline_ids[] → cada pipeline precisa ser da mesma org.
  IF NEW.applicable_pipeline_ids IS NOT NULL AND array_length(NEW.applicable_pipeline_ids, 1) > 0 THEN
    SELECT pip.id INTO v_bad_pipeline_id
    FROM unnest(NEW.applicable_pipeline_ids) AS arr(pip_id)
    JOIN public.pipelines pip ON pip.id = arr.pip_id
    WHERE pip.org_id IS DISTINCT FROM NEW.org_id
    LIMIT 1;

    IF v_bad_pipeline_id IS NOT NULL THEN
      RAISE EXCEPTION 'applicable_pipeline_ids contém pipeline % de outra empresa. Todos devem ser da empresa atual (%).', v_bad_pipeline_id, NEW.org_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- 5) task_configs[].assign_to_user_id → user precisa ser membro da org.
  IF NEW.task_configs IS NOT NULL AND jsonb_typeof(NEW.task_configs) = 'array' THEN
    SELECT (tc->>'assign_to_user_id')::uuid INTO v_bad_user_id
    FROM jsonb_array_elements(NEW.task_configs) AS tc
    WHERE tc->>'assign_to_user_id' IS NOT NULL
      AND COALESCE(NULLIF(TRIM(tc->>'assign_to_user_id'), ''), NULL) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.org_members om
        WHERE om.user_id = (tc->>'assign_to_user_id')::uuid
          AND om.org_id = NEW.org_id
      )
    LIMIT 1;

    IF v_bad_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'task_configs.assign_to_user_id % não é membro da empresa atual (%). Escolha um usuário da equipe.', v_bad_user_id, NEW.org_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.cadence_event_triggers_enforce_same_org() IS
'Sprint C: garante que toda FK de cadence_event_triggers aponta pra recurso da mesma org. Segue padrão de cadence_steps_strict_template_org (migration 20260414h3_029). Evita 406 silencioso na UI quando RLS esconde a linha referenciada.';

DROP TRIGGER IF EXISTS trg_cadence_event_triggers_enforce_same_org ON public.cadence_event_triggers;
CREATE TRIGGER trg_cadence_event_triggers_enforce_same_org
BEFORE INSERT OR UPDATE ON public.cadence_event_triggers
FOR EACH ROW
EXECUTE FUNCTION public.cadence_event_triggers_enforce_same_org();

-- Função de auditoria: retorna total de triggers com QUALQUER FK cross-org.
-- Usada pelo schema-smoke-test.sh — se retornar > 0, smoke test falha e
-- bloqueia promoção.
CREATE OR REPLACE FUNCTION public.cadence_triggers_cross_org_count()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::BIGINT FROM (
    -- target_template
    SELECT t.id FROM public.cadence_event_triggers t
    JOIN public.cadence_templates tpl ON tpl.id = t.target_template_id
    WHERE t.org_id IS DISTINCT FROM tpl.org_id
    UNION ALL
    -- target_stage
    SELECT t.id FROM public.cadence_event_triggers t
    CROSS JOIN LATERAL (
      SELECT (t.action_config->>'target_stage_id')::uuid AS stage_id
      WHERE t.action_type = 'change_stage'
        AND t.action_config ? 'target_stage_id'
        AND COALESCE(NULLIF(TRIM(t.action_config->>'target_stage_id'), ''), NULL) IS NOT NULL
    ) sa
    JOIN public.pipeline_stages ps ON ps.id = sa.stage_id
    JOIN public.pipelines p ON p.id = ps.pipeline_id
    WHERE t.org_id IS DISTINCT FROM p.org_id
    UNION ALL
    -- tag_id
    SELECT t.id FROM public.cadence_event_triggers t
    CROSS JOIN LATERAL (
      SELECT (t.action_config->>'tag_id')::uuid AS tag_id
      WHERE t.action_type IN ('add_tag', 'remove_tag')
        AND t.action_config ? 'tag_id'
        AND COALESCE(NULLIF(TRIM(t.action_config->>'tag_id'), ''), NULL) IS NOT NULL
    ) tq
    JOIN public.card_tags ct ON ct.id = tq.tag_id
    WHERE t.org_id IS DISTINCT FROM ct.org_id
    UNION ALL
    -- applicable_pipeline_ids[]
    SELECT t.id FROM public.cadence_event_triggers t,
         unnest(COALESCE(t.applicable_pipeline_ids, '{}'::uuid[])) AS pip_id
    JOIN public.pipelines pip ON pip.id = pip_id
    WHERE pip.org_id IS DISTINCT FROM t.org_id
    UNION ALL
    -- task_configs[].assign_to_user_id
    SELECT t.id FROM public.cadence_event_triggers t
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(t.task_configs, '[]'::jsonb)) AS tc
    WHERE tc->>'assign_to_user_id' IS NOT NULL
      AND COALESCE(NULLIF(TRIM(tc->>'assign_to_user_id'), ''), NULL) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.org_members om
        WHERE om.user_id = (tc->>'assign_to_user_id')::uuid
          AND om.org_id = t.org_id
      )
  ) orphans;
$$;

COMMENT ON FUNCTION public.cadence_triggers_cross_org_count() IS
'Sprint C: retorna total de automations com qualquer FK apontando pra outra org. Smoke test chama e falha se > 0.';

-- Sanidade final: deve ser zero.
DO $$
DECLARE
  v_cross BIGINT;
BEGIN
  v_cross := public.cadence_triggers_cross_org_count();
  IF v_cross > 0 THEN
    RAISE EXCEPTION 'Sprint C: existem % automations com FK cross-org — investigue antes', v_cross;
  END IF;
  RAISE NOTICE 'Sprint C: 0 órfãos cross-org detectados';
END $$;

COMMIT;
