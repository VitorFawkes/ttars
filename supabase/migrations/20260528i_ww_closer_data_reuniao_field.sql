-- ============================================================================
-- ww_closer_data_reuniao — campo faltante em system_fields
--
-- Contexto: o campo "Data e horário do agendamento com a Closer" é referenciado
-- por RPCs (ww_v2_funil_conversao, ww2_journey) lendo cards.produto_data->>'ww_closer_data_reuniao',
-- e o AC sync já popula em 682 cards (Welcome Weddings) via integration_field_map.
-- Mas o campo nunca foi registrado em system_fields, então a UI do card não exibe.
--
-- Insere em Welcome Group (account-mãe, com section_id) E Welcome Weddings
-- (workspace filho, section_id NULL) — espelha o padrão de ww_sdr_data_reuniao.
-- ============================================================================

INSERT INTO public.system_fields (key, label, type, options, active, section, is_system, section_id, order_index, org_id, produto_exclusivo)
SELECT
  'ww_closer_data_reuniao',
  'Data Reunião Closer',
  'date',
  NULL::jsonb,
  TRUE,
  'wedding_info',
  TRUE,
  sf.section_id,
  15,  -- ordem entre ww_closer_como_reuniao (10) e o próximo
  sf.org_id,
  'WEDDING'
FROM public.system_fields sf
WHERE sf.key = 'ww_closer_como_reuniao'
  AND NOT EXISTS (
    SELECT 1 FROM public.system_fields sf2
    WHERE sf2.key = 'ww_closer_data_reuniao' AND sf2.org_id = sf.org_id
  );

-- Verificação: deve retornar 2 linhas (Welcome Group + Welcome Weddings)
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.system_fields
   WHERE key = 'ww_closer_data_reuniao' AND produto_exclusivo = 'WEDDING';
  IF v_count < 1 THEN
    RAISE EXCEPTION 'ww_closer_data_reuniao não foi criado (esperado >= 1, encontrado %)', v_count;
  END IF;
END $$;
