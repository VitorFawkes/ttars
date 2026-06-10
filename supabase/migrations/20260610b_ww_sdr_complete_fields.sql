-- Weddings: completa a seção SDR com os campos da tela real (prints do Mateus)
-- que ainda não existiam no card. Complementa 20260609i (rebuild da SDR).
-- Escopo: workspace Welcome Weddings (b0…0002), produto WEDDING.
--
-- Estratégia de chaves: reusa as keys já mapeadas no integration_field_map do
-- ActiveCampaign (ww_tempo_relacionamento, ww_sdr_motivo_dw, ww_sdr_ja_foi_dw,
-- ww_sdr_ja_tem_destino, ww_sdr_data_qualificacao) — o histórico sincronizado
-- em produto_data aparece no card imediatamente. Tipos/opções escolhidos a
-- partir dos valores REAIS gravados nos cards (auditados via REST em 10/06).
--
-- Fora de escopo (decisões anteriores mantidas):
--   · Fonte do lead → já é cards.origem (nativo); não duplicar em produto_data
--   · Cidade/Destino/Nº convidados/Orçamento/Nome Noivo2 → seção Qualificação
--   · Telefone/CPF Noivo2 e CPF principal → viraram dados do contato (20260609k/l)

DO $$
DECLARE
  v_org uuid := 'b0000000-0000-0000-0000-000000000002';
  r record;
BEGIN
  -- 1. Campos novos (insere se não existir; keys do integration_field_map quando há)
  FOR r IN
    SELECT * FROM (VALUES
      ('ww_tempo_relacionamento',   'Tempo de relacionamento',                      'text',     NULL::jsonb,  40),
      ('ww_sdr_costumam_viajar',    'Costumam Viajar?',                             'boolean',  NULL,         60),
      ('ww_sdr_motivo_dw',          'Motivo da escolha de um Destination Wedding?', 'select',
        '["Apelo Emocional","Diminuir número de convidados","Não quer casamento tradicional","Custo benefício","Outros"]'::jsonb, 70),
      ('ww_sdr_ja_foi_dw',          'Já foi em algum Destination Wedding?',         'boolean',  NULL,         80),
      ('ww_sdr_ja_tem_destino',     'Já tem destino definido?',                     'select',
        '["Sim","Não","Muito perdido"]'::jsonb, 100),
      ('ww_sdr_previsao_assessoria','Previsão contratar assessoria',                'text',     NULL,        120),
      ('ww_sdr_data_qualificacao',  'Data Qualificação SDR (automático)',           'datetime', NULL,        200)
    ) AS t(key, label, ftype, opts, ord)
  LOOP
    INSERT INTO public.system_fields
      (key, label, type, options, active, section, is_system, section_id, order_index, org_id, produto_exclusivo)
    SELECT r.key, r.label, r.ftype, r.opts, true, 'wedding_sdr', true, NULL, r.ord, v_org, 'WEDDING'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.system_fields WHERE org_id = v_org AND key = r.key
    );
  END LOOP;

  -- 2. Reativa campos desativados em 20260609i que estão na tela real, com
  --    label/tipo/opções alinhados aos dados gravados:
  --    · data_reuniao: valores são datetime ISO (AC) → tipo datetime
  --    · status_relacionamento: opções antigas não batem com a tela e não há
  --      dado gravado → texto livre
  --    · como_conheceu / previsao_data: opções = valores reais nos cards
  UPDATE public.system_fields
  SET label = 'Data e horário do agendamento da 1ª reunião',
      type = 'datetime', options = NULL, order_index = 10, active = true
  WHERE org_id = v_org AND key = 'ww_sdr_data_reuniao';

  UPDATE public.system_fields
  SET label = 'Status do relacionamento',
      type = 'text', options = NULL, order_index = 50, active = true
  WHERE org_id = v_org AND key = 'ww_sdr_status_relacionamento';

  UPDATE public.system_fields
  SET label = 'Como conheceu a WW?',
      options = '["Google","Instagram","Indicação","Influencer","Chatgpt","Já foi em um de nossos casamentos","Outro"]'::jsonb,
      order_index = 90, active = true
  WHERE org_id = v_org AND key = 'ww_sdr_como_conheceu';

  UPDATE public.system_fields
  SET label = 'Previsão data de casamento',
      options = '["Menos de 6 Meses","Entre 6 e 12 meses","Entre 12 e 18 meses","Acima de 18 meses"]'::jsonb,
      order_index = 110, active = true
  WHERE org_id = v_org AND key = 'ww_sdr_previsao_data';

  -- 3. Reordena os campos já ativos para seguir a ordem da tela real
  FOR r IN
    SELECT * FROM (VALUES
      ('ww_sdr_link_reuniao',          20),
      ('ww_sdr_como_reuniao',          30),
      ('ww_sdr_taxa_enviada',         130),
      ('ww_sdr_taxa_paga',            140),
      ('ww_sdr_qualificado',          150),
      ('ww_sdr_motivo_qualificacao',  160),
      ('ww_sdr_motivo_desqualificacao',170),
      ('ww_sdr_agendamento_closer',   180),
      ('ww_sdr_tipo_reuniao_closer',  190)
    ) AS t(key, ord)
  LOOP
    UPDATE public.system_fields
    SET order_index = r.ord
    WHERE org_id = v_org AND key = r.key;
  END LOOP;

  -- 4. Normaliza ww_sdr_ja_foi_dw: "Sim"/"Não" (string do AC) -> boolean,
  --    pois o campo renderiza como boolean (mesmo padrão de ww_grupo_whats_criado)
  UPDATE public.cards
  SET produto_data = jsonb_set(
        produto_data, '{ww_sdr_ja_foi_dw}',
        to_jsonb( lower(btrim(produto_data->>'ww_sdr_ja_foi_dw')) IN ('sim','true','t','yes','1') )
      )
  WHERE org_id = v_org
    AND produto = 'WEDDING'
    AND produto_data ? 'ww_sdr_ja_foi_dw'
    AND jsonb_typeof(produto_data->'ww_sdr_ja_foi_dw') = 'string';
END $$;

-- 5. Automação: carimbar ww_sdr_data_qualificacao quando "Qualificado para SQL"
--    vira true. O AC fazia isso (campo "Automático - WW - Data Qualificação SDR");
--    com o inbound do AC desligado (20260609), o carimbo passa a ser do CRM.
--    Só na transição não-qualificado → qualificado e só se ainda não há carimbo
--    (preserva o histórico do AC e não retro-carimba cards antigos).
CREATE OR REPLACE FUNCTION public.stamp_ww_sdr_data_qualificacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_q boolean;
  v_old_q boolean;
BEGIN
  IF NEW.produto IS DISTINCT FROM 'WEDDING' THEN
    RETURN NEW;
  END IF;

  v_new_q := lower(coalesce(NEW.produto_data->>'ww_sdr_qualificado','')) IN ('true','sim','t','1','yes');
  IF NOT v_new_q THEN
    RETURN NEW;
  END IF;

  IF coalesce(NEW.produto_data->>'ww_sdr_data_qualificacao','') <> '' THEN
    RETURN NEW;  -- já carimbado (manual ou histórico do AC)
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old_q := lower(coalesce(OLD.produto_data->>'ww_sdr_qualificado','')) IN ('true','sim','t','1','yes');
    IF v_old_q THEN
      RETURN NEW;  -- já era qualificado antes; não retro-carimbar
    END IF;
  END IF;

  NEW.produto_data := jsonb_set(
    coalesce(NEW.produto_data, '{}'::jsonb),
    '{ww_sdr_data_qualificacao}',
    to_jsonb(to_char(timezone('America/Sao_Paulo', now()), 'YYYY-MM-DD"T"HH24:MI:SS') || '-03:00')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_ww_sdr_data_qualificacao ON public.cards;
CREATE TRIGGER trg_stamp_ww_sdr_data_qualificacao
  BEFORE INSERT OR UPDATE OF produto_data ON public.cards
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_ww_sdr_data_qualificacao();
