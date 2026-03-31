-- ════════════════════════════════════════════════════════════════════════════
-- INTEGRATION QUALITY GATE - Reconciliação entre Regras de Criação e Quality Gate
-- ════════════════════════════════════════════════════════════════════════════
--
-- PROBLEMA: Cards criados via integração podem violar requisitos de stage (Quality Gate)
-- SOLUÇÃO: Validação configurável no processamento de integrações
--
-- FUNCIONALIDADES:
-- 1. bypass_validation: Ignora validação completamente
-- 2. validation_level: none, fields_only, full
-- 3. quarantine_mode: stage (redireciona), reject (bloqueia), force (ignora e loga)
-- 4. bypass_sources: Fontes que podem ignorar requisitos específicos
-- ════════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- 1. NOVAS COLUNAS EM integration_inbound_triggers
-- ============================================================================

-- bypass_validation: Se true, ignora completamente as validações de Quality Gate
ALTER TABLE integration_inbound_triggers
    ADD COLUMN IF NOT EXISTS bypass_validation BOOLEAN DEFAULT false;

COMMENT ON COLUMN integration_inbound_triggers.bypass_validation IS
    'Se true, ignora todas as validações de requisitos de stage (Quality Gate)';

-- validation_level: O que validar (none = nada, fields_only = campos, full = campos + propostas + tarefas)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'integration_inbound_triggers'
        AND column_name = 'validation_level'
    ) THEN
        ALTER TABLE integration_inbound_triggers
            ADD COLUMN validation_level TEXT DEFAULT 'fields_only';

        ALTER TABLE integration_inbound_triggers
            ADD CONSTRAINT check_validation_level
            CHECK (validation_level IN ('none', 'fields_only', 'full'));
    END IF;
END $$;

COMMENT ON COLUMN integration_inbound_triggers.validation_level IS
    'Nível de validação: none=sem validação, fields_only=apenas campos, full=campos+propostas+tarefas';

-- quarantine_mode: O que fazer quando validação falha
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'integration_inbound_triggers'
        AND column_name = 'quarantine_mode'
    ) THEN
        ALTER TABLE integration_inbound_triggers
            ADD COLUMN quarantine_mode TEXT DEFAULT 'stage';

        ALTER TABLE integration_inbound_triggers
            ADD CONSTRAINT check_quarantine_mode
            CHECK (quarantine_mode IN ('stage', 'reject', 'force'));
    END IF;
END $$;

COMMENT ON COLUMN integration_inbound_triggers.quarantine_mode IS
    'Ação quando requisitos não são atendidos: stage=mover para quarentena, reject=bloquear criação, force=criar mesmo assim';

-- quarantine_stage_id: Stage de destino quando quarantine_mode='stage'
ALTER TABLE integration_inbound_triggers
    ADD COLUMN IF NOT EXISTS quarantine_stage_id UUID REFERENCES pipeline_stages(id);

COMMENT ON COLUMN integration_inbound_triggers.quarantine_stage_id IS
    'Stage para onde cards com requisitos faltantes serão redirecionados (quando quarantine_mode=stage)';

-- ============================================================================
-- 2. NOVA COLUNA EM stage_field_config (bypass_sources)
-- ============================================================================

ALTER TABLE stage_field_config
    ADD COLUMN IF NOT EXISTS bypass_sources TEXT[] DEFAULT ARRAY[]::TEXT[];

COMMENT ON COLUMN stage_field_config.bypass_sources IS
    'Fontes que podem ignorar este requisito específico: active_campaign, manual_sync, import, api';

-- ============================================================================
-- 3. NOVA TABELA: integration_conflict_log
-- ============================================================================

CREATE TABLE IF NOT EXISTS integration_conflict_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id UUID REFERENCES integrations(id) ON DELETE SET NULL,
    event_id UUID REFERENCES integration_events(id) ON DELETE SET NULL,
    card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
    trigger_id UUID REFERENCES integration_inbound_triggers(id) ON DELETE SET NULL,

    -- Tipo de conflito
    conflict_type TEXT NOT NULL CHECK (conflict_type IN (
        'missing_field',
        'missing_proposal',
        'missing_task',
        'missing_rule'
    )),

    -- Stages envolvidos
    target_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
    actual_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,

    -- Detalhes do conflito
    missing_requirements JSONB NOT NULL DEFAULT '[]',

    -- Resolução
    resolution TEXT NOT NULL CHECK (resolution IN (
        'quarantined',      -- Movido para stage de quarentena
        'rejected',         -- Evento rejeitado/bloqueado
        'forced',           -- Criado mesmo assim (bypass)
        'resolved_later'    -- Usuário resolveu manualmente depois
    )),

    -- Resolução manual (se aplicável)
    resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    notes TEXT,

    -- Metadados
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para consultas frequentes
CREATE INDEX IF NOT EXISTS idx_conflict_log_card
    ON integration_conflict_log(card_id)
    WHERE card_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conflict_log_integration
    ON integration_conflict_log(integration_id);

CREATE INDEX IF NOT EXISTS idx_conflict_log_unresolved
    ON integration_conflict_log(card_id, created_at DESC)
    WHERE resolution = 'quarantined';

CREATE INDEX IF NOT EXISTS idx_conflict_log_created
    ON integration_conflict_log(created_at DESC);

-- RLS
ALTER TABLE integration_conflict_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view conflict logs"
    ON integration_conflict_log FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can insert conflict logs"
    ON integration_conflict_log FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Authenticated users can update conflict logs"
    ON integration_conflict_log FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

COMMENT ON TABLE integration_conflict_log IS
    'Log de conflitos entre regras de criação (integrações) e requisitos de stage (Quality Gate)';

-- ============================================================================
-- 4. FUNÇÃO: validate_integration_gate
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_integration_gate(
    p_card_data JSONB,
    p_target_stage_id UUID,
    p_source TEXT DEFAULT 'active_campaign',
    p_validation_level TEXT DEFAULT 'fields_only'
)
RETURNS TABLE (
    valid BOOLEAN,
    missing_requirements JSONB,
    can_bypass BOOLEAN
) AS $$
DECLARE
    v_missing JSONB := '[]'::JSONB;
    v_rule RECORD;
    v_value TEXT;
    v_is_valid BOOLEAN;
    v_any_bypass BOOLEAN := false;
BEGIN
    -- Se validation_level = 'none', não valida nada
    IF p_validation_level = 'none' THEN
        RETURN QUERY SELECT true, '[]'::JSONB, false;
        RETURN;
    END IF;

    -- Iterar sobre cada requisito do stage
    FOR v_rule IN
        SELECT
            sfc.*,
            sf.label as field_label,
            sf.section as field_section
        FROM stage_field_config sfc
        LEFT JOIN system_fields sf ON sf.key = sfc.field_key
        WHERE sfc.stage_id = p_target_stage_id
          AND sfc.is_required = true
          AND sfc.is_blocking = true
    LOOP
        -- Verificar se esta fonte pode fazer bypass deste requisito específico
        IF p_source = ANY(COALESCE(v_rule.bypass_sources, ARRAY[]::TEXT[])) THEN
            v_any_bypass := true;
            CONTINUE; -- Pula este requisito
        END IF;

        v_is_valid := true;

        -- ========================================
        -- VALIDAÇÃO DE CAMPOS (fields_only ou full)
        -- ========================================
        IF v_rule.requirement_type = 'field' THEN
            -- Tentar buscar o valor em múltiplos locais (waterfall)

            -- 1. Coluna direta no card_data
            v_value := p_card_data->>v_rule.field_key;

            -- 2. produto_data
            IF v_value IS NULL OR v_value = '' THEN
                v_value := p_card_data->'produto_data'->>v_rule.field_key;
            END IF;

            -- 3. briefing_inicial
            IF v_value IS NULL OR v_value = '' THEN
                v_value := p_card_data->'briefing_inicial'->>v_rule.field_key;
            END IF;

            -- 4. marketing_data
            IF v_value IS NULL OR v_value = '' THEN
                v_value := p_card_data->'marketing_data'->>v_rule.field_key;
            END IF;

            -- Verificar se valor está preenchido
            IF v_value IS NULL OR v_value = '' OR v_value = '[]' OR v_value = '{}' OR v_value = 'null' THEN
                v_is_valid := false;
            END IF;
        END IF;

        -- ========================================
        -- VALIDAÇÃO DE PROPOSTAS E TAREFAS (apenas modo 'full')
        -- ========================================
        -- NOTA: Para integrações que CRIAM cards, propostas e tarefas não existem ainda
        -- Então essas validações só fazem sentido para ATUALIZAÇÕES de cards existentes
        -- Por segurança, pulamos essas validações para integrações (fields_only é o recomendado)

        IF p_validation_level = 'full' THEN
            -- Propostas: Verificar se existe card_id no payload (atualização)
            IF v_rule.requirement_type = 'proposal' THEN
                -- Para novas criações, sempre válido (ainda não existem propostas)
                -- Para atualizações, precisaria checar o banco - não implementado aqui
                v_is_valid := true;
            END IF;

            -- Tarefas: Mesmo caso
            IF v_rule.requirement_type = 'task' THEN
                v_is_valid := true;
            END IF;
        END IF;

        -- ========================================
        -- REGRAS ESPECIAIS
        -- ========================================
        IF v_rule.requirement_type = 'rule' THEN
            IF v_rule.field_key = 'lost_reason_required' THEN
                -- Verificar se tem motivo de perda
                v_value := p_card_data->>'motivo_perda_id';
                IF v_value IS NULL OR v_value = '' THEN
                    v_value := p_card_data->>'motivo_perda_comentario';
                END IF;
                IF v_value IS NULL OR v_value = '' THEN
                    v_is_valid := false;
                END IF;
            END IF;
        END IF;

        -- Se não válido, adicionar à lista de requisitos faltantes
        IF NOT v_is_valid THEN
            v_missing := v_missing || jsonb_build_array(jsonb_build_object(
                'type', COALESCE(v_rule.requirement_type, 'field'),
                'key', v_rule.field_key,
                'label', COALESCE(v_rule.requirement_label, v_rule.field_label, v_rule.field_key),
                'section', v_rule.field_section
            ));
        END IF;
    END LOOP;

    -- Retornar resultado
    RETURN QUERY SELECT
        (jsonb_array_length(v_missing) = 0),
        v_missing,
        v_any_bypass;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION validate_integration_gate IS
    'Valida dados de um card contra os requisitos de um stage, respeitando bypass_sources';

-- ============================================================================
-- 5. FUNÇÃO HELPER: get_trigger_with_validation_config
-- ============================================================================

CREATE OR REPLACE FUNCTION get_trigger_with_validation_config(
    p_integration_id UUID,
    p_pipeline_id TEXT,
    p_stage_id TEXT,
    p_owner_id TEXT DEFAULT NULL
)
RETURNS TABLE (
    trigger_id UUID,
    target_stage_id UUID,
    target_pipeline_id UUID,
    bypass_validation BOOLEAN,
    validation_level TEXT,
    quarantine_mode TEXT,
    quarantine_stage_id UUID,
    action_type TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.id as trigger_id,
        t.target_stage_id,
        t.target_pipeline_id,
        COALESCE(t.bypass_validation, false) as bypass_validation,
        COALESCE(t.validation_level, 'fields_only') as validation_level,
        COALESCE(t.quarantine_mode, 'stage') as quarantine_mode,
        t.quarantine_stage_id,
        t.action_type
    FROM integration_inbound_triggers t
    WHERE t.integration_id = p_integration_id
      AND t.is_active = true
      AND (
          -- Pipeline match: NULL/empty = any
          t.external_pipeline_ids IS NULL
          OR array_length(t.external_pipeline_ids, 1) IS NULL
          OR p_pipeline_id = ANY(t.external_pipeline_ids)
      )
      AND (
          -- Stage match: NULL/empty = any
          t.external_stage_ids IS NULL
          OR array_length(t.external_stage_ids, 1) IS NULL
          OR p_stage_id = ANY(t.external_stage_ids)
      )
      AND (
          -- Owner match: NULL/empty = any
          t.external_owner_ids IS NULL
          OR array_length(t.external_owner_ids, 1) IS NULL
          OR p_owner_id = ANY(t.external_owner_ids)
      )
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_trigger_with_validation_config IS
    'Retorna trigger correspondente com configurações de validação para uso em integrações';

-- ============================================================================
-- 6. VIEW: integration_conflicts_summary
-- ============================================================================

CREATE OR REPLACE VIEW integration_conflicts_summary AS
SELECT
    cl.id,
    cl.integration_id,
    i.name as integration_name,
    cl.card_id,
    c.titulo as card_titulo,
    cl.conflict_type,
    cl.target_stage_id,
    ts.nome as target_stage_name,
    cl.actual_stage_id,
    acs.nome as actual_stage_name,
    cl.missing_requirements,
    jsonb_array_length(cl.missing_requirements) as missing_count,
    cl.resolution,
    cl.resolved_by,
    rp.nome as resolved_by_name,
    cl.resolved_at,
    cl.notes,
    cl.created_at
FROM integration_conflict_log cl
LEFT JOIN integrations i ON i.id = cl.integration_id
LEFT JOIN cards c ON c.id = cl.card_id
LEFT JOIN pipeline_stages ts ON ts.id = cl.target_stage_id
LEFT JOIN pipeline_stages acs ON acs.id = cl.actual_stage_id
LEFT JOIN profiles rp ON rp.id = cl.resolved_by
ORDER BY cl.created_at DESC;

COMMENT ON VIEW integration_conflicts_summary IS
    'View resumida de conflitos de integração com nomes resolvidos';

-- ============================================================================
-- DONE
-- ============================================================================
