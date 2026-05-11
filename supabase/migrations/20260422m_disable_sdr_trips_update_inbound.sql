-- Desativa APENAS o trigger de atualização do pipeline "SDR Trips" do AC
-- (external_pipeline_id = "8", action_type = update_only).
-- O trigger de criação do SDR Trips (7c2059bb...) continua ativo para
-- que novos leads ainda entrem no CRM.
--
-- Efeito: updates vindos do AC para deals já criados no SDR Trips são
-- registrados em integration_events como 'ignored'. Nenhum card existente
-- é alterado pela integração daqui pra frente.
-- Reversível: UPDATE ... SET is_active = true no id abaixo.

BEGIN;

UPDATE integration_inbound_triggers
SET is_active = false,
    updated_at = NOW()
WHERE id = '2896fd0b-3cea-4b8b-ad52-302932bce6a6'
  AND is_active = true;

-- Sanity: só valida onde a integração AC existe (produção).
DO $$
DECLARE
  v_update_inactive INT;
  v_create_active  INT;
  v_exists         INT;
BEGIN
  SELECT COUNT(*) INTO v_exists
  FROM integration_inbound_triggers
  WHERE id = '2896fd0b-3cea-4b8b-ad52-302932bce6a6';

  IF v_exists = 0 THEN
    RAISE NOTICE 'Trigger SDR Trips - Atualização não encontrado — '
                 'banco provavelmente não é produção. Skipando sanity.';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_update_inactive
  FROM integration_inbound_triggers
  WHERE id = '2896fd0b-3cea-4b8b-ad52-302932bce6a6'
    AND is_active = false;

  IF v_update_inactive <> 1 THEN
    RAISE EXCEPTION
      'SDR Trips - Atualização deveria estar desativado, está ativo';
  END IF;

  SELECT COUNT(*) INTO v_create_active
  FROM integration_inbound_triggers
  WHERE id = '7c2059bb-c055-479e-b225-e85a9f8b3cce'
    AND is_active = true;

  IF v_create_active <> 1 THEN
    RAISE EXCEPTION
      'SDR Trips - Criação deveria continuar ativo, está inativo';
  END IF;
END $$;

COMMIT;
