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
