-- Registrar Oportunidades Futuras como seção dinâmica (configurável via Pipeline Studio)
INSERT INTO sections (key, label, icon, color, position, order_index, is_system, is_governable, active, widget_component)
VALUES (
    'future_opportunities',
    'Oportunidades Futuras',
    'calendar-clock',
    'bg-blue-50 text-blue-700 border-blue-100',
    'right_column',
    15,
    true,
    false,
    true,
    'future_opportunities'
)
ON CONFLICT (key) DO UPDATE SET
    widget_component = EXCLUDED.widget_component,
    active = true;
