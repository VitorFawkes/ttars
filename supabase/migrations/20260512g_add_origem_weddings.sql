-- Adiciona 'weddings' como valor permitido em cards.origem
-- Permite marcar leads como originados do produto Weddings (parcerias internas, indicação cross-produto)

ALTER TABLE cards DROP CONSTRAINT IF EXISTS cards_origem_check;

ALTER TABLE cards ADD CONSTRAINT cards_origem_check
    CHECK (origem IS NULL OR origem = ANY(ARRAY[
        'mkt'::text,
        'indicacao'::text,
        'carteira_propria'::text,
        'carteira_wg'::text,
        'sorrento'::text,
        'weddings'::text,
        'carteira'::text,
        'manual'::text,
        'outro'::text,
        'site'::text,
        'active_campaign'::text,
        'whatsapp'::text
    ]));

COMMENT ON CONSTRAINT cards_origem_check ON cards IS
    'Origens permitidas para cards. Atualizado 2026-05-11 para incluir weddings.';
