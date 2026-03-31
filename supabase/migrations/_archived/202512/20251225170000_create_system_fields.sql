-- Drop deprecated table
DROP TABLE IF EXISTS crm_outcomes;

-- Create system_fields table
CREATE TABLE IF NOT EXISTS system_fields (
    key text PRIMARY KEY,
    label text NOT NULL,
    type text NOT NULL CHECK (type IN ('text', 'number', 'date', 'currency', 'select', 'multiselect', 'boolean')),
    options jsonb,
    active boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE system_fields ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can read
CREATE POLICY "Everyone can read system_fields" ON system_fields FOR SELECT USING (true);

-- Policy: Authenticated users can insert/update/delete (for Admin UI)
CREATE POLICY "Authenticated users can manage system_fields" ON system_fields USING (auth.role() = 'authenticated');

-- Populate initial data
INSERT INTO system_fields (key, label, type, options) VALUES
('valor_estimado', 'Valor Estimado', 'currency', null),
('data_viagem_inicio', 'Data Início Viagem', 'date', null),
('data_viagem_fim', 'Data Fim Viagem', 'date', null),
('prioridade', 'Prioridade', 'select', '["Alta", "Média", "Baixa"]'::jsonb),
('origem', 'Origem', 'text', null),
('destinos', 'Destinos', 'multiselect', null),
('orcamento', 'Orçamento', 'currency', null),
('motivo', 'Motivo da Viagem', 'text', null),
('epoca_viagem', 'Época da Viagem', 'text', null),
('pessoas', 'Viajantes', 'text', null)
ON CONFLICT (key) DO NOTHING;
