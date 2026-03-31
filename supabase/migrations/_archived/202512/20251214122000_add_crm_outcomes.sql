-- Add CRM outcome fields to reunioes
ALTER TABLE reunioes 
ADD COLUMN IF NOT EXISTS resultado text,
ADD COLUMN IF NOT EXISTS feedback text,
ADD COLUMN IF NOT EXISTS motivo_cancelamento text;

-- Add CRM outcome fields to tarefas
ALTER TABLE tarefas
ADD COLUMN IF NOT EXISTS resultado text;

-- Create index for analytics
CREATE INDEX IF NOT EXISTS idx_reunioes_resultado ON reunioes(resultado);
CREATE INDEX IF NOT EXISTS idx_tarefas_resultado ON tarefas(resultado);
