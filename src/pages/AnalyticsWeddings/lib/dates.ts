type BasePeriod = 'today' | '7d' | '30d' | '90d' | 'mtd' | 'last_month' | '12m' | 'all' | 'custom'
// `ano2025` etc — anos-calendário entram como opção direta no seletor de período.
export type PeriodOption = BasePeriod | `ano${number}`

export const PERIOD_LABELS: Record<BasePeriod, string> = {
  today: 'Hoje',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  '90d': 'Últimos 90 dias',
  mtd: 'Este mês',
  last_month: 'Mês passado',
  '12m': 'Últimos 12 meses',
  all: 'Tudo (desde 2024)',
  custom: 'Datas específicas…',
}

/** Opções do seletor de período, com os anos-calendário no meio (2024 até o ano atual). */
export function periodOptions(): { key: PeriodOption; label: string }[] {
  const anoAtual = new Date().getFullYear()
  const anos: { key: PeriodOption; label: string }[] = []
  for (let y = anoAtual; y >= 2024; y--) anos.push({ key: `ano${y}` as PeriodOption, label: String(y) })
  return [
    { key: '7d', label: PERIOD_LABELS['7d'] },
    { key: '30d', label: PERIOD_LABELS['30d'] },
    { key: '90d', label: PERIOD_LABELS['90d'] },
    { key: 'mtd', label: PERIOD_LABELS.mtd },
    { key: 'last_month', label: PERIOD_LABELS.last_month },
    { key: '12m', label: PERIOD_LABELS['12m'] },
    ...anos,
    { key: 'all', label: PERIOD_LABELS.all },
    { key: 'custom', label: PERIOD_LABELS.custom },
  ]
}

export function periodLabel(opt: PeriodOption): string {
  if (opt.startsWith('ano')) return opt.slice(3)
  return PERIOD_LABELS[opt as BasePeriod] ?? opt
}

export function periodToDates(opt: PeriodOption, customStart?: string, customEnd?: string): { dateStart: string; dateEnd: string } {
  if (opt.startsWith('ano')) return anoJanela(Number(opt.slice(3)))
  const now = new Date()
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  const start = new Date(now)

  switch (opt as BasePeriod) {
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

// Janela de tempo (período A/B do funil comparado) + derivações.
export type Janela = { dateStart: string; dateEnd: string }

export function shiftYears(iso: string, years: number): string {
  const d = new Date(iso)
  d.setFullYear(d.getFullYear() + years)
  return d.toISOString()
}
/** Mesma janela, 1 ano antes. */
export function umAnoAntes(b: Janela): Janela {
  return { dateStart: shiftYears(b.dateStart, -1), dateEnd: shiftYears(b.dateEnd, -1) }
}
/** Janela contígua de mesmo tamanho, imediatamente antes de B. */
export function janelaAnterior(b: Janela): Janela {
  const len = new Date(b.dateEnd).getTime() - new Date(b.dateStart).getTime()
  const end = new Date(new Date(b.dateStart).getTime() - 1)
  return { dateStart: new Date(end.getTime() - len).toISOString(), dateEnd: end.toISOString() }
}

function _dp(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
/** Janela de um ano-calendário (capada em hoje se for o ano corrente). */
export function anoJanela(y: number): Janela {
  const start = new Date(y, 0, 1, 0, 0, 0, 0)
  const fim = new Date(y, 11, 31, 23, 59, 59, 999)
  const agora = new Date()
  return { dateStart: start.toISOString(), dateEnd: (fim > agora ? agora : fim).toISOString() }
}
/** Rótulo legível de um período ("Período todo", "Últimos 90 dias", "2024", ou range). */
export function labelDoPeriodo(j: Janela): string {
  const all = periodToDates('all')
  if (_dp(j.dateStart) === _dp(all.dateStart) && _dp(j.dateEnd) === _dp(all.dateEnd)) return 'Período todo'
  const anoAtual = new Date().getFullYear()
  for (let y = 2024; y <= anoAtual; y++) {
    const a = anoJanela(y)
    if (_dp(j.dateStart) === _dp(a.dateStart) && _dp(j.dateEnd) === _dp(a.dateEnd)) return String(y)
  }
  const dias = Math.round((new Date(j.dateEnd).getTime() - new Date(j.dateStart).getTime()) / 86_400_000)
  if (Math.abs(dias - 30) <= 3) return 'Últimos 30 dias'
  if (Math.abs(dias - 90) <= 3) return 'Últimos 90 dias'
  if (Math.abs(dias - 365) <= 5) return 'Últimos 12 meses'
  return formatRange(j.dateStart, j.dateEnd)
}
