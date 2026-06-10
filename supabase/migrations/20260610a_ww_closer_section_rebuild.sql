-- Weddings: reconstrói a seção Negociação (Closer) conforme a tela real que a
-- Closer usa (print do Mateus). Hoje os campos da Closer ainda vivem na seção
-- wedding_info (widget, coluna direita) — esta migration os MOVE para a seção
-- wedding_closer (coluna esquerda, lista de campos), exatamente como a reforma
-- da SDR de ontem (20260609i) fez com os campos ww_sdr_*.
-- Escopo: workspace Welcome Weddings (b0…0002), produto WEDDING.
--
-- "Esconder" = active=false: some da UI, dado preservado em produto_data
-- (alimenta analytics/integração; nenhum é obrigatório em transição de etapa).
-- 4 campos que só vinham do ActiveCampaign (AC inbound foi desligado p/ WW em
-- 20260609_disable_ac_weddings_inbound) passam a ser preenchidos pela Closer no
-- card; as keys já existem no integration_field_map (AC 31/65/70 + 62).
-- "DW ou Elopement?" do print = o "Tipo de Casamento" que já está na SDR
-- (decisão do usuário) — não vira campo novo aqui.

DO $$
DECLARE
  v_org uuid := 'b0000000-0000-0000-0000-000000000002';
  r record;
BEGIN
  -- 1. Campos novos / trazidos do AC pro card (insere se não existir)
  FOR r IN
    SELECT * FROM (VALUES
      ('ww_closer_orcamento_apresentado', 'Foi apresentado detalhamento de orçamento?', 'boolean',  60),
      ('ww_grupo_whats_criado',           'Grupo de whats criado?',                     'boolean',  70),
      ('ww_closer_prazo_contrato',        'Prazo para devolução do contrato',           'text',     80),
      ('ww_closer_cerimonial',            'Cerimonial incluso? Quantos?',               'text',    100),
      ('ww_closer_pacote_convidados',     'Pacote WW - Nº de Convidados',               'text',    110)
    ) AS t(key, label, ftype, ord)
  LOOP
    INSERT INTO public.system_fields
      (key, label, type, options, active, section, is_system, section_id, order_index, org_id, produto_exclusivo)
    SELECT r.key, r.label, r.ftype, NULL, true, 'wedding_closer', true, NULL, r.ord, v_org, 'WEDDING'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.system_fields WHERE org_id = v_org AND key = r.key
    );
  END LOOP;

  -- 2. Campos mantidos: MOVE para wedding_closer + reordena + alinha labels ao print
  FOR r IN
    SELECT * FROM (VALUES
      ('ww_closer_como_reuniao',   'Como foi feita a Reunião Closer', 10),
      ('ww_closer_link_reuniao',   'Link Reunião Teams Closer',       20),
      ('ww_closer_segunda_reuniao','Fez segunda reunião?',            30),
      ('ww_closer_link_proposta',  'Link da Proposta',                40),
      ('ww_closer_link_asaas',     'Link do Asaas',                   50),
      ('ww_closer_valor_contrato', 'Valor fechado em contrato',       90)
    ) AS t(key, label, ord)
  LOOP
    UPDATE public.system_fields
    SET label = r.label, order_index = r.ord, active = true, section = 'wedding_closer'
    WHERE org_id = v_org AND key = r.key;
  END LOOP;

  -- 3. Esconde do card (active=false) — seguem em produto_data p/ relatórios/integração
  UPDATE public.system_fields
  SET active = false
  WHERE org_id = v_org
    AND produto_exclusivo = 'WEDDING'
    AND key IN ('ww_closer_data_reuniao', 'ww_closer_monde_venda', 'ww_closer_data_ganho');

  -- 4. Normaliza ww_grupo_whats_criado em produto_data: "Sim"/"Não" (string vinda do
  --    AC) -> boolean, pois o campo agora renderiza como boolean. Só onde é string.
  UPDATE public.cards
  SET produto_data = jsonb_set(
        produto_data, '{ww_grupo_whats_criado}',
        to_jsonb( lower(btrim(produto_data->>'ww_grupo_whats_criado')) IN ('sim','true','t','yes','1') )
      )
  WHERE org_id = v_org
    AND produto = 'WEDDING'
    AND produto_data ? 'ww_grupo_whats_criado'
    AND jsonb_typeof(produto_data->'ww_grupo_whats_criado') = 'string';
END $$;
