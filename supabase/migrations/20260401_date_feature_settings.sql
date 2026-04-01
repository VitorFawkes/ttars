-- Configurações para features de datas de viagem
-- Alerta ao mover para pós-venda + auto-cálculo a partir dos produtos

INSERT INTO integration_settings (key, value, description)
VALUES
    ('date_features.pos_venda_alert_enabled', 'true', 'Exibir alerta de confirmação de data ao mover card para primeira etapa de pós-venda'),
    ('date_features.auto_calc_from_products_enabled', 'true', 'Auto-calcular Data Viagem c/ Welcome a partir das datas dos produtos financeiros')
ON CONFLICT (key) DO NOTHING;
