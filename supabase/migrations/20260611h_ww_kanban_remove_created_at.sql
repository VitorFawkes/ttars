-- Weddings: tira a estampa de data ("Data de Criação") do card do kanban na
-- fase SDR. created_at é system_field tipo date e renderizava 📅 dd/mm/aaaa.
-- Pedido do Mateus em 2026-06-11. Card fica: contato, destino, convidados,
-- orçamento, cidade e status de tarefa.

UPDATE public.pipeline_card_settings
SET campos_kanban = '["pessoa_nome","ww_destino","ww_num_convidados","ww_orcamento_faixa","ww_sdr_cidade","task_status"]'::jsonb,
    ordem_kanban  = '["pessoa_nome","ww_destino","ww_num_convidados","ww_orcamento_faixa","ww_sdr_cidade","task_status"]'::jsonb
WHERE phase_id = '545a78f5-e58b-48a7-980a-e2a2652dc755'  -- fase SDR, Welcome Weddings
  AND usuario_id IS NULL;
