-- Fase C do plano de isolamento: formaliza o modelo "account + workspaces".
-- Adiciona flag explícito em organizations para controlar se uma conta (pai)
-- compartilha contatos/catálogos com seus workspaces (filhos).
--
-- Hoje `requesting_parent_org_id()` retorna o pai SEMPRE que existe parent_org_id.
-- Com a nova lógica, retorna o pai APENAS se a conta tiver explicitamente
-- marcado `shares_contacts_with_children = TRUE`.
--
-- Welcome Group (conta atual que compartilha contatos entre Trips/Weddings/Courses)
-- é setada TRUE no upgrade para preservar o comportamento existente. Novas contas
-- criadas nascem FALSE — só ativam quando o admin decidir no onboarding.

SET search_path = public;

-- 1. Adicionar flag
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS shares_contacts_with_children BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN organizations.shares_contacts_with_children IS
  'Quando TRUE, workspaces filhos desta conta compartilham contatos, destinations e '
  'catálogos importados (Monde). Quando FALSE (default), cada workspace tem dados '
  'isolados. Só faz sentido em contas com 2+ workspaces. Setado no onboarding.';

-- 2. Preservar comportamento atual — Welcome Group compartilha
UPDATE organizations SET shares_contacts_with_children = TRUE
WHERE id = 'a0000000-0000-0000-0000-000000000001'
  AND shares_contacts_with_children = FALSE;

-- 3. Atualizar função para respeitar o flag
CREATE OR REPLACE FUNCTION public.requesting_parent_org_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT parent.id
  FROM public.organizations child
  JOIN public.organizations parent ON parent.id = child.parent_org_id
  WHERE child.id = public.requesting_org_id()
    AND parent.shares_contacts_with_children = TRUE
$$;

COMMENT ON FUNCTION public.requesting_parent_org_id() IS
  'Retorna o org_id da conta pai APENAS se ela tiver shares_contacts_with_children=TRUE. '
  'Usado em policies RLS de tabelas compartilhadas (contatos, destinations, etc) via '
  'padrão: USING (org_id = requesting_org_id() OR org_id = requesting_parent_org_id()). '
  'Workspaces sem conta compartilhadora veem apenas os próprios dados.';

-- 4. Documentar o modelo em organizations
COMMENT ON TABLE organizations IS
  'Entidades de tenancy em 2 níveis: ACCOUNT (parent_org_id IS NULL) vs WORKSPACE '
  '(parent_org_id aponta para a account). '
  'Account: conta do cliente — mora billing, admins, audit. Uma por empresa cliente. '
  'Workspace: produto operacional dentro da account — cards, pipelines, mensagens, '
  'agentes IA, propostas. Uma account pode ter 1+ workspaces. '
  'Ex: Welcome Group (account) → Trips, Weddings, Courses (workspaces). '
  'Cliente com um produto só tem account + 1 workspace. '
  'Campo shares_contacts_with_children na account controla se contatos e catálogos '
  'são compartilhados entre workspaces daquela conta.';
