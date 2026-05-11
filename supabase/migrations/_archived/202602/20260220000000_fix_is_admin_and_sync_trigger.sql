-- Migration: Fix is_admin para admins/gestores + trigger de sync
--
-- Problema: commit 39c19ab mudou isAdmin check para `is_admin === true`,
-- mas alguns profiles com role='admin'/'gestor' tinham is_admin=false/null.
-- A migration M4 anterior (20260219300000) deveria ter corrigido, mas nao
-- pegou todos os casos.
--
-- Mudancas:
-- 1. UPDATE: garantir is_admin=true para role IN ('admin','gestor')
-- 2. TRIGGER: auto-setar is_admin=true quando role muda para admin/gestor

-- =============================================================================
-- 1. Fix data: is_admin=true para todos admin/gestor
-- =============================================================================

UPDATE public.profiles
SET is_admin = true
WHERE role IN ('admin', 'gestor')
  AND is_admin IS DISTINCT FROM true;

-- =============================================================================
-- 2. Trigger: sync is_admin quando role muda
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sync_is_admin_from_role()
RETURNS trigger AS $$
BEGIN
    IF NEW.role IN ('admin', 'gestor') THEN
        NEW.is_admin := true;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_is_admin_from_role ON public.profiles;

CREATE TRIGGER trg_sync_is_admin_from_role
    BEFORE INSERT OR UPDATE OF role ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_is_admin_from_role();
