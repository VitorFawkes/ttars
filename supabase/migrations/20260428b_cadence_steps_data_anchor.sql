-- Adiciona campo data_anchor em cadence_steps pra escolher qual data
-- ancorar o cálculo de quando disparar o atendimento.
--
-- Hoje o motor calcula tudo a partir de cards.data_viagem_inicio (viagem
-- completa). Mas as datas relevantes pro concierge variam:
-- - viagem_inicio: voo de ida da viagem completa (default)
-- - viagem_fim: volta da viagem completa
-- - welcome_inicio: entrada na parte com Welcome (data_exata_da_viagem.start em produto_data)
-- - welcome_fim: saída da parte com Welcome (data_exata_da_viagem.end)
-- - aceite: quando a cadência foi disparada (started_at da instance)
--
-- Default = 'viagem_inicio' pra preservar comportamento atual.

ALTER TABLE cadence_steps
  ADD COLUMN IF NOT EXISTS data_anchor TEXT DEFAULT 'viagem_inicio'
    CHECK (data_anchor IN ('viagem_inicio', 'viagem_fim', 'welcome_inicio', 'welcome_fim', 'aceite'));

COMMENT ON COLUMN cadence_steps.data_anchor IS
  'Qual data do card ancora o cálculo de execute_at (data_vencimento da tarefa).
   Combinado com day_offset: anchor + day_offset dias = data de execução.
   Ex: anchor=welcome_inicio + day_offset=-7 = "7 dias antes da entrada com Welcome".';

-- Backfill: ajustar seeded cadências do Concierge pra ancorar corretamente
UPDATE cadence_steps SET data_anchor = 'aceite'
  WHERE categoria_concierge = 'publicar_app';

UPDATE cadence_steps SET data_anchor = 'welcome_inicio'
  WHERE categoria_concierge IN ('passaporte', 'check_in_oferta', 'welcome_letter', 'check_in_executar', 'vip_treatment');

UPDATE cadence_steps SET data_anchor = 'welcome_fim'
  WHERE categoria_concierge = 'pesquisa_pos';
