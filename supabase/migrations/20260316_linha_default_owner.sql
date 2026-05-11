-- Adiciona default_owner_id para forçar Travel Planner por linha
ALTER TABLE whatsapp_linha_config
  ADD COLUMN IF NOT EXISTS default_owner_id UUID REFERENCES profiles(id);

-- Mariana Volpi como Travel Planner padrão na linha dela
UPDATE whatsapp_linha_config
SET default_owner_id = '82e2dfe6-5436-4087-b45d-3d4b4938dae5'
WHERE phone_number_label = 'Mariana Volpi';
