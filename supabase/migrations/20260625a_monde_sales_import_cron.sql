-- monde-sales-import: importação INBOUND de vendas Monde V3 → CRM
-- A edge function `monde-sales-import` lê GET /api/v3/sales e reconcilia em
-- card_financial_items via bulk_import_financial_items (v13) — mesma máquina
-- da planilha. Esta migration cria os settings + o cron periódico que a invoca.
--
-- Valores oficiais da venda (totals.final_value / totals.revenue) validados
-- 100% contra o relatório do Monde (2026-06-25). Ver plano
-- ~/.claude/plans/leia-toda-essa-documenta-o-partitioned-bubble.md

-- 1. Settings (idempotente — há UNIQUE em (org_id, COALESCE(produto,'__GLOBAL__'), key)).
--    Org = Welcome Group (account), igual aos demais settings MONDE_*.
-- Começa DESLIGADO (dormente): o cron é criado mas pula até alguém setar 'true'.
-- Ativar em produção = trocar este valor p/ 'true' (decisão "pode subir").
INSERT INTO integration_settings (key, value, description, org_id, produto)
SELECT 'MONDE_V3_SYNC_ENABLED', 'false',
       'Liga/desliga o sync automático (cron) de vendas Monde V3. Começa false.',
       'a0000000-0000-0000-0000-000000000001', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM integration_settings
  WHERE key = 'MONDE_V3_SYNC_ENABLED'
    AND org_id = 'a0000000-0000-0000-0000-000000000001'
    AND produto IS NULL
);

INSERT INTO integration_settings (key, value, description, org_id, produto)
SELECT 'MONDE_V3_IMPORT_PAGES', '10',
       'Páginas (x100 vendas mais recentes) varridas por execução do cron de vendas',
       'a0000000-0000-0000-0000-000000000001', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM integration_settings
  WHERE key = 'MONDE_V3_IMPORT_PAGES'
    AND org_id = 'a0000000-0000-0000-0000-000000000001'
    AND produto IS NULL
);

INSERT INTO integration_settings (key, value, description, org_id, produto)
SELECT 'MONDE_V3_IMPORT_ORG_ID', 'b0000000-0000-0000-0000-000000000001',
       'Workspace (Welcome Trips) onde casar as vendas Monde por número',
       'a0000000-0000-0000-0000-000000000001', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM integration_settings
  WHERE key = 'MONDE_V3_IMPORT_ORG_ID'
    AND org_id = 'a0000000-0000-0000-0000-000000000001'
    AND produto IS NULL
);

-- 2. Cron a cada 2h às :30 (offset p/ não colidir com monde-people-import às :00).
--    Guardado por pg_cron pra aplicar limpo onde a extensão não existe (staging).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monde-sales-import') THEN
      PERFORM cron.unschedule('monde-sales-import');
    END IF;
    PERFORM cron.schedule(
      'monde-sales-import',
      '30 */2 * * *',
      $cron$
      SELECT net.http_post(
        url := 'https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/monde-sales-import'::text,
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1),
          'Content-Type', 'application/json'
        ),
        body := '{"mode":"window","pages":10}'::jsonb
      );
      $cron$
    );
  END IF;
END $$;
