-- =============================================================
-- Default org_id de contatos: cai para a org-mãe quando existe.
--
-- Modelo: contatos são pool único na org raiz (Welcome Group).
-- Quando um usuário de Welcome Trips/Weddings/Courses cria um
-- contato, ele deve nascer em Welcome Group (e não na própria
-- org filha). Isso elimina duplicação cross-org futura.
--
-- Orgs sem parent (ex.: orgs de teste isoladas) continuam usando
-- requesting_org_id() — comportamento atual preservado.
-- =============================================================

CREATE OR REPLACE FUNCTION public.contatos_default_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT parent_org_id FROM organizations WHERE id = requesting_org_id()),
    requesting_org_id()
  );
$$;

ALTER TABLE public.contatos
  ALTER COLUMN org_id SET DEFAULT public.contatos_default_org_id();

COMMENT ON FUNCTION public.contatos_default_org_id() IS
  'Retorna parent_org_id quando o usuário está em uma org filha; caso contrário, retorna requesting_org_id(). Garante pool único de contatos na org raiz.';
