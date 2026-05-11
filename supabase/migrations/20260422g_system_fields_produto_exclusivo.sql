-- ============================================================================
-- System Fields — coluna produto_exclusivo (2026-04-22)
-- ============================================================================
-- Alguns system_fields cadastrados em sections genericas (people, marketing,
-- observacoes_criticas) sao conceitualmente TRIPS-only mas vazam para a UI de
-- Weddings. Adicionamos coluna produto_exclusivo para indicar campos que
-- devem aparecer APENAS em um produto. NULL = compartilhado entre todos.
--
-- Tambem limpa emoji do label "Cliente Recorrente" (🔄).
-- ============================================================================

-- 1. Adicionar coluna produto_exclusivo
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'system_fields' AND column_name = 'produto_exclusivo'
  ) THEN
    ALTER TABLE system_fields ADD COLUMN produto_exclusivo TEXT;
    COMMENT ON COLUMN system_fields.produto_exclusivo IS
      'Indica produto exclusivo para este campo (TRIPS, WEDDING, etc). NULL = compartilhado.';
    RAISE NOTICE 'Coluna produto_exclusivo adicionada em system_fields';
  ELSE
    RAISE NOTICE 'Coluna produto_exclusivo ja existe';
  END IF;
END $$;

-- 2. Limpar emoji do label "Cliente Recorrente"
UPDATE system_fields
SET label = 'Cliente Recorrente'
WHERE key = 'cliente_recorrente' AND label LIKE '%Cliente Recorrente%';

-- 3. Marcar campos claramente TRIPS como produto_exclusivo='TRIPS'
--    Criterio: label menciona "viagem/viajar" ou sao semanticamente de viagem
UPDATE system_fields SET produto_exclusivo = 'TRIPS' WHERE key IN (
  'briefing',
  'viajantes',
  'prioridade_viagem',
  'importante_viagem_perfeita',
  'viagem_especial',
  'viajar_por_agencia',
  'frequencia_viajar',
  'receio_viagem'
);

-- 4. Marcar campos ww_* como WEDDING (reforco — ja estao em secoes wedding_*)
UPDATE system_fields SET produto_exclusivo = 'WEDDING'
WHERE key LIKE 'ww\_%' AND (produto_exclusivo IS NULL OR produto_exclusivo <> 'WEDDING');

-- 5. Report
DO $$
DECLARE
  v_trips INT;
  v_wedding INT;
  v_shared INT;
BEGIN
  SELECT COUNT(*) INTO v_trips FROM system_fields WHERE produto_exclusivo = 'TRIPS';
  SELECT COUNT(*) INTO v_wedding FROM system_fields WHERE produto_exclusivo = 'WEDDING';
  SELECT COUNT(*) INTO v_shared FROM system_fields WHERE produto_exclusivo IS NULL;
  RAISE NOTICE 'TRIPS-only: % | WEDDING-only: % | shared: %', v_trips, v_wedding, v_shared;
END $$;
