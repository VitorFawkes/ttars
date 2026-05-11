-- ============================================================
-- Fix: adicionar 4 seções Wedding faltantes em produção
-- Seções: wedding_sdr, wedding_closer, wedding_planejamento, wedding_marketing
-- Todas as outras migrations wedding_* já foram aplicadas via Studio/SQL
-- ============================================================

INSERT INTO sections (key, label, color, icon, position, order_index, is_governable, is_system, active, widget_component, produto)
VALUES
('wedding_sdr',           'SDR - Qualificação',       'bg-blue-50 text-blue-700 border-blue-100',     'ClipboardCheck', 'left_column',   20, true, false, true, NULL,            'WEDDING'),
('wedding_closer',        'Closer - Negociação',      'bg-purple-50 text-purple-700 border-purple-100','FileText',      'left_column',   30, true, false, true, NULL,            'WEDDING'),
('wedding_planejamento',  'Planejamento',             'bg-green-50 text-green-700 border-green-100',  'CalendarCheck',  'left_column',   40, true, false, true, NULL,            'WEDDING'),
('wedding_marketing',     'Marketing e Origem',       'bg-pink-50 text-pink-700 border-pink-100',     'Megaphone',      'right_column',  60, true, false, true, NULL,            'WEDDING')
ON CONFLICT DO NOTHING;

-- Reparentar system_fields que apontam para seções que agora existem
-- (section_id pode estar NULL se a seção não existia quando os fields foram criados)
UPDATE system_fields SET section_id = (SELECT id FROM sections WHERE key = 'wedding_sdr')
WHERE section = 'wedding_sdr' AND (section_id IS NULL OR section_id != (SELECT id FROM sections WHERE key = 'wedding_sdr'));

UPDATE system_fields SET section_id = (SELECT id FROM sections WHERE key = 'wedding_closer')
WHERE section = 'wedding_closer' AND (section_id IS NULL OR section_id != (SELECT id FROM sections WHERE key = 'wedding_closer'));

UPDATE system_fields SET section_id = (SELECT id FROM sections WHERE key = 'wedding_planejamento')
WHERE section = 'wedding_planejamento' AND (section_id IS NULL OR section_id != (SELECT id FROM sections WHERE key = 'wedding_planejamento'));

UPDATE system_fields SET section_id = (SELECT id FROM sections WHERE key = 'wedding_marketing')
WHERE section = 'wedding_marketing' AND (section_id IS NULL OR section_id != (SELECT id FROM sections WHERE key = 'wedding_marketing'));

-- Verificação
DO $$
DECLARE
    cnt INT;
BEGIN
    SELECT COUNT(*) INTO cnt FROM sections WHERE produto = 'WEDDING';
    IF cnt < 5 THEN
        RAISE EXCEPTION 'Expected at least 5 Wedding sections, got %', cnt;
    END IF;
    RAISE NOTICE 'Wedding sections OK: % total', cnt;
END $$;
