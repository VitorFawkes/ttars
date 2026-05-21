-- ============================================================================
-- HANDOFF COMPARTILHADO — etapas sem dono fixo
-- Date: 2026-05-18
--
-- CONTEXTO
-- Hoje o handoff Travel Planner → Pós-venda força o frontend a abrir
-- StageChangeModal pedindo um pós-venda específico. Sem owner setado, o
-- Kanban esconde o card e o Quality Gate (requirement_type='team_member')
-- bloqueia o avanço.
--
-- Esta migration introduz uma alternativa configurável por etapa: quando
-- pipeline_stages.handoff_compartilhado = true, o card pode chegar e ficar
-- na etapa SEM owner. Todos os membros do time da fase enxergam o card.
-- Coordenação acontece via tarefas delegadas (mecanismo de pingo pulsante
-- já existente em get_unread_delegated_task_card_ids).
--
-- MUDANÇAS
-- 1. Nova coluna pipeline_stages.handoff_compartilhado
-- 2. Nova tabela stage_entry_task_templates (templates de tarefas criadas
--    automaticamente na entrada da etapa, com responsavel_id=NULL)
-- 3. Trigger strict org match em stage_entry_task_templates → pipeline_stages
-- 4. Recriar mover_card: detecta etapa compartilhada, materializa tarefas
--    do template, notifica todo o time da fase
-- 5. NOVO trigger `aa_skip_stage_requirements_on_compartilhado` (BEFORE
--    UPDATE, ordem alfabética garante execução antes de trg_enforce_stage_requirements)
--    que detecta handoff compartilhado e seta GUC `app.bypass_stage_requirements`
--    quando os ÚNICOS missing são requirements team_member. Reusa o mecanismo
--    de bypass GUC existente, sem reescrever validate_stage_requirements ou
--    enforce_stage_requirements_on_card_move (ambos têm histórico de rebase).
-- ============================================================================

BEGIN;

-- ─── 1. Nova coluna em pipeline_stages ──────────────────────────────────────
ALTER TABLE public.pipeline_stages
  ADD COLUMN IF NOT EXISTS handoff_compartilhado boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pipeline_stages.handoff_compartilhado IS
  'Quando true: card entra na etapa sem owner fixo. Todos os membros do time da fase enxergam no Kanban. Coordenação via tarefas delegadas.';

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_compartilhado
  ON public.pipeline_stages(phase_id, ativo)
  WHERE handoff_compartilhado = true;

-- ─── 2. Tabela de templates de tarefa na entrada da etapa ────────────────────
CREATE TABLE IF NOT EXISTS public.stage_entry_task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT requesting_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  descricao text,
  tipo text NOT NULL DEFAULT 'tarefa',
  prioridade text NOT NULL DEFAULT 'media',
  dias_vencimento int NOT NULL DEFAULT 1,
  ordem int NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_template_tipo CHECK (tipo IN ('ligacao', 'reuniao', 'tarefa', 'email', 'whatsapp', 'outro')),
  CONSTRAINT chk_template_prioridade CHECK (prioridade IN ('baixa', 'media', 'alta', 'urgente')),
  CONSTRAINT chk_template_dias CHECK (dias_vencimento >= 0 AND dias_vencimento <= 365)
);

COMMENT ON TABLE public.stage_entry_task_templates IS
  'Templates de tarefas criadas automaticamente quando um card entra na etapa. Tarefas materializadas têm responsavel_id=NULL (órfãs) — qualquer membro do time da fase pode puxar pra si.';

CREATE INDEX IF NOT EXISTS idx_stage_entry_task_templates_stage
  ON public.stage_entry_task_templates(stage_id, ativo, ordem)
  WHERE ativo = true;

-- RLS
ALTER TABLE public.stage_entry_task_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stage_entry_task_templates_org_all ON public.stage_entry_task_templates;
CREATE POLICY stage_entry_task_templates_org_all ON public.stage_entry_task_templates
  TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

DROP POLICY IF EXISTS stage_entry_task_templates_service_all ON public.stage_entry_task_templates;
CREATE POLICY stage_entry_task_templates_service_all ON public.stage_entry_task_templates
  TO service_role
  USING (true)
  WITH CHECK (true);

-- updated_at automático
CREATE OR REPLACE FUNCTION public.set_stage_entry_task_templates_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stage_entry_task_templates_updated_at ON public.stage_entry_task_templates;
CREATE TRIGGER trg_stage_entry_task_templates_updated_at
  BEFORE UPDATE ON public.stage_entry_task_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_stage_entry_task_templates_updated_at();

-- ─── 3. Trigger strict: template.org_id = stage.org_id ──────────────────────
-- Modelo: H3-029 (cadence_steps_strict_template_org).
CREATE OR REPLACE FUNCTION public.auto_set_stage_entry_task_templates_org_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  stage_org UUID;
BEGIN
  SELECT org_id INTO stage_org
  FROM public.pipeline_stages
  WHERE id = NEW.stage_id;

  IF stage_org IS NULL THEN
    RAISE EXCEPTION 'stage_entry_task_templates: stage_id % não encontrado em pipeline_stages', NEW.stage_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.org_id IS NOT NULL AND NEW.org_id <> stage_org THEN
    RAISE EXCEPTION 'stage_entry_task_templates.org_id (%) diverge de pipeline_stages.org_id (%) para stage %',
      NEW.org_id, stage_org, NEW.stage_id
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.org_id := stage_org;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS auto_set_stage_entry_task_templates_org_id_trigger ON public.stage_entry_task_templates;
CREATE TRIGGER auto_set_stage_entry_task_templates_org_id_trigger
  BEFORE INSERT OR UPDATE OF stage_id, org_id ON public.stage_entry_task_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_stage_entry_task_templates_org_id();

-- ─── 4. Recriar mover_card com lógica de handoff compartilhado ──────────────
-- Mantém o IDOR fix (20260406_h3_020) e adiciona:
--   - Detecção de handoff_compartilhado na etapa destino
--   - Materialização das tarefas do template (responsavel_id=NULL)
--   - Notificação in-app pra todos os membros do time da fase
CREATE OR REPLACE FUNCTION public.mover_card(
    p_card_id uuid,
    p_nova_etapa_id uuid,
    p_motivo_perda_id uuid DEFAULT NULL::uuid,
    p_motivo_perda_comentario text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_valid boolean;
    v_updated integer;
    v_compartilhado boolean;
    v_target_phase_id uuid;
    v_card_org_id uuid;
    v_card_titulo text;
    v_stage_nome text;
BEGIN
    v_valid := public.validate_transition(p_card_id, p_nova_etapa_id);
    IF v_valid IS FALSE THEN
        RAISE EXCEPTION 'Transição de etapa não permitida pelas regras de governança.';
    END IF;

    -- Detecta se a etapa destino é compartilhada
    SELECT
        COALESCE(handoff_compartilhado, false),
        phase_id,
        nome
    INTO v_compartilhado, v_target_phase_id, v_stage_nome
    FROM pipeline_stages
    WHERE id = p_nova_etapa_id;

    UPDATE cards
    SET
        pipeline_stage_id = p_nova_etapa_id,
        motivo_perda_id = p_motivo_perda_id,
        motivo_perda_comentario = p_motivo_perda_comentario,
        updated_at = now()
    WHERE id = p_card_id
      AND org_id = requesting_org_id()
    RETURNING org_id, titulo INTO v_card_org_id, v_card_titulo;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
        RAISE EXCEPTION 'Card não encontrado ou não pertence à sua organização.';
    END IF;

    -- Se etapa compartilhada: materializa tarefas do template (órfãs) +
    -- notifica todo o time da fase
    IF v_compartilhado THEN
        -- 4a. Materializar tarefas do template
        INSERT INTO public.tarefas (
            card_id, titulo, descricao, tipo, prioridade,
            data_vencimento, responsavel_id, created_by, status, org_id
        )
        SELECT
            p_card_id,
            t.titulo,
            t.descricao,
            t.tipo,
            t.prioridade,
            (now() + (t.dias_vencimento || ' days')::interval),
            NULL,                                  -- órfã: ninguém ainda
            NULL,                                  -- created_by = NULL = sistema
            'pendente',
            v_card_org_id
        FROM public.stage_entry_task_templates t
        WHERE t.stage_id = p_nova_etapa_id
          AND t.ativo = true
          AND t.org_id = v_card_org_id
        ORDER BY t.ordem;

        -- 4b. Notificar todos os membros do time da fase destino
        IF v_target_phase_id IS NOT NULL THEN
            INSERT INTO public.notifications (
                user_id, type, title, body, url, card_id, org_id, metadata
            )
            SELECT DISTINCT
                tm.user_id,
                'shared_handoff',
                'Novo card em ' || v_stage_nome,
                COALESCE(v_card_titulo, 'Card') || ' entrou na fila do time. Veja se há tarefa pra você.',
                '/cards/' || p_card_id::text,
                p_card_id,
                v_card_org_id,
                jsonb_build_object(
                    'stage_id', p_nova_etapa_id,
                    'phase_id', v_target_phase_id,
                    'shared', true
                )
            FROM public.team_members tm
            JOIN public.teams t ON t.id = tm.team_id
            WHERE t.phase_id = v_target_phase_id
              AND t.org_id = v_card_org_id
              AND COALESCE(t.is_active, true) = true
              AND tm.user_id IS NOT NULL;
        END IF;
    END IF;
END;
$$;

COMMENT ON FUNCTION public.mover_card(uuid, uuid, uuid, text) IS
  'Move card de etapa. Se etapa destino tem handoff_compartilhado=true: materializa tarefas do template (responsavel_id=NULL) e notifica todo o time da fase.';

-- ─── 5. Trigger novo: skip team_member quando handoff compartilhado ─────────
-- Executa ANTES de trg_enforce_stage_requirements (ordem alfabética por nome
-- "aa_skip_..." < "trg_enforce_...") e seta GUC bypass quando os ÚNICOS
-- requirements faltantes são do tipo team_member E origem/destino é etapa
-- compartilhada. Reusa o mecanismo de bypass GUC existente sem reescrever
-- validate_stage_requirements ou enforce_stage_requirements_on_card_move.
CREATE OR REPLACE FUNCTION public.skip_stage_requirements_on_compartilhado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_old_compartilhado boolean := false;
    v_new_compartilhado boolean := false;
    v_result jsonb;
    v_other_missing_count int;
BEGIN
    -- Só atua em mudança de stage
    IF NEW.pipeline_stage_id IS NOT DISTINCT FROM OLD.pipeline_stage_id THEN
        RETURN NEW;
    END IF;

    IF NEW.pipeline_stage_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Detecta se origem OU destino é etapa compartilhada
    SELECT COALESCE(handoff_compartilhado, false) INTO v_old_compartilhado
    FROM public.pipeline_stages WHERE id = OLD.pipeline_stage_id;

    SELECT COALESCE(handoff_compartilhado, false) INTO v_new_compartilhado
    FROM public.pipeline_stages WHERE id = NEW.pipeline_stage_id;

    -- Nem origem nem destino é compartilhada: skip (deixa trg_enforce validar normalmente)
    IF NOT v_old_compartilhado AND NOT v_new_compartilhado THEN
        RETURN NEW;
    END IF;

    -- Valida e conta quantos missing NÃO são team_member
    v_result := public.validate_stage_requirements(NEW.id, NEW.pipeline_stage_id);

    IF (v_result->>'valid')::boolean THEN
        -- Sem missing — não precisa intervir
        RETURN NEW;
    END IF;

    SELECT COUNT(*)
    INTO v_other_missing_count
    FROM jsonb_array_elements_text(v_result->'missing') elem
    WHERE elem <> ALL(
        COALESCE(
            (SELECT array_agg(COALESCE(requirement_label, field_key, 'Requisito'))
             FROM public.stage_field_config
             WHERE stage_id = NEW.pipeline_stage_id
               AND requirement_type = 'team_member'
               AND is_required = true
               AND COALESCE(is_blocking, true) = true),
            ARRAY[]::text[]
        )
    );

    -- Se todos os missing são team_member, seta bypass GUC pro trigger seguinte
    IF v_other_missing_count = 0 THEN
        PERFORM set_config('app.bypass_stage_requirements', 'true', true);
    END IF;

    RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.skip_stage_requirements_on_compartilhado() IS
  'Trigger BEFORE UPDATE em cards.pipeline_stage_id. Executa antes de trg_enforce_stage_requirements (ordem alfabética). Quando origem ou destino é etapa compartilhada E os únicos requirements faltantes são team_member, seta GUC bypass — permitindo card transitar sem owner fixo.';

DROP TRIGGER IF EXISTS aa_skip_stage_requirements_on_compartilhado ON public.cards;
CREATE TRIGGER aa_skip_stage_requirements_on_compartilhado
  BEFORE UPDATE OF pipeline_stage_id ON public.cards
  FOR EACH ROW
  EXECUTE FUNCTION public.skip_stage_requirements_on_compartilhado();

COMMIT;

-- ─── Validação pós-migration ─────────────────────────────────────────────────
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'pipeline_stages'
    AND column_name = 'handoff_compartilhado';

  IF v_count = 0 THEN
    RAISE EXCEPTION 'handoff_compartilhado: coluna não foi criada em pipeline_stages';
  END IF;

  SELECT count(*) INTO v_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'stage_entry_task_templates';

  IF v_count = 0 THEN
    RAISE EXCEPTION 'handoff_compartilhado: tabela stage_entry_task_templates não foi criada';
  END IF;

  -- Confirma que o novo trigger existe E executa antes do enforce
  SELECT count(*) INTO v_count
  FROM pg_trigger
  WHERE tgname = 'aa_skip_stage_requirements_on_compartilhado'
    AND tgrelid = 'public.cards'::regclass;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'handoff_compartilhado: trigger aa_skip_stage_requirements_on_compartilhado não foi criado';
  END IF;

  RAISE NOTICE 'handoff_compartilhado: schema validado com sucesso';
END $$;
