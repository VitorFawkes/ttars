-- ============================================================================
-- MIGRATION: contadores de cancelados/reativados no histórico de uploads Monde
-- Date: 2026-05-11
--
-- Permite ao usuário ver, depois do upload, quantos produtos foram cancelados
-- e quantos foram reativados naquele import — direto na tabela de histórico
-- da página Vendas Monde.
-- ============================================================================

ALTER TABLE public.monde_import_logs
  ADD COLUMN IF NOT EXISTS products_cancelled INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS products_reactivated INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.monde_import_logs.products_cancelled IS
  'Total de produtos arquivados como ''monde_cancelamento'' neste upload (Data Cancelamento preenchida na planilha).';
COMMENT ON COLUMN public.monde_import_logs.products_reactivated IS
  'Total de produtos previamente cancelados que voltaram (Data Cancelamento ficou vazia neste upload).';
