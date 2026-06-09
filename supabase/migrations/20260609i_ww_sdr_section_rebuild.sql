-- Weddings: reconstrói a seção SDR conforme os campos que a SDR realmente
-- preenche (prints do Mateus). Só a seção wedding_sdr muda; Qualificação e
-- Marketing ficam intactas. Escopo: workspace Weddings b0…0002, WEDDING.
--
-- "Excluir" = desativar (active=false): some da UI, dados preservados, a IA
-- continua escrevendo em produto_data. Tipo de Casamento é mantido (decisão do
-- usuário). Campos novos nascem texto livre.

DO $$
DECLARE
  v_org uuid := 'b0000000-0000-0000-0000-000000000002';
  r record;
BEGIN
  -- 1. Campos novos (insere se não existir)
  FOR r IN
    SELECT * FROM (VALUES
      ('ww_sdr_email_noivo2',          'E-mail do Noivo(a) 2',                        'text',     10),
      ('ww_sdr_telefone_noivo2',       'Telefone do Noivo(a) 2',                      'text',     20),
      ('ww_sdr_cpf_noivo2',            'CPF do Noivo(a) 2',                           'text',     30),
      ('ww_sdr_cpf_principal',         'CPF do contato principal',                    'text',     40),
      ('ww_sdr_motivo_desqualificacao','Motivo desqualificação SDR',                  'text',     90),
      ('ww_sdr_agendamento_closer',    'Data e horário do agendamento com a Closer',  'datetime', 100),
      ('ww_sdr_tipo_reuniao_closer',   'Tipo da reunião com a Closer',                'text',     110)
    ) AS t(key, label, ftype, ord)
  LOOP
    INSERT INTO public.system_fields
      (key, label, type, options, active, section, is_system, section_id, order_index, org_id, produto_exclusivo)
    SELECT r.key, r.label, r.ftype, NULL, true, 'wedding_sdr', true, NULL, r.ord, v_org, 'WEDDING'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.system_fields WHERE org_id = v_org AND key = r.key
    );
  END LOOP;

  -- 2. Campos mantidos: reordena + alinha labels aos prints
  FOR r IN
    SELECT * FROM (VALUES
      ('ww_sdr_taxa_enviada',       'Enviado pagamento de taxa?',  50),
      ('ww_sdr_taxa_paga',          'Pagamento de Taxa?',          60),
      ('ww_sdr_qualificado',        'Qualificado para SQL',        70),
      ('ww_sdr_motivo_qualificacao','Motivos de qualificação SDR', 80),
      ('ww_sdr_como_reuniao',       'Como foi feita a 1ª reunião?',120),
      ('ww_sdr_link_reuniao',       'WW | Link Reunião Teams SDR', 130),
      ('ww_tipo_casamento',         'Tipo de Casamento',           140)
    ) AS t(key, label, ord)
  LOOP
    UPDATE public.system_fields
    SET label = r.label, order_index = r.ord, active = true, section = 'wedding_sdr'
    WHERE org_id = v_org AND key = r.key;
  END LOOP;

  -- 3. Desativa os campos que saem da SDR (não estão nos prints)
  UPDATE public.system_fields
  SET active = false
  WHERE org_id = v_org
    AND produto_exclusivo = 'WEDDING'
    AND key IN (
      'ww_data_casamento',
      'ww_sdr_como_conheceu',
      'ww_sdr_status_relacionamento',
      'ww_sdr_previsao_data',
      'ww_sdr_visao_casamento',
      'ww_sdr_motivacao',
      'ww_sdr_flexibilidade',
      'ww_sdr_ajuda_familia',
      'ww_sdr_orcamento',
      'ww_sdr_teto_orcamento',
      'ww_sdr_perfil_viagem_internacional',
      'ww_sdr_referencia_casamento_premium',
      'ww_sdr_data_reuniao'
    );
END $$;
