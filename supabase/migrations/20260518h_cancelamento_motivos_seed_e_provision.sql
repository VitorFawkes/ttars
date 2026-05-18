-- ============================================================
-- Cancelamento de Viagem — Seed de motivos default + extensão de provision_workspace
-- ============================================================
-- 1. Função helper seed_motivos_cancelamento(org_id) — idempotente.
-- 2. Aplica para org Welcome Trips (e Welcome Group como fonte de referência).
-- 3. Estende provision_workspace para semear motivos em workspaces novos.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Helper para semear motivos default numa org (idempotente)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION seed_motivos_cancelamento(p_org_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_count INT := 0;
  v_motivos jsonb := jsonb_build_array(
    jsonb_build_object('nome', 'Saúde do passageiro',                'escopo', 'qualquer', 'ordem', 1),
    jsonb_build_object('nome', 'Morte na família',                   'escopo', 'qualquer', 'ordem', 2),
    jsonb_build_object('nome', 'Força maior climática',              'escopo', 'qualquer', 'ordem', 3),
    jsonb_build_object('nome', 'Força maior política / segurança',   'escopo', 'qualquer', 'ordem', 4),
    jsonb_build_object('nome', 'Arrependimento',                     'escopo', 'qualquer', 'ordem', 5),
    jsonb_build_object('nome', 'Mudança de planos (sem culpa)',      'escopo', 'qualquer', 'ordem', 6),
    jsonb_build_object('nome', 'Mudança de planos (com culpa)',      'escopo', 'qualquer', 'ordem', 7),
    jsonb_build_object('nome', 'Mudança de destino / datas',         'escopo', 'mudanca',  'ordem', 8),
    jsonb_build_object('nome', 'Problema com fornecedor',            'escopo', 'parcial',  'ordem', 9),
    jsonb_build_object('nome', 'Outro',                              'escopo', 'qualquer', 'ordem', 99)
  );
  rec jsonb;
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(v_motivos)
  LOOP
    INSERT INTO motivos_cancelamento (org_id, nome, escopo, ordem, ativo)
    SELECT p_org_id, rec->>'nome', rec->>'escopo', (rec->>'ordem')::int, true
    WHERE NOT EXISTS (
      SELECT 1 FROM motivos_cancelamento
       WHERE org_id = p_org_id AND nome = rec->>'nome'
    );

    IF FOUND THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END
$fn$;

COMMENT ON FUNCTION seed_motivos_cancelamento IS
  'Semeia motivos_cancelamento default numa org. Idempotente: pula motivos com nome já existente. Retorna quantidade inserida.';

GRANT EXECUTE ON FUNCTION seed_motivos_cancelamento TO service_role;

-- ────────────────────────────────────────────────────────────
-- 2. Semear na Welcome Trips e Welcome Group
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_trips_inserted INT;
  v_group_inserted INT;
BEGIN
  -- Welcome Trips workspace
  SELECT seed_motivos_cancelamento('b0000000-0000-0000-0000-000000000001'::uuid)
    INTO v_trips_inserted;
  RAISE NOTICE 'Welcome Trips: % motivos de cancelamento semeados', v_trips_inserted;

  -- Welcome Group account (fonte de referência para futuros workspaces)
  SELECT seed_motivos_cancelamento('a0000000-0000-0000-0000-000000000001'::uuid)
    INTO v_group_inserted;
  RAISE NOTICE 'Welcome Group: % motivos de cancelamento semeados', v_group_inserted;
EXCEPTION WHEN foreign_key_violation OR no_data_found THEN
  RAISE NOTICE 'Org base não encontrada — pulando seed (esperado em staging recém-criado)';
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 3. Estender provision_workspace para semear motivos em novos workspaces
-- ────────────────────────────────────────────────────────────
-- Não vamos reescrever a função inteira (é grande e está em 20260426c).
-- Em vez disso, criamos um trigger AFTER INSERT em organizations que detecta
-- criação de workspace filho (parent_org_id NOT NULL) e semeia os motivos.
-- Isso desacopla este feature do código de provision_workspace.
CREATE OR REPLACE FUNCTION fn_seed_motivos_cancelamento_on_workspace_create()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Só semeia se for workspace filho (com parent_org_id)
  IF NEW.parent_org_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM seed_motivos_cancelamento(NEW.id);
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_seed_motivos_cancelamento ON organizations;
CREATE TRIGGER trg_seed_motivos_cancelamento
  AFTER INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION fn_seed_motivos_cancelamento_on_workspace_create();

COMMENT ON TRIGGER trg_seed_motivos_cancelamento ON organizations IS
  'Quando um workspace filho (parent_org_id NOT NULL) é criado, semeia motivos_cancelamento default. Desacoplado de provision_workspace.';
