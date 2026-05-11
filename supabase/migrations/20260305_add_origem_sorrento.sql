-- Add 'sorrento' as lead origin option + fix missing 'carteira_propria' and 'carteira_wg' in constraint
-- The CHECK constraint was last updated in 20260212 but missed the new split values

ALTER TABLE cards DROP CONSTRAINT IF EXISTS cards_origem_check;
ALTER TABLE cards ADD CONSTRAINT cards_origem_check
    CHECK (origem = ANY(ARRAY[
        'mkt'::text,
        'indicacao'::text,
        'carteira_propria'::text,
        'carteira_wg'::text,
        'sorrento'::text,
        'carteira'::text,
        'manual'::text,
        'outro'::text,
        'site'::text,
        'active_campaign'::text,
        'whatsapp'::text
    ]));

COMMENT ON CONSTRAINT cards_origem_check ON cards IS
    'Allowed origem values. Updated 2026-03-05: added sorrento, carteira_propria, carteira_wg.';
