-- ============================================================================
-- MIGRATION: Notification System Improvements
-- Date: 2026-03-30
--
-- 1. Tabela notification_type_config (admin configura tipos)
-- 2. Fix trigger lead_assigned: remover filtro TRIPS-only + check config
-- 3. Adicionar notificação no bulk_import_financial_items
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Tabela de configuração de tipos de notificação
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notification_type_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_key TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  icon TEXT NOT NULL DEFAULT 'bell',
  color TEXT NOT NULL DEFAULT 'indigo',
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed tipos iniciais
INSERT INTO notification_type_config (type_key, label, description, icon, color) VALUES
  ('lead_assigned', 'Lead Atribuído', 'Quando um card é atribuído a você', 'user-check', 'indigo'),
  ('financial_items_updated', 'Produtos Atualizados', 'Quando produtos financeiros são importados via Monde', 'file-spreadsheet', 'purple')
ON CONFLICT (type_key) DO NOTHING;

-- RLS
ALTER TABLE notification_type_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read notification config" ON notification_type_config;
CREATE POLICY "Anyone can read notification config"
  ON notification_type_config FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can update notification config" ON notification_type_config;
CREATE POLICY "Admins can update notification config"
  ON notification_type_config FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- Realtime precisa de REPLICA IDENTITY FULL para filtrar UPDATEs por user_id
ALTER TABLE notifications REPLICA IDENTITY FULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Fix trigger: remover filtro TRIPS-only + respeitar config admin
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION notify_teams_on_card_assign()
RETURNS TRIGGER AS $$
DECLARE
    v_n8n_url TEXT;
    v_teams_url TEXT;
    v_enabled TEXT;
    v_dono_email TEXT;
    v_dono_teams_enabled BOOLEAN;
BEGIN
    -- Só dispara se dono_atual_id mudou
    IF TG_OP = 'UPDATE' AND OLD.dono_atual_id IS NOT DISTINCT FROM NEW.dono_atual_id THEN
        RETURN NEW;
    END IF;

    -- Sem dono = sem notificação
    IF NEW.dono_atual_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Verificar se tipo está habilitado na config admin
    IF NOT EXISTS (
        SELECT 1 FROM notification_type_config
        WHERE type_key = 'lead_assigned' AND enabled = true
    ) THEN
        RETURN NEW;
    END IF;

    -- ============================================================
    -- SEMPRE inserir notificação in-app (todos os produtos)
    -- ============================================================
    INSERT INTO notifications (user_id, type, title, body, url)
    VALUES (
        NEW.dono_atual_id,
        'lead_assigned',
        'Novo lead atribuído',
        'Card "' || COALESCE(NEW.titulo, 'Sem título') || '" foi atribuído a você',
        '/cards/' || NEW.id::TEXT
    );

    -- ============================================================
    -- Teams: verificar se dono tem Teams habilitado
    -- ============================================================
    SELECT email, teams_notify_enabled
    INTO v_dono_email, v_dono_teams_enabled
    FROM profiles WHERE id = NEW.dono_atual_id;

    -- Skip Teams se desabilitado ou sem email
    IF v_dono_teams_enabled IS NOT TRUE OR v_dono_email IS NULL THEN
        RETURN NEW;
    END IF;

    -- Verificar se integração Teams está habilitada globalmente
    SELECT value INTO v_enabled FROM integration_settings WHERE key = 'TEAMS_NOTIFY_ENABLED';
    IF v_enabled IS DISTINCT FROM 'true' THEN
        RETURN NEW;
    END IF;

    -- Buscar URLs
    SELECT value INTO v_n8n_url FROM integration_settings WHERE key = 'TEAMS_N8N_WEBHOOK_URL';
    SELECT value INTO v_teams_url FROM integration_settings WHERE key = 'TEAMS_WEBHOOK_URL';

    IF v_n8n_url IS NULL THEN
        RAISE WARNING '[teams_notify] TEAMS_N8N_WEBHOOK_URL not found';
        RETURN NEW;
    END IF;

    -- Chamada async via pg_net para o n8n (com email do dono)
    PERFORM net.http_post(
        url := v_n8n_url,
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object(
            'card_id', NEW.id::TEXT,
            'dono_id', NEW.dono_atual_id::TEXT,
            'dono_email', v_dono_email,
            'titulo', COALESCE(NEW.titulo, 'Sem título'),
            'teams_webhook_url', v_teams_url
        )
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[teams_notify] error: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions;

-- Trigger já existe, recriar para garantir
DROP TRIGGER IF EXISTS trg_notify_teams_on_assign ON public.cards;

CREATE TRIGGER trg_notify_teams_on_assign
    AFTER INSERT OR UPDATE OF dono_atual_id ON public.cards
    FOR EACH ROW
    EXECUTE FUNCTION notify_teams_on_card_assign();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Adicionar notificação no bulk_import_financial_items
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION bulk_import_financial_items(p_cards JSONB)
RETURNS JSONB AS $$
DECLARE
  v_card JSONB;
  v_product JSONB;
  v_card_id UUID;
  v_item_id UUID;
  v_cards_updated INTEGER := 0;
  v_products_imported INTEGER := 0;
  v_pax_name TEXT;
  v_pax_idx INTEGER;
  v_total_venda DECIMAL(12,2);
  v_total_custo DECIMAL(12,2);
  v_receita DECIMAL(12,2);
  v_item_count INTEGER;
  v_notify_user UUID;
  v_card_titulo TEXT;
  v_notif_enabled BOOLEAN;
BEGIN
  -- Check se tipo de notificação está habilitado (uma vez, fora do loop)
  SELECT enabled INTO v_notif_enabled
  FROM notification_type_config
  WHERE type_key = 'financial_items_updated';

  FOR v_card IN SELECT * FROM jsonb_array_elements(p_cards)
  LOOP
    v_card_id := (v_card->>'card_id')::UUID;

    -- 1. Delete existing financial items (cascade deletes passengers too)
    DELETE FROM card_financial_items WHERE card_id = v_card_id;

    -- 2. Insert products
    FOR v_product IN SELECT * FROM jsonb_array_elements(v_card->'products')
    LOOP
      INSERT INTO card_financial_items (
        card_id, product_type, description, sale_value, supplier_cost,
        fornecedor, representante, documento, data_inicio, data_fim
      ) VALUES (
        v_card_id,
        'custom',
        v_product->>'description',
        COALESCE((v_product->>'sale_value')::DECIMAL, 0),
        COALESCE((v_product->>'supplier_cost')::DECIMAL, 0),
        v_product->>'fornecedor',
        v_product->>'representante',
        v_product->>'documento',
        (v_product->>'data_inicio')::DATE,
        (v_product->>'data_fim')::DATE
      )
      RETURNING id INTO v_item_id;

      -- 3. Insert passengers for this product
      v_pax_idx := 0;
      IF v_product->'passageiros' IS NOT NULL AND jsonb_array_length(v_product->'passageiros') > 0 THEN
        FOR v_pax_name IN SELECT jsonb_array_elements_text(v_product->'passageiros')
        LOOP
          INSERT INTO financial_item_passengers (financial_item_id, card_id, nome, ordem)
          VALUES (v_item_id, v_card_id, v_pax_name, v_pax_idx);
          v_pax_idx := v_pax_idx + 1;
        END LOOP;
      END IF;

      v_products_imported := v_products_imported + 1;
    END LOOP;

    -- 4. Recalculate financials inline
    SELECT
      COALESCE(SUM(sale_value), 0),
      COALESCE(SUM(supplier_cost), 0),
      COUNT(*)
    INTO v_total_venda, v_total_custo, v_item_count
    FROM card_financial_items
    WHERE card_id = v_card_id;

    IF v_item_count > 0 THEN
      v_receita := v_total_venda - v_total_custo;

      UPDATE cards
      SET
        valor_final = v_total_venda,
        receita = v_receita,
        receita_source = 'calculated',
        updated_at = NOW()
      WHERE id = v_card_id;
    END IF;

    -- 5. Notificar dono do card sobre import (se habilitado)
    IF v_notif_enabled IS TRUE THEN
      SELECT COALESCE(dono_atual_id, vendas_owner_id), titulo
      INTO v_notify_user, v_card_titulo
      FROM cards WHERE id = v_card_id;

      IF v_notify_user IS NOT NULL THEN
        INSERT INTO notifications (user_id, type, title, body, url)
        VALUES (
          v_notify_user,
          'financial_items_updated',
          'Produtos atualizados via Monde',
          'Card "' || COALESCE(v_card_titulo, 'Sem título') || '" recebeu ' || v_item_count || ' produtos',
          '/cards/' || v_card_id::TEXT
        );
      END IF;
    END IF;

    v_cards_updated := v_cards_updated + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'cards_updated', v_cards_updated,
    'products_imported', v_products_imported
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
