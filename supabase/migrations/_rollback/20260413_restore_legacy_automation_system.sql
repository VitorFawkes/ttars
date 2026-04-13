-- =====================================================================
-- ROLLBACK do 20260413_drop_legacy_automation_system.sql
-- =====================================================================
-- Restaura o estado pré-DROP das 7 tabelas legacy + 7 funções + 5 triggers
-- + 28 policies + 24 índices capturados de produção em 2026-04-13.
--
-- Use este script SOMENTE se a promoção a produção quebrar algo crítico
-- e precisar reverter rapidamente. Execução direta:
--   bash .claude/hooks/promote-to-prod.sh supabase/migrations/_rollback/20260413_restore_legacy_automation_system.sql
--
-- Pós-rollback necessário no frontend:
--   - Reverter o edit em supabase/functions/export-org-data/index.ts
--     (adicionar "automation_rules" de volta à lista)
--   - Redeploy da edge function
--
-- DADOS NÃO RESTAURADOS: a única linha viva era 1 regra de teste inativa
-- em automation_rules (org Welcome Group) + 1 linha órfã em task_queue.
-- Ambas eram lixo e não precisam voltar.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Tabela: automacao_regras (raiz)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.automacao_regras (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
    produto app_product NOT NULL,
    nome TEXT NOT NULL,
    descricao TEXT,
    ativa BOOLEAN DEFAULT false,
    tipo TEXT NOT NULL DEFAULT 'single'
        CHECK (tipo = ANY (ARRAY['single', 'jornada'])),
    trigger_type TEXT NOT NULL
        CHECK (trigger_type = ANY (ARRAY['stage_enter','stage_exit','card_won','card_lost','card_created','field_changed','owner_changed','dias_no_stage','dias_sem_contato','sem_resposta_horas','dias_antes_viagem','dias_apos_viagem','aniversario_contato','documento_recebido','documento_pendente','proposta_visualizada','proposta_aceita','proposta_expirada','voo_alterado','pagamento_recebido','milestone_atingido','webhook_externo'])),
    trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    condicoes JSONB DEFAULT '[]'::jsonb,
    template_id UUID REFERENCES mensagem_templates(id),
    max_envios_por_card INTEGER DEFAULT 1,
    dedup_janela_horas INTEGER DEFAULT 24,
    max_mensagens_contato_dia INTEGER DEFAULT 3,
    response_aware BOOLEAN DEFAULT true,
    modo_aprovacao BOOLEAN DEFAULT false,
    total_disparados INTEGER DEFAULT 0,
    total_enviados INTEGER DEFAULT 0,
    total_entregues INTEGER DEFAULT 0,
    total_lidos INTEGER DEFAULT 0,
    total_respondidos INTEGER DEFAULT 0,
    total_falhas INTEGER DEFAULT 0,
    total_skipped INTEGER DEFAULT 0,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    phone_number_id TEXT,
    agent_aware BOOLEAN DEFAULT true,
    business_hours BOOLEAN DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_ar_org_produto ON public.automacao_regras (org_id, produto) WHERE (ativa = true);
CREATE INDEX IF NOT EXISTS idx_ar_trigger ON public.automacao_regras (trigger_type) WHERE (ativa = true);
ALTER TABLE public.automacao_regras ENABLE ROW LEVEL SECURITY;
CREATE POLICY ar_select ON public.automacao_regras FOR SELECT TO authenticated USING (org_id = requesting_org_id());
CREATE POLICY ar_insert ON public.automacao_regras FOR INSERT TO authenticated WITH CHECK (org_id = requesting_org_id());
CREATE POLICY ar_update ON public.automacao_regras FOR UPDATE TO authenticated USING (org_id = requesting_org_id());
CREATE POLICY ar_delete ON public.automacao_regras FOR DELETE TO authenticated USING (org_id = requesting_org_id());
CREATE POLICY ar_service ON public.automacao_regras FOR ALL TO service_role USING (true);
CREATE POLICY automacao_regras_org_select ON public.automacao_regras FOR SELECT TO authenticated USING (org_id = requesting_org_id());

-- ---------------------------------------------------------------------
-- 2. Tabela: automacao_regra_passos (FK → automacao_regras)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.automacao_regra_passos (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    regra_id UUID NOT NULL REFERENCES automacao_regras(id) ON DELETE CASCADE,
    ordem INTEGER NOT NULL,
    tipo TEXT NOT NULL
        CHECK (tipo = ANY (ARRAY['enviar_mensagem','aguardar','criar_tarefa','verificar_resposta','atualizar_campo'])),
    config JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_arp_regra_ordem ON public.automacao_regra_passos (regra_id, ordem);
ALTER TABLE public.automacao_regra_passos ENABLE ROW LEVEL SECURITY;
CREATE POLICY arp_select ON public.automacao_regra_passos FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM automacao_regras ar WHERE ar.id = automacao_regra_passos.regra_id AND ar.org_id = requesting_org_id()));
CREATE POLICY arp_insert ON public.automacao_regra_passos FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM automacao_regras ar WHERE ar.id = automacao_regra_passos.regra_id AND ar.org_id = requesting_org_id()));
CREATE POLICY arp_update ON public.automacao_regra_passos FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM automacao_regras ar WHERE ar.id = automacao_regra_passos.regra_id AND ar.org_id = requesting_org_id()));
CREATE POLICY arp_delete ON public.automacao_regra_passos FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM automacao_regras ar WHERE ar.id = automacao_regra_passos.regra_id AND ar.org_id = requesting_org_id()));
CREATE POLICY arp_service ON public.automacao_regra_passos FOR ALL TO service_role USING (true);

-- ---------------------------------------------------------------------
-- 3. Tabela: automacao_execucoes (FK → automacao_regras, automacao_regra_passos)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.automacao_execucoes (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL DEFAULT requesting_org_id(),
    regra_id UUID NOT NULL REFERENCES automacao_regras(id) ON DELETE CASCADE,
    card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
    contact_id UUID REFERENCES contatos(id) ON DELETE SET NULL,
    passo_atual_id UUID REFERENCES automacao_regra_passos(id),
    passo_atual_ordem INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status = ANY (ARRAY['pending','aguardando_horario','aguardando_passo','gerando_ia','aguardando_aprovacao','enviando','enviado','entregue','lido','respondido','falhou','skipped','pausado','cancelado','completo'])),
    skip_reason TEXT,
    trigger_type TEXT,
    trigger_data JSONB,
    template_id UUID REFERENCES mensagem_templates(id),
    corpo_renderizado TEXT,
    corpo_ia_gerado TEXT,
    ia_contexto_usado JSONB,
    whatsapp_message_id UUID,
    echo_message_id TEXT,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    next_retry_at TIMESTAMPTZ,
    proximo_passo_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    enviado_at TIMESTAMPTZ,
    entregue_at TIMESTAMPTZ,
    lido_at TIMESTAMPTZ,
    respondido_at TIMESTAMPTZ,
    dedup_key TEXT
);
CREATE INDEX IF NOT EXISTS idx_ae_card ON public.automacao_execucoes (card_id);
CREATE INDEX IF NOT EXISTS idx_ae_contact ON public.automacao_execucoes (contact_id);
CREATE INDEX IF NOT EXISTS idx_ae_dedup ON public.automacao_execucoes (dedup_key);
CREATE INDEX IF NOT EXISTS idx_ae_processaveis ON public.automacao_execucoes (status) WHERE (status = ANY (ARRAY['pending','aguardando_passo','aguardando_horario','aguardando_aprovacao','gerando_ia']));
CREATE INDEX IF NOT EXISTS idx_ae_proximo_passo ON public.automacao_execucoes (proximo_passo_at) WHERE (status = 'aguardando_passo');
CREATE INDEX IF NOT EXISTS idx_ae_regra_status ON public.automacao_execucoes (regra_id, status);
CREATE INDEX IF NOT EXISTS idx_ae_retry ON public.automacao_execucoes (next_retry_at) WHERE (status = 'falhou' AND attempts < 3);
ALTER TABLE public.automacao_execucoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY ae_select ON public.automacao_execucoes FOR SELECT TO authenticated USING (org_id = requesting_org_id());
CREATE POLICY ae_service ON public.automacao_execucoes FOR ALL TO service_role USING (true);

-- ---------------------------------------------------------------------
-- 4. Tabela: automacao_optout (FK → automacao_regras)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.automacao_optout (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL DEFAULT requesting_org_id(),
    contact_id UUID NOT NULL REFERENCES contatos(id) ON DELETE CASCADE,
    regra_id UUID REFERENCES automacao_regras(id) ON DELETE CASCADE,
    motivo TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (contact_id, regra_id)
);
CREATE INDEX IF NOT EXISTS idx_ao_contact ON public.automacao_optout (contact_id) WHERE (regra_id IS NULL);
ALTER TABLE public.automacao_optout ENABLE ROW LEVEL SECURITY;
CREATE POLICY ao_select ON public.automacao_optout FOR SELECT TO authenticated USING (org_id = requesting_org_id());
CREATE POLICY ao_insert ON public.automacao_optout FOR INSERT TO authenticated WITH CHECK (org_id = requesting_org_id());
CREATE POLICY ao_delete ON public.automacao_optout FOR DELETE TO authenticated USING (org_id = requesting_org_id());
CREATE POLICY ao_service ON public.automacao_optout FOR ALL TO service_role USING (true);

-- ---------------------------------------------------------------------
-- 5. Tabela: automation_rules (raiz do subsistema scheduler legacy)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.automation_rules (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    pipeline_id UUID NOT NULL,
    trigger_stage_id UUID NOT NULL,
    timing_value INTEGER DEFAULT 0,
    task_titulo TEXT NOT NULL,
    task_tipo TEXT NOT NULL,
    task_prioridade TEXT DEFAULT 'media',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    trigger_type TEXT DEFAULT 'stage_enter',
    task_descricao TEXT,
    assign_to TEXT DEFAULT 'card_owner',
    assign_to_user_id UUID,
    timing_type TEXT DEFAULT 'relative_minutes',
    timing_respect_business_hours BOOLEAN DEFAULT false,
    timing_business_hour_start TIME DEFAULT '09:00:00',
    timing_business_hour_end TIME DEFAULT '18:00:00',
    conditions JSONB DEFAULT '{}'::jsonb,
    order_index INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT now(),
    org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id)
);
CREATE INDEX IF NOT EXISTS idx_automation_rules_org_id ON public.automation_rules (org_id);
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and Gestores can edit rules" ON public.automation_rules FOR ALL TO public USING (is_gestor());
CREATE POLICY "Admins and Gestores can view rules" ON public.automation_rules FOR SELECT TO public USING (is_gestor());
CREATE POLICY automation_rules_org_all ON public.automation_rules FOR ALL TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
CREATE POLICY automation_rules_org_select ON public.automation_rules FOR SELECT TO authenticated USING ((org_id = requesting_org_id()) OR (org_id = requesting_parent_org_id()));
CREATE POLICY automation_rules_service_all ON public.automation_rules FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------
-- 6. Tabela: automation_log (FK → automation_rules, cards, tarefas)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.automation_log (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    rule_id UUID REFERENCES automation_rules(id) ON DELETE SET NULL,
    card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    task_id UUID REFERENCES tarefas(id) ON DELETE SET NULL,
    triggered_at TIMESTAMPTZ DEFAULT now(),
    trigger_stage_from UUID,
    trigger_stage_to UUID,
    status TEXT DEFAULT 'success',
    error_message TEXT,
    conditions_evaluated JSONB,
    org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id)
);
CREATE INDEX IF NOT EXISTS idx_automation_log_card ON public.automation_log (card_id);
CREATE INDEX IF NOT EXISTS idx_automation_log_org_id ON public.automation_log (org_id);
ALTER TABLE public.automation_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view automation_log" ON public.automation_log FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "Authenticated users can insert automation logs" ON public.automation_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY automation_log_org_all ON public.automation_log FOR ALL TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
CREATE POLICY automation_log_org_select ON public.automation_log FOR SELECT TO authenticated USING (org_id = requesting_org_id());
CREATE POLICY automation_log_service_all ON public.automation_log FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------
-- 7. Tabela: task_queue (FK → automation_rules, cards)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.task_queue (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    rule_id UUID REFERENCES automation_rules(id),
    scheduled_for TIMESTAMPTZ NOT NULL,
    processed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_task_queue_card ON public.task_queue (card_id);
CREATE INDEX IF NOT EXISTS idx_task_queue_schedule ON public.task_queue (scheduled_for) WHERE (processed = false);
ALTER TABLE public.task_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "System can process queue" ON public.task_queue FOR ALL TO public USING (is_admin());

-- ---------------------------------------------------------------------
-- 8. Funções (7)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.count_automacao_metrics(p_regra_id uuid)
RETURNS TABLE(total_disparados integer, total_enviados integer, total_entregues integer, total_lidos integer, total_respondidos integer, total_falhas integer, total_skipped integer)
LANGUAGE sql STABLE
AS $function$
  SELECT
    COUNT(*)::INT,
    COUNT(*) FILTER (WHERE status = 'enviado')::INT,
    COUNT(*) FILTER (WHERE status = 'entregue')::INT,
    COUNT(*) FILTER (WHERE status = 'lido')::INT,
    COUNT(*) FILTER (WHERE status = 'respondido')::INT,
    COUNT(*) FILTER (WHERE status = 'falhou')::INT,
    COUNT(*) FILTER (WHERE status = 'skipped')::INT
  FROM automacao_execucoes WHERE regra_id = p_regra_id;
$function$;

CREATE OR REPLACE FUNCTION public.execute_automation_rules()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE
    rule RECORD;
    new_task_id UUID;
    due_date TIMESTAMPTZ;
    assignee_id UUID;
    should_skip BOOLEAN;
    condition_result JSONB;
BEGIN
    IF OLD.pipeline_stage_id IS DISTINCT FROM NEW.pipeline_stage_id THEN
        FOR rule IN
            SELECT * FROM automation_rules
            WHERE trigger_stage_id = NEW.pipeline_stage_id
            AND trigger_type = 'stage_enter' AND is_active = true
            ORDER BY order_index
        LOOP
            should_skip := false;
            condition_result := '{}'::JSONB;
            IF rule.conditions ? 'require_no_pending_task_of_type' THEN
                IF EXISTS (
                    SELECT 1 FROM tarefas
                    WHERE card_id = NEW.id
                    AND tipo = rule.conditions->>'require_no_pending_task_of_type'
                    AND concluida = false AND deleted_at IS NULL
                ) THEN
                    should_skip := true;
                    condition_result := jsonb_build_object('skipped', 'pending_task_exists');
                END IF;
            END IF;
            IF should_skip THEN
                INSERT INTO automation_log (rule_id, card_id, trigger_stage_from, trigger_stage_to, status, conditions_evaluated)
                VALUES (rule.id, NEW.id, OLD.pipeline_stage_id, NEW.pipeline_stage_id, 'skipped_condition', condition_result);
                CONTINUE;
            END IF;
            due_date := NOW() + (COALESCE(rule.task_prazo_horas, 24) || ' hours')::INTERVAL;
            assignee_id := COALESCE(
                CASE rule.assign_to WHEN 'specific_user' THEN rule.assign_to_user_id ELSE NULL END,
                NEW.dono_atual_id, NEW.created_by
            );
            INSERT INTO tarefas (card_id, titulo, descricao, tipo, prioridade, responsavel_id, data_vencimento, status, concluida, metadata)
            VALUES (NEW.id, rule.task_titulo, rule.task_descricao, rule.task_tipo, COALESCE(rule.task_prioridade, 'normal'), assignee_id, due_date, 'pending', false, jsonb_build_object('automation_rule_id', rule.id, 'auto_created', true))
            RETURNING id INTO new_task_id;
            INSERT INTO automation_log (rule_id, card_id, task_id, trigger_stage_from, trigger_stage_to, status)
            VALUES (rule.id, NEW.id, new_task_id, OLD.pipeline_stage_id, NEW.pipeline_stage_id, 'success');
        END LOOP;
    END IF;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    INSERT INTO automation_log (card_id, trigger_stage_from, trigger_stage_to, status, error_message)
    VALUES (NEW.id, OLD.pipeline_stage_id, NEW.pipeline_stage_id, 'error', SQLERRM);
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.schedule_tasks_on_stage_change()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
    IF (TG_OP = 'INSERT') OR (TG_OP = 'UPDATE' AND OLD.pipeline_stage_id IS DISTINCT FROM NEW.pipeline_stage_id) THEN
        INSERT INTO public.task_queue (card_id, rule_id, scheduled_for)
        SELECT NEW.id, r.id, NOW() + (r.delay_minutes || ' minutes')::INTERVAL
        FROM public.automation_rules r
        WHERE r.stage_id = NEW.pipeline_stage_id AND r.active = true;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_task_queue()
RETURNS integer LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE
    r RECORD;
    processed_count INTEGER := 0;
BEGIN
    FOR r IN
        SELECT q.*, ar.task_title, ar.task_type, ar.task_priority, c.dono_atual_id
        FROM public.task_queue q
        JOIN public.automation_rules ar ON q.rule_id = ar.id
        JOIN public.cards c ON q.card_id = c.id
        WHERE q.processed = false AND q.scheduled_for <= NOW()
        FOR UPDATE SKIP LOCKED
    LOOP
        INSERT INTO public.tarefas (card_id, titulo, tipo, data_vencimento, prioridade, responsavel_id)
        VALUES (r.card_id, r.task_title, r.task_type, NOW(), r.task_priority, r.dono_atual_id);
        UPDATE public.task_queue SET processed = true WHERE id = r.id;
        processed_count := processed_count + 1;
    END LOOP;
    RETURN processed_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.queue_automacao_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_event_type TEXT;
  v_trigger_data JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event_type := 'card_created';
    v_trigger_data := jsonb_build_object('card_id', NEW.id);
  ELSIF OLD.pipeline_stage_id IS DISTINCT FROM NEW.pipeline_stage_id THEN
    v_event_type := 'stage_enter';
    v_trigger_data := jsonb_build_object('old_stage_id', OLD.pipeline_stage_id, 'new_stage_id', NEW.pipeline_stage_id);
  ELSIF OLD.status_comercial IS DISTINCT FROM NEW.status_comercial THEN
    IF NEW.status_comercial = 'ganho' THEN v_event_type := 'card_won';
    ELSIF NEW.status_comercial = 'perdido' THEN v_event_type := 'card_lost';
    END IF;
    v_trigger_data := jsonb_build_object('old_status', OLD.status_comercial, 'new_status', NEW.status_comercial);
  ELSIF OLD.dono_atual_id IS DISTINCT FROM NEW.dono_atual_id THEN
    v_event_type := 'owner_changed';
    v_trigger_data := jsonb_build_object('old_owner', OLD.dono_atual_id, 'new_owner', NEW.dono_atual_id);
  END IF;
  IF v_event_type IS NOT NULL AND NEW.pessoa_principal_id IS NOT NULL THEN
    INSERT INTO automacao_execucoes (org_id, regra_id, card_id, contact_id, trigger_type, trigger_data, template_id, dedup_key)
    SELECT ar.org_id, ar.id, NEW.id, NEW.pessoa_principal_id, v_event_type, v_trigger_data, ar.template_id,
           ar.id || '|' || NEW.id || '|' || CURRENT_DATE::TEXT
    FROM automacao_regras ar
    WHERE ar.ativa = true AND ar.produto::TEXT = NEW.produto::TEXT AND ar.trigger_type = v_event_type
    AND (v_event_type != 'stage_enter' OR NEW.pipeline_stage_id = ANY(ARRAY(SELECT jsonb_array_elements_text(ar.trigger_config->'stage_ids'))::UUID[]))
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.queue_automacao_documento_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE v_card_produto TEXT;
BEGIN
  IF NEW.status = 'received' AND (OLD IS NULL OR OLD.status IS DISTINCT FROM 'received') THEN
    SELECT c.produto::TEXT INTO v_card_produto FROM cards c WHERE c.id = NEW.card_id;
    INSERT INTO automacao_execucoes (org_id, regra_id, card_id, contact_id, trigger_type, trigger_data, template_id, dedup_key)
    SELECT ar.org_id, ar.id, NEW.card_id, NEW.contato_id, 'documento_recebido',
           jsonb_build_object('document_type_id', NEW.document_type_id), ar.template_id,
           ar.id || '|' || NEW.card_id || '|' || NEW.document_type_id::TEXT || '|' || CURRENT_DATE::TEXT
    FROM automacao_regras ar
    WHERE ar.ativa = true AND ar.trigger_type = 'documento_recebido'
    AND (v_card_produto IS NULL OR ar.produto::TEXT = v_card_produto)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.queue_automacao_proposta_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_card_id UUID;
  v_contact_id UUID;
  v_card_produto TEXT;
BEGIN
  IF NEW.event_type = 'viewed' THEN
    SELECT p.card_id INTO v_card_id FROM proposals p WHERE p.id = NEW.proposal_id;
    IF v_card_id IS NOT NULL THEN
      SELECT c.pessoa_principal_id, c.produto::TEXT INTO v_contact_id, v_card_produto FROM cards c WHERE c.id = v_card_id;
      INSERT INTO automacao_execucoes (org_id, regra_id, card_id, contact_id, trigger_type, trigger_data, template_id, dedup_key)
      SELECT ar.org_id, ar.id, v_card_id, v_contact_id, 'proposta_visualizada',
             jsonb_build_object('scroll_depth', NEW.scroll_depth, 'duration_seconds', NEW.duration_seconds, 'proposal_id', NEW.proposal_id),
             ar.template_id,
             ar.id || '|' || v_card_id || '|' || CURRENT_DATE::TEXT
      FROM automacao_regras ar
      WHERE ar.ativa = true AND ar.trigger_type = 'proposta_visualizada'
      AND (v_card_produto IS NULL OR ar.produto::TEXT = v_card_produto)
      AND ((ar.trigger_config->>'min_scroll_depth') IS NULL OR COALESCE(NEW.scroll_depth, 0) >= (ar.trigger_config->>'min_scroll_depth')::INT)
      AND ((ar.trigger_config->>'min_duration_seconds') IS NULL OR COALESCE(NEW.duration_seconds, 0) >= (ar.trigger_config->>'min_duration_seconds')::INT)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------
-- 9. Triggers (5)
-- ---------------------------------------------------------------------
CREATE TRIGGER trigger_automation_rules AFTER UPDATE OF pipeline_stage_id ON public.cards
  FOR EACH ROW EXECUTE FUNCTION execute_automation_rules();
CREATE TRIGGER trg_automacao_card_event AFTER INSERT OR UPDATE ON public.cards
  FOR EACH ROW EXECUTE FUNCTION queue_automacao_event();
CREATE TRIGGER trg_automacao_documento_event AFTER INSERT OR UPDATE ON public.card_document_requirements
  FOR EACH ROW EXECUTE FUNCTION queue_automacao_documento_event();
CREATE TRIGGER trg_automacao_proposta_event AFTER INSERT ON public.proposal_events
  FOR EACH ROW EXECUTE FUNCTION queue_automacao_proposta_event();
CREATE TRIGGER audit_automation_rules_changes AFTER INSERT OR DELETE OR UPDATE ON public.automation_rules
  FOR EACH ROW EXECUTE FUNCTION log_changes();

COMMIT;
