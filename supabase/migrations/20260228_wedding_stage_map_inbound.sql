-- ============================================================
-- Wedding Stage Map Inbound: AC → CRM (32 mapeamentos)
-- Mapeia stages de 6 AC pipelines para 19 CRM stages
-- Depende de: 20260228_wedding_pipeline_stages.sql
-- ============================================================

-- Helper: resolve CRM stage UUID by name within Wedding pipeline
CREATE OR REPLACE FUNCTION _ww_stage(p_nome TEXT) RETURNS UUID AS $$
    SELECT id FROM pipeline_stages
    WHERE pipeline_id = 'f4611f84-ce9c-48ad-814b-dcd6081f15db' AND nome = p_nome
    LIMIT 1;
$$ LANGUAGE sql STABLE;

-- ═══════════════════════════════════════════════════════════
-- Pipeline 1 — SDR Weddings (8 mappings)
-- ═══════════════════════════════════════════════════════════
INSERT INTO integration_stage_map (integration_id, pipeline_id, external_stage_id, external_stage_name, internal_stage_id, direction)
VALUES
('a2141b92-561f-4514-92b4-9412a068d236', '1', '1',   'Triagem - MQL',                     _ww_stage('Novo Lead'),              'inbound'),
('a2141b92-561f-4514-92b4-9412a068d236', '1', '60',  'StandBy',                            _ww_stage('Novo Lead'),              'inbound'),
('a2141b92-561f-4514-92b4-9412a068d236', '1', '3',   'Follow Up',                          _ww_stage('Tentativa de Contato'),   'inbound'),
('a2141b92-561f-4514-92b4-9412a068d236', '1', '201', 'Reagendamento SDR',                  _ww_stage('Tentativa de Contato'),   'inbound'),
('a2141b92-561f-4514-92b4-9412a068d236', '1', '7',   'Primeiro Contato - Qualificação',    _ww_stage('Conectado'),              'inbound'),
('a2141b92-561f-4514-92b4-9412a068d236', '1', '155', 'Reagendamento closer',               _ww_stage('Reunião Agendada'),       'inbound'),
('a2141b92-561f-4514-92b4-9412a068d236', '1', '8',   'Qualificado pela SDR',               _ww_stage('Qualificação Feita'),     'inbound'),
('a2141b92-561f-4514-92b4-9412a068d236', '1', '61',  'Aguardando pagamento TAXA',          _ww_stage('Qualificação Feita'),     'inbound');

-- ═══════════════════════════════════════════════════════════
-- Pipeline 3 — Closer Weddings (7 mappings)
-- ═══════════════════════════════════════════════════════════
INSERT INTO integration_stage_map (integration_id, pipeline_id, external_stage_id, external_stage_name, internal_stage_id, direction)
VALUES
('a2141b92-561f-4514-92b4-9412a068d236', '3', '13',  '1ª Reunião',                        _ww_stage('1ª Reunião'),             'inbound'),
('a2141b92-561f-4514-92b4-9412a068d236', '3', '14',  'Em contato',                         _ww_stage('Proposta em Construção'), 'inbound'),
('a2141b92-561f-4514-92b4-9412a068d236', '3', '193', 'Aguardando dados',                   _ww_stage('Proposta em Construção'), 'inbound'),
('a2141b92-561f-4514-92b4-9412a068d236', '3', '163', 'Standby - Closer',                   _ww_stage('1ª Reunião'),             'inbound'),
('a2141b92-561f-4514-92b4-9412a068d236', '3', '15',  'Contrato enviado',                   _ww_stage('Proposta Enviada'),       'inbound'),
('a2141b92-561f-4514-92b4-9412a068d236', '3', '16',  'Em negociação',                      _ww_stage('Negociação'),             'inbound'),
('a2141b92-561f-4514-92b4-9412a068d236', '3', '37',  'Ganho',                              _ww_stage('Contrato Assinado'),      'inbound');

-- ═══════════════════════════════════════════════════════════
-- Pipeline 4 — Planejamento Weddings (7 mappings)
-- ═══════════════════════════════════════════════════════════
INSERT INTO integration_stage_map (integration_id, pipeline_id, external_stage_id, external_stage_name, internal_stage_id, direction)
VALUES
('a2141b92-561f-4514-92b4-9412a068d236', '4', '20',  'Boas-vindas + Questionário do Casal', _ww_stage('Boas-vindas e Questionário'),   'inbound'),
('a2141b92-561f-4514-92b4-9412a068d236', '4', '21',  'Primeira reunião - Onboarding',       _ww_stage('1ª Reunião Planejamento'),      'inbound'),
('a2141b92-561f-4514-92b4-9412a068d236', '4', '22',  'Propostas pré-definição',             _ww_stage('Definição do Casamento'),       'inbound'),
('a2141b92-561f-4514-92b4-9412a068d236', '4', '23',  'Definir casamento e hospedagem',      _ww_stage('Definição do Casamento'),       'inbound'),
('a2141b92-561f-4514-92b4-9412a068d236', '4', '25',  'Passagem do Casamento',               _ww_stage('Passagens e Logística'),        'inbound'),
('a2141b92-561f-4514-92b4-9412a068d236', '4', '146', 'Casais com Aditivo Contratual',       _ww_stage('Passagens e Logística'),        'inbound'),
('a2141b92-561f-4514-92b4-9412a068d236', '4', '147', 'Casamentos Cancelados',               _ww_stage('Casamento Cancelado'),          'inbound');

-- ═══════════════════════════════════════════════════════════
-- Pipeline 12 — Elopment Wedding (7 mappings)
-- ═══════════════════════════════════════════════════════════
INSERT INTO integration_stage_map (integration_id, pipeline_id, external_stage_id, external_stage_name, internal_stage_id, direction)
VALUES
('a2141b92-561f-4514-92b4-9412a068d236', '12', '62',  'Elopment Antigo',                   _ww_stage('Novo Lead'),              'inbound'),
('a2141b92-561f-4514-92b4-9412a068d236', '12', '182', 'Elopment Wedding',                  _ww_stage('Novo Lead'),              'inbound'),
('a2141b92-561f-4514-92b4-9412a068d236', '12', '186', 'Follow up',                         _ww_stage('Tentativa de Contato'),   'inbound'),
('a2141b92-561f-4514-92b4-9412a068d236', '12', '198', 'Reunião agendada',                  _ww_stage('Reunião Agendada'),       'inbound'),
('a2141b92-561f-4514-92b4-9412a068d236', '12', '185', 'Aguardando pagamento',              _ww_stage('Qualificação Feita'),     'inbound'),
('a2141b92-561f-4514-92b4-9412a068d236', '12', '184', 'Assinatura de contrato',            _ww_stage('Proposta Enviada'),       'inbound'),
('a2141b92-561f-4514-92b4-9412a068d236', '12', '199', 'Ganho',                             _ww_stage('Contrato Assinado'),      'inbound');

-- ═══════════════════════════════════════════════════════════
-- Pipeline 17 — WW Internacional (1 mapping)
-- ═══════════════════════════════════════════════════════════
INSERT INTO integration_stage_map (integration_id, pipeline_id, external_stage_id, external_stage_name, internal_stage_id, direction)
VALUES
('a2141b92-561f-4514-92b4-9412a068d236', '17', '81',  'Lead Internacional',                _ww_stage('Novo Lead'),              'inbound');

-- ═══════════════════════════════════════════════════════════
-- Pipeline 31 — Outros Desqualificados (2 mappings)
-- ═══════════════════════════════════════════════════════════
INSERT INTO integration_stage_map (integration_id, pipeline_id, external_stage_id, external_stage_name, internal_stage_id, direction)
VALUES
('a2141b92-561f-4514-92b4-9412a068d236', '31', '165', 'Geral',                             _ww_stage('Perdido'),                'inbound'),
('a2141b92-561f-4514-92b4-9412a068d236', '31', '170', 'Desqualificado',                    _ww_stage('Perdido'),                'inbound');

-- Cleanup helper function
DROP FUNCTION _ww_stage(TEXT);

-- Verificação
DO $$
DECLARE
    cnt INT;
BEGIN
    SELECT COUNT(*) INTO cnt FROM integration_stage_map
    WHERE integration_id = 'a2141b92-561f-4514-92b4-9412a068d236'
      AND direction = 'inbound'
      AND pipeline_id IN ('1','3','4','12','17','31');
    IF cnt != 32 THEN
        RAISE EXCEPTION 'Expected 32 inbound mappings for Wedding, got %', cnt;
    END IF;
    RAISE NOTICE 'Wedding inbound stage map: % mappings created', cnt;
END $$;
