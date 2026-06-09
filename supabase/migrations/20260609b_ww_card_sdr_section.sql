-- Card de Weddings — reorganizar campos por fase: seção SDR ("SDR - Qualificação").
--
-- Hoje os 73 campos de wedding estão todos na seção única "Informações do
-- Casamento" (wedding_info). As seções por fase já existem mas estão vazias.
-- Este passo move pra seção wedding_sdr os campos que pertencem ao SDR (base do
-- casamento que o Leadster preenche + qualificação + reunião + taxa) e move os
-- campos crus de marketing pra wedding_marketing. Closer e Pós-venda ficam pra
-- passos seguintes; quando wedding_info esvaziar, será desativada.
--
-- Mudança só de metadado (system_fields.section / order_index). Os valores nos
-- cards (cards.produto_data, keyed por `key`) não são tocados — apenas mudam de
-- lugar na renderização. Escopo restrito ao workspace Weddings pra não tocar em
-- resíduo da conta-mãe. Reversível: reatribuir section='wedding_info'.

DO $$
DECLARE
  v_org  uuid := 'b0000000-0000-0000-0000-000000000002'; -- workspace Welcome Weddings
  -- (campo, seção, order_index) na ordem de exibição desejada
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      -- Base do casamento (vem do Leadster)
      ('ww_nome_parceiro',                    'wedding_sdr',        10),
      ('ww_data_casamento',                   'wedding_sdr',        20),
      ('ww_destino',                          'wedding_sdr',        30),
      ('ww_tipo_casamento',                   'wedding_sdr',        40),
      ('ww_num_convidados',                   'wedding_sdr',        50),
      ('ww_orcamento_faixa',                  'wedding_sdr',        60),
      -- Qualificação
      ('ww_sdr_como_conheceu',                'wedding_sdr',       100),
      ('ww_sdr_cidade',                       'wedding_sdr',       110),
      ('ww_sdr_status_relacionamento',        'wedding_sdr',       120),
      ('ww_sdr_previsao_data',                'wedding_sdr',       130),
      ('ww_sdr_visao_casamento',              'wedding_sdr',       140),
      ('ww_sdr_motivacao',                    'wedding_sdr',       150),
      ('ww_sdr_flexibilidade',                'wedding_sdr',       160),
      ('ww_sdr_ajuda_familia',                'wedding_sdr',       170),
      ('ww_sdr_orcamento',                    'wedding_sdr',       180),
      ('ww_sdr_teto_orcamento',               'wedding_sdr',       190),
      ('ww_sdr_perfil_viagem_internacional',  'wedding_sdr',       200),
      ('ww_sdr_referencia_casamento_premium', 'wedding_sdr',       210),
      ('ww_sdr_qualificado',                  'wedding_sdr',       220),
      ('ww_sdr_motivo_qualificacao',          'wedding_sdr',       230),
      -- Reunião SDR
      ('ww_sdr_data_reuniao',                 'wedding_sdr',       300),
      ('ww_sdr_como_reuniao',                 'wedding_sdr',       310),
      ('ww_sdr_link_reuniao',                 'wedding_sdr',       320),
      -- Taxa (passagem pro Closer)
      ('ww_sdr_taxa_enviada',                 'wedding_sdr',       400),
      ('ww_sdr_taxa_paga',                    'wedding_sdr',       410),
      -- Marketing / origem
      ('ww_mkt_como_conheceu',                'wedding_marketing', 500),
      ('ww_mkt_destino_form',                 'wedding_marketing', 510),
      ('ww_mkt_convidados_form',              'wedding_marketing', 520),
      ('ww_mkt_orcamento_form',               'wedding_marketing', 530)
    ) AS t(field_key, target_section, ord)
  LOOP
    UPDATE public.system_fields
    SET section = r.target_section, order_index = r.ord
    WHERE org_id = v_org
      AND produto_exclusivo = 'WEDDING'
      AND key = r.field_key;
  END LOOP;
END $$;
