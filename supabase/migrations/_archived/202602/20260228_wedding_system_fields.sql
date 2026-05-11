-- ============================================================
-- 36 System Fields para Wedding
-- Agrupados por seção: wedding_info, wedding_sdr, wedding_closer,
-- wedding_planejamento, wedding_marketing
-- Depende de: 20260228_wedding_sections.sql
-- ============================================================

-- Resolver section_id pelo key
CREATE OR REPLACE FUNCTION _ww_section(p_key TEXT) RETURNS UUID AS $$
    SELECT id FROM sections WHERE key = p_key LIMIT 1;
$$ LANGUAGE sql STABLE;

-- ═══════════════════════════════════════════════════════════
-- wedding_info (6 campos)
-- ═══════════════════════════════════════════════════════════
INSERT INTO system_fields (key, label, type, options, section, section_id, is_system, active, order_index) VALUES
('ww_data_casamento',    'Data do Casamento',      'date',     NULL, 'wedding_info', _ww_section('wedding_info'), true, true, 10),
('ww_destino',           'Destino',                'select',   '["Caribe","Nordeste","Europa","EUA","México","Itália","Outro"]'::jsonb, 'wedding_info', _ww_section('wedding_info'), true, true, 20),
('ww_tipo_casamento',    'Tipo de Casamento',      'select',   '["Destination Wedding","Elopement","Internacional"]'::jsonb, 'wedding_info', _ww_section('wedding_info'), true, true, 30),
('ww_orcamento_faixa',   'Orçamento',              'select',   '["Até R$50k","R$50-80k","R$80-100k","R$100-200k","Acima R$200k"]'::jsonb, 'wedding_info', _ww_section('wedding_info'), true, true, 40),
('ww_num_convidados',    'Número de Convidados',   'number',   NULL, 'wedding_info', _ww_section('wedding_info'), true, true, 50),
('ww_nome_parceiro',     'Nome do(a) Noivo(a) 2',  'text',     NULL, 'wedding_info', _ww_section('wedding_info'), true, true, 60)
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════
-- wedding_sdr (12 campos)
-- ═══════════════════════════════════════════════════════════
INSERT INTO system_fields (key, label, type, options, section, section_id, is_system, active, order_index) VALUES
('ww_sdr_data_reuniao',           'Data Reunião SDR',             'date',     NULL, 'wedding_sdr', _ww_section('wedding_sdr'), true, true, 10),
('ww_sdr_como_reuniao',           'Como foi a Reunião',           'select',   '["Vídeo","Telefone","Presencial","Nenhuma"]'::jsonb, 'wedding_sdr', _ww_section('wedding_sdr'), true, true, 20),
('ww_sdr_link_reuniao',           'Link Reunião Teams',           'text',     NULL, 'wedding_sdr', _ww_section('wedding_sdr'), true, true, 30),
('ww_sdr_cidade',                 'Cidade',                       'text',     NULL, 'wedding_sdr', _ww_section('wedding_sdr'), true, true, 40),
('ww_sdr_status_relacionamento',  'Status Relacionamento',        'select',   '["Noivos","Casados","Renovação"]'::jsonb, 'wedding_sdr', _ww_section('wedding_sdr'), true, true, 50),
('ww_sdr_como_conheceu',          'Como Conheceu a WW',           'select',   '["Google","Instagram","Indicação","Outro"]'::jsonb, 'wedding_sdr', _ww_section('wedding_sdr'), true, true, 60),
('ww_sdr_previsao_data',          'Previsão Data Casamento',      'select',   '["Até 6 meses","6-12 meses","12-18 meses","Acima de 18 meses"]'::jsonb, 'wedding_sdr', _ww_section('wedding_sdr'), true, true, 70),
('ww_sdr_orcamento',              'Orçamento Informado',          'currency', NULL, 'wedding_sdr', _ww_section('wedding_sdr'), true, true, 80),
('ww_sdr_qualificado',            'Qualificado para SQL',         'boolean',  NULL, 'wedding_sdr', _ww_section('wedding_sdr'), true, true, 90),
('ww_sdr_motivo_qualificacao',    'Motivo Qualificação',          'select',   '["Orçamento condiz","Bom orçamento","Indicação"]'::jsonb, 'wedding_sdr', _ww_section('wedding_sdr'), true, true, 100),
('ww_sdr_taxa_enviada',           'Taxa Enviada',                 'boolean',  NULL, 'wedding_sdr', _ww_section('wedding_sdr'), true, true, 110),
('ww_sdr_taxa_paga',              'Taxa Paga',                    'boolean',  NULL, 'wedding_sdr', _ww_section('wedding_sdr'), true, true, 120)
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════
-- wedding_closer (8 campos)
-- ═══════════════════════════════════════════════════════════
INSERT INTO system_fields (key, label, type, options, section, section_id, is_system, active, order_index) VALUES
('ww_closer_como_reuniao',    'Como foi Reunião Closer',   'select',   '["Vídeo","Telefone","Presencial"]'::jsonb, 'wedding_closer', _ww_section('wedding_closer'), true, true, 10),
('ww_closer_link_reuniao',    'Link Reunião Teams',        'text',     NULL, 'wedding_closer', _ww_section('wedding_closer'), true, true, 20),
('ww_closer_segunda_reuniao', 'Fez Segunda Reunião',       'boolean',  NULL, 'wedding_closer', _ww_section('wedding_closer'), true, true, 30),
('ww_closer_link_proposta',   'Link Proposta',             'text',     NULL, 'wedding_closer', _ww_section('wedding_closer'), true, true, 40),
('ww_closer_link_asaas',      'Link Asaas',                'text',     NULL, 'wedding_closer', _ww_section('wedding_closer'), true, true, 50),
('ww_closer_valor_contrato',  'Valor do Contrato',         'currency', NULL, 'wedding_closer', _ww_section('wedding_closer'), true, true, 60),
('ww_closer_monde_venda',     'Número Venda Monde',        'text',     NULL, 'wedding_closer', _ww_section('wedding_closer'), true, true, 70),
('ww_closer_data_ganho',      'Data/Hora do Ganho',         'date',     NULL, 'wedding_closer', _ww_section('wedding_closer'), true, true, 80)
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════
-- wedding_planejamento (6 campos)
-- ═══════════════════════════════════════════════════════════
INSERT INTO system_fields (key, label, type, options, section, section_id, is_system, active, order_index) VALUES
('ww_plan_data_reuniao',          'Data 1ª Reunião Planejamento',  'date',     NULL, 'wedding_planejamento', _ww_section('wedding_planejamento'), true, true, 10),
('ww_plan_data_casamento_final',  'Data Confirmada Casamento',     'date',     NULL, 'wedding_planejamento', _ww_section('wedding_planejamento'), true, true, 20),
('ww_plan_hospedagem',            'Hospedagem',                    'text',     NULL, 'wedding_planejamento', _ww_section('wedding_planejamento'), true, true, 30),
('ww_plan_apartamentos',          'Apartamentos Bloqueados',       'number',   NULL, 'wedding_planejamento', _ww_section('wedding_planejamento'), true, true, 40),
('ww_plan_qtd_reunioes',          'Reuniões Realizadas',           'number',   NULL, 'wedding_planejamento', _ww_section('wedding_planejamento'), true, true, 50),
('ww_plan_observacoes',           'Observações',                   'textarea', NULL, 'wedding_planejamento', _ww_section('wedding_planejamento'), true, true, 60)
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════
-- wedding_marketing (4 campos)
-- ═══════════════════════════════════════════════════════════
INSERT INTO system_fields (key, label, type, options, section, section_id, is_system, active, order_index) VALUES
('ww_mkt_destino_form',    'Destino (Formulário)',    'text', NULL, 'wedding_marketing', _ww_section('wedding_marketing'), true, true, 10),
('ww_mkt_orcamento_form',  'Orçamento (Formulário)',  'text', NULL, 'wedding_marketing', _ww_section('wedding_marketing'), true, true, 20),
('ww_mkt_convidados_form', 'Convidados (Formulário)', 'text', NULL, 'wedding_marketing', _ww_section('wedding_marketing'), true, true, 30),
('ww_mkt_como_conheceu',   'Origem Conversão',        'text', NULL, 'wedding_marketing', _ww_section('wedding_marketing'), true, true, 40)
ON CONFLICT (key) DO NOTHING;

-- Cleanup helper
DROP FUNCTION _ww_section(TEXT);

-- Verificação
DO $$
DECLARE
    cnt INT;
BEGIN
    SELECT COUNT(*) INTO cnt FROM system_fields WHERE key LIKE 'ww_%';
    IF cnt < 36 THEN
        RAISE EXCEPTION 'Expected at least 36 Wedding fields, got %', cnt;
    END IF;
    RAISE NOTICE 'Wedding system fields: % created', cnt;
END $$;
