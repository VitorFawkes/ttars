-- ============================================================================
-- Corrige mapeamento ww_closer_como_reuniao: AC field 19 → 299
--
-- O campo "WW | Como foi feita Reunião Closer" (label do CRM e da AC) era
-- mapeado historicamente pro AC field 19 ("Tipo da reunião com a Closer:",
-- opções Online/Presencial) — que indica o tipo PLANEJADO, não a realização.
--
-- O campo correto pra confirmar realização é AC field 299
-- (perstag DEAL_WW_COMO_FOI_FEITA_REUNIO_CLOSER, opções Vídeo/Presencial/
-- Não teve reunião), criado depois e sem mapeamento no integration_field_map.
--
-- Esta migration:
--   1. Atualiza os 3 mapeamentos pra apontar pro field 299
--   2. Retroage cards.produto_data->>'ww_closer_como_reuniao' usando o cache
--      ww_ac_deal_funnel_cache.closer_canal (espelho do field 299)
--
-- Antes:  Online (613) + Presencial (10)              = 623 deals com valor
-- Depois: Vídeo (187) + Presencial (5) + Não teve (28) = 220 deals com valor
-- (queda esperada — só conta deals que TIVERAM o field 299 preenchido)
-- ============================================================================

-- 1. Atualizar mapeamento
UPDATE integration_field_map
SET external_field_id = '299', updated_at = NOW()
WHERE local_field_key = 'ww_closer_como_reuniao'
  AND external_field_id = '19'
  AND source = 'active_campaign';

-- 2. Retroagir valores em cards.produto_data
WITH updates AS (
  SELECT c.id AS card_id, fc.closer_canal
  FROM cards c
  JOIN ww_ac_deal_funnel_cache fc
    ON fc.ac_deal_id = c.external_id
   AND c.external_source = 'active_campaign'
  WHERE c.produto::TEXT = 'WEDDING'
    AND c.deleted_at IS NULL AND c.archived_at IS NULL
)
UPDATE cards c SET produto_data =
  CASE
    WHEN u.closer_canal IS NOT NULL THEN
      COALESCE(c.produto_data, '{}'::jsonb) || jsonb_build_object('ww_closer_como_reuniao', u.closer_canal)
    ELSE
      COALESCE(c.produto_data, '{}'::jsonb) - 'ww_closer_como_reuniao'
  END,
  updated_at = NOW()
FROM updates u
WHERE c.id = u.card_id
  AND (
    (u.closer_canal IS NOT NULL AND COALESCE(c.produto_data->>'ww_closer_como_reuniao','') <> u.closer_canal)
    OR (u.closer_canal IS NULL AND c.produto_data ? 'ww_closer_como_reuniao')
  );
