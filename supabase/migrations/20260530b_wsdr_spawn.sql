-- ============================================================================
-- M7 — Templating: criar um agente novo a partir do modelo de outro (ex: Sofia)
-- Clona a config + cria o registro, isolado por workspace (requesting_org_id).
-- ============================================================================

CREATE OR REPLACE FUNCTION wsdr_spawn_agent_from_template(
  p_template_slug TEXT,
  p_new_slug TEXT,
  p_display_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := requesting_org_id();
  v_cfg JSONB;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Sem workspace ativo' USING ERRCODE = 'P0001';
  END IF;
  IF p_new_slug IS NULL OR length(trim(p_new_slug)) < 2 THEN
    RAISE EXCEPTION 'Identificador inválido' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM wsdr_agents WHERE org_id = v_org AND slug = p_new_slug) THEN
    RAISE EXCEPTION 'Já existe um agente com esse identificador neste workspace' USING ERRCODE = 'P0001';
  END IF;

  -- copia a config do modelo (mesmo org); se não houver, parte de objeto vazio
  SELECT config INTO v_cfg
  FROM wsdr_agent_config
  WHERE org_id = v_org AND slug = p_template_slug
  LIMIT 1;
  IF v_cfg IS NULL THEN v_cfg := '{}'::jsonb; END IF;

  -- garante que o bloco identity exista antes de setar o nome (modelo pode vir vazio)
  IF NOT (v_cfg ? 'identity') THEN
    v_cfg := v_cfg || jsonb_build_object('identity', '{}'::jsonb);
  END IF;
  -- personaliza o nome no clone
  v_cfg := jsonb_set(v_cfg, '{identity,persona_nome}', to_jsonb(p_display_name), true);

  INSERT INTO wsdr_agent_config (org_id, slug, config) VALUES (v_org, p_new_slug, v_cfg);
  INSERT INTO wsdr_agents (org_id, slug, display_name, role_template, active)
  VALUES (v_org, p_new_slug, p_display_name, 'sdr', TRUE);

  RETURN jsonb_build_object('ok', true, 'slug', p_new_slug, 'display_name', p_display_name);
END $$;
COMMENT ON FUNCTION wsdr_spawn_agent_from_template IS 'Cria um novo agente wsdr clonando a config de um modelo (org-scoped).';
