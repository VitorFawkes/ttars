-- Weddings: card do kanban (fase SDR) passa a estampar as infos de Qualificação.
--
-- A fase SDR de Weddings herdou os campos do Trips na provisão do workspace
-- (mkt_pretende_viajar_tempo, mkt_hospedagem_contratada, etc.) — todos vazios
-- em card WEDDING. Troca por: destino, nº de convidados, faixa de orçamento e
-- cidade (preenchidos pelo webhook Leadster em produto_data), mantendo nome do
-- contato, idade do lead (created_at) e status de tarefa.
--
-- Reversível: restaurar o array anterior (registrado no git desta migration).

UPDATE public.pipeline_card_settings
SET campos_kanban = '["pessoa_nome","ww_destino","ww_num_convidados","ww_orcamento_faixa","ww_sdr_cidade","created_at","task_status"]'::jsonb,
    ordem_kanban  = '["pessoa_nome","ww_destino","ww_num_convidados","ww_orcamento_faixa","ww_sdr_cidade","created_at","task_status"]'::jsonb
WHERE phase_id = '545a78f5-e58b-48a7-980a-e2a2652dc755'  -- fase SDR, Welcome Weddings
  AND usuario_id IS NULL;
