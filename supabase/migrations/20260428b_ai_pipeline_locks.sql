-- ============================================================================
-- MIGRATION: ai_pipeline_locks — lock de pipeline por contato
-- Date: 2026-04-28
--
-- Bug observado em prod 28/04 conv d05b1fae: Vitor mandou 2 mensagens em
-- ~2s de diferença. Pipeline A começou processando a 1ª, pipeline B começou
-- em paralelo processando a 2ª (antes de A terminar). Resultado: duas
-- respostas diferentes da Estela pra mesmo input — cliente vê inconsistência.
--
-- Causa raiz: claim atômico do buffer protege contra duplo claim das mesmas
-- rows, mas NÃO previne que um drain "novo" (com novas msgs) rode em paralelo
-- enquanto o anterior está no meio do pipeline (que demora ~10-30s).
--
-- Fix: lock por contact_phone com TTL. Antes de entrar no pipeline pesado,
-- o router tenta adquirir o lock. Se outro pipeline está ativo, agenda drain
-- pra depois e bail. TTL de 90s cobre worst case (pipeline trava → outro
-- drain consegue eventualmente).
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_pipeline_locks (
  contact_phone TEXT PRIMARY KEY,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

COMMENT ON TABLE ai_pipeline_locks IS
  'Lock por contato pra prevenir pipelines concorrentes em ai-agent-router. Evita 2 respostas pra mesmo input quando lead manda mensagens rapidamente.';

CREATE INDEX IF NOT EXISTS idx_ai_pipeline_locks_expires
  ON ai_pipeline_locks (expires_at);

-- ============================================================================
-- RPC: try_acquire_pipeline_lock
--
-- Tenta adquirir lock pra contact_phone. Retorna true se conseguiu, false se
-- outro pipeline já tem o lock e ainda não expirou. Limpa locks expirados
-- automaticamente.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.try_acquire_pipeline_lock(
  p_contact_phone TEXT,
  p_ttl_seconds INT DEFAULT 90
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_acquired BOOLEAN := false;
BEGIN
  -- Limpa locks expirados (lazy cleanup; cron seria overkill pra tabela pequena).
  DELETE FROM ai_pipeline_locks WHERE expires_at < now();

  -- Tenta INSERT. Se row já existe (não expirou — DELETE acima removeu expirados),
  -- ON CONFLICT não faz nada e v_acquired fica false.
  INSERT INTO ai_pipeline_locks (contact_phone, locked_at, expires_at)
  VALUES (p_contact_phone, now(), now() + (p_ttl_seconds || ' seconds')::interval)
  ON CONFLICT (contact_phone) DO NOTHING;

  -- Verifica se este foi quem inseriu (locked_at = now() recente).
  -- Margem de 100ms cobre clock skew interno.
  SELECT EXISTS (
    SELECT 1 FROM ai_pipeline_locks
    WHERE contact_phone = p_contact_phone
      AND locked_at >= now() - interval '100 milliseconds'
  ) INTO v_acquired;

  RETURN v_acquired;
END;
$$;

COMMENT ON FUNCTION public.try_acquire_pipeline_lock(TEXT, INT) IS
  'Tenta adquirir lock de pipeline pra contact_phone. Retorna true se conseguiu, false se outro pipeline está ativo.';

GRANT EXECUTE ON FUNCTION public.try_acquire_pipeline_lock(TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.try_acquire_pipeline_lock(TEXT, INT) TO authenticated;

-- ============================================================================
-- RPC: release_pipeline_lock
--
-- Libera o lock após pipeline terminar (sucesso ou falha — chamada via try/finally).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.release_pipeline_lock(
  p_contact_phone TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM ai_pipeline_locks WHERE contact_phone = p_contact_phone;
END;
$$;

COMMENT ON FUNCTION public.release_pipeline_lock(TEXT) IS
  'Libera lock de pipeline pra contact_phone. Sempre chamado em finally após pipeline terminar.';

GRANT EXECUTE ON FUNCTION public.release_pipeline_lock(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_pipeline_lock(TEXT) TO authenticated;
