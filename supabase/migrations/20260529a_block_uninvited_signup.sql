-- =========================================================================
-- Gate de acesso: só convidados conseguem criar conta
-- =========================================================================
-- Por senha não existe cadastro público — só via link de convite (signUp na
-- InvitePage). Por OAuth (Microsoft/Azure) esse portão era pulado: o Supabase
-- criava o usuário no primeiro login e handle_new_user provisionava um profile
-- fantasma na conta Welcome Group (fallback) para qualquer email do tenant.
--
-- Este trigger BEFORE INSERT em auth.users roda ANTES de handle_new_user
-- (AFTER INSERT) e recusa a criação quando não há convite válido pendente nem
-- profile pré-existente. Não toca em handle_new_user — separa "gate" de
-- "provisionamento".
--
-- Seguro para quem deve entrar:
--   * Convidado (senha ou Microsoft): tem invitations pendente → passa.
--   * Usuário existente logando de novo: login não faz INSERT → gate nem roda.
--   * Account-linking por email: sem INSERT, ou com profile pré-existente → passa.
--   * Não convidado via Microsoft: sem convite/profile → RAISE → criação abortada.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.block_uninvited_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Permite: convite válido pendente para o email
    IF EXISTS (
        SELECT 1 FROM public.invitations i
        WHERE lower(i.email) = lower(NEW.email)
          AND i.used_at IS NULL
          AND i.expires_at > NOW()
    ) THEN
        RETURN NEW;
    END IF;

    -- Permite: já existe profile (re-criação / account-linking) — defensivo
    IF EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = NEW.id OR lower(p.email) = lower(NEW.email)
    ) THEN
        RETURN NEW;
    END IF;

    -- Bloqueia o resto. ERRCODE check_violation evita ser confundido com erro de infra.
    RAISE EXCEPTION 'WELCOMECRM_NO_INVITE: acesso restrito — peça um convite ao administrador'
        USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS tg_block_uninvited_signup ON auth.users;
CREATE TRIGGER tg_block_uninvited_signup
    BEFORE INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.block_uninvited_signup();
