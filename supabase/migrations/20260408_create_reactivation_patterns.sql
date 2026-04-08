-- ============================================================
-- Reativação Inteligente — Tabela de padrões de viagem
-- Pré-calculada via cron diário para performance
-- ============================================================

CREATE TABLE IF NOT EXISTS reactivation_patterns (
  contact_id UUID PRIMARY KEY REFERENCES contatos(id) ON DELETE CASCADE,
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id),

  -- Frequência
  travel_frequency_per_year NUMERIC(4,2),
  avg_days_between_trips INT,
  total_completed_trips INT DEFAULT 0,

  -- Sazonalidade
  peak_months INT[],
  peak_months_confidence NUMERIC(3,2),
  typical_booking_lead_days INT,

  -- Predição
  predicted_next_trip_start DATE,
  predicted_next_trip_end DATE,
  ideal_contact_date DATE,
  prediction_confidence NUMERIC(3,2),

  -- Valor
  avg_trip_value NUMERIC(12,2),
  total_revenue NUMERIC(14,2),
  is_high_value BOOLEAN DEFAULT FALSE,

  -- Score composto (0-100)
  reactivation_score INT,
  score_breakdown JSONB,

  -- Contexto
  last_destinations TEXT[],
  preferred_duration_days INT,
  days_since_last_trip INT,
  days_until_ideal_contact INT,

  -- Meta
  calculated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE reactivation_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rp_org_isolation" ON reactivation_patterns
  FOR ALL USING (org_id = requesting_org_id());

CREATE INDEX idx_reactivation_score
  ON reactivation_patterns(org_id, reactivation_score DESC);

CREATE INDEX idx_reactivation_contact_date
  ON reactivation_patterns(org_id, ideal_contact_date);

CREATE INDEX idx_reactivation_contact
  ON reactivation_patterns(contact_id);
