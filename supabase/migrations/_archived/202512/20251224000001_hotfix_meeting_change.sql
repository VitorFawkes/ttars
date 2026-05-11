-- Add participantes_externos column to tarefas table
ALTER TABLE tarefas 
ADD COLUMN IF NOT EXISTS participantes_externos text[] DEFAULT '{}';

-- Comment on column
COMMENT ON COLUMN tarefas.participantes_externos IS 'List of external email addresses for meeting participants';
