-- ============================================================
-- Marco 1 — Travel Planner: ENUMs
-- ============================================================

-- Estado da viagem (ciclo de vida completo)
CREATE TYPE viagem_estado AS ENUM (
  'desenho',
  'em_recomendacao',
  'em_aprovacao',
  'confirmada',
  'em_montagem',
  'aguardando_embarque',
  'em_andamento',
  'pos_viagem',
  'concluida'
);

-- Tipo de item da viagem
CREATE TYPE trip_item_tipo AS ENUM (
  'dia',
  'hotel',
  'voo',
  'transfer',
  'passeio',
  'refeicao',
  'seguro',
  'dica',
  'voucher',
  'contato',
  'texto',
  'checklist'
);

-- Status do item (ciclo de vida)
CREATE TYPE trip_item_status AS ENUM (
  'rascunho',
  'proposto',
  'aprovado',
  'recusado',
  'operacional',
  'vivido',
  'arquivado'
);
