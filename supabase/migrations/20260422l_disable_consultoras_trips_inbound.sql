-- Desativa entrada do ActiveCampaign no pipeline "Consultoras Trips"
-- (external_pipeline_id = "6") na integração AC do CRM.
-- SDR Trips (pipeline "8") e Weddings (WW) continuam ativos.
--
-- Efeito: deals vindos do AC no pipeline 6 não criam nem atualizam cards.
-- Eventos continuam registrados em integration_events com status='ignored'
-- e mensagem "No trigger matched (Pipeline 6, ...)" para auditoria.
-- Reversível: basta reativar com UPDATE ... SET is_active = true.

BEGIN;

UPDATE integration_inbound_triggers
SET is_active = false,
    updated_at = NOW()
WHERE integration_id = 'a2141b92-561f-4514-92b4-9412a068d236'
  AND external_pipeline_ids @> ARRAY['6']::text[]
  AND is_active = true;

-- Sanity: só valida onde a integração AC existe com esses triggers
-- (produção). Em staging/Supabase branches o banco pode estar sem esses
-- dados — nesses casos a migration é no-op.
DO $$
DECLARE
  v_total_consultoras INT;
  v_inactive INT;
  v_sdr_active INT;
BEGIN
  SELECT COUNT(*) INTO v_total_consultoras
  FROM integration_inbound_triggers
  WHERE integration_id = 'a2141b92-561f-4514-92b4-9412a068d236'
    AND external_pipeline_ids @> ARRAY['6']::text[];

  IF v_total_consultoras = 0 THEN
    RAISE NOTICE 'Nenhum trigger de Consultoras Trips encontrado — '
                 'banco provavelmente não é produção. Skipando sanity.';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_inactive
  FROM integration_inbound_triggers
  WHERE integration_id = 'a2141b92-561f-4514-92b4-9412a068d236'
    AND external_pipeline_ids @> ARRAY['6']::text[]
    AND is_active = false;

  IF v_inactive <> 5 THEN
    RAISE EXCEPTION
      'Esperado 5 triggers de Consultoras Trips desativados, encontrei %',
      v_inactive;
  END IF;

  SELECT COUNT(*) INTO v_sdr_active
  FROM integration_inbound_triggers
  WHERE integration_id = 'a2141b92-561f-4514-92b4-9412a068d236'
    AND external_pipeline_ids @> ARRAY['8']::text[]
    AND is_active = true;

  IF v_sdr_active <> 2 THEN
    RAISE EXCEPTION
      'SDR Trips deveria ter 2 triggers ativos, encontrei %',
      v_sdr_active;
  END IF;
END $$;

COMMIT;
