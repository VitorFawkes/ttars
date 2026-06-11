-- Weddings: cria na fase SDR as etapas que espelham o pipeline SDR do
-- ActiveCampaign (pedido do Mateus, 2026-06-11), com "Qualificado pela SDR"
-- por último. Ordem das demais segue o board do AC.
--
-- Junto, redireciona o integration_stage_map (inbound, AC pipeline 1) para as
-- etapas novas — sem isso as movimentações vindas do Active continuariam
-- caindo nas etapas antigas (Conectado/Tentativa/Qualificação Feita) e as
-- colunas novas ficariam mortas. "Triagem - MQL"→Novo Lead permanece.
--
-- Etapas antigas (Conectado 15 cards, Tentativa de Contato 79, Qualificação
-- Feita 1, Taxa Paga 0) ficam ativas — têm cards; migração/desativação é
-- decisão separada.
--
-- Seções do card: etapa sem linha em stage_section_config é visível por
-- default (useStageSectionConfig: is_visible ?? true) — sem seed necessário.

DO $$
DECLARE
  v_org      uuid := 'b0000000-0000-0000-0000-000000000002';  -- Welcome Weddings
  v_pipeline uuid := 'f4611f84-ce9c-48ad-814b-dcd6081f15db';  -- Pipeline Welcome Wedding
  v_phase    uuid := '545a78f5-e58b-48a7-980a-e2a2652dc755';  -- fase SDR
  v_fase     text;
  v_tipo     public.app_role;  -- tipo_responsavel é enum app_role
  r          record;
BEGIN
  -- Copia atributos legados da etapa de entrada (Novo Lead)
  SELECT fase, tipo_responsavel INTO v_fase, v_tipo
  FROM public.pipeline_stages
  WHERE id = '6acb35af-d1a2-48e7-bc48-133907ae9554';

  FOR r IN SELECT * FROM (VALUES
    ('Follow Up',                       10, '3'),
    ('Reagendamento SDR',               11, '201'),
    ('Primeiro Contato - Qualificação', 12, '7'),
    ('Aguardando pagamento TAXA',       13, '61'),
    ('StandBy',                         14, '60'),
    ('Qualificado pela SDR',            15, '8')
  ) AS t(nome, ordem, ac_stage)
  LOOP
    INSERT INTO public.pipeline_stages
      (org_id, pipeline_id, phase_id, fase, nome, ordem, ativo, tipo_responsavel)
    SELECT v_org, v_pipeline, v_phase, v_fase, r.nome, r.ordem, true, v_tipo
    WHERE NOT EXISTS (
      SELECT 1 FROM public.pipeline_stages
      WHERE phase_id = v_phase AND nome = r.nome
    );

    UPDATE public.integration_stage_map m
    SET internal_stage_id = s.id
    FROM public.pipeline_stages s
    WHERE s.phase_id = v_phase
      AND s.nome = r.nome
      AND m.integration_id = 'a2141b92-561f-4514-92b4-9412a068d236'
      AND m.pipeline_id = '1'
      AND m.external_stage_id = r.ac_stage
      AND m.direction = 'inbound';
  END LOOP;
END $$;
