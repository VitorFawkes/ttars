-- Sprint A — Automações: Parar hemorragia silenciosa + limpeza.
--
-- Contexto: a tabela `public.automacao_regras` foi dropada em 2026-04-13
-- (migration 20260413_drop_legacy_automation_system.sql), mas 2 pg_cron jobs
-- e 2 edge functions continuaram rodando contra ela — erro silencioso a cada
-- minuto / todo dia 9h. Esta migration para o sangramento e limpa órfãos.
--
-- Decisões do Vitor (2026-04-20, plano de fechamento):
--   1. Deletar os 19 [Exemplo] de cadence_event_triggers (serão recriados
--      no Sprint E em cima do motor novo).
--   2. Deletar 2 órfãos `whatsapp_inbound/outbound` (nome NULL, sobra de
--      migração antiga 20260131 que nunca foi limpa).
--   3. Preservar as 2 automations ativas em produção:
--      - be5495d4-0cec-4a26-b919-3d5e9365e38c Roteamento Pós-Venda (Trips)
--      - 6f3ec4fe-747f-4124-b542-17085052a027 Pós-venda: App & Conteúdo
--
-- Edge functions `automacao-mensagem-processor` e `automacao-trigger-temporal`
-- são deletadas via `supabase functions delete` fora desta migration (não é
-- algo que SQL faz).

BEGIN;

-- 1) Pausar pg_cron jobs quebrados
--    unschedule é idempotente: se o job não existe, só retorna FALSE.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'automacao-mensagem-processor') THEN
    PERFORM cron.unschedule('automacao-mensagem-processor');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'automacao-trigger-temporal') THEN
    PERFORM cron.unschedule('automacao-trigger-temporal');
  END IF;
END $$;

-- 2) Apagar 19 [Exemplo] + 2 órfãos whatsapp_inbound/outbound
--    Usa pattern LIKE '[Exemplo]%' para os seeds + nome IS NULL com event_types
--    órfãos para o lixo legado. Cada linha em cadence_event_triggers tem FK
--    ON DELETE CASCADE em cadence_entry_queue, então limpa cascata sozinha.
DELETE FROM public.cadence_event_triggers
WHERE name LIKE '[Exemplo]%'
   OR (name IS NULL AND event_type IN ('whatsapp_inbound', 'whatsapp_outbound'));

-- 3) Sanidade: depois do delete só pode sobrar as 2 automations ativas
DO $$
DECLARE
  v_active_count INT;
  v_total_count INT;
BEGIN
  SELECT COUNT(*) INTO v_active_count FROM public.cadence_event_triggers WHERE is_active = true;
  SELECT COUNT(*) INTO v_total_count FROM public.cadence_event_triggers;

  IF v_active_count <> 2 THEN
    RAISE EXCEPTION 'Sprint A: esperado 2 automations ativas, achei %', v_active_count;
  END IF;

  RAISE NOTICE 'Sprint A: % automations ativas preservadas, % total na tabela', v_active_count, v_total_count;
END $$;

COMMIT;
