-- Add viajantes and travel_history as proper dynamic sections (TRIPS only)
INSERT INTO sections (key, label, color, icon, position, order_index, is_governable, is_system, active, widget_component, produto)
VALUES
    ('viajantes', 'Viajantes', 'bg-indigo-50 text-indigo-700 border-indigo-100', 'users', 'right_column', 41, false, true, true, 'viajantes', 'TRIPS'),
    ('travel_history', 'Histórico de Viagem', 'bg-emerald-50 text-emerald-700 border-emerald-100', 'map-pin', 'right_column', 42, false, true, true, 'travel_history', 'TRIPS')
ON CONFLICT (key) DO NOTHING;

-- Set travel_history to start collapsed by default (if column exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sections' AND column_name = 'default_collapsed') THEN
        UPDATE sections SET default_collapsed = true WHERE key = 'travel_history';
    END IF;
END $$;
