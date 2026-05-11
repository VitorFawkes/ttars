-- ============================================================================
-- Remove status 'pausado' — apenas 3 estados válidos: aberto, ganho, perdido
-- ============================================================================
-- Contexto: "pausado" não faz sentido no modelo de negócio.
-- Um card que não está ganho nem perdido é automaticamente "aberto".
--
-- Ações:
--   1. Normalizar cards existentes com pausado → aberto
--   2. Adicionar CHECK constraint para impedir pausado no futuro
-- ============================================================================

-- 1. Normalizar cards com status inválido (pausado, NULL, etc.) → aberto
UPDATE cards
SET status_comercial = 'aberto'
WHERE status_comercial NOT IN ('aberto', 'ganho', 'perdido')
   OR status_comercial IS NULL;

-- 2. CHECK constraint: apenas aberto, ganho, perdido são válidos (NOT NULL)
ALTER TABLE cards DROP CONSTRAINT IF EXISTS chk_status_comercial_valid;

ALTER TABLE cards ADD CONSTRAINT chk_status_comercial_valid
    CHECK (status_comercial IN ('aberto', 'ganho', 'perdido'));

-- 3. Garantir NOT NULL com default
ALTER TABLE cards ALTER COLUMN status_comercial SET DEFAULT 'aberto';
ALTER TABLE cards ALTER COLUMN status_comercial SET NOT NULL;
