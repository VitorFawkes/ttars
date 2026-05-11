-- =====================================================
-- OUTBOUND TRIGGER RULES SYSTEM
-- Sistema de regras para controlar sincronização CRM → AC
-- Similar ao sistema de Inbound Triggers, mas na direção oposta
-- =====================================================

-- 1. Criar tabela de regras de outbound
CREATE TABLE IF NOT EXISTS public.integration_outbound_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id UUID REFERENCES public.integrations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,

    -- QUANDO (Condições de Origem no CRM)
    source_pipeline_ids UUID[],      -- Pipelines do CRM (NULL = qualquer)
    source_stage_ids UUID[],         -- Estágios do CRM (NULL = qualquer)
    source_owner_ids UUID[],         -- Responsáveis no CRM (NULL = qualquer)
    source_status TEXT[],            -- ['ativo', 'ganho', 'perdido'] (NULL = qualquer)

    -- QUAIS EVENTOS
    event_types TEXT[] DEFAULT '{stage_change,field_update,won,lost}',
    -- Tipos permitidos: stage_change, field_update, won, lost

    -- FILTRO DE CAMPOS (para field_update)
    sync_field_mode TEXT DEFAULT 'all' CHECK (sync_field_mode IN ('all', 'selected', 'exclude')),
    sync_fields TEXT[],              -- Campos específicos (usado quando sync_field_mode != 'all')

    -- CONTROLES
    action_mode TEXT DEFAULT 'allow' CHECK (action_mode IN ('allow', 'block')),
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 100,    -- Menor = mais prioritário

    -- AUDITORIA
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Índices para performance
CREATE INDEX IF NOT EXISTS idx_outbound_triggers_integration_id
    ON public.integration_outbound_triggers(integration_id);
CREATE INDEX IF NOT EXISTS idx_outbound_triggers_active
    ON public.integration_outbound_triggers(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_outbound_triggers_priority
    ON public.integration_outbound_triggers(priority);

-- 3. Trigger para updated_at
CREATE OR REPLACE FUNCTION update_outbound_triggers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_outbound_triggers_updated_at ON public.integration_outbound_triggers;
CREATE TRIGGER tr_outbound_triggers_updated_at
    BEFORE UPDATE ON public.integration_outbound_triggers
    FOR EACH ROW
    EXECUTE FUNCTION update_outbound_triggers_updated_at();

-- 4. Função para verificar se evento deve ser processado
CREATE OR REPLACE FUNCTION check_outbound_trigger(
    p_integration_id UUID,
    p_pipeline_id UUID,
    p_stage_id UUID,
    p_owner_id UUID,
    p_status TEXT,
    p_event_type TEXT,
    p_field_name TEXT DEFAULT NULL
)
RETURNS TABLE (
    allowed BOOLEAN,
    rule_id UUID,
    rule_name TEXT,
    action_mode TEXT,
    sync_field_mode TEXT,
    sync_fields TEXT[],
    reason TEXT
) AS $$
DECLARE
    v_trigger RECORD;
    v_has_rules BOOLEAN := FALSE;
BEGIN
    -- Verificar se existem regras ativas para esta integração
    SELECT EXISTS (
        SELECT 1 FROM public.integration_outbound_triggers
        WHERE integration_id = p_integration_id AND is_active = true
    ) INTO v_has_rules;

    -- Se não há regras, permitir tudo (comportamento padrão legado)
    IF NOT v_has_rules THEN
        RETURN QUERY SELECT
            true::BOOLEAN,
            NULL::UUID,
            NULL::TEXT,
            'allow'::TEXT,
            'all'::TEXT,
            NULL::TEXT[],
            'No outbound rules configured - allowing all'::TEXT;
        RETURN;
    END IF;

    -- Buscar primeira regra que faz match (ordenada por prioridade)
    FOR v_trigger IN
        SELECT t.* FROM public.integration_outbound_triggers t
        WHERE t.integration_id = p_integration_id
          AND t.is_active = true
        ORDER BY t.priority ASC, t.created_at ASC
    LOOP
        -- Verificar match de pipeline (NULL = qualquer)
        IF v_trigger.source_pipeline_ids IS NOT NULL AND
           NOT (p_pipeline_id = ANY(v_trigger.source_pipeline_ids)) THEN
            CONTINUE;
        END IF;

        -- Verificar match de estágio (NULL = qualquer)
        IF v_trigger.source_stage_ids IS NOT NULL AND
           NOT (p_stage_id = ANY(v_trigger.source_stage_ids)) THEN
            CONTINUE;
        END IF;

        -- Verificar match de owner (NULL = qualquer)
        IF v_trigger.source_owner_ids IS NOT NULL AND
           NOT (p_owner_id = ANY(v_trigger.source_owner_ids)) THEN
            CONTINUE;
        END IF;

        -- Verificar match de status (NULL = qualquer)
        IF v_trigger.source_status IS NOT NULL AND
           NOT (p_status = ANY(v_trigger.source_status)) THEN
            CONTINUE;
        END IF;

        -- Verificar match de tipo de evento
        IF v_trigger.event_types IS NOT NULL AND
           NOT (p_event_type = ANY(v_trigger.event_types)) THEN
            CONTINUE;
        END IF;

        -- Se chegou aqui, a regra fez match!

        -- Verificar filtro de campos (para field_update)
        IF p_event_type = 'field_update' AND p_field_name IS NOT NULL THEN
            IF v_trigger.sync_field_mode = 'selected' AND v_trigger.sync_fields IS NOT NULL THEN
                -- Modo 'selected': só permite campos listados
                IF NOT (p_field_name = ANY(v_trigger.sync_fields)) THEN
                    RETURN QUERY SELECT
                        false::BOOLEAN,
                        v_trigger.id,
                        v_trigger.name,
                        v_trigger.action_mode,
                        v_trigger.sync_field_mode,
                        v_trigger.sync_fields,
                        format('Field "%s" not in allowed list for rule "%s"', p_field_name, v_trigger.name)::TEXT;
                    RETURN;
                END IF;
            ELSIF v_trigger.sync_field_mode = 'exclude' AND v_trigger.sync_fields IS NOT NULL THEN
                -- Modo 'exclude': bloqueia campos listados
                IF p_field_name = ANY(v_trigger.sync_fields) THEN
                    RETURN QUERY SELECT
                        false::BOOLEAN,
                        v_trigger.id,
                        v_trigger.name,
                        v_trigger.action_mode,
                        v_trigger.sync_field_mode,
                        v_trigger.sync_fields,
                        format('Field "%s" is excluded by rule "%s"', p_field_name, v_trigger.name)::TEXT;
                    RETURN;
                END IF;
            END IF;
            -- Modo 'all' ou sem campos especificados: permite todos
        END IF;

        -- Retornar resultado baseado no action_mode
        IF v_trigger.action_mode = 'block' THEN
            RETURN QUERY SELECT
                false::BOOLEAN,
                v_trigger.id,
                v_trigger.name,
                v_trigger.action_mode,
                v_trigger.sync_field_mode,
                v_trigger.sync_fields,
                format('Blocked by rule "%s"', v_trigger.name)::TEXT;
            RETURN;
        ELSE
            RETURN QUERY SELECT
                true::BOOLEAN,
                v_trigger.id,
                v_trigger.name,
                v_trigger.action_mode,
                v_trigger.sync_field_mode,
                v_trigger.sync_fields,
                format('Allowed by rule "%s"', v_trigger.name)::TEXT;
            RETURN;
        END IF;
    END LOOP;

    -- Nenhuma regra fez match - bloquear por padrão quando há regras configuradas
    RETURN QUERY SELECT
        false::BOOLEAN,
        NULL::UUID,
        NULL::TEXT,
        'block'::TEXT,
        NULL::TEXT,
        NULL::TEXT[],
        'No matching outbound rule found - blocking by default'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Atualizar trigger log_outbound_card_event para usar as regras
CREATE OR REPLACE FUNCTION log_outbound_card_event()
RETURNS TRIGGER AS $$
DECLARE
    v_integration_id UUID;
    v_external_id TEXT;
    v_event_type TEXT;
    v_payload JSONB := '{}';
    v_stage_mapping RECORD;
    v_field_changed BOOLEAN := FALSE;
    v_field_name TEXT;
    v_outbound_enabled BOOLEAN := FALSE;
    v_shadow_mode BOOLEAN := TRUE;
    v_allowed_events TEXT;
    v_rule_result RECORD;
    v_card_status TEXT;
BEGIN
    -- Verificar se é uma atualização originada da integração (evita loop infinito)
    IF current_setting('app.update_source', TRUE) = 'integration' THEN
        RETURN NEW;
    END IF;

    -- Só processar cards que têm external_id (foram sincronizados de fora)
    IF NEW.external_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Buscar integração pelo external_source do card
    SELECT id INTO v_integration_id
    FROM public.integrations
    WHERE provider = NEW.external_source OR name = NEW.external_source
    LIMIT 1;

    IF v_integration_id IS NULL THEN
        RETURN NEW;
    END IF;

    v_external_id := NEW.external_id;

    -- Buscar configurações globais de outbound
    SELECT COALESCE(value, 'false')::boolean INTO v_outbound_enabled
    FROM public.integration_settings WHERE key = 'OUTBOUND_SYNC_ENABLED';

    SELECT COALESCE(value, 'true')::boolean INTO v_shadow_mode
    FROM public.integration_settings WHERE key = 'OUTBOUND_SHADOW_MODE';

    SELECT COALESCE(value, 'stage_change,won,lost,field_update') INTO v_allowed_events
    FROM public.integration_settings WHERE key = 'OUTBOUND_ALLOWED_EVENTS';

    -- Se outbound desabilitado, não fazer nada
    IF NOT v_outbound_enabled THEN
        RETURN NEW;
    END IF;

    -- Determinar status do card para verificação de regras
    v_card_status := COALESCE(NEW.status_comercial, 'ativo');

    -- 1. Detectar mudança de estágio
    IF OLD.pipeline_stage_id IS DISTINCT FROM NEW.pipeline_stage_id THEN
        -- Buscar mapeamento de estágio
        SELECT * INTO v_stage_mapping
        FROM public.integration_outbound_stage_map
        WHERE integration_id = v_integration_id
          AND internal_stage_id = NEW.pipeline_stage_id
          AND is_active = true
        LIMIT 1;

        IF v_stage_mapping IS NOT NULL AND v_allowed_events LIKE '%stage_change%' THEN
            v_event_type := 'stage_change';

            -- Verificar regras de outbound
            SELECT * INTO v_rule_result
            FROM check_outbound_trigger(
                v_integration_id,
                NEW.pipeline_id,
                NEW.pipeline_stage_id,
                NEW.responsavel_id,
                v_card_status,
                v_event_type,
                NULL
            );

            IF v_rule_result.allowed THEN
                v_payload := jsonb_build_object(
                    'old_stage_id', OLD.pipeline_stage_id,
                    'new_stage_id', NEW.pipeline_stage_id,
                    'target_external_stage_id', v_stage_mapping.external_stage_id,
                    'target_external_stage_name', v_stage_mapping.external_stage_name,
                    'shadow_mode', v_shadow_mode,
                    'matched_rule', v_rule_result.rule_name
                );

                INSERT INTO public.integration_outbound_queue (
                    card_id, integration_id, external_id, event_type, payload,
                    status, triggered_by
                ) VALUES (
                    NEW.id, v_integration_id, v_external_id, v_event_type, v_payload,
                    CASE WHEN v_shadow_mode THEN 'shadow' ELSE 'pending' END,
                    'system'
                );
            END IF;
        END IF;
    END IF;

    -- 2. Detectar status_comercial = ganho
    IF OLD.status_comercial IS DISTINCT FROM NEW.status_comercial AND NEW.status_comercial = 'ganho' THEN
        IF v_allowed_events LIKE '%won%' THEN
            v_event_type := 'won';

            -- Verificar regras de outbound
            SELECT * INTO v_rule_result
            FROM check_outbound_trigger(
                v_integration_id,
                NEW.pipeline_id,
                NEW.pipeline_stage_id,
                NEW.responsavel_id,
                v_card_status,
                v_event_type,
                NULL
            );

            IF v_rule_result.allowed THEN
                v_payload := jsonb_build_object(
                    'status', 'won',
                    'valor_final', NEW.valor_final,
                    'shadow_mode', v_shadow_mode,
                    'matched_rule', v_rule_result.rule_name
                );

                INSERT INTO public.integration_outbound_queue (
                    card_id, integration_id, external_id, event_type, payload,
                    status, triggered_by
                ) VALUES (
                    NEW.id, v_integration_id, v_external_id, v_event_type, v_payload,
                    CASE WHEN v_shadow_mode THEN 'shadow' ELSE 'pending' END,
                    'system'
                );
            END IF;
        END IF;
    END IF;

    -- 3. Detectar status_comercial = perdido
    IF OLD.status_comercial IS DISTINCT FROM NEW.status_comercial AND NEW.status_comercial = 'perdido' THEN
        IF v_allowed_events LIKE '%lost%' THEN
            v_event_type := 'lost';

            -- Verificar regras de outbound
            SELECT * INTO v_rule_result
            FROM check_outbound_trigger(
                v_integration_id,
                NEW.pipeline_id,
                NEW.pipeline_stage_id,
                NEW.responsavel_id,
                v_card_status,
                v_event_type,
                NULL
            );

            IF v_rule_result.allowed THEN
                v_payload := jsonb_build_object(
                    'status', 'lost',
                    'motivo_perda', NEW.motivo_perda_id,
                    'shadow_mode', v_shadow_mode,
                    'matched_rule', v_rule_result.rule_name
                );

                INSERT INTO public.integration_outbound_queue (
                    card_id, integration_id, external_id, event_type, payload,
                    status, triggered_by
                ) VALUES (
                    NEW.id, v_integration_id, v_external_id, v_event_type, v_payload,
                    CASE WHEN v_shadow_mode THEN 'shadow' ELSE 'pending' END,
                    'system'
                );
            END IF;
        END IF;
    END IF;

    -- 4. Detectar mudanças em campos mapeados
    IF v_allowed_events LIKE '%field_update%' THEN
        -- Verificar campos específicos que mudaram
        -- valor_estimado
        IF OLD.valor_estimado IS DISTINCT FROM NEW.valor_estimado THEN
            v_field_name := 'valor_estimado';

            -- Verificar regras de outbound para este campo
            SELECT * INTO v_rule_result
            FROM check_outbound_trigger(
                v_integration_id,
                NEW.pipeline_id,
                NEW.pipeline_stage_id,
                NEW.responsavel_id,
                v_card_status,
                'field_update',
                v_field_name
            );

            IF v_rule_result.allowed THEN
                v_payload := jsonb_build_object(
                    v_field_name, NEW.valor_estimado,
                    'shadow_mode', v_shadow_mode,
                    'matched_rule', v_rule_result.rule_name
                );

                INSERT INTO public.integration_outbound_queue (
                    card_id, integration_id, external_id, event_type, payload,
                    status, triggered_by
                ) VALUES (
                    NEW.id, v_integration_id, v_external_id, 'field_update', v_payload,
                    CASE WHEN v_shadow_mode THEN 'shadow' ELSE 'pending' END,
                    'system'
                );
            END IF;
        END IF;

        -- valor_final
        IF OLD.valor_final IS DISTINCT FROM NEW.valor_final THEN
            v_field_name := 'valor_final';

            SELECT * INTO v_rule_result
            FROM check_outbound_trigger(
                v_integration_id,
                NEW.pipeline_id,
                NEW.pipeline_stage_id,
                NEW.responsavel_id,
                v_card_status,
                'field_update',
                v_field_name
            );

            IF v_rule_result.allowed THEN
                v_payload := jsonb_build_object(
                    v_field_name, NEW.valor_final,
                    'shadow_mode', v_shadow_mode,
                    'matched_rule', v_rule_result.rule_name
                );

                INSERT INTO public.integration_outbound_queue (
                    card_id, integration_id, external_id, event_type, payload,
                    status, triggered_by
                ) VALUES (
                    NEW.id, v_integration_id, v_external_id, 'field_update', v_payload,
                    CASE WHEN v_shadow_mode THEN 'shadow' ELSE 'pending' END,
                    'system'
                );
            END IF;
        END IF;

        -- data_viagem_inicio
        IF OLD.data_viagem_inicio IS DISTINCT FROM NEW.data_viagem_inicio THEN
            v_field_name := 'data_viagem_inicio';

            SELECT * INTO v_rule_result
            FROM check_outbound_trigger(
                v_integration_id,
                NEW.pipeline_id,
                NEW.pipeline_stage_id,
                NEW.responsavel_id,
                v_card_status,
                'field_update',
                v_field_name
            );

            IF v_rule_result.allowed THEN
                v_payload := jsonb_build_object(
                    v_field_name, NEW.data_viagem_inicio,
                    'shadow_mode', v_shadow_mode,
                    'matched_rule', v_rule_result.rule_name
                );

                INSERT INTO public.integration_outbound_queue (
                    card_id, integration_id, external_id, event_type, payload,
                    status, triggered_by
                ) VALUES (
                    NEW.id, v_integration_id, v_external_id, 'field_update', v_payload,
                    CASE WHEN v_shadow_mode THEN 'shadow' ELSE 'pending' END,
                    'system'
                );
            END IF;
        END IF;

        -- data_viagem_fim
        IF OLD.data_viagem_fim IS DISTINCT FROM NEW.data_viagem_fim THEN
            v_field_name := 'data_viagem_fim';

            SELECT * INTO v_rule_result
            FROM check_outbound_trigger(
                v_integration_id,
                NEW.pipeline_id,
                NEW.pipeline_stage_id,
                NEW.responsavel_id,
                v_card_status,
                'field_update',
                v_field_name
            );

            IF v_rule_result.allowed THEN
                v_payload := jsonb_build_object(
                    v_field_name, NEW.data_viagem_fim,
                    'shadow_mode', v_shadow_mode,
                    'matched_rule', v_rule_result.rule_name
                );

                INSERT INTO public.integration_outbound_queue (
                    card_id, integration_id, external_id, event_type, payload,
                    status, triggered_by
                ) VALUES (
                    NEW.id, v_integration_id, v_external_id, 'field_update', v_payload,
                    CASE WHEN v_shadow_mode THEN 'shadow' ELSE 'pending' END,
                    'system'
                );
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- 6. Recriar trigger no cards
DROP TRIGGER IF EXISTS tr_log_outbound_card_event ON public.cards;
CREATE TRIGGER tr_log_outbound_card_event
    AFTER UPDATE ON public.cards
    FOR EACH ROW
    EXECUTE FUNCTION log_outbound_card_event();

-- 7. RLS Policies
ALTER TABLE public.integration_outbound_triggers ENABLE ROW LEVEL SECURITY;

-- Admin pode tudo
CREATE POLICY "Admins can manage outbound triggers"
    ON public.integration_outbound_triggers
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.papel IN ('admin', 'super_admin')
        )
    );

-- Usuários autenticados podem visualizar
CREATE POLICY "Authenticated users can view outbound triggers"
    ON public.integration_outbound_triggers
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- 8. Comentários
COMMENT ON TABLE public.integration_outbound_triggers IS 'Regras para controlar sincronização CRM → ActiveCampaign';
COMMENT ON COLUMN public.integration_outbound_triggers.source_pipeline_ids IS 'Pipelines do CRM que ativam a regra (NULL = qualquer)';
COMMENT ON COLUMN public.integration_outbound_triggers.source_stage_ids IS 'Estágios do CRM que ativam a regra (NULL = qualquer)';
COMMENT ON COLUMN public.integration_outbound_triggers.source_owner_ids IS 'Responsáveis do CRM que ativam a regra (NULL = qualquer)';
COMMENT ON COLUMN public.integration_outbound_triggers.source_status IS 'Status comercial que ativa a regra (NULL = qualquer)';
COMMENT ON COLUMN public.integration_outbound_triggers.event_types IS 'Tipos de evento: stage_change, field_update, won, lost';
COMMENT ON COLUMN public.integration_outbound_triggers.sync_field_mode IS 'all=todos campos, selected=apenas listados, exclude=todos exceto listados';
COMMENT ON COLUMN public.integration_outbound_triggers.action_mode IS 'allow=permite sincronização, block=bloqueia';
COMMENT ON COLUMN public.integration_outbound_triggers.priority IS 'Prioridade da regra (menor = mais prioritário)';
COMMENT ON FUNCTION check_outbound_trigger IS 'Verifica se evento deve ser processado baseado nas regras de outbound';
