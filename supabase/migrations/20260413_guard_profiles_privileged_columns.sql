-- =========================================================================
-- Guard Profiles Privileged Columns — Fecha gap descoberto ao validar Fix
-- Cross-Tenant Invite Escalation (20260413_fix_cross_tenant_invite_escalation)
-- =========================================================================
-- Gap: a RLS `profiles_self_update` permite UPDATE em QUALQUER coluna do
-- próprio profile. Um user autenticado consegue, via 4 PATCHes REST:
--
--   PATCH /profiles { "is_platform_admin": true }              → virou superuser
--   PATCH /profiles { "org_id": "<qualquer>" }                 → sequestra home
--   PATCH /profiles { "impersonating_org_id": "<qualquer>" }   → hook aceita
--                                                                (porque agora
--                                                                is_platform_admin)
--   PATCH /profiles { "is_admin": true, "role_id": "<admin>" } → admin funcional
--
-- Pós-PATCHes + re-login, JWT contém is_platform_admin=true e o caller
-- bypassa generate_invite membership check, re-abrindo cross-tenant invite
-- (e abrindo toda RLS que usa is_platform_admin()).
--
-- Comprovado em produção durante validação (invite emitido em Org Teste
-- Isolamento por user de teste que era só membro de Welcome Trips). Invite
-- deletado imediatamente.
--
-- Fix: trigger BEFORE UPDATE que distingue:
--
--  (1) service_role / auth.uid() NULL      → bypass (ops internas, triggers).
--  (2) platform admin                       → bypass total.
--  (3) self-update (auth.uid() = NEW.id)    → bloqueia colunas privilegiadas
--                                             (is_platform_admin, is_admin, role,
--                                             role_id, org_id, team_id, produtos,
--                                             impersonating_org_id). active_org_id
--                                             só aceita org onde é membro.
--  (4) admin-update de outro user           → só chega aqui pela RLS
--      (auth.uid() <> NEW.id)                 profiles_admin_all (admin da mesma
--                                             org). Admin da org pode gerenciar
--                                             is_admin, role, role_id, team_id,
--                                             produtos do time dele. Mas
--                                             is_platform_admin, org_id (home),
--                                             impersonating_org_id, active_org_id
--                                             continuam restritos a platform admin.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.guard_profiles_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
    v_is_platform_admin BOOLEAN := FALSE;
    v_caller            UUID;
BEGIN
    -- (1) service_role e contextos sem JWT (migrations, triggers internos).
    IF auth.role() = 'service_role' THEN
        RETURN NEW;
    END IF;

    v_caller := auth.uid();

    IF v_caller IS NULL THEN
        RETURN NEW;
    END IF;

    -- (2) Platform admin: bypass total.
    SELECT COALESCE(is_platform_admin, FALSE) INTO v_is_platform_admin
    FROM public.profiles WHERE id = v_caller;

    IF v_is_platform_admin THEN
        RETURN NEW;
    END IF;

    -- Colunas que NENHUM caller não-platform-admin pode alterar, inclusive
    -- admins de org atuando em outros profiles.
    IF NEW.is_platform_admin IS DISTINCT FROM OLD.is_platform_admin THEN
        RAISE EXCEPTION 'Permissão negada: apenas platform admins podem alterar is_platform_admin';
    END IF;

    IF NEW.impersonating_org_id IS DISTINCT FROM OLD.impersonating_org_id THEN
        RAISE EXCEPTION 'Permissão negada: apenas platform admins podem alterar impersonating_org_id';
    END IF;

    IF NEW.org_id IS DISTINCT FROM OLD.org_id THEN
        RAISE EXCEPTION 'Permissão negada: apenas platform admins podem alterar org_id (home)';
    END IF;

    -- active_org_id é a "org ativa" do próprio user (OrgSwitcher). Admin não
    -- deveria forçar troca em outro user, e self só pode mudar pra org onde
    -- é membro.
    IF NEW.active_org_id IS DISTINCT FROM OLD.active_org_id THEN
        IF v_caller <> NEW.id THEN
            RAISE EXCEPTION 'Permissão negada: active_org_id só pode ser alterado pelo próprio usuário';
        END IF;

        IF NEW.active_org_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.org_members
            WHERE user_id = NEW.id AND org_id = NEW.active_org_id
        ) THEN
            RAISE EXCEPTION 'Permissão negada: active_org_id deve ser uma organização da qual você é membro';
        END IF;
    END IF;

    -- (3) Self-update: colunas adicionais restritas. Só o admin (RLS) muda
    -- essas em outros profiles.
    IF v_caller = NEW.id THEN
        IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
            RAISE EXCEPTION 'Permissão negada: is_admin não pode ser alterado via self-update';
        END IF;

        IF NEW.role_id IS DISTINCT FROM OLD.role_id THEN
            RAISE EXCEPTION 'Permissão negada: role_id não pode ser alterado via self-update';
        END IF;

        IF NEW.role IS DISTINCT FROM OLD.role THEN
            RAISE EXCEPTION 'Permissão negada: role não pode ser alterado via self-update';
        END IF;

        IF NEW.team_id IS DISTINCT FROM OLD.team_id THEN
            RAISE EXCEPTION 'Permissão negada: team_id não pode ser alterado via self-update';
        END IF;

        IF NEW.produtos IS DISTINCT FROM OLD.produtos THEN
            RAISE EXCEPTION 'Permissão negada: produtos não podem ser alterados via self-update';
        END IF;
    END IF;

    -- (4) Admin da org (v_caller <> NEW.id) pode alterar is_admin, role,
    -- role_id, team_id, produtos — a RLS profiles_admin_all só libera esse
    -- update para admins da mesma org, então já está contido no tenant.

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_profiles_privileged_columns ON public.profiles;
CREATE TRIGGER trg_guard_profiles_privileged_columns
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.guard_profiles_privileged_columns();

COMMENT ON FUNCTION public.guard_profiles_privileged_columns() IS
'Bloqueia escalation de privilégios via UPDATE em profiles. Self-update não pode alterar is_platform_admin, is_admin, role, role_id, org_id, team_id, produtos, impersonating_org_id; active_org_id só aceita org onde é membro. Admin da org (via RLS profiles_admin_all) pode alterar is_admin/role/role_id/team_id/produtos de outros profiles da sua org, mas não is_platform_admin, org_id (home), impersonating_org_id ou active_org_id alheio. Platform admin e service_role bypassam. Defesa em profundidade para 20260413_fix_cross_tenant_invite_escalation.';
