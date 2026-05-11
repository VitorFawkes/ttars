-- ============================================================
-- Marco 1 — Travel Planner: Tabelas + RLS + Indexes
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. viagens
-- ────────────────────────────────────────────────────────────
CREATE TABLE viagens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id         UUID NOT NULL UNIQUE REFERENCES cards(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id),
  public_token    TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(18), 'base64'),
  estado          viagem_estado NOT NULL DEFAULT 'desenho',
  tp_owner_id     UUID REFERENCES profiles(id),
  pos_owner_id    UUID REFERENCES profiles(id),
  titulo          TEXT,
  subtitulo       TEXT,
  capa_url        TEXT,
  total_estimado  NUMERIC NOT NULL DEFAULT 0,
  total_aprovado  NUMERIC NOT NULL DEFAULT 0,
  enviada_em      TIMESTAMPTZ,
  confirmada_em   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE viagens IS 'Entidade central do Travel Planner. 1 card ↔ 1 viagem. Substitui proposals + proposal_trip_plans.';

ALTER TABLE viagens ENABLE ROW LEVEL SECURITY;

CREATE POLICY viagens_org_all ON viagens TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

CREATE POLICY viagens_service_all ON viagens TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_viagens_org_estado ON viagens (org_id, estado);
CREATE INDEX idx_viagens_public_token ON viagens (public_token);

-- ────────────────────────────────────────────────────────────
-- 2. trip_items
-- ────────────────────────────────────────────────────────────
CREATE TABLE trip_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viagem_id         UUID NOT NULL REFERENCES viagens(id) ON DELETE CASCADE,
  org_id            UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id),
  parent_id         UUID REFERENCES trip_items(id) ON DELETE SET NULL,
  tipo              trip_item_tipo NOT NULL,
  status            trip_item_status NOT NULL DEFAULT 'rascunho',
  ordem             INT NOT NULL DEFAULT 0,
  comercial         JSONB NOT NULL DEFAULT '{}',
  operacional       JSONB NOT NULL DEFAULT '{}',
  alternativas      JSONB NOT NULL DEFAULT '[]',
  aprovado_em       TIMESTAMPTZ,
  aprovado_por      TEXT CHECK (aprovado_por IN ('client', 'tp', 'pv')),
  criado_por        UUID,
  criado_por_papel  TEXT CHECK (criado_por_papel IN ('tp', 'pv')),
  editado_por       UUID,
  editado_por_papel TEXT CHECK (editado_por_papel IN ('tp', 'pv')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

COMMENT ON TABLE trip_items IS 'Item da viagem (hotel, voo, dia, etc). Substitui proposal_items + proposal_sections + trip_plan_blocks.';

ALTER TABLE trip_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY trip_items_org_all ON trip_items TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

CREATE POLICY trip_items_service_all ON trip_items TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_trip_items_viagem ON trip_items (viagem_id);
CREATE INDEX idx_trip_items_org_viagem ON trip_items (org_id, viagem_id);
CREATE INDEX idx_trip_items_parent ON trip_items (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_trip_items_active ON trip_items (viagem_id, ordem) WHERE deleted_at IS NULL;

-- ────────────────────────────────────────────────────────────
-- 3. trip_item_history
-- ────────────────────────────────────────────────────────────
CREATE TABLE trip_item_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id         UUID NOT NULL REFERENCES trip_items(id) ON DELETE CASCADE,
  viagem_id       UUID NOT NULL,
  org_id          UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id),
  autor           UUID,
  papel           TEXT CHECK (papel IN ('tp', 'pv', 'sistema', 'client')),
  campo           TEXT NOT NULL,
  valor_anterior  JSONB,
  valor_novo      JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE trip_item_history IS 'Audit granular por campo de trip_items. Um registro por campo alterado.';

ALTER TABLE trip_item_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY trip_item_history_org_select ON trip_item_history FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());

CREATE POLICY trip_item_history_service_all ON trip_item_history TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_trip_item_history_item ON trip_item_history (item_id);
CREATE INDEX idx_trip_item_history_viagem ON trip_item_history (viagem_id);

-- ────────────────────────────────────────────────────────────
-- 4. trip_comments
-- ────────────────────────────────────────────────────────────
CREATE TABLE trip_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     UUID REFERENCES trip_items(id) ON DELETE CASCADE,
  viagem_id   UUID NOT NULL REFERENCES viagens(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id),
  autor       TEXT NOT NULL CHECK (autor IN ('client', 'tp', 'pv')),
  autor_id    UUID,
  texto       TEXT NOT NULL,
  interno     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE trip_comments IS 'Comentários por item ou viagem inteira. interno=true só visível para TP/PV.';

ALTER TABLE trip_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY trip_comments_org_all ON trip_comments TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

CREATE POLICY trip_comments_service_all ON trip_comments TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_trip_comments_viagem ON trip_comments (viagem_id);
CREATE INDEX idx_trip_comments_item ON trip_comments (item_id) WHERE item_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 5. trip_events
-- ────────────────────────────────────────────────────────────
CREATE TABLE trip_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viagem_id   UUID NOT NULL REFERENCES viagens(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id),
  tipo        TEXT NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE trip_events IS 'Timeline de eventos da viagem. Fonte única de tracking.';

ALTER TABLE trip_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY trip_events_org_all ON trip_events TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

CREATE POLICY trip_events_service_all ON trip_events TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_trip_events_viagem ON trip_events (viagem_id);

-- ────────────────────────────────────────────────────────────
-- 6. trip_library_items
-- ────────────────────────────────────────────────────────────
CREATE TABLE trip_library_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id),
  tipo        trip_item_tipo NOT NULL,
  titulo      TEXT NOT NULL,
  comercial   JSONB NOT NULL DEFAULT '{}',
  operacional JSONB NOT NULL DEFAULT '{}',
  is_shared   BOOLEAN NOT NULL DEFAULT true,
  criado_por  UUID,
  uso_count   INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE trip_library_items IS 'Biblioteca de itens reutilizáveis. is_shared=true compartilhado no workspace.';

ALTER TABLE trip_library_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY trip_library_items_org_all ON trip_library_items TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

CREATE POLICY trip_library_items_service_all ON trip_library_items TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_trip_library_org_tipo ON trip_library_items (org_id, tipo);
