// Rank-relative color helper for analytics tables.
// Substitui thresholds fixos (verde se >=30%, vermelho se <15%) por comparação
// relativa dentro do período filtrado: top 25% verde, meio amarelo, bottom 25% vermelho.
// Sem amostra suficiente (n<3) ou valores idênticos → neutro.

export type RankTier = 'top' | 'mid' | 'bottom' | 'neutral'
export type RankDirection = 'higher_is_better' | 'lower_is_better'

export function getRankTier(
  value: number | null | undefined,
  sample: readonly (number | null | undefined)[],
  direction: RankDirection,
): RankTier {
  if (value == null || !Number.isFinite(value)) return 'neutral'
  const clean = sample.filter((v): v is number => v != null && Number.isFinite(v))
  if (clean.length < 3) return 'neutral'
  if (new Set(clean).size === 1) return 'neutral'

  const sorted = [...clean].sort((a, b) => a - b)
  const q1 = quantile(sorted, 0.25)
  const q3 = quantile(sorted, 0.75)

  if (direction === 'higher_is_better') {
    if (value >= q3) return 'top'
    if (value <= q1) return 'bottom'
    return 'mid'
  }
  if (value <= q1) return 'top'
  if (value >= q3) return 'bottom'
  return 'mid'
}

export function rankBadgeClass(tier: RankTier): string {
  switch (tier) {
    case 'top':
      return 'bg-emerald-50 text-emerald-700'
    case 'mid':
      return 'bg-amber-50 text-amber-700'
    case 'bottom':
      return 'bg-rose-50 text-rose-700'
    default:
      return 'bg-slate-50 text-slate-500'
  }
}

export function rankTextClass(tier: RankTier): string {
  switch (tier) {
    case 'top':
      return 'text-emerald-700'
    case 'mid':
      return 'text-amber-700'
    case 'bottom':
      return 'text-rose-700'
    default:
      return 'text-slate-500'
  }
}

export function rankDotClass(tier: RankTier): string {
  switch (tier) {
    case 'top':
      return 'bg-emerald-500'
    case 'mid':
      return 'bg-amber-500'
    case 'bottom':
      return 'bg-rose-500'
    default:
      return 'bg-slate-300'
  }
}

export function rankTierLabel(tier: RankTier): string {
  switch (tier) {
    case 'top':
      return 'Top 25% no período'
    case 'mid':
      return 'Meio do grupo'
    case 'bottom':
      return 'Bottom 25% no período'
    default:
      return 'Sem comparação disponível'
  }
}

function quantile(sorted: readonly number[], p: number): number {
  const idx = (sorted.length - 1) * p
  const lower = Math.floor(idx)
  const upper = Math.ceil(idx)
  if (lower === upper) return sorted[lower]
  return sorted[lower] * (upper - idx) + sorted[upper] * (idx - lower)
}
