-- Migration: Flexible Travel Fields
-- Description: Adds flexible date, duration, and budget fields with normalized columns for reporting

-- ============================================================================
-- 1. UPDATE TYPE CONSTRAINT to allow new field types
-- ============================================================================
ALTER TABLE system_fields DROP CONSTRAINT IF EXISTS system_fields_type_check;
ALTER TABLE system_fields ADD CONSTRAINT system_fields_type_check
CHECK (type IN (
    'text', 'number', 'date', 'datetime', 'date_range', 'currency', 'currency_range',
    'select', 'multiselect', 'checklist', 'boolean', 'json', 'textarea',
    'loss_reason_selector',
    -- New flexible types
    'flexible_date',      -- Supports: exact date, month, month range, undefined
    'flexible_duration',  -- Supports: fixed days, day range, undefined
    'smart_budget'        -- Supports: total, per person, range with auto-calc
));

-- ============================================================================
-- 2. ADD NORMALIZED COLUMNS to cards table for fast queries/reports
-- ============================================================================

-- Epoca da Viagem - Normalized
ALTER TABLE cards ADD COLUMN IF NOT EXISTS epoca_mes_inicio smallint;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS epoca_mes_fim smallint;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS epoca_ano smallint;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS epoca_tipo text; -- 'data_exata', 'mes', 'range_meses', 'indefinido'

-- Duracao da Viagem - Normalized
ALTER TABLE cards ADD COLUMN IF NOT EXISTS duracao_dias_min smallint;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS duracao_dias_max smallint;

-- Orcamento - Normalized (total_calculado will sync to valor_estimado)
-- valor_estimado already exists, we'll sync smart_budget.total_calculado to it

-- ============================================================================
-- 3. ADD INDEXES for reporting queries
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_cards_epoca_mes ON cards(epoca_mes_inicio, epoca_mes_fim) WHERE epoca_mes_inicio IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cards_epoca_ano ON cards(epoca_ano) WHERE epoca_ano IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cards_duracao ON cards(duracao_dias_min, duracao_dias_max) WHERE duracao_dias_min IS NOT NULL;

-- ============================================================================
-- 4. UPDATE SYSTEM_FIELDS with new types
-- ============================================================================

-- Update epoca_viagem to flexible_date type
UPDATE system_fields
SET type = 'flexible_date',
    options = jsonb_build_object(
        'modes', jsonb_build_array('data_exata', 'mes', 'range_meses', 'indefinido'),
        'defaultMode', 'mes',
        'allowFlexible', true
    )
WHERE key = 'epoca_viagem';

-- Update orcamento to smart_budget type
UPDATE system_fields
SET type = 'smart_budget',
    options = jsonb_build_object(
        'modes', jsonb_build_array('total', 'por_pessoa', 'range'),
        'defaultMode', 'total',
        'currency', 'BRL',
        'syncToValorEstimado', true
    )
WHERE key = 'orcamento';

-- Add duracao_viagem field
INSERT INTO system_fields (key, label, type, section, is_system, active, options)
VALUES (
    'duracao_viagem',
    'Duração da Viagem',
    'flexible_duration',
    'trip_info',
    true,
    true,
    jsonb_build_object(
        'modes', jsonb_build_array('fixo', 'range', 'indefinido'),
        'defaultMode', 'range',
        'unit', 'dias'
    )
)
ON CONFLICT (key) DO UPDATE SET
    type = EXCLUDED.type,
    options = EXCLUDED.options,
    label = EXCLUDED.label;

-- ============================================================================
-- 5. HELPER FUNCTION: Sync produto_data to normalized columns
-- ============================================================================
CREATE OR REPLACE FUNCTION sync_travel_normalized_columns()
RETURNS TRIGGER AS $$
DECLARE
    epoca jsonb;
    duracao jsonb;
    orcamento jsonb;
BEGIN
    -- Extract from produto_data
    epoca := NEW.produto_data -> 'epoca_viagem';
    duracao := NEW.produto_data -> 'duracao_viagem';
    orcamento := NEW.produto_data -> 'orcamento';

    -- Sync epoca_viagem
    IF epoca IS NOT NULL THEN
        NEW.epoca_tipo := epoca ->> 'tipo';
        NEW.epoca_mes_inicio := (epoca ->> 'mes_inicio')::smallint;
        NEW.epoca_mes_fim := (epoca ->> 'mes_fim')::smallint;
        NEW.epoca_ano := (epoca ->> 'ano')::smallint;

        -- Also sync legacy columns if data_exata
        IF (epoca ->> 'tipo') = 'data_exata' THEN
            NEW.data_viagem_inicio := (epoca ->> 'data_inicio')::date;
            NEW.data_viagem_fim := (epoca ->> 'data_fim')::date;
        END IF;
    END IF;

    -- Sync duracao_viagem
    IF duracao IS NOT NULL THEN
        NEW.duracao_dias_min := (duracao ->> 'dias_min')::smallint;
        NEW.duracao_dias_max := (duracao ->> 'dias_max')::smallint;
    END IF;

    -- Sync orcamento to valor_estimado (total_calculado takes priority)
    IF orcamento IS NOT NULL THEN
        IF (orcamento ->> 'total_calculado') IS NOT NULL THEN
            NEW.valor_estimado := (orcamento ->> 'total_calculado')::numeric;
        ELSIF (orcamento ->> 'total') IS NOT NULL THEN
            NEW.valor_estimado := (orcamento ->> 'total')::numeric;
        ELSIF (orcamento ->> 'valor') IS NOT NULL AND (orcamento ->> 'tipo') = 'total' THEN
            NEW.valor_estimado := (orcamento ->> 'valor')::numeric;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (drop first to be idempotent)
DROP TRIGGER IF EXISTS trg_sync_travel_normalized ON cards;
CREATE TRIGGER trg_sync_travel_normalized
    BEFORE INSERT OR UPDATE OF produto_data ON cards
    FOR EACH ROW
    EXECUTE FUNCTION sync_travel_normalized_columns();

-- ============================================================================
-- 6. COMMENTS for documentation
-- ============================================================================
COMMENT ON COLUMN cards.epoca_mes_inicio IS 'Normalized: Month (1-12) when trip starts. Extracted from produto_data.epoca_viagem';
COMMENT ON COLUMN cards.epoca_mes_fim IS 'Normalized: Month (1-12) when trip ends. Extracted from produto_data.epoca_viagem';
COMMENT ON COLUMN cards.epoca_ano IS 'Normalized: Year of trip. Extracted from produto_data.epoca_viagem';
COMMENT ON COLUMN cards.epoca_tipo IS 'Type of date definition: data_exata, mes, range_meses, indefinido';
COMMENT ON COLUMN cards.duracao_dias_min IS 'Normalized: Minimum trip duration in days';
COMMENT ON COLUMN cards.duracao_dias_max IS 'Normalized: Maximum trip duration in days';
