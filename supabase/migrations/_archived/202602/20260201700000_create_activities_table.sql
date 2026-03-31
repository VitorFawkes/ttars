-- Criar tabela activities (necessária para triggers de logging)
CREATE TABLE IF NOT EXISTS activities (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    card_id uuid REFERENCES cards(id) ON DELETE CASCADE,
    tipo text,
    descricao text,
    metadata jsonb DEFAULT '{}',
    created_by uuid,
    created_at timestamptz DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_activities_card_id ON activities(card_id);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at);

-- RLS
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view activities" ON activities
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert activities" ON activities
    FOR INSERT TO authenticated WITH CHECK (true);
