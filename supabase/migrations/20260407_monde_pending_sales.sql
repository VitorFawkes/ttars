-- ============================================================
-- monde_pending_sales: vendas importadas do CSV Monde que não
-- têm card correspondente. Ficam "esperando" até alguém
-- preencher o numero_venda_monde em um card.
-- ============================================================

CREATE TABLE IF NOT EXISTS monde_pending_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id),
  venda_num TEXT NOT NULL,
  products JSONB NOT NULL DEFAULT '[]',
  total_venda NUMERIC NOT NULL DEFAULT 0,
  total_receita NUMERIC NOT NULL DEFAULT 0,
  products_count INT NOT NULL DEFAULT 0,
  file_name TEXT,
  import_log_id UUID REFERENCES monde_import_logs(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'matched', 'expired')),
  matched_card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
  matched_at TIMESTAMPTZ,
  UNIQUE(org_id, venda_num)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_monde_pending_sales_status ON monde_pending_sales(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_monde_pending_sales_venda_num ON monde_pending_sales(venda_num) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_monde_pending_sales_org ON monde_pending_sales(org_id);

-- RLS
ALTER TABLE monde_pending_sales ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'monde_pending_sales' AND policyname = 'monde_pending_sales_org_access'
  ) THEN
    CREATE POLICY "monde_pending_sales_org_access"
      ON monde_pending_sales
      FOR ALL
      USING (org_id = requesting_org_id());
  END IF;
END $$;

-- ============================================================
-- Trigger: auto-match quando cards.produto_data->>'numero_venda_monde'
-- é preenchido/alterado
-- ============================================================

CREATE OR REPLACE FUNCTION trg_match_pending_monde_sale()
RETURNS TRIGGER AS $$
DECLARE
  v_new_num TEXT;
  v_old_num TEXT;
  v_pending RECORD;
  v_product JSONB;
  v_org UUID;
BEGIN
  v_new_num := NEW.produto_data->>'numero_venda_monde';
  v_old_num := OLD.produto_data->>'numero_venda_monde';

  -- Só processa se o numero mudou e o novo não é vazio
  IF v_new_num IS NULL OR v_new_num = '' OR v_new_num = COALESCE(v_old_num, '') THEN
    RETURN NEW;
  END IF;

  v_org := COALESCE(NEW.org_id, requesting_org_id());

  -- Buscar venda pendente
  SELECT * INTO v_pending
  FROM monde_pending_sales
  WHERE venda_num = v_new_num
    AND status = 'pending'
    AND org_id = v_org
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Inserir cada produto como card_financial_item
  FOR v_product IN SELECT * FROM jsonb_array_elements(v_pending.products)
  LOOP
    INSERT INTO card_financial_items (
      card_id, description, sale_value, supplier_cost,
      fornecedor, representante, documento, data_inicio, data_fim,
      org_id
    ) VALUES (
      NEW.id,
      v_product->>'produto',
      COALESCE((v_product->>'valorTotal')::NUMERIC, 0),
      ROUND((COALESCE((v_product->>'valorTotal')::NUMERIC, 0) - COALESCE((v_product->>'receita')::NUMERIC, 0)) * 100) / 100,
      NULLIF(v_product->>'fornecedor', ''),
      NULLIF(v_product->>'representante', ''),
      NULLIF(v_product->>'documento', ''),
      (v_product->>'dataInicio')::DATE,
      (v_product->>'dataFim')::DATE,
      v_org
    );
  END LOOP;

  -- Marcar como matched
  UPDATE monde_pending_sales
  SET status = 'matched',
      matched_card_id = NEW.id,
      matched_at = now()
  WHERE id = v_pending.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar trigger apenas se não existir
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_cards_match_pending_monde'
  ) THEN
    CREATE TRIGGER trg_cards_match_pending_monde
      AFTER UPDATE ON cards
      FOR EACH ROW
      WHEN (NEW.produto_data->>'numero_venda_monde' IS DISTINCT FROM OLD.produto_data->>'numero_venda_monde')
      EXECUTE FUNCTION trg_match_pending_monde_sale();
  END IF;
END $$;
