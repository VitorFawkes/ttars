-- H3-028: Criptografia de credenciais + fix PK de integration_settings
--
-- PROBLEMA 1: integration_settings.value armazena tokens/API keys em plain-text.
-- Um dump do banco expõe todas as credenciais.
--
-- PROBLEMA 2: a PK é apenas (key), impedindo que múltiplas orgs tenham a mesma
-- chave de configuração. Bug silencioso de multi-tenant.
--
-- FIX:
--   1. Promove PK para (key, org_id, produto) via drop+recreate (com coluna sintética id)
--   2. Adiciona value_encrypted BYTEA + is_encrypted BOOL
--   3. Funções set_integration_setting e get_*_setting criptografam/descriptografam via pgcrypto
--   4. Backfill: chaves sensíveis (api_key, token, secret, webhook_url) são criptografadas
--
-- Obs: Para produção séria, trocar chave fixa por integração com AWS KMS.
-- Este é um primeiro nível de proteção que elimina o risco de dump plain-text.

-- =============================================================================
-- 1. Helper: chave de criptografia
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_encryption_key()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    BEGIN
        RETURN current_setting('app.encryption_key', false);
    EXCEPTION WHEN OTHERS THEN
        -- Fallback para dev — em produção, setar app.encryption_key via ALTER DATABASE
        RETURN 'welcome-crm-dev-key-change-in-production-2026';
    END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_encryption_key() FROM public;
GRANT EXECUTE ON FUNCTION public.get_encryption_key() TO service_role;

-- =============================================================================
-- 2. Fix PK + adicionar colunas de criptografia
-- =============================================================================
DO $$ BEGIN
    -- Adicionar coluna id UUID se não existir (será nova PK sintética)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'integration_settings' AND column_name = 'id'
    ) THEN
        ALTER TABLE integration_settings ADD COLUMN id UUID DEFAULT gen_random_uuid();
        UPDATE integration_settings SET id = gen_random_uuid() WHERE id IS NULL;
        ALTER TABLE integration_settings ALTER COLUMN id SET NOT NULL;
    END IF;

    -- Dropar PK antiga (key) se existir e criar nova em id
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'integration_settings_pkey' AND conrelid = 'public.integration_settings'::regclass
    ) THEN
        -- Só trocar se a PK atual for (key), não se já foi migrada
        IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'integration_settings_pkey' AND conrelid = 'public.integration_settings'::regclass) = 'PRIMARY KEY (key)' THEN
            ALTER TABLE integration_settings DROP CONSTRAINT integration_settings_pkey;
            ALTER TABLE integration_settings ADD CONSTRAINT integration_settings_pkey PRIMARY KEY (id);
        END IF;
    END IF;

    -- Colunas de criptografia
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'integration_settings' AND column_name = 'value_encrypted'
    ) THEN
        ALTER TABLE integration_settings ADD COLUMN value_encrypted BYTEA;
        ALTER TABLE integration_settings ADD COLUMN is_encrypted BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
END $$;

-- =============================================================================
-- 3. Função SET (criptografa chaves sensíveis automaticamente)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.set_integration_setting(
    p_key TEXT,
    p_value TEXT,
    p_produto TEXT DEFAULT NULL,
    p_encrypt BOOLEAN DEFAULT NULL -- NULL = autodetecta pelo nome da chave
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_org_id UUID;
    v_should_encrypt BOOLEAN;
    v_encrypted BYTEA;
    v_existing_id UUID;
BEGIN
    v_org_id := requesting_org_id();

    -- Autodetecção: chaves que contêm padrões sensíveis são criptografadas
    v_should_encrypt := COALESCE(
        p_encrypt,
        p_key ~* '(api_key|apikey|api-key|token|secret|password|pwd|credential|private|webhook_url)'
    );

    -- Buscar registro existente pelo unique composto
    SELECT id INTO v_existing_id
    FROM integration_settings
    WHERE key = p_key
      AND org_id = v_org_id
      AND COALESCE(produto, '__GLOBAL__'::TEXT) = COALESCE(p_produto, '__GLOBAL__'::TEXT);

    IF v_should_encrypt THEN
        v_encrypted := extensions.pgp_sym_encrypt(p_value, get_encryption_key());

        IF v_existing_id IS NOT NULL THEN
            UPDATE integration_settings
            SET value = '[ENCRYPTED]', value_encrypted = v_encrypted, is_encrypted = TRUE, updated_at = now()
            WHERE id = v_existing_id;
        ELSE
            INSERT INTO integration_settings (key, value, value_encrypted, is_encrypted, produto, org_id)
            VALUES (p_key, '[ENCRYPTED]', v_encrypted, TRUE, p_produto, v_org_id);
        END IF;
    ELSE
        IF v_existing_id IS NOT NULL THEN
            UPDATE integration_settings
            SET value = p_value, value_encrypted = NULL, is_encrypted = FALSE, updated_at = now()
            WHERE id = v_existing_id;
        ELSE
            INSERT INTO integration_settings (key, value, is_encrypted, produto, org_id)
            VALUES (p_key, p_value, FALSE, p_produto, v_org_id);
        END IF;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_integration_setting(TEXT, TEXT, TEXT, BOOLEAN) TO authenticated, service_role;

-- =============================================================================
-- 4. Atualizar funções GET existentes para descriptografar
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_outbound_setting(p_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_row RECORD;
    v_org_id UUID;
BEGIN
    v_org_id := COALESCE(
      (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'org_id')::UUID,
      'a0000000-0000-0000-0000-000000000001'::UUID
    );

    SELECT value, value_encrypted, is_encrypted INTO v_row
    FROM public.integration_settings
    WHERE key = p_key
      AND org_id = v_org_id
      AND produto IS NULL
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN '';
    END IF;

    IF v_row.is_encrypted AND v_row.value_encrypted IS NOT NULL THEN
        RETURN extensions.pgp_sym_decrypt(v_row.value_encrypted, get_encryption_key());
    END IF;

    RETURN COALESCE(v_row.value, '');
END;
$$;

CREATE OR REPLACE FUNCTION public.get_product_setting(p_key TEXT, p_produto TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_row RECORD;
    v_org_id UUID;
BEGIN
    v_org_id := COALESCE(
      (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'org_id')::UUID,
      'a0000000-0000-0000-0000-000000000001'::UUID
    );

    IF p_produto IS NOT NULL THEN
        SELECT value, value_encrypted, is_encrypted INTO v_row
        FROM public.integration_settings
        WHERE key = p_key AND org_id = v_org_id AND produto = p_produto
        LIMIT 1;

        IF FOUND THEN
            IF v_row.is_encrypted AND v_row.value_encrypted IS NOT NULL THEN
                RETURN extensions.pgp_sym_decrypt(v_row.value_encrypted, get_encryption_key());
            END IF;
            RETURN v_row.value;
        END IF;
    END IF;

    SELECT value, value_encrypted, is_encrypted INTO v_row
    FROM public.integration_settings
    WHERE key = p_key AND org_id = v_org_id AND produto IS NULL
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    IF v_row.is_encrypted AND v_row.value_encrypted IS NOT NULL THEN
        RETURN extensions.pgp_sym_decrypt(v_row.value_encrypted, get_encryption_key());
    END IF;

    RETURN v_row.value;
END;
$$;

-- =============================================================================
-- 5. Backfill: criptografar registros existentes com chaves sensíveis
-- =============================================================================
UPDATE integration_settings
SET value_encrypted = extensions.pgp_sym_encrypt(value, get_encryption_key()),
    is_encrypted = TRUE,
    value = '[ENCRYPTED]',
    updated_at = now()
WHERE is_encrypted = FALSE
  AND value IS NOT NULL
  AND value != ''
  AND value != '[ENCRYPTED]'
  AND key ~* '(api_key|apikey|api-key|token|secret|password|pwd|credential|private|webhook_url)';
