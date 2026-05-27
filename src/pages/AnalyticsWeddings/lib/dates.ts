export type PeriodOption = 'today' | '7d' | '30d' | '90d' | 'mtd' | 'last_month' | '12m' | 'all' | 'custom'

export const PERIOD_LABELS: Record<PeriodOption, string> = {
  today: 'Hoje',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  '90d': 'Últimos 90 dias',
  mtd: 'Este mês',
  last_month: 'Mês passado',
  '12m': 'Últimos 12 meses',
  all: 'Tudo (desde 2024)',
  custom: 'Período custom',
}

export function periodToDates(opt: PeriodOption, customStart?: string, customEnd?: string): { dateStart: string; dateEnd: string } {
  const now = new Date()
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  const start = new Date(now)

  switch (opt) {
    case 'today':
      start.setHours(0, 0, 0, 0)
      break
    case '7d':
      start.setDate(now.getDate() - 7); start.setHours(0, 0, 0, 0); break
    case '30d':
      start.setDate(now.getDate() - 30); start.setHours(0, 0, 0, 0); break
    case '90d':
      start.setDate(now.getDate() - 90); start.setHours(0, 0, 0, 0); break
    case 'mtd':
      start.setDate(1); start.setHours(0, 0, 0, 0); break
    case 'last_month':
      start.setMonth(now.getMonth() - 1, 1); start.setHours(0, 0, 0, 0)
      end.setMonth(now.getMonth(), 0); end.setHours(23, 59, 59, 999); break
    case '12m':
      start.setMonth(now.getMonth() - 12); start.setHours(0, 0, 0, 0); break
    case 'all':
      start.setFullYear(2024, 0, 1); start.setHours(0, 0, 0, 0); break
    case 'custom':
      return {
        dateStart: customStart ?? start.toISOString(),
        dateEnd: customEnd ?? end.toISOString(),
      }
  }
  return { dateStart: start.toISOString(), dateEnd: end.toISOString() }
}

export function formatRange(dateStart: string, dateEnd: string): string {
  const s = new Date(dateStart)
  const e = new Date(dateEnd)
  return `${s.toLocaleDateString('pt-BR')} – ${e.toLocaleDateString('pt-BR')}`
}

export function deltaPct(current: number, prev: number): { pct: number; sign: 'up' | 'down' | 'flat' } {
  if (prev === 0) return { pct: current > 0 ? 100 : 0, sign: current > 0 ? 'up' : 'flat' }
  const pct = Math.round(((current - prev) / prev) * 1000) / 10
  return { pct: Math.abs(pct), sign: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' }
}
