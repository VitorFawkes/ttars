-- Analytics v2 — Fase 0 (Schema changes)
-- Plano: /Users/vitorgambetti/.claude/plans/falando-da-aba-de-glimmering-coral.md (Bloco 4)
--
-- Adiciona 3 colunas novas em cards que alimentam dashboards por persona e
-- filtros universais do Analytics v2:
--   - quality_score_pct   (0-100)      preenchimento de campos-chave
--   - lead_entry_path     (text, CHECK) caminho de entrada do lead
--   - first_response_at   (timestamptz) primeira msg outbound ao lead
--
-- Fase 0 é invisível: colunas ficam NULL até os triggers (20260422g) e o
-- backfill (20260422h/i/j/k) serem aplicados. Analytics atual não lê estes
-- campos, então não há risco de regressão na UI legada.
--
-- Nota sobre task_tipo ENUM: o plano original previa converter tarefas.tipo
-- em ENUM. Mantido como TEXT na Fase 0 por decisão sênior: ENUM em Postgres
-- é transaction-unsafe em migrations (ADD VALUE), e nenhum RPC do Analytics
-- v2 depende de tipo estrito (group-by por texto basta). Se ficar claro na
-- Fase 2 que precisamos constraint, adicionamos um CHECK list.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) quality_score_pct
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS quality_score_pct INT;

ALTER TABLE public.cards
  DROP CONSTRAINT IF EXISTS cards_quality_score_range;

ALTER TABLE public.cards
  ADD CONSTRAINT cards_quality_score_range
  CHECK (quality_score_pct IS NULL OR quality_score_pct BETWEEN 0 AND 100)
  NOT VALID;

ALTER TABLE public.cards
  VALIDATE CONSTRAINT cards_quality_score_range;

COMMENT ON COLUMN public.cards.quality_score_pct IS
  'Analytics v2: % (0-100) de campos-chave preenchidos no card. Recalculado por trigger trg_update_quality_score. NULL enquanto backfill nao rodou.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) lead_entry_path
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS lead_entry_path TEXT;

ALTER TABLE public.cards
  DROP CONSTRAINT IF EXISTS cards_lead_entry_path_check;

ALTER TABLE public.cards
  ADD CONSTRAINT cards_lead_entry_path_check
  CHECK (
    lead_entry_path IS NULL
    OR lead_entry_path IN ('full_funnel', 'direct_planner', 'returning', 'referred')
  )
  NOT VALID;

ALTER TABLE public.cards
  VALIDATE CONSTRAINT cards_lead_entry_path_check;

COMMENT ON COLUMN public.cards.lead_entry_path IS
  'Analytics v2: caminho de entrada do lead. full_funnel=passou pelo SDR; direct_planner=caiu direto no Planner; returning=cliente com ganho previo; referred=indicacao. Populado por trigger trg_set_lead_entry_path no INSERT.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) first_response_at
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ;

COMMENT ON COLUMN public.cards.first_response_at IS
  'Analytics v2: timestamp da primeira mensagem outbound do time ao lead. Populado por trigger trg_set_first_response_at em whatsapp_messages INSERT. Alimenta FRT (analytics_whatsapp_speed_v2).';

COMMIT;
