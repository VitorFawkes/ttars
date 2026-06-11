-- Weddings: tira a cidade da estampa do card no kanban (fase SDR) — não é
-- relevante para a SDR (pedido do Mateus, 2026-06-11). O campo continua na
-- seção Qualificação dentro do card.

UPDATE public.pipeline_card_settings
SET campos_kanban = '["pessoa_nome","ww_destino","ww_num_convidados","ww_orcamento_faixa","task_status"]'::jsonb,
    ordem_kanban  = '["pessoa_nome","ww_destino","ww_num_convidados","ww_orcamento_faixa","task_status"]'::jsonb
WHERE phase_id = '545a78f5-e58b-48a7-980a-e2a2652dc755'  -- fase SDR, Welcome Weddings
  AND usuario_id IS NULL;
