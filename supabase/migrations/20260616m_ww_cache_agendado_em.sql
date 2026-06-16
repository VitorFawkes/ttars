-- "Quando a reunião foi MARCADA" (distinto de "para quando ela é").
-- Fonte: updatedTimestamp dos campos 6 (SDR) e 18 (Closer) do Active — o momento em que o
-- consultor preencheu a data/hora da reunião = quando ele agendou. Validado em 2026-06-16:
-- o updatedTimestamp espalha naturalmente pelos dias e é sempre <= a data da reunião
-- (agendado 1-7 dias antes), ou seja, é sinal real de agendamento, não ruído de import.
-- Alimenta o gráfico "Reuniões agendadas por dia" na Visão Geral Weddings.
ALTER TABLE public.ww_ac_deal_funnel_cache
  ADD COLUMN IF NOT EXISTS sdr_agendado_em    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closer_agendado_em TIMESTAMPTZ;

COMMENT ON COLUMN public.ww_ac_deal_funnel_cache.sdr_agendado_em IS
  'Quando a 1ª reunião (SDR) foi marcada = updatedTimestamp do campo 6 do Active. Distinto de sdr_agendou_at (para quando a reunião é).';
COMMENT ON COLUMN public.ww_ac_deal_funnel_cache.closer_agendado_em IS
  'Quando a reunião da Closer foi marcada = updatedTimestamp do campo 18 do Active. Distinto de closer_agendou_at (para quando a reunião é).';

-- Índices parciais para a agregação por dia de agendamento (consultas WW).
CREATE INDEX IF NOT EXISTS idx_ww_cache_sdr_agendado_em
  ON public.ww_ac_deal_funnel_cache (sdr_agendado_em)
  WHERE is_ww AND sdr_agendado_em IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ww_cache_closer_agendado_em
  ON public.ww_ac_deal_funnel_cache (closer_agendado_em)
  WHERE is_ww AND closer_agendado_em IS NOT NULL;
