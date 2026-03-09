-- Fix: converter origem='' para NULL automaticamente antes de insert/update
-- Garante compatibilidade mesmo que o frontend envie string vazia

CREATE OR REPLACE FUNCTION normalize_card_origem()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.origem = '' THEN
    NEW.origem := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_normalize_card_origem ON cards;
CREATE TRIGGER trg_normalize_card_origem
  BEFORE INSERT OR UPDATE ON cards
  FOR EACH ROW
  EXECUTE FUNCTION normalize_card_origem();
