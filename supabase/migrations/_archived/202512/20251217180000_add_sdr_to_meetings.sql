-- Add sdr_responsavel_id to reunioes table
ALTER TABLE reunioes 
ADD COLUMN sdr_responsavel_id UUID REFERENCES profiles(id);

-- Add comment
COMMENT ON COLUMN reunioes.sdr_responsavel_id IS 'ID do SDR responsável pelo agendamento da reunião';
