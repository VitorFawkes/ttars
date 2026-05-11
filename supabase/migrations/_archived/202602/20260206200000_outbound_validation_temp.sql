-- ============================================================================
-- [TEMP] Outbound Validation - Resposta da API Active Campaign
-- ============================================================================
-- Adiciona coluna para armazenar resposta completa da API do AC
-- para validar se os campos estão sendo atualizados corretamente.
--
-- REMOVER QUANDO: Validação de sync estiver concluída
-- ============================================================================

-- Nova coluna para armazenar resposta da API
ALTER TABLE integration_outbound_queue
ADD COLUMN IF NOT EXISTS response_data jsonb;

-- Comentário indicando que é temporário
COMMENT ON COLUMN integration_outbound_queue.response_data IS
'[TEMP] Resposta da API do Active Campaign para validação de sync. Remover após testes.';

-- Index para queries de validação (eventos sent com response)
CREATE INDEX IF NOT EXISTS idx_outbound_queue_validation
ON integration_outbound_queue (status, integration_id)
WHERE status = 'sent' AND response_data IS NOT NULL;
