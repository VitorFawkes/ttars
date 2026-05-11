-- =============================================================================
-- FIX OUTBOUND FIELD IDs
-- Corrige external_field_id de nomes simbólicos (DEAL_*) para IDs numéricos
-- reais do ActiveCampaign, baseados no integration_catalog sincronizado.
--
-- Problema: O dispatch faz parseInt("DEAL_DESTINOS_DO_ROTEIRO") → NaN → 0
-- O AC API requer IDs numéricos para custom fields.
-- =============================================================================

-- Custom fields: simbólico → ID numérico do catálogo AC
UPDATE integration_outbound_field_map SET external_field_id = '148'
WHERE internal_field = 'destinos' AND external_field_id = 'DEAL_DESTINOS_DO_ROTEIRO';

UPDATE integration_outbound_field_map SET external_field_id = '149'
WHERE internal_field = 'data_viagem_inicio' AND external_field_id = 'DEAL_DATA_DE_EMBARQUE';

UPDATE integration_outbound_field_map SET external_field_id = '141'
WHERE internal_field = 'data_viagem_fim' AND external_field_id = 'DEAL_DATA_RETORNO_VIAGEM';

UPDATE integration_outbound_field_map SET external_field_id = '145'
WHERE internal_field = 'motivo' AND external_field_id = 'DEAL_QUAL_O_INTUITO_DA_VIAGEM';

UPDATE integration_outbound_field_map SET external_field_id = '81'
WHERE internal_field = 'origem' AND external_field_id = 'DEAL_WTCONSULTORAORIGEM_DE_LEAD';

UPDATE integration_outbound_field_map SET external_field_id = '161006'
WHERE internal_field = 'utm_source' AND external_field_id = 'DEAL_ORIGEM_DA_LTIMA_CONVERSO';

UPDATE integration_outbound_field_map SET external_field_id = '140'
WHERE internal_field = 'telefone' AND external_field_id = 'DEAL_TELEFONE';

UPDATE integration_outbound_field_map SET external_field_id = '135'
WHERE internal_field = 'prioridade' AND external_field_id = 'DEAL_LEAD_SCORE_2';

UPDATE integration_outbound_field_map SET external_field_id = '280'
WHERE internal_field = 'proxima_tarefa' AND external_field_id = 'DEAL_WC_AGENDAMENTO_DE_REUNIO';

UPDATE integration_outbound_field_map SET external_field_id = '284'
WHERE internal_field = 'ultima_interacao' AND external_field_id = 'DEAL_DATA_E_HORA_DO_GANHO';

UPDATE integration_outbound_field_map SET external_field_id = '151'
WHERE internal_field = 'pax' AND external_field_id = 'DEAL_QUANTAS_PESSOAS';

UPDATE integration_outbound_field_map SET external_field_id = '150'
WHERE internal_field = 'dias_ate_viagem' AND external_field_id = 'DEAL_QUANTOS_DIAS_DE_VIAGEM';

UPDATE integration_outbound_field_map SET external_field_id = '157'
WHERE internal_field = 'o_que_e_importante' AND external_field_id = 'DEAL_OBSERVAO';

-- Standard AC fields: simbólico → formato deal[*]
UPDATE integration_outbound_field_map SET external_field_id = 'deal[value]'
WHERE internal_field = 'valor_estimado' AND external_field_id = 'DEAL_VALUE';

UPDATE integration_outbound_field_map SET external_field_id = 'deal[status]'
WHERE internal_field = 'status_comercial' AND external_field_id = 'DEAL_STATUS';

-- Desativar campos que o AC gerencia automaticamente
UPDATE integration_outbound_field_map SET is_active = false
WHERE internal_field IN ('created_at', 'updated_at') AND external_field_id LIKE 'DEAL_%';

-- Desativar special_requests → DEAL_DESCRIPTION (ID simbólico inválido)
UPDATE integration_outbound_field_map SET is_active = false
WHERE internal_field = 'special_requests' AND external_field_id = 'DEAL_DESCRIPTION';

-- Verificação: alertar se ainda existem IDs simbólicos não corrigidos
DO $$
DECLARE v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM integration_outbound_field_map
    WHERE external_field_id LIKE 'DEAL_%' AND is_active = true;

    IF v_count > 0 THEN
        RAISE WARNING 'integration_outbound_field_map: % registros ainda com external_field_id simbólico!', v_count;
    ELSE
        RAISE NOTICE 'integration_outbound_field_map: todos os IDs simbólicos corrigidos com sucesso.';
    END IF;
END $$;
