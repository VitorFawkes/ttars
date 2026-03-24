-- Adiciona coluna value_map para tradução de valores CRM→AC em campos dropdown/radio
-- O dispatch usa value_map[slug] para enviar o label correto ao ActiveCampaign
-- Ex: CRM salva "vídeo" (slug), AC espera "Video" (label exato da opção)

ALTER TABLE integration_outbound_field_map
ADD COLUMN IF NOT EXISTS value_map JSONB DEFAULT NULL;

COMMENT ON COLUMN integration_outbound_field_map.value_map IS
  'Mapeamento CRM slug → AC option label. Ex: {"vídeo": "Video"}. Se NULL, envia valor bruto.';

-- Campo 167: Como foi feita a 1a. Reunião SDR TRIPS (dropdown)
-- AC options: Video, Telefone, Presencial, Não teve reunião
-- CRM options: Vídeo (vídeo), Whatsapp (whatsapp), Ligação (ligação)
UPDATE integration_outbound_field_map
SET value_map = '{
  "vídeo": "Video",
  "ligação": "Telefone",
  "whatsapp": "Whatsapp"
}'::jsonb
WHERE external_field_id = '167';

-- Campo 168: WT - Enviado pagamento de taxa? (radio)
-- AC options: Sim - Taxa Automatica, Não - taxa Manual
-- CRM options: sim_-_taxa_automatica, não_-_taxa_manual
UPDATE integration_outbound_field_map
SET value_map = '{
  "sim_-_taxa_automatica": "Sim - Taxa Automatica",
  "não_-_taxa_manual": "Não - taxa Manual"
}'::jsonb
WHERE external_field_id = '168';
