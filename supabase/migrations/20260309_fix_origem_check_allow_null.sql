-- Fix: permitir NULL no campo origem (campo opcional na UI)
-- Erro: "new row for relation cards violates check constraint cards_origem_check"
-- Causa: CreateCardModal envia origem='' quando usuário não seleciona origem

ALTER TABLE cards DROP CONSTRAINT IF EXISTS cards_origem_check;

ALTER TABLE cards ADD CONSTRAINT cards_origem_check
    CHECK (origem IS NULL OR origem = ANY(ARRAY[
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
