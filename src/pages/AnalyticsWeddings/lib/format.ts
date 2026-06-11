export function formatCurrency(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return 'R$ 0'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null) return '0'
  return new Intl.NumberFormat('pt-BR').format(value)
}

export function formatPct(value: number | null | undefined): string {
  if (value == null) return '0%'
  return `${value}%`
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** '2025-06' (ou '2025-06-01') → 'jun/25'. Qualquer outro formato volta como veio. */
export function formatMes(value: string | null | undefined): string {
  if (!value) return ''
  const m = /^(\d{4})-(\d{2})/.exec(value)
  if (!m) return value
  const mes = Number(m[2])
  if (mes < 1 || mes > 12) return value
  return `${MESES_CURTOS[mes - 1]}/${m[1].slice(2)}`
}
