-- ============================================================
-- Remove seções extras do Wedding (wedding_sdr, wedding_closer,
-- wedding_planejamento, wedding_marketing)
-- Filosofia correta: wedding_info é a ÚNICA seção product-specific,
-- equivalente ao trip_info do TRIPS.
-- Todos os campos ww_* são reassociados para wedding_info.
-- ============================================================

-- Passo 1: Reassociar campos das 4 seções deletadas → wedding_info
UPDATE system_fields
SET
    section_id = (SELECT id FROM sections WHERE key = 'wedding_info'),
    section     = 'wedding_info'
WHERE section IN ('wedding_sdr', 'wedding_closer', 'wedding_planejamento', 'wedding_marketing');

-- Passo 2: Deletar as 4 seções extras
DELETE FROM sections
WHERE key IN ('wedding_sdr', 'wedding_closer', 'wedding_planejamento', 'wedding_marketing');

-- Verificação
DO $$
DECLARE
    remaining_extra INT;
    ww_fields_in_info INT;
BEGIN
    SELECT COUNT(*) INTO remaining_extra
    FROM sections
    WHERE key IN ('wedding_sdr', 'wedding_closer', 'wedding_planejamento', 'wedding_marketing');

    IF remaining_extra != 0 THEN
        RAISE EXCEPTION 'Expected 0 extra sections, found %', remaining_extra;
    END IF;

    SELECT COUNT(*) INTO ww_fields_in_info
    FROM system_fields sf
    JOIN sections s ON s.id = sf.section_id
    WHERE sf.key LIKE 'ww_%' AND s.key = 'wedding_info';

    RAISE NOTICE 'Extra sections removed. All % ww_* fields now in wedding_info.', ww_fields_in_info;
END $$;
