-- Weddings/SDR: Tipo de Casamento no topo; os dois campos da Closer no fim.
-- Só order_index. Escopo workspace Weddings.

UPDATE public.system_fields SET order_index = 5
  WHERE org_id = 'b0000000-0000-0000-0000-000000000002' AND key = 'ww_tipo_casamento';

UPDATE public.system_fields SET order_index = 200
  WHERE org_id = 'b0000000-0000-0000-0000-000000000002' AND key = 'ww_sdr_agendamento_closer';

UPDATE public.system_fields SET order_index = 210
  WHERE org_id = 'b0000000-0000-0000-0000-000000000002' AND key = 'ww_sdr_tipo_reuniao_closer';
