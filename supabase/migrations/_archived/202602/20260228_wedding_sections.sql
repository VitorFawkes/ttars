-- ============================================================
-- 5 Seções exclusivas do Wedding
-- Depende de: 20260228_wedding_sections_produto.sql
-- ============================================================

INSERT INTO sections (key, label, color, icon, position, order_index, is_governable, is_system, active, widget_component, produto)
VALUES
('wedding_info',          'Informações do Casamento', 'bg-rose-50 text-rose-700 border-rose-100',     'Heart',          'right_column',  10, true, true, true, 'wedding_info', 'WEDDING'),
('wedding_sdr',           'SDR - Qualificação',       'bg-blue-50 text-blue-700 border-blue-100',     'ClipboardCheck', 'left_column',   20, true, false, true, NULL,            'WEDDING'),
('wedding_closer',        'Closer - Negociação',      'bg-purple-50 text-purple-700 border-purple-100','FileText',      'left_column',   30, true, false, true, NULL,            'WEDDING'),
('wedding_planejamento',  'Planejamento',             'bg-green-50 text-green-700 border-green-100',  'CalendarCheck',  'left_column',   40, true, false, true, NULL,            'WEDDING'),
('wedding_marketing',     'Marketing e Origem',       'bg-pink-50 text-pink-700 border-pink-100',     'Megaphone',      'right_column',  60, true, false, true, NULL,            'WEDDING')
ON CONFLICT DO NOTHING;

-- Verificação
DO $$
DECLARE
    cnt INT;
BEGIN
    SELECT COUNT(*) INTO cnt FROM sections WHERE produto = 'WEDDING';
    IF cnt < 5 THEN
        RAISE EXCEPTION 'Expected at least 5 Wedding sections, got %', cnt;
    END IF;
    RAISE NOTICE 'Wedding sections: % created', cnt;
END $$;
