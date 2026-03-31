-- ============================================================
-- Wedding Outbound Stage Map: CRM → AC (16 mapeamentos)
-- Quando um card muda de stage no CRM, sincroniza para o AC
-- AC move deals automaticamente entre pipelines pelo stage_id
-- Depende de: 20260228_wedding_pipeline_stages.sql
-- ============================================================

-- Helper: resolve CRM stage UUID by name within Wedding pipeline
CREATE OR REPLACE FUNCTION _ww_stage(p_nome TEXT) RETURNS UUID AS $$
    SELECT id FROM pipeline_stages
    WHERE pipeline_id = 'f4611f84-ce9c-48ad-814b-dcd6081f15db' AND nome = p_nome
    LIMIT 1;
$$ LANGUAGE sql STABLE;

INSERT INTO integration_outbound_stage_map (integration_id, internal_stage_id, external_stage_id, external_stage_name, is_active)
VALUES
-- SDR → AC Pipeline 1
('a2141b92-561f-4514-92b4-9412a068d236', _ww_stage('Novo Lead'),              '1',   'Triagem - MQL',                     true),
('a2141b92-561f-4514-92b4-9412a068d236', _ww_stage('Tentativa de Contato'),   '3',   'Follow Up',                          true),
('a2141b92-561f-4514-92b4-9412a068d236', _ww_stage('Conectado'),              '7',   'Primeiro Contato - Qualificação',    true),
('a2141b92-561f-4514-92b4-9412a068d236', _ww_stage('Reunião Agendada'),       '155', 'Reagendamento closer',               true),
('a2141b92-561f-4514-92b4-9412a068d236', _ww_stage('Qualificação Feita'),     '8',   'Qualificado pela SDR',               true),
('a2141b92-561f-4514-92b4-9412a068d236', _ww_stage('Taxa Paga'),              '61',  'Aguardando pagamento TAXA',          true),

-- Closer → AC Pipeline 3
('a2141b92-561f-4514-92b4-9412a068d236', _ww_stage('1ª Reunião'),             '13',  '1ª Reunião',                         true),
('a2141b92-561f-4514-92b4-9412a068d236', _ww_stage('Proposta em Construção'), '14',  'Em contato',                         true),
('a2141b92-561f-4514-92b4-9412a068d236', _ww_stage('Proposta Enviada'),       '15',  'Contrato enviado',                   true),
('a2141b92-561f-4514-92b4-9412a068d236', _ww_stage('Negociação'),             '16',  'Em negociação',                      true),
('a2141b92-561f-4514-92b4-9412a068d236', _ww_stage('Contrato Assinado'),      '37',  'Ganho',                              true),

-- Planejamento → AC Pipeline 4
('a2141b92-561f-4514-92b4-9412a068d236', _ww_stage('Boas-vindas e Questionário'),   '20',  'Boas-vindas + Questionário do Casal', true),
('a2141b92-561f-4514-92b4-9412a068d236', _ww_stage('1ª Reunião Planejamento'),      '21',  'Primeira reunião - Onboarding',       true),
('a2141b92-561f-4514-92b4-9412a068d236', _ww_stage('Definição do Casamento'),       '23',  'Definir casamento e hospedagem',      true),
('a2141b92-561f-4514-92b4-9412a068d236', _ww_stage('Passagens e Logística'),        '25',  'Passagem do Casamento',               true),

-- Terminal → AC Pipeline 4
('a2141b92-561f-4514-92b4-9412a068d236', _ww_stage('Casamento Cancelado'),          '147', 'Casamentos Cancelados',               true);

-- NÃO mapeados (intencional):
-- Casamento Concluído → CRM-only (sem equivalente no AC)
-- Pós-casamento e Reativação → CRM-only
-- Perdido → sincroniza via evento won/lost, não via stage

-- Cleanup helper function
DROP FUNCTION _ww_stage(TEXT);

-- Verificação
DO $$
DECLARE
    cnt INT;
BEGIN
    SELECT COUNT(*) INTO cnt FROM integration_outbound_stage_map
    WHERE integration_id = 'a2141b92-561f-4514-92b4-9412a068d236'
      AND internal_stage_id IN (
          SELECT id FROM pipeline_stages WHERE pipeline_id = 'f4611f84-ce9c-48ad-814b-dcd6081f15db'
      );
    IF cnt != 16 THEN
        RAISE EXCEPTION 'Expected 16 outbound mappings for Wedding, got %', cnt;
    END IF;
    RAISE NOTICE 'Wedding outbound stage map: % mappings created', cnt;
END $$;
