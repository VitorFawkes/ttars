-- =============================================================================
-- FIX OUTBOUND JSONB FIELDS
-- Adiciona monitoramento de campos JSONB (orcamento em produto_data)
-- Corrige mapeamento para usar external_field_id no payload
-- =============================================================================

-- =============================================================================
-- PART 1: HELPER FUNCTION - Get External Field ID
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_outbound_external_field_id(
    p_integration_id uuid,
    p_internal_field text
) RETURNS text AS $$
DECLARE
    v_external_id text;
BEGIN
    SELECT external_field_id INTO v_external_id
    FROM public.integration_outbound_field_map
    WHERE integration_id = p_integration_id
      AND internal_field = p_internal_field
      AND is_active = true
    LIMIT 1;

    RETURN v_external_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.get_outbound_external_field_id IS
'Retorna o external_field_id (ID do campo no ActiveCampaign) para um campo interno';

-- =============================================================================
-- PART 2: ATUALIZAR TRIGGER COM SUPORTE A JSONB E MAPEAMENTO CORRETO
-- =============================================================================

CREATE OR REPLACE FUNCTION public.log_outbound_card_event()
RETURNS TRIGGER AS $$
DECLARE
    v_integration_id uuid;
    v_outbound_stage_id text;
    v_outbound_stage_name text;
    v_current_phase_id uuid;
    v_sync_enabled boolean;
    v_shadow_mode boolean;
    v_allowed_events text[];
    v_event_status text;
    v_ac_field_id text;
    v_orcamento_value jsonb;
BEGIN
    -- Only process cards synced from external systems (have external_id)
    IF NEW.external_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Prevent infinite loops: skip if triggered by integration
    IF current_setting('app.update_source', true) = 'integration' THEN
        RETURN NEW;
    END IF;

    -- =========================================================================
    -- CHECK GLOBAL SETTINGS
    -- =========================================================================
    v_sync_enabled := COALESCE(public.get_outbound_setting('OUTBOUND_SYNC_ENABLED'), 'false') = 'true';
    v_shadow_mode := COALESCE(public.get_outbound_setting('OUTBOUND_SHADOW_MODE'), 'true') = 'true';

    -- If sync is disabled globally, exit early
    IF NOT v_sync_enabled THEN
        RETURN NEW;
    END IF;

    -- Get allowed event types
    v_allowed_events := string_to_array(
        COALESCE(public.get_outbound_setting('OUTBOUND_ALLOWED_EVENTS'), 'stage_change,won,lost,field_update'),
        ','
    );

    -- Determine event status based on shadow mode
    v_event_status := CASE WHEN v_shadow_mode THEN 'shadow' ELSE 'pending' END;

    -- =========================================================================
    -- FIND INTEGRATION
    -- =========================================================================
    SELECT id INTO v_integration_id
    FROM public.integrations
    WHERE (provider = NEW.external_source OR name ILIKE '%' || NEW.external_source || '%')
      AND active = true
    LIMIT 1;

    IF v_integration_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Get current phase for field sync decisions
    SELECT ps.phase_id INTO v_current_phase_id
    FROM public.pipeline_stages ps
    WHERE ps.id = NEW.pipeline_stage_id;

    -- ==========================================================================
    -- STAGE CHANGE DETECTION
    -- ==========================================================================
    IF OLD.pipeline_stage_id IS DISTINCT FROM NEW.pipeline_stage_id
       AND 'stage_change' = ANY(v_allowed_events) THEN
        -- Look up outbound stage mapping
        SELECT osm.external_stage_id, osm.external_stage_name
        INTO v_outbound_stage_id, v_outbound_stage_name
        FROM public.integration_outbound_stage_map osm
        WHERE osm.integration_id = v_integration_id
          AND osm.internal_stage_id = NEW.pipeline_stage_id
          AND osm.is_active = true;

        IF v_outbound_stage_id IS NOT NULL THEN
            INSERT INTO public.integration_outbound_queue (
                card_id, integration_id, external_id, event_type, payload, status, triggered_by
            ) VALUES (
                NEW.id,
                v_integration_id,
                NEW.external_id,
                'stage_change',
                jsonb_build_object(
                    'old_stage_id', OLD.pipeline_stage_id,
                    'new_stage_id', NEW.pipeline_stage_id,
                    'target_external_stage_id', v_outbound_stage_id,
                    'target_external_stage_name', v_outbound_stage_name,
                    'shadow_mode', v_shadow_mode
                ),
                v_event_status,
                'user'
            );
        END IF;
    END IF;

    -- ==========================================================================
    -- WON/LOST DETECTION (via status_comercial)
    -- ==========================================================================
    IF OLD.status_comercial IS DISTINCT FROM NEW.status_comercial THEN
        IF NEW.status_comercial = 'ganho' AND 'won' = ANY(v_allowed_events) THEN
            INSERT INTO public.integration_outbound_queue (
                card_id, integration_id, external_id, event_type, payload, status, triggered_by
            ) VALUES (
                NEW.id,
                v_integration_id,
                NEW.external_id,
                'won',
                jsonb_build_object(
                    'status', 'won',
                    'valor_final', NEW.valor_final,
                    'shadow_mode', v_shadow_mode
                ),
                v_event_status,
                'user'
            );
        ELSIF NEW.status_comercial = 'perdido' AND 'lost' = ANY(v_allowed_events) THEN
            INSERT INTO public.integration_outbound_queue (
                card_id, integration_id, external_id, event_type, payload, status, triggered_by
            ) VALUES (
                NEW.id,
                v_integration_id,
                NEW.external_id,
                'lost',
                jsonb_build_object(
                    'status', 'lost',
                    'reason', NEW.motivo_perda_id,
                    'shadow_mode', v_shadow_mode
                ),
                v_event_status,
                'user'
            );
        END IF;
    END IF;

    -- ==========================================================================
    -- FIELD CHANGE DETECTION (for mapped fields)
    -- Agora usa external_field_id do mapeamento como chave no payload
    -- ==========================================================================
    IF 'field_update' = ANY(v_allowed_events) THEN

        -- ======================================================================
        -- CAMPOS DIRETOS (colunas da tabela cards)
        -- ======================================================================

        -- Valor Estimado
        IF OLD.valor_estimado IS DISTINCT FROM NEW.valor_estimado THEN
            IF public.should_sync_field(v_integration_id, 'valor_estimado', v_current_phase_id) THEN
                v_ac_field_id := public.get_outbound_external_field_id(v_integration_id, 'valor_estimado');
                IF v_ac_field_id IS NOT NULL THEN
                    INSERT INTO public.integration_outbound_queue (
                        card_id, integration_id, external_id, event_type, payload, status, triggered_by
                    ) VALUES (
                        NEW.id, v_integration_id, NEW.external_id, 'field_update',
                        jsonb_build_object(v_ac_field_id, NEW.valor_estimado, 'shadow_mode', v_shadow_mode),
                        v_event_status,
                        'user'
                    );
                END IF;
            END IF;
        END IF;

        -- Valor Final
        IF OLD.valor_final IS DISTINCT FROM NEW.valor_final THEN
            IF public.should_sync_field(v_integration_id, 'valor_final', v_current_phase_id) THEN
                v_ac_field_id := public.get_outbound_external_field_id(v_integration_id, 'valor_final');
                IF v_ac_field_id IS NOT NULL THEN
                    INSERT INTO public.integration_outbound_queue (
                        card_id, integration_id, external_id, event_type, payload, status, triggered_by
                    ) VALUES (
                        NEW.id, v_integration_id, NEW.external_id, 'field_update',
                        jsonb_build_object(v_ac_field_id, NEW.valor_final, 'shadow_mode', v_shadow_mode),
                        v_event_status,
                        'user'
                    );
                END IF;
            END IF;
        END IF;

        -- Data Viagem Início
        IF OLD.data_viagem_inicio IS DISTINCT FROM NEW.data_viagem_inicio THEN
            IF public.should_sync_field(v_integration_id, 'data_viagem_inicio', v_current_phase_id) THEN
                v_ac_field_id := public.get_outbound_external_field_id(v_integration_id, 'data_viagem_inicio');
                IF v_ac_field_id IS NOT NULL THEN
                    INSERT INTO public.integration_outbound_queue (
                        card_id, integration_id, external_id, event_type, payload, status, triggered_by
                    ) VALUES (
                        NEW.id, v_integration_id, NEW.external_id, 'field_update',
                        jsonb_build_object(v_ac_field_id, NEW.data_viagem_inicio, 'shadow_mode', v_shadow_mode),
                        v_event_status,
                        'user'
                    );
                END IF;
            END IF;
        END IF;

        -- Data Viagem Fim
        IF OLD.data_viagem_fim IS DISTINCT FROM NEW.data_viagem_fim THEN
            IF public.should_sync_field(v_integration_id, 'data_viagem_fim', v_current_phase_id) THEN
                v_ac_field_id := public.get_outbound_external_field_id(v_integration_id, 'data_viagem_fim');
                IF v_ac_field_id IS NOT NULL THEN
                    INSERT INTO public.integration_outbound_queue (
                        card_id, integration_id, external_id, event_type, payload, status, triggered_by
                    ) VALUES (
                        NEW.id, v_integration_id, NEW.external_id, 'field_update',
                        jsonb_build_object(v_ac_field_id, NEW.data_viagem_fim, 'shadow_mode', v_shadow_mode),
                        v_event_status,
                        'user'
                    );
                END IF;
            END IF;
        END IF;

        -- ======================================================================
        -- CAMPOS JSONB (dentro de produto_data)
        -- ======================================================================

        -- Orçamento / Investimento (produto_data -> 'orcamento')
        IF (OLD.produto_data -> 'orcamento') IS DISTINCT FROM (NEW.produto_data -> 'orcamento') THEN
            IF public.should_sync_field(v_integration_id, 'orcamento', v_current_phase_id) THEN
                v_ac_field_id := public.get_outbound_external_field_id(v_integration_id, 'orcamento');
                IF v_ac_field_id IS NOT NULL THEN
                    -- Extrair valor do orçamento (pode ser objeto smart_budget ou valor simples)
                    v_orcamento_value := NEW.produto_data -> 'orcamento';

                    -- Se for smart_budget, extrair total_calculado; senão, usar valor direto
                    INSERT INTO public.integration_outbound_queue (
                        card_id, integration_id, external_id, event_type, payload, status, triggered_by
                    ) VALUES (
                        NEW.id, v_integration_id, NEW.external_id, 'field_update',
                        jsonb_build_object(
                            v_ac_field_id,
                            COALESCE(
                                v_orcamento_value -> 'total_calculado',
                                v_orcamento_value -> 'valor',
                                v_orcamento_value
                            ),
                            'shadow_mode', v_shadow_mode
                        ),
                        v_event_status,
                        'user'
                    );
                END IF;
            END IF;
        END IF;

        -- Destinos (produto_data -> 'destinos')
        IF (OLD.produto_data -> 'destinos') IS DISTINCT FROM (NEW.produto_data -> 'destinos') THEN
            IF public.should_sync_field(v_integration_id, 'destinos', v_current_phase_id) THEN
                v_ac_field_id := public.get_outbound_external_field_id(v_integration_id, 'destinos');
                IF v_ac_field_id IS NOT NULL THEN
                    INSERT INTO public.integration_outbound_queue (
                        card_id, integration_id, external_id, event_type, payload, status, triggered_by
                    ) VALUES (
                        NEW.id, v_integration_id, NEW.external_id, 'field_update',
                        jsonb_build_object(v_ac_field_id, NEW.produto_data ->> 'destinos', 'shadow_mode', v_shadow_mode),
                        v_event_status,
                        'user'
                    );
                END IF;
            END IF;
        END IF;

        -- Pax / Quantidade de pessoas (produto_data -> 'pax')
        IF (OLD.produto_data -> 'pax') IS DISTINCT FROM (NEW.produto_data -> 'pax') THEN
            IF public.should_sync_field(v_integration_id, 'pax', v_current_phase_id) THEN
                v_ac_field_id := public.get_outbound_external_field_id(v_integration_id, 'pax');
                IF v_ac_field_id IS NOT NULL THEN
                    INSERT INTO public.integration_outbound_queue (
                        card_id, integration_id, external_id, event_type, payload, status, triggered_by
                    ) VALUES (
                        NEW.id, v_integration_id, NEW.external_id, 'field_update',
                        jsonb_build_object(v_ac_field_id, NEW.produto_data ->> 'pax', 'shadow_mode', v_shadow_mode),
                        v_event_status,
                        'user'
                    );
                END IF;
            END IF;
        END IF;

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.log_outbound_card_event IS
'Logs card changes to outbound queue. Supports:
- Direct columns: valor_estimado, valor_final, data_viagem_inicio/fim
- JSONB fields: orcamento, destinos, pax (from produto_data)
- Uses external_field_id from mapping as payload key';

-- =============================================================================
-- PART 3: GARANTIR QUE O MAPEAMENTO EXISTE PARA ORCAMENTO
-- =============================================================================

-- Inserir mapeamento para orcamento se não existir
-- O AC Field ID "24" é "Qual o orçamento por pessoa?" baseado no sync-field-mappings.ts
-- Mas o usuário quer mapear para "Deal Value" que é um campo standard

-- Nota: O campo "Deal Value" no AC não é um custom field, é o campo deal[value]
-- Vamos adicionar um mapeamento especial que o dispatch vai entender

INSERT INTO public.integration_outbound_field_map (
    integration_id,
    internal_field,
    internal_field_label,
    external_field_id,
    external_field_name,
    section,
    sync_always,
    is_active
)
SELECT
    id,
    'orcamento',
    'Investimento / Orçamento',
    'deal[value]',  -- Campo standard do AC (não custom field)
    'Deal Value',
    'valor',
    true,  -- Sempre sincronizar
    true   -- Ativo
FROM public.integrations
WHERE provider = 'ActiveCampaign' OR name ILIKE '%ActiveCampaign%'
LIMIT 1
ON CONFLICT (integration_id, internal_field)
DO UPDATE SET
    external_field_id = EXCLUDED.external_field_id,
    external_field_name = EXCLUDED.external_field_name,
    is_active = true;

-- =============================================================================
-- COMENTÁRIOS
-- =============================================================================

COMMENT ON TABLE public.integration_outbound_field_map IS
'Mapeamento de campos internos para campos do ActiveCampaign.
external_field_id pode ser:
- ID numérico para custom fields (ex: "21", "24")
- Nome do campo standard (ex: "deal[value]", "deal[title]")';
