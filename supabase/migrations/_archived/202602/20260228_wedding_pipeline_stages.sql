-- ============================================================
-- Wedding Pipeline: 19 Stages (4 fases)
-- Pipeline UUID: f4611f84-ce9c-48ad-814b-dcd6081f15db
-- Filosofia: stages = jornada do CLIENTE, não operações internas
-- ============================================================

-- Limpar stages existentes (caso re-run) — pipeline Wedding tem 0 stages hoje
DELETE FROM pipeline_stages WHERE pipeline_id = 'f4611f84-ce9c-48ad-814b-dcd6081f15db';

-- ═══════════════════════════════════════════════════════════
-- SDR Phase (b7b72c29-6091-4c20-a58a-c3b8aed4755a) — 6 stages
-- ═══════════════════════════════════════════════════════════
INSERT INTO pipeline_stages (pipeline_id, phase_id, nome, ordem, is_won, is_lost, is_sdr_won, is_planner_won, is_pos_won, tipo_responsavel, target_role, milestone_key, is_frozen) VALUES
('f4611f84-ce9c-48ad-814b-dcd6081f15db', 'b7b72c29-6091-4c20-a58a-c3b8aed4755a', 'Novo Lead',              1, false, false, false, false, false, 'sdr', NULL, NULL, false),
('f4611f84-ce9c-48ad-814b-dcd6081f15db', 'b7b72c29-6091-4c20-a58a-c3b8aed4755a', 'Tentativa de Contato',   2, false, false, false, false, false, 'sdr', NULL, NULL, false),
('f4611f84-ce9c-48ad-814b-dcd6081f15db', 'b7b72c29-6091-4c20-a58a-c3b8aed4755a', 'Conectado',              3, false, false, false, false, false, 'sdr', NULL, NULL, false),
('f4611f84-ce9c-48ad-814b-dcd6081f15db', 'b7b72c29-6091-4c20-a58a-c3b8aed4755a', 'Reunião Agendada',       4, false, false, false, false, false, 'sdr', NULL, NULL, false),
('f4611f84-ce9c-48ad-814b-dcd6081f15db', 'b7b72c29-6091-4c20-a58a-c3b8aed4755a', 'Qualificação Feita',     5, false, false, false, false, false, 'sdr', NULL, NULL, false),
('f4611f84-ce9c-48ad-814b-dcd6081f15db', 'b7b72c29-6091-4c20-a58a-c3b8aed4755a', 'Taxa Paga',              6, false, false, true,  false, false, 'sdr', NULL, 'ww_taxa_paga', false);

-- ═══════════════════════════════════════════════════════════
-- Planner/Closer Phase (eafb7dff-663c-4713-bca2-035dcf2093ba) — 5 stages
-- ═══════════════════════════════════════════════════════════
INSERT INTO pipeline_stages (pipeline_id, phase_id, nome, ordem, is_won, is_lost, is_sdr_won, is_planner_won, is_pos_won, tipo_responsavel, target_role, milestone_key, is_frozen) VALUES
('f4611f84-ce9c-48ad-814b-dcd6081f15db', 'eafb7dff-663c-4713-bca2-035dcf2093ba', '1ª Reunião',              1, false, false, false, false, false, 'vendas', 'vendas', NULL, false),
('f4611f84-ce9c-48ad-814b-dcd6081f15db', 'eafb7dff-663c-4713-bca2-035dcf2093ba', 'Proposta em Construção',  2, false, false, false, false, false, 'vendas', NULL, NULL, false),
('f4611f84-ce9c-48ad-814b-dcd6081f15db', 'eafb7dff-663c-4713-bca2-035dcf2093ba', 'Proposta Enviada',        3, false, false, false, false, false, 'vendas', NULL, 'ww_proposta', false),
('f4611f84-ce9c-48ad-814b-dcd6081f15db', 'eafb7dff-663c-4713-bca2-035dcf2093ba', 'Negociação',              4, false, false, false, false, false, 'vendas', NULL, NULL, false),
('f4611f84-ce9c-48ad-814b-dcd6081f15db', 'eafb7dff-663c-4713-bca2-035dcf2093ba', 'Contrato Assinado',       5, true,  false, false, true,  false, 'vendas', NULL, 'ww_contrato_assinado', false);

-- ═══════════════════════════════════════════════════════════
-- Pós-venda/Planejamento Phase (95e78a06-92af-447c-9f71-60b2c23f1420) — 6 stages
-- ═══════════════════════════════════════════════════════════
INSERT INTO pipeline_stages (pipeline_id, phase_id, nome, ordem, is_won, is_lost, is_sdr_won, is_planner_won, is_pos_won, tipo_responsavel, target_role, milestone_key, is_frozen) VALUES
('f4611f84-ce9c-48ad-814b-dcd6081f15db', '95e78a06-92af-447c-9f71-60b2c23f1420', 'Boas-vindas e Questionário',   1, false, false, false, false, false, 'concierge', 'concierge', NULL, false),
('f4611f84-ce9c-48ad-814b-dcd6081f15db', '95e78a06-92af-447c-9f71-60b2c23f1420', '1ª Reunião Planejamento',      2, false, false, false, false, false, 'concierge', NULL, NULL, false),
('f4611f84-ce9c-48ad-814b-dcd6081f15db', '95e78a06-92af-447c-9f71-60b2c23f1420', 'Definição do Casamento',       3, false, false, false, false, false, 'concierge', NULL, NULL, false),
('f4611f84-ce9c-48ad-814b-dcd6081f15db', '95e78a06-92af-447c-9f71-60b2c23f1420', 'Passagens e Logística',        4, false, false, false, false, false, 'concierge', NULL, NULL, false),
('f4611f84-ce9c-48ad-814b-dcd6081f15db', '95e78a06-92af-447c-9f71-60b2c23f1420', 'Casamento Concluído',          5, true,  false, false, false, true,  'concierge', NULL, NULL, false),
('f4611f84-ce9c-48ad-814b-dcd6081f15db', '95e78a06-92af-447c-9f71-60b2c23f1420', 'Pós-casamento e Reativação',   6, false, false, false, false, false, 'concierge', NULL, NULL, false);

-- ═══════════════════════════════════════════════════════════
-- Resolução/Terminal Phase (7e4b7b21-fff2-4cb6-9b33-d9baf771edf7) — 2 stages
-- ═══════════════════════════════════════════════════════════
INSERT INTO pipeline_stages (pipeline_id, phase_id, nome, ordem, is_won, is_lost, is_sdr_won, is_planner_won, is_pos_won, tipo_responsavel, target_role, milestone_key, is_frozen) VALUES
('f4611f84-ce9c-48ad-814b-dcd6081f15db', '7e4b7b21-fff2-4cb6-9b33-d9baf771edf7', 'Perdido',                1, false, true,  false, false, false, 'sdr', NULL, NULL, false),
('f4611f84-ce9c-48ad-814b-dcd6081f15db', '7e4b7b21-fff2-4cb6-9b33-d9baf771edf7', 'Casamento Cancelado',    2, false, true,  false, false, false, 'sdr', NULL, NULL, false);

-- Verificação
DO $$
DECLARE
    cnt INT;
BEGIN
    SELECT COUNT(*) INTO cnt FROM pipeline_stages WHERE pipeline_id = 'f4611f84-ce9c-48ad-814b-dcd6081f15db';
    IF cnt != 19 THEN
        RAISE EXCEPTION 'Expected 19 stages, got %', cnt;
    END IF;
    RAISE NOTICE 'Wedding pipeline: % stages created successfully', cnt;
END $$;
