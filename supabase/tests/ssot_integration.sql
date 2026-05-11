-- Integration Test: SSOT Triggers
-- Run this to verify triggers work as expected

BEGIN;

-- 1. Test Date Sync (JSON -> Column)
INSERT INTO cards (id, titulo, produto_data) 
VALUES ('00000000-0000-0000-0000-000000000001', 'Test Date Sync', '{"epoca_viagem": {"inicio": "2025-12-25", "fim": "2025-12-31"}}');

DO $$
DECLARE
    r_start date;
BEGIN
    SELECT data_viagem_inicio INTO r_start FROM cards WHERE id = '00000000-0000-0000-0000-000000000001';
    IF r_start != '2025-12-25'::date THEN
        RAISE EXCEPTION 'D1 Violation: JSON did not sync to Column';
    END IF;
END $$;

-- 2. Test Value Guardrail (Open Card -> No Final Value)
UPDATE cards 
SET status_comercial = 'aberto', valor_final = 10000 
WHERE id = '00000000-0000-0000-0000-000000000001';

DO $$
DECLARE
    r_val numeric;
BEGIN
    SELECT valor_final INTO r_val FROM cards WHERE id = '00000000-0000-0000-0000-000000000001';
    IF r_val IS NOT NULL THEN
        RAISE EXCEPTION 'V1 Violation: Open card has valor_final';
    END IF;
END $$;

ROLLBACK;
