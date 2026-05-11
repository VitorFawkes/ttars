-- Migration: Security Cleanup
-- Data: 2026-01-28
-- Autor: Vitor (via Claude)
--
-- Esta migration:
-- 1. Remove functions órfãs identificadas na auditoria de segurança
-- 2. Habilita RLS nas tabelas de integração que estavam expostas
-- 3. Cria policies apropriadas para cada tabela

-- ============================================================
-- PARTE 1: REMOVER FUNCTIONS ÓRFÃS
-- ============================================================

-- 1.1 log_tarefa_activity (v1) - substituída por log_tarefa_activity_v2
-- O trigger tarefa_activity_trigger_v2 já usa a v2
DROP FUNCTION IF EXISTS public.log_tarefa_activity();

-- 1.2 is_privileged_user - nunca foi usada em RLS, triggers ou código
DROP FUNCTION IF EXISTS public.is_privileged_user();

-- 1.3 is_card_owner - nunca foi usada em RLS, triggers ou código
-- Pode ter diferentes assinaturas, removemos todas
DROP FUNCTION IF EXISTS public.is_card_owner(UUID);
DROP FUNCTION IF EXISTS public.is_card_owner();

-- 1.4 pode_avancar_etapa - nunca foi usada em RLS, triggers ou código
DROP FUNCTION IF EXISTS public.pode_avancar_etapa(UUID, UUID);
DROP FUNCTION IF EXISTS public.pode_avancar_etapa();

-- ============================================================
-- PARTE 2: HABILITAR RLS NAS TABELAS DE INTEGRAÇÃO
-- ============================================================

-- 2.1 integration_settings
-- Contém: API keys, credenciais, configurações sensíveis
-- Acesso: Apenas admins

ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Admins podem ler
CREATE POLICY "integration_settings_admin_select"
ON public.integration_settings
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'::app_role
    )
);

-- Policy: Admins podem modificar
CREATE POLICY "integration_settings_admin_all"
ON public.integration_settings
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

-- Policy: Service role (para functions internas como process_whatsapp_raw_event_v2)
CREATE POLICY "integration_settings_service_role"
ON public.integration_settings
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 2.2 integration_field_map
-- Contém: Mapeamento de campos entre sistemas
-- Acesso: Admins para modificar, authenticated para ler

ALTER TABLE public.integration_field_map ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated podem ler (necessário para UI de mapeamento)
CREATE POLICY "integration_field_map_authenticated_select"
ON public.integration_field_map
FOR SELECT
TO authenticated
USING (true);

-- Policy: Admins podem modificar
CREATE POLICY "integration_field_map_admin_all"
ON public.integration_field_map
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

-- Policy: Service role (para processamento automático)
CREATE POLICY "integration_field_map_service_role"
ON public.integration_field_map
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 2.3 integration_outbox
-- Contém: Fila de eventos para sincronização
-- Acesso: Authenticated para ler, service_role para processar

ALTER TABLE public.integration_outbox ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated podem ler (para ver status de sync)
CREATE POLICY "integration_outbox_authenticated_select"
ON public.integration_outbox
FOR SELECT
TO authenticated
USING (true);

-- Policy: Apenas admins podem inserir manualmente (raro)
CREATE POLICY "integration_outbox_admin_insert"
ON public.integration_outbox
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'::app_role
    )
);

-- Policy: Service role para processamento (triggers e jobs)
CREATE POLICY "integration_outbox_service_role"
ON public.integration_outbox
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================
-- PARTE 3: COMENTÁRIOS DE DOCUMENTAÇÃO
-- ============================================================

COMMENT ON POLICY "integration_settings_admin_select" ON public.integration_settings
IS 'Apenas admins podem ver configurações de integração (contém API keys)';

COMMENT ON POLICY "integration_field_map_authenticated_select" ON public.integration_field_map
IS 'Todos autenticados podem ver mapeamentos para exibição na UI';

COMMENT ON POLICY "integration_outbox_authenticated_select" ON public.integration_outbox
IS 'Todos autenticados podem ver status de sincronização';
