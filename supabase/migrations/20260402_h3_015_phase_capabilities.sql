-- H3-015: Phase Capabilities — tornar fases dinâmicas
-- Adiciona colunas semânticas em pipeline_phases para substituir
-- referências hardcoded a 'sdr', 'planner', 'pos_venda'.
--
-- Em vez de if (slug === 'sdr'), o código checa phase.supports_win, phase.win_action, etc.

-- Colunas de capability
ALTER TABLE pipeline_phases ADD COLUMN IF NOT EXISTS supports_win BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE pipeline_phases ADD COLUMN IF NOT EXISTS win_action TEXT DEFAULT NULL;
  -- 'advance_to_next': avança para próxima fase
  -- 'close_deal': fecha o card como ganho
  -- 'choose': modal pergunta se avança ou fecha (planner)
ALTER TABLE pipeline_phases ADD COLUMN IF NOT EXISTS owner_field TEXT DEFAULT NULL;
  -- nome da coluna em cards que guarda o owner desta fase
  -- ex: 'sdr_owner_id', 'vendas_owner_id', 'pos_owner_id'
ALTER TABLE pipeline_phases ADD COLUMN IF NOT EXISTS is_entry_phase BOOLEAN NOT NULL DEFAULT false;
  -- primeira fase do pipeline (onde cards entram)
ALTER TABLE pipeline_phases ADD COLUMN IF NOT EXISTS is_terminal_phase BOOLEAN NOT NULL DEFAULT false;
  -- última fase (pós-venda, entrega, etc.)
ALTER TABLE pipeline_phases ADD COLUMN IF NOT EXISTS owner_label TEXT DEFAULT NULL;
  -- label para exibir o owner desta fase (ex: 'SDR', 'Planner', 'Concierge')
ALTER TABLE pipeline_phases ADD COLUMN IF NOT EXISTS accent_color TEXT DEFAULT NULL;
  -- cor de destaque para filtros (ex: 'teal', 'indigo', 'amber')

-- Seed Welcome Group phases
UPDATE pipeline_phases SET
    supports_win = true,
    win_action = 'advance_to_next',
    owner_field = 'sdr_owner_id',
    is_entry_phase = true,
    owner_label = 'SDR',
    accent_color = 'teal'
WHERE slug = 'sdr';

UPDATE pipeline_phases SET
    supports_win = true,
    win_action = 'choose',
    owner_field = 'vendas_owner_id',
    owner_label = 'Planner',
    accent_color = 'indigo'
WHERE slug = 'planner';

UPDATE pipeline_phases SET
    supports_win = false,
    is_terminal_phase = true,
    owner_field = 'pos_owner_id',
    owner_label = 'Pós-Venda',
    accent_color = 'amber'
WHERE slug = 'pos_venda';

UPDATE pipeline_phases SET
    owner_field = 'concierge_owner_id',
    owner_label = 'Concierge',
    accent_color = 'rose'
WHERE slug = 'concierge';
