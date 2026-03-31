-- Migration: Adicionar action_type 'update_only' e permitir arrays null (qualquer)
-- Autor: Claude (Vitor via Claude)
-- Data: 2026-01-29

-- 1. Remover constraint antiga e adicionar nova com 'update_only'
ALTER TABLE public.integration_inbound_triggers
    DROP CONSTRAINT IF EXISTS integration_inbound_triggers_action_type_check;

ALTER TABLE public.integration_inbound_triggers
    ADD CONSTRAINT integration_inbound_triggers_action_type_check
    CHECK (action_type IN ('create_only', 'all', 'update_only'));

-- 2. Atualizar comentário
COMMENT ON COLUMN public.integration_inbound_triggers.action_type IS
    'create_only = apenas deal_add cria card | update_only = apenas deal_update atualiza card existente | all = ambos';

-- 3. Permitir que external_pipeline_ids e external_stage_ids sejam NULL (significa "qualquer")
-- Nota: os campos já são nullable por padrão, então nada precisa ser alterado estruturalmente
-- Mas vamos adicionar comentários explicativos

COMMENT ON COLUMN public.integration_inbound_triggers.external_pipeline_ids IS
    'Array de IDs de pipeline do AC. NULL = qualquer pipeline';
COMMENT ON COLUMN public.integration_inbound_triggers.external_stage_ids IS
    'Array de IDs de etapa do AC. NULL = qualquer etapa';
COMMENT ON COLUMN public.integration_inbound_triggers.external_owner_ids IS
    'Array de IDs de donos do AC. NULL = qualquer pessoa';
