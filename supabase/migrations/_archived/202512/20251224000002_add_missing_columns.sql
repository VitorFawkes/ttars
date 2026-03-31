-- Add missing columns to tarefas table
ALTER TABLE tarefas 
ADD COLUMN IF NOT EXISTS categoria_outro text,
ADD COLUMN IF NOT EXISTS feedback text,
ADD COLUMN IF NOT EXISTS motivo_cancelamento text,
ADD COLUMN IF NOT EXISTS resultado text,
ADD COLUMN IF NOT EXISTS rescheduled_to_id uuid REFERENCES tarefas(id),
ADD COLUMN IF NOT EXISTS rescheduled_from_id uuid REFERENCES tarefas(id);

-- Force schema cache reload
NOTIFY pgrst, 'reload config';
