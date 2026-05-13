-- Adiciona coluna scheduling_config em ai_agents.
--
-- Configurável via Studio. Permite admin escolher:
--   - available_hours: lista de horários do dia que a WP atende
--   - max_slots_per_day: quantos horários do mesmo dia oferecer
--   - max_days: quantos dias distintos cobrir
--   - total_slots: total a oferecer (cap)
--   - skip_weekends: pula sáb/dom
--   - search_window_days: até quantos dias à frente buscar
--   - date_format: "short" (14/05) | "full" (14/05/2026)
--
-- Nullable: quando vazio/null o router usa defaults seguros (mantém
-- comportamento atual — não quebra agentes existentes que não tenham config).

ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS scheduling_config JSONB;

COMMENT ON COLUMN ai_agents.scheduling_config IS
  'Config de oferta de horários no desfecho_qualificado. Estrutura: { available_hours: ["HH:MM"...], max_slots_per_day: int, max_days: int, total_slots: int, skip_weekends: bool, search_window_days: int, date_format: "short"|"full" }. NULL = defaults (3h/dia, 1 horario por dia, 3 dias, formato curto).';

-- Seed Patricia: 3 horários por dia, 2 dias diferentes, 6 slots no total, formato curto
UPDATE ai_agents
SET scheduling_config = '{
  "available_hours": ["10:00", "14:00", "16:00"],
  "max_slots_per_day": 3,
  "max_days": 2,
  "total_slots": 6,
  "skip_weekends": true,
  "search_window_days": 14,
  "date_format": "short"
}'::jsonb
WHERE id = '4d96d9b4-e909-4441-bd85-d3f807cccfa7';
