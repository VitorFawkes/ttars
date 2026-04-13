-- =============================================================
-- Fix: Permitir que orgs filhas editem/deletem/criem contatos
-- que pertencem à org-mãe (parent_org_id).
--
-- Contexto: pós Org Split (Fase 5), contatos ficaram majoritariamente
-- em Welcome Group (parent), mas o app é usado a partir das orgs
-- filhas (Welcome Trips, Welcome Weddings). A policy de SELECT já
-- fazia fallback para parent_org_id, mas UPDATE/DELETE/INSERT não —
-- causando "Cannot coerce the result to a single JSON object"
-- (UPDATE filtrado pela RLS retorna 0 linhas, `.single()` explode).
--
-- Modelo acordado: contatos são compartilhados entre org-mãe e filhas.
-- Todos os usuários da árvore (parent + children) podem CRUD.
-- =============================================================

-- UPDATE: aceita contato próprio OU do parent
DROP POLICY IF EXISTS contatos_org_update ON public.contatos;
CREATE POLICY contatos_org_update ON public.contatos
  FOR UPDATE
  TO authenticated
  USING (
    org_id = requesting_org_id()
    OR org_id = (SELECT parent_org_id FROM organizations WHERE id = requesting_org_id())
  )
  WITH CHECK (
    org_id = requesting_org_id()
    OR org_id = (SELECT parent_org_id FROM organizations WHERE id = requesting_org_id())
  );

-- DELETE: mesma lógica
DROP POLICY IF EXISTS contatos_org_delete ON public.contatos;
CREATE POLICY contatos_org_delete ON public.contatos
  FOR DELETE
  TO authenticated
  USING (
    org_id = requesting_org_id()
    OR org_id = (SELECT parent_org_id FROM organizations WHERE id = requesting_org_id())
  );

-- INSERT: permite atribuir o contato à própria org ou à org-mãe
DROP POLICY IF EXISTS contatos_org_insert ON public.contatos;
CREATE POLICY contatos_org_insert ON public.contatos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id = requesting_org_id()
    OR org_id = (SELECT parent_org_id FROM organizations WHERE id = requesting_org_id())
  );

-- Alinhar contato_meios (já permissivo via USING true, mas fechar
-- a policy org_all para também aceitar parent, eliminando casos
-- onde o meio referencia contato da org-mãe).
DROP POLICY IF EXISTS contato_meios_org_all ON public.contato_meios;
CREATE POLICY contato_meios_org_all ON public.contato_meios
  FOR ALL
  TO authenticated
  USING (
    org_id = requesting_org_id()
    OR org_id = (SELECT parent_org_id FROM organizations WHERE id = requesting_org_id())
  )
  WITH CHECK (
    org_id = requesting_org_id()
    OR org_id = (SELECT parent_org_id FROM organizations WHERE id = requesting_org_id())
  );

COMMENT ON POLICY contatos_org_update ON public.contatos IS
  'Child orgs podem editar contatos da org-mãe (modelo de contatos compartilhados pós Org Split).';
COMMENT ON POLICY contatos_org_delete ON public.contatos IS
  'Child orgs podem deletar contatos da org-mãe.';
COMMENT ON POLICY contatos_org_insert ON public.contatos IS
  'Child orgs podem criar contatos atribuídos à própria org ou à org-mãe.';
