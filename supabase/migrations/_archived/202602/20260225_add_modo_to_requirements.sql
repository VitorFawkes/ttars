-- Adiciona coluna 'modo' para controle granular do que coletar por documento
-- Valores: 'dados' (só texto/número), 'arquivo' (só upload), 'ambos' (texto + upload)

ALTER TABLE card_document_requirements
  ADD COLUMN IF NOT EXISTS modo TEXT NOT NULL DEFAULT 'ambos';

ALTER TABLE card_document_requirements
  ADD CONSTRAINT chk_modo CHECK (modo IN ('dados', 'arquivo', 'ambos'));

-- Backfill: definir modo correto para rows existentes baseado no document_type
UPDATE card_document_requirements r
SET modo = CASE
  WHEN dt.requires_file AND dt.has_data_field THEN 'ambos'
  WHEN dt.requires_file AND NOT dt.has_data_field THEN 'arquivo'
  WHEN NOT dt.requires_file AND dt.has_data_field THEN 'dados'
  ELSE 'ambos'
END
FROM document_types dt
WHERE r.document_type_id = dt.id;
