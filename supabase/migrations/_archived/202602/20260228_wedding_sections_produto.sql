-- ============================================================
-- Adiciona coluna `produto` na tabela sections
-- NULL = seção compartilhada (visível para todos os produtos)
-- ============================================================

ALTER TABLE sections ADD COLUMN IF NOT EXISTS produto app_product NULL;

COMMENT ON COLUMN sections.produto IS 'Produto exclusivo desta seção. NULL = compartilhada entre todos os produtos.';

-- Escopar seções que são exclusivas de TRIPS
UPDATE sections SET produto = 'TRIPS' WHERE key = 'trip_info';
UPDATE sections SET produto = 'TRIPS' WHERE key = 'marketing_informacoes_preenchidas';

-- Verificação
DO $$
DECLARE
    trips_cnt INT;
    null_cnt INT;
BEGIN
    SELECT COUNT(*) INTO trips_cnt FROM sections WHERE produto = 'TRIPS';
    SELECT COUNT(*) INTO null_cnt FROM sections WHERE produto IS NULL;
    RAISE NOTICE 'Sections: % TRIPS-only, % shared (NULL)', trips_cnt, null_cnt;
END $$;
