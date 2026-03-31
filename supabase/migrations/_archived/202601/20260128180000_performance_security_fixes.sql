-- ============================================================
-- Migration: Performance & Security Fixes
-- Data: 2026-01-28
-- Autor: Vitor (via Claude)
--
-- BASEADO EM: Análise exaustiva do banco LIVE com evidências
--
-- Esta migration:
-- 1. Remove 4 índices duplicados (verificados com 0 usos)
-- 2. Corrige 6 RLS policies que permitem acesso PUBLIC indevido
-- ============================================================

-- ============================================================
-- ROLLBACK SCRIPTS (executar em caso de problemas)
-- ============================================================
/*
-- ROLLBACK PARTE 1: Recriar índices removidos
CREATE INDEX idx_cards_pessoa ON public.cards USING btree (pessoa_principal_id);
CREATE INDEX idx_card_settings_fase ON public.pipeline_card_settings USING btree (fase);
CREATE INDEX idx_card_settings_usuario ON public.pipeline_card_settings USING btree (usuario_id);
CREATE INDEX idx_proposal_client_selections_proposal ON public.proposal_client_selections USING btree (proposal_id);

-- ROLLBACK PARTE 2: Restaurar policies antigas de contato_meios
DROP POLICY IF EXISTS "contato_meios_delete" ON public.contato_meios;
DROP POLICY IF EXISTS "contato_meios_insert" ON public.contato_meios;
DROP POLICY IF EXISTS "contato_meios_select" ON public.contato_meios;
DROP POLICY IF EXISTS "contato_meios_update" ON public.contato_meios;

CREATE POLICY "contato_meios_delete" ON public.contato_meios FOR DELETE TO public USING (true);
CREATE POLICY "contato_meios_insert" ON public.contato_meios FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "contato_meios_select" ON public.contato_meios FOR SELECT TO public USING (true);
CREATE POLICY "contato_meios_update" ON public.contato_meios FOR UPDATE TO public USING (true);

-- ROLLBACK PARTE 3: Restaurar policies antigas de whatsapp_linha_config
DROP POLICY IF EXISTS "whatsapp_linha_config_all" ON public.whatsapp_linha_config;
DROP POLICY IF EXISTS "whatsapp_linha_config_select" ON public.whatsapp_linha_config;

CREATE POLICY "whatsapp_linha_config_all" ON public.whatsapp_linha_config FOR ALL TO public USING (true);
CREATE POLICY "whatsapp_linha_config_select" ON public.whatsapp_linha_config FOR SELECT TO public USING (true);
*/

-- ============================================================
-- PARTE 1: REMOVER ÍNDICES DUPLICADOS
-- ============================================================
-- Evidências do banco LIVE:
-- idx_cards_pessoa: 0 usos, 16KB (duplica idx_cards_pessoa_principal com 765 usos)
-- idx_card_settings_fase: 0 usos (duplica idx_pipeline_card_settings_fase)
-- idx_card_settings_usuario: 0 usos (duplica idx_pipeline_card_settings_usuario)
-- idx_proposal_client_selections_proposal: 0 usos (duplica idx_proposal_client_selections_proposal_id)

DROP INDEX IF EXISTS public.idx_cards_pessoa;
DROP INDEX IF EXISTS public.idx_card_settings_fase;
DROP INDEX IF EXISTS public.idx_card_settings_usuario;
DROP INDEX IF EXISTS public.idx_proposal_client_selections_proposal;

-- ============================================================
-- PARTE 2: CORRIGIR RLS POLICIES - contato_meios
-- ============================================================
-- PROBLEMA: Policies permitem acesso PUBLIC (não autenticado)
-- CORREÇÃO: Mudar para authenticated

-- 2.1 Remover policies antigas inseguras
DROP POLICY IF EXISTS "contato_meios_delete" ON public.contato_meios;
DROP POLICY IF EXISTS "contato_meios_insert" ON public.contato_meios;
DROP POLICY IF EXISTS "contato_meios_select" ON public.contato_meios;
DROP POLICY IF EXISTS "contato_meios_update" ON public.contato_meios;

-- 2.2 Criar policies seguras (apenas authenticated)
CREATE POLICY "contato_meios_select"
ON public.contato_meios
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "contato_meios_insert"
ON public.contato_meios
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "contato_meios_update"
ON public.contato_meios
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "contato_meios_delete"
ON public.contato_meios
FOR DELETE
TO authenticated
USING (true);

-- ============================================================
-- PARTE 3: CORRIGIR RLS POLICIES - whatsapp_linha_config
-- ============================================================
-- PROBLEMA: ALL policy para PUBLIC permite qualquer operação sem autenticação
-- CORREÇÃO: Mudar para authenticated + service_role para operações internas

-- 3.1 Remover policies antigas inseguras
DROP POLICY IF EXISTS "whatsapp_linha_config_all" ON public.whatsapp_linha_config;
DROP POLICY IF EXISTS "whatsapp_linha_config_select" ON public.whatsapp_linha_config;

-- 3.2 Criar policies seguras
-- Authenticated pode ler
CREATE POLICY "whatsapp_linha_config_select"
ON public.whatsapp_linha_config
FOR SELECT
TO authenticated
USING (true);

-- Apenas admins podem modificar
CREATE POLICY "whatsapp_linha_config_admin_modify"
ON public.whatsapp_linha_config
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'::app_role
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'::app_role
    )
);

-- Service role para operações internas (triggers, Edge Functions)
CREATE POLICY "whatsapp_linha_config_service_role"
ON public.whatsapp_linha_config
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================
-- VERIFICAÇÃO PÓS-APLICAÇÃO
-- ============================================================
-- Execute após aplicar para verificar:
/*
-- Verificar que índices foram removidos
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public'
AND indexname IN ('idx_cards_pessoa', 'idx_card_settings_fase',
                  'idx_card_settings_usuario', 'idx_proposal_client_selections_proposal');
-- Esperado: 0 rows

-- Verificar policies de contato_meios
SELECT policyname, roles FROM pg_policies
WHERE tablename = 'contato_meios';
-- Esperado: roles = {authenticated} para todas

-- Verificar policies de whatsapp_linha_config
SELECT policyname, roles FROM pg_policies
WHERE tablename = 'whatsapp_linha_config';
-- Esperado: authenticated e service_role, NÃO public
*/

-- ============================================================
-- COMENTÁRIOS DE DOCUMENTAÇÃO
-- ============================================================
COMMENT ON POLICY "contato_meios_select" ON public.contato_meios
IS 'Corrigido em 2026-01-28: Mudado de PUBLIC para authenticated por segurança';

COMMENT ON POLICY "whatsapp_linha_config_admin_modify" ON public.whatsapp_linha_config
IS 'Corrigido em 2026-01-28: Apenas admins podem modificar configurações de WhatsApp';
