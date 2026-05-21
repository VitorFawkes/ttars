-- Configuração de variáveis por template de mensagem (Echo / WhatsApp HSM).
-- Persiste o "padrão" salvo na UI de "Configurar Envio": qual campo do contato
-- ou casamento alimenta cada Var{N} do template.
--
-- Escopo: org-wide por template_slug. Ex: 'promom1' em Welcome Weddings tem
-- um padrão único usado pra todos os casamentos da org.

BEGIN;

CREATE TABLE IF NOT EXISTS public.template_var_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_slug TEXT NOT NULL,
  -- vars: array com identificadores dos campos. NULL = var não preenchida.
  -- Ex: ["contact.nome", "card.local", null, "card.data", "card.site", null]
  vars JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- button_var: identificador do campo da variável do botão (só promom1-4 usam).
  button_var TEXT,
  -- phone_number_id: linha WhatsApp escolhida (UUID interno do Echo).
  phone_number_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT template_var_configs_vars_array CHECK (jsonb_typeof(vars) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_template_var_configs_org_slug
  ON public.template_var_configs(org_id, template_slug);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.template_var_configs_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_template_var_configs_set_updated_at ON public.template_var_configs;
CREATE TRIGGER trg_template_var_configs_set_updated_at
  BEFORE UPDATE ON public.template_var_configs
  FOR EACH ROW EXECUTE FUNCTION public.template_var_configs_set_updated_at();

-- RLS
ALTER TABLE public.template_var_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS template_var_configs_org_all ON public.template_var_configs;
CREATE POLICY template_var_configs_org_all ON public.template_var_configs TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

DROP POLICY IF EXISTS template_var_configs_service_all ON public.template_var_configs;
CREATE POLICY template_var_configs_service_all ON public.template_var_configs TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.template_var_configs TO authenticated;

COMMIT;
