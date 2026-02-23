-- =====================================================
-- card_team_members: Equipe do card (assistentes, apoio)
-- FK: cards + profiles (3 Suns architecture)
-- =====================================================

CREATE TABLE card_team_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'apoio',
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES profiles(id),
  UNIQUE(card_id, profile_id)
);

COMMENT ON TABLE card_team_members IS 'Membros adicionais da equipe do card (assistentes, apoio). Owners principais continuam em cards.sdr_owner_id/vendas_owner_id/pos_owner_id.';
COMMENT ON COLUMN card_team_members.role IS 'Papel: assistente_planner, assistente_pos, apoio';

-- Indexes para queries frequentes
CREATE INDEX idx_card_team_card ON card_team_members(card_id);
CREATE INDEX idx_card_team_profile ON card_team_members(profile_id);

-- RLS: padrão permissivo (mesmo que cards)
ALTER TABLE card_team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage card team"
  ON card_team_members FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);
