-- ============================================================================
-- Migration: Adicionar produtos ao fluxo de convites e perfis
-- Objetivo: Permitir que admins atribuam acesso a produtos específicos
--           (TRIPS, WEDDING, CORP) ao convidar ou editar membros.
-- Fluxo: AddUserModal → generate_invite → invitations.produtos
--        → handle_new_user trigger → profiles.produtos
-- Nota: Defensivo — ignora ALTER TABLE se tabela não existir (staging bootstrap)
-- ============================================================================

-- Passo 1: Adicionar coluna produtos na tabela de convites (se a tabela existir)
DO $$
BEGIN
    IF EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'invitations'
    ) THEN
        ALTER TABLE public.invitations
            ADD COLUMN IF NOT EXISTS produtos text[] DEFAULT NULL;

        COMMENT ON COLUMN public.invitations.produtos IS
            'Produtos a que o convidado terá acesso (TRIPS, WEDDING, CORP). NULL = acesso a todos.';
    END IF;
END $$;

-- ============================================================================
-- Passo 2: Recriar generate_invite com p_produtos (DEFAULT NULL → backward compat)
-- A assinatura muda de 4 para 5 params, então é necessário DROP + CREATE.
-- ============================================================================

-- Remover função antiga com 4 parâmetros (assinatura incompatível)
DROP FUNCTION IF EXISTS public.generate_invite(text, text, uuid, uuid);

CREATE OR REPLACE FUNCTION public.generate_invite(
    p_email       TEXT,
    p_role        TEXT,
    p_team_id     UUID,
    p_created_by  UUID,
    p_produtos    TEXT[] DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_token TEXT;
    v_caller_role TEXT;
BEGIN
    -- Verificar permissão do chamador (admin ou manager)
    SELECT r.name INTO v_caller_role
    FROM public.profiles p
    JOIN public.roles r ON p.role_id = r.id
    WHERE p.id = auth.uid();

    IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'manager', 'member') THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND is_admin = TRUE
        ) THEN
            RAISE EXCEPTION 'Permissão negada: apenas admins e managers podem criar convites';
        END IF;
    END IF;

    -- Validar role
    IF NOT EXISTS (SELECT 1 FROM public.roles WHERE name = p_role) THEN
        RAISE EXCEPTION 'Role inválida: %', p_role;
    END IF;

    -- Gerar token
    v_token := encode(gen_random_bytes(32), 'hex');

    INSERT INTO public.invitations (email, role, team_id, token, expires_at, created_by, produtos)
    VALUES (p_email, p_role, p_team_id, v_token, now() + interval '7 days', p_created_by, p_produtos);

    RETURN v_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_invite(text, text, uuid, uuid, text[]) TO authenticated;

COMMENT ON FUNCTION public.generate_invite IS
    'Gera token de convite. Aceita produtos (TRIPS/WEDDING/CORP). NULL = acesso a todos.';

-- ============================================================================
-- Passo 3: Recriar get_invite_details para incluir produtos na resposta
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_invite_details(text);

CREATE FUNCTION public.get_invite_details(token_input TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invite    RECORD;
    v_team_name TEXT;
BEGIN
    SELECT * INTO v_invite
    FROM public.invitations
    WHERE token = token_input
      AND used_at IS NULL
      AND expires_at > now();

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    IF v_invite.team_id IS NOT NULL THEN
        SELECT name INTO v_team_name
        FROM public.teams
        WHERE id = v_invite.team_id;
    END IF;

    RETURN json_build_object(
        'id',        v_invite.id,
        'email',     v_invite.email,
        'role',      v_invite.role,
        'team_id',   v_invite.team_id,
        'team_name', v_team_name,
        'expires_at', v_invite.expires_at,
        'produtos',  v_invite.produtos
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_invite_details(text) TO anon, authenticated;

-- ============================================================================
-- Passo 4: Atualizar handle_new_user para aplicar produtos do convite no perfil
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invite    RECORD;
    v_role_id   UUID;
    v_team_id   UUID;
    v_role_name TEXT;
    v_produtos  TEXT[];
BEGIN
    -- Buscar dados do convite para este email (se tabela existir)
    BEGIN
        SELECT i.role, i.team_id, i.produtos
          INTO v_role_name, v_team_id, v_produtos
        FROM public.invitations i
        WHERE i.email = new.email
          AND i.used_at IS NULL
          AND i.expires_at > now()
        LIMIT 1;
    EXCEPTION WHEN undefined_table THEN
        -- staging bootstrap: tabela invitations não existe, sem convite
        NULL;
    END;

    -- Se não encontrou convite, usar role do metadata (fallback)
    IF v_role_name IS NULL THEN
        v_role_name := COALESCE(new.raw_user_meta_data->>'role', 'member');
    END IF;

    -- Resolver role_id a partir do nome
    SELECT id INTO v_role_id
    FROM public.roles
    WHERE name = v_role_name;

    -- Fallback para 'member' se role não encontrada
    IF v_role_id IS NULL THEN
        SELECT id INTO v_role_id
        FROM public.roles
        WHERE name = 'member';
    END IF;

    -- Criar perfil com role_id, team_id e produtos do convite
    INSERT INTO public.profiles (
        id,
        email,
        nome,
        role_id,
        team_id,
        active,
        produtos
    )
    VALUES (
        new.id,
        new.email,
        COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
        v_role_id,
        v_team_id,
        true,
        v_produtos::app_product[]
    )
    ON CONFLICT (id) DO UPDATE SET
        role_id  = COALESCE(EXCLUDED.role_id,  profiles.role_id),
        team_id  = COALESCE(EXCLUDED.team_id,  profiles.team_id),
        produtos = COALESCE(EXCLUDED.produtos, profiles.produtos);

    RETURN new;
END;
$$;
