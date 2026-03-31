-- ============================================================
-- Migration: Remove Unused Indexes
-- Data: 2026-01-28
-- Autor: Vitor (via Claude)
--
-- CRITÉRIOS DE REMOÇÃO (todos devem ser verdadeiros):
-- 1. idx_scan = 0 (nunca usado)
-- 2. NÃO é UNIQUE (não enforça constraints)
-- 3. NÃO é em coluna de FK (não afeta DELETE CASCADE)
-- 4. NÃO é usado por jobs de background (queue, status, pending)
-- 5. NÃO é índice de segurança (token, hash, external)
-- 6. NÃO é índice GIN/trigram (usado para busca)
--
-- ECONOMIA ESTIMADA: ~776 KB
-- IMPACTO: Melhora performance de escrita (INSERT/UPDATE)
-- ============================================================

-- ============================================================
-- ROLLBACK: Execute os CREATE INDEX comentados abaixo se necessário
-- ============================================================

-- ============================================================
-- PARTE 1: Tabela tarefas (208 KB)
-- ============================================================

-- ROLLBACK: CREATE INDEX idx_tarefas_resultado ON public.tarefas USING btree (resultado);
DROP INDEX IF EXISTS public.idx_tarefas_resultado;

-- ============================================================
-- PARTE 2: Tabela whatsapp_messages (168 KB total)
-- ============================================================

-- ROLLBACK: CREATE INDEX idx_whatsapp_messages_conversation ON public.whatsapp_messages USING btree (conversation_id);
DROP INDEX IF EXISTS public.idx_whatsapp_messages_conversation;

-- ROLLBACK: CREATE INDEX idx_whatsapp_messages_sender_phone ON public.whatsapp_messages USING btree (sender_phone);
DROP INDEX IF EXISTS public.idx_whatsapp_messages_sender_phone;

-- ROLLBACK: CREATE INDEX idx_whatsapp_messages_agent_email ON public.whatsapp_messages USING btree (agent_email);
DROP INDEX IF EXISTS public.idx_whatsapp_messages_agent_email;

-- ROLLBACK: CREATE INDEX idx_whatsapp_messages_sector ON public.whatsapp_messages USING btree (sector);
DROP INDEX IF EXISTS public.idx_whatsapp_messages_sector;

-- ROLLBACK: CREATE INDEX idx_whatsapp_messages_produto ON public.whatsapp_messages USING btree (produto) WHERE (produto IS NOT NULL);
DROP INDEX IF EXISTS public.idx_whatsapp_messages_produto;

-- ROLLBACK: CREATE INDEX idx_whatsapp_messages_organization ON public.whatsapp_messages USING btree (organization);
DROP INDEX IF EXISTS public.idx_whatsapp_messages_organization;

-- ============================================================
-- PARTE 3: Tabela contatos (88 KB total)
-- ============================================================

-- ROLLBACK: CREATE INDEX idx_contatos_nome ON public.contatos USING btree (nome);
DROP INDEX IF EXISTS public.idx_contatos_nome;

-- ROLLBACK: CREATE INDEX idx_contatos_data_nascimento ON public.contatos USING btree (data_nascimento) WHERE (data_nascimento IS NOT NULL);
DROP INDEX IF EXISTS public.idx_contatos_data_nascimento;

-- ROLLBACK: CREATE INDEX idx_contatos_tipo_pessoa ON public.contatos USING btree (tipo_pessoa);
DROP INDEX IF EXISTS public.idx_contatos_tipo_pessoa;

-- ============================================================
-- PARTE 4: Tabela proposal_library (64 KB total)
-- Nota: Mantidos idx_library_name_trgm e idx_library_tags (GIN)
-- ============================================================

-- ROLLBACK: CREATE INDEX idx_library_recent ON public.proposal_library USING btree (last_used_at DESC NULLS LAST);
DROP INDEX IF EXISTS public.idx_library_recent;

-- ROLLBACK: CREATE INDEX idx_library_destination ON public.proposal_library USING btree (destination);
DROP INDEX IF EXISTS public.idx_library_destination;

-- ROLLBACK: CREATE INDEX idx_library_supplier ON public.proposal_library USING btree (supplier);
DROP INDEX IF EXISTS public.idx_library_supplier;

-- ROLLBACK: CREATE INDEX idx_library_category ON public.proposal_library USING btree (category);
DROP INDEX IF EXISTS public.idx_library_category;

-- ============================================================
-- PARTE 5: Tabela sections (32 KB total)
-- ============================================================

-- ROLLBACK: CREATE INDEX idx_sections_position ON public.sections USING btree ("position") WHERE (active = true);
DROP INDEX IF EXISTS public.idx_sections_position;

-- ROLLBACK: CREATE INDEX idx_sections_active_order ON public.sections USING btree (active, order_index);
DROP INDEX IF EXISTS public.idx_sections_active_order;

-- ============================================================
-- PARTE 6: Tabela proposal_templates (32 KB total)
-- ============================================================

-- ROLLBACK: CREATE INDEX idx_templates_recent ON public.proposal_templates USING btree (last_used_at DESC NULLS LAST);
DROP INDEX IF EXISTS public.idx_templates_recent;

-- ROLLBACK: CREATE INDEX idx_proposal_templates_global ON public.proposal_templates USING btree (is_global) WHERE (is_global = true);
DROP INDEX IF EXISTS public.idx_proposal_templates_global;

-- ============================================================
-- PARTE 7: Outras tabelas (pequenas, 8-16 KB cada)
-- ============================================================

-- pipeline_card_settings
-- ROLLBACK: CREATE INDEX idx_pipeline_card_settings_fase ON public.pipeline_card_settings USING btree (fase);
DROP INDEX IF EXISTS public.idx_pipeline_card_settings_fase;

-- automation_rules
-- ROLLBACK: CREATE INDEX idx_automation_rules_stage ON public.automation_rules USING btree (trigger_stage_id);
DROP INDEX IF EXISTS public.idx_automation_rules_stage;

-- contato_meios (manter idx_contato_meios_unique que é UNIQUE)
-- ROLLBACK: CREATE INDEX idx_contato_meios_busca ON public.contato_meios USING btree (tipo, valor_normalizado);
DROP INDEX IF EXISTS public.idx_contato_meios_busca;

-- stage_field_config
-- ROLLBACK: CREATE INDEX idx_stage_field_config_requirement_type ON public.stage_field_config USING btree (requirement_type);
DROP INDEX IF EXISTS public.idx_stage_field_config_requirement_type;

-- integrations
-- ROLLBACK: CREATE INDEX idx_integrations_type ON public.integrations USING btree (type);
DROP INDEX IF EXISTS public.idx_integrations_type;

-- text_blocks
-- ROLLBACK: CREATE INDEX idx_text_blocks_category ON public.text_blocks USING btree (category);
DROP INDEX IF EXISTS public.idx_text_blocks_category;

-- proposal_flights
-- ROLLBACK: CREATE INDEX idx_flights_leg ON public.proposal_flights USING btree (trip_leg);
DROP INDEX IF EXISTS public.idx_flights_leg;

-- ROLLBACK: CREATE INDEX idx_flights_option ON public.proposal_flights USING btree (option_group);
DROP INDEX IF EXISTS public.idx_flights_option;

-- card_owner_history
-- ROLLBACK: CREATE INDEX idx_owner_history_started_at ON public.card_owner_history USING btree (started_at DESC);
DROP INDEX IF EXISTS public.idx_owner_history_started_at;

-- pipeline_config
-- ROLLBACK: CREATE INDEX idx_pipeline_config_type ON public.pipeline_config USING btree (config_type);
DROP INDEX IF EXISTS public.idx_pipeline_config_type;

-- mensagens
-- ROLLBACK: CREATE INDEX idx_mensagens_canal ON public.mensagens USING btree (canal);
DROP INDEX IF EXISTS public.idx_mensagens_canal;

-- ROLLBACK: CREATE INDEX idx_mensagens_data ON public.mensagens USING btree (data_hora);
DROP INDEX IF EXISTS public.idx_mensagens_data;

-- destinations
-- ROLLBACK: CREATE INDEX idx_destinations_country ON public.destinations USING btree (country);
DROP INDEX IF EXISTS public.idx_destinations_country;

-- ROLLBACK: CREATE INDEX idx_destinations_name ON public.destinations USING btree (lower(name));
DROP INDEX IF EXISTS public.idx_destinations_name;

-- proposal_events
-- ROLLBACK: CREATE INDEX idx_proposal_events_type ON public.proposal_events USING btree (event_type);
DROP INDEX IF EXISTS public.idx_proposal_events_type;

-- reunioes
-- ROLLBACK: CREATE INDEX idx_reunioes_resultado ON public.reunioes USING btree (resultado);
DROP INDEX IF EXISTS public.idx_reunioes_resultado;

-- participacoes (não é FK - pessoa_id não referencia outra tabela)
-- ROLLBACK: CREATE INDEX idx_participacoes_pessoa ON public.participacoes USING btree (pessoa_id);
DROP INDEX IF EXISTS public.idx_participacoes_pessoa;

-- api_request_logs
-- ROLLBACK: CREATE INDEX idx_api_logs_created ON public.api_request_logs USING btree (created_at DESC);
DROP INDEX IF EXISTS public.idx_api_logs_created;

-- ============================================================
-- TOTAL: 36 índices removidos
-- ECONOMIA: ~776 KB de storage + melhoria em escrita
-- ============================================================
