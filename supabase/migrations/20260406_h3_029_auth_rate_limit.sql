-- H3-029: Rate limiting de autenticação (proteção contra brute-force)
--
-- Estratégia: tabela auth_attempts rastreia tentativas por email+IP. Função
-- check_auth_rate_limit(email) retorna se o email está bloqueado e por quanto
-- tempo. Frontend chama essa função ANTES de signInWithPassword e bloqueia
-- localmente se necessário.
--
-- Limites:
--   - 5 tentativas falhas em 15 minutos → bloqueio de 15 min
--   - 10 tentativas falhas em 1 hora → bloqueio de 1 hora
--
-- Para proteção real contra bypass do frontend, é necessário um Supabase Auth
-- Hook (before_sign_in) — fora do escopo desta migration. Esta é uma primeira
-- linha de defesa.

CREATE TABLE IF NOT EXISTS auth_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    ip_address INET,
    user_agent TEXT,
    success BOOLEAN NOT NULL DEFAULT FALSE,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_attempts_email_time ON auth_attempts(email, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_ip_time ON auth_attempts(ip_address, attempted_at DESC);

-- RLS: só service role pode ler (privacidade) e authenticated só pode inserir o próprio
ALTER TABLE auth_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_attempts_insert_public" ON auth_attempts;
DROP POLICY IF EXISTS "auth_attempts_service_all" ON auth_attempts;

-- Qualquer usuário pode inserir tentativa (necessário antes do login)
CREATE POLICY "auth_attempts_insert_public" ON auth_attempts
  FOR INSERT TO anon, authenticated
  WITH CHECK (TRUE);

CREATE POLICY "auth_attempts_service_all" ON auth_attempts
  FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

-- =============================================================================
-- Função de verificação de rate limit
-- =============================================================================
CREATE OR REPLACE FUNCTION public.check_auth_rate_limit(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_failures_15min INTEGER;
    v_failures_1hour INTEGER;
    v_blocked_until TIMESTAMPTZ;
    v_seconds_remaining INTEGER;
BEGIN
    -- Contar falhas em 15 minutos
    SELECT COUNT(*) INTO v_failures_15min
    FROM auth_attempts
    WHERE email = lower(p_email)
      AND success = FALSE
      AND attempted_at > now() - interval '15 minutes';

    -- Contar falhas em 1 hora
    SELECT COUNT(*) INTO v_failures_1hour
    FROM auth_attempts
    WHERE email = lower(p_email)
      AND success = FALSE
      AND attempted_at > now() - interval '1 hour';

    -- Regras de bloqueio
    IF v_failures_1hour >= 10 THEN
        -- Bloqueio de 1 hora a partir da última tentativa
        SELECT MAX(attempted_at) + interval '1 hour' INTO v_blocked_until
        FROM auth_attempts
        WHERE email = lower(p_email) AND success = FALSE
          AND attempted_at > now() - interval '1 hour';

        IF v_blocked_until > now() THEN
            v_seconds_remaining := EXTRACT(EPOCH FROM (v_blocked_until - now()))::INTEGER;
            RETURN jsonb_build_object(
                'blocked', TRUE,
                'reason', 'too_many_attempts',
                'seconds_remaining', v_seconds_remaining,
                'message', format('Muitas tentativas de login. Tente novamente em %s minutos.', CEIL(v_seconds_remaining::NUMERIC / 60))
            );
        END IF;
    ELSIF v_failures_15min >= 5 THEN
        -- Bloqueio de 15 minutos
        SELECT MAX(attempted_at) + interval '15 minutes' INTO v_blocked_until
        FROM auth_attempts
        WHERE email = lower(p_email) AND success = FALSE
          AND attempted_at > now() - interval '15 minutes';

        IF v_blocked_until > now() THEN
            v_seconds_remaining := EXTRACT(EPOCH FROM (v_blocked_until - now()))::INTEGER;
            RETURN jsonb_build_object(
                'blocked', TRUE,
                'reason', 'too_many_attempts',
                'seconds_remaining', v_seconds_remaining,
                'message', format('Muitas tentativas de login. Tente novamente em %s minutos.', CEIL(v_seconds_remaining::NUMERIC / 60))
            );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'blocked', FALSE,
        'failures_15min', v_failures_15min,
        'failures_1hour', v_failures_1hour
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_auth_rate_limit(TEXT) TO anon, authenticated, service_role;

-- =============================================================================
-- Função para registrar tentativa
-- =============================================================================
CREATE OR REPLACE FUNCTION public.record_auth_attempt(
    p_email TEXT,
    p_success BOOLEAN,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO auth_attempts (email, success, user_agent)
    VALUES (lower(p_email), p_success, p_user_agent);

    -- Limpar tentativas antigas (> 24h) para manter tabela pequena
    DELETE FROM auth_attempts WHERE attempted_at < now() - interval '24 hours';
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_auth_attempt(TEXT, BOOLEAN, TEXT) TO anon, authenticated, service_role;
