-- Qualificação Weddings: deriva ww_tipo_casamento (Elopement × Destination Wedding)
-- a partir do campo de convidados. Regra EDITÁVEL por workspace via
-- backend_automation_settings (ligar/desligar + parâmetros), lida pelo trigger.
--
-- Regra: convidados = "Apenas o Casal" -> Elopement; qualquer faixa -> Destination
-- Wedding. Só preenche quando ww_tipo_casamento está vazio (respeita manual/IA).

-- ===========================================================================
-- 1. Tabela de config de automações de backend (genérica, por org)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.backend_automation_settings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizations(id),
  automation_id text NOT NULL,
  is_active    boolean NOT NULL DEFAULT true,
  config       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, automation_id)
);

ALTER TABLE public.backend_automation_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS backend_automation_settings_org_all ON public.backend_automation_settings;
CREATE POLICY backend_automation_settings_org_all ON public.backend_automation_settings
  TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

DROP POLICY IF EXISTS backend_automation_settings_service_all ON public.backend_automation_settings;
CREATE POLICY backend_automation_settings_service_all ON public.backend_automation_settings
  TO service_role
  USING (true) WITH CHECK (true);

-- ===========================================================================
-- 2. Seed da regra para o workspace Welcome Weddings
-- ===========================================================================
INSERT INTO public.backend_automation_settings (org_id, automation_id, is_active, config)
VALUES (
  'b0000000-0000-0000-0000-000000000002',
  'ww_derive_tipo_casamento',
  true,
  jsonb_build_object(
    'field_keys',      jsonb_build_array('ww_mkt_convidados_form', 'ww_num_convidados'),
    'elopement_match', 'Apenas o Casal',
    'elopement_type',  'Elopement',
    'default_type',    'Destination Wedding'
  )
)
ON CONFLICT (org_id, automation_id) DO NOTHING;

-- ===========================================================================
-- 3. Função do trigger (config-driven) + trigger
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.derive_ww_tipo_casamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active boolean;
  v_cfg    jsonb;
  v_keys   text[];
  v_raw    text;
  v_match  text;
  v_norm_raw   text;
  v_norm_match text;
  v_result text;
BEGIN
  IF NEW.produto::text <> 'WEDDING' THEN
    RETURN NEW;
  END IF;

  -- respeita valor já preenchido (manual/IA)
  IF NULLIF(TRIM(COALESCE(NEW.produto_data->>'ww_tipo_casamento','')), '') IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- config por org (default ativo se não houver linha)
  SELECT is_active, config INTO v_active, v_cfg
  FROM public.backend_automation_settings
  WHERE org_id = NEW.org_id AND automation_id = 'ww_derive_tipo_casamento';

  IF v_active IS NULL THEN
    v_active := true;
    v_cfg := jsonb_build_object(
      'field_keys', jsonb_build_array('ww_mkt_convidados_form','ww_num_convidados'),
      'elopement_match','Apenas o Casal',
      'elopement_type','Elopement',
      'default_type','Destination Wedding');
  END IF;

  IF v_active = false THEN
    RETURN NEW;
  END IF;

  -- lê o valor de convidados do(s) campo(s) configurado(s)
  SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_cfg->'field_keys',
           jsonb_build_array('ww_mkt_convidados_form','ww_num_convidados'))))
    INTO v_keys;

  v_raw := NULL;
  FOR i IN 1 .. COALESCE(array_length(v_keys,1),0) LOOP
    v_raw := COALESCE(v_raw, NULLIF(TRIM(COALESCE(NEW.produto_data->>v_keys[i],'')), ''));
  END LOOP;

  IF v_raw IS NULL THEN
    RETURN NEW; -- sem info de convidados, não classifica
  END IF;

  v_match := COALESCE(v_cfg->>'elopement_match', 'Apenas o Casal');

  -- normaliza (minúsculo, sem acento, espaços colapsados) p/ comparar
  v_norm_raw   := lower(translate(regexp_replace(v_raw,   '\s+',' ','g'), 'áàâãéêíóôõúç','aaaaeeiooouc'));
  v_norm_match := lower(translate(regexp_replace(v_match, '\s+',' ','g'), 'áàâãéêíóôõúç','aaaaeeiooouc'));

  IF v_norm_match <> '' AND position(v_norm_match in v_norm_raw) > 0 THEN
    v_result := COALESCE(v_cfg->>'elopement_type', 'Elopement');
  ELSE
    v_result := COALESCE(v_cfg->>'default_type', 'Destination Wedding');
  END IF;

  NEW.produto_data := jsonb_set(
    COALESCE(NEW.produto_data, '{}'::jsonb),
    '{ww_tipo_casamento}',
    to_jsonb(v_result)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_derive_ww_tipo_casamento ON public.cards;
CREATE TRIGGER trg_derive_ww_tipo_casamento
  BEFORE INSERT OR UPDATE OF produto_data ON public.cards
  FOR EACH ROW EXECUTE FUNCTION public.derive_ww_tipo_casamento();

-- ===========================================================================
-- 4. Backfill dos cards WEDDING existentes (tipo vazio, convidados conhecido)
-- ===========================================================================
UPDATE public.cards c
SET produto_data = jsonb_set(
      COALESCE(c.produto_data, '{}'::jsonb),
      '{ww_tipo_casamento}',
      to_jsonb(CASE
        WHEN position(
               lower(translate('apenas o casal','áàâãéêíóôõúç','aaaaeeiooouc'))
               in lower(translate(regexp_replace(
                    COALESCE(c.produto_data->>'ww_mkt_convidados_form', c.produto_data->>'ww_num_convidados'),
                    '\s+',' ','g'), 'áàâãéêíóôõúç','aaaaeeiooouc'))
             ) > 0
        THEN 'Elopement'
        ELSE 'Destination Wedding'
      END)
    )
WHERE c.produto::text = 'WEDDING'
  AND c.org_id = 'b0000000-0000-0000-0000-000000000002'
  AND NULLIF(TRIM(COALESCE(c.produto_data->>'ww_tipo_casamento','')), '') IS NULL
  AND NULLIF(TRIM(COALESCE(c.produto_data->>'ww_mkt_convidados_form', c.produto_data->>'ww_num_convidados','')), '') IS NOT NULL;
