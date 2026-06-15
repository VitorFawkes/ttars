import { parseLocalDate } from '../localDate'

/** Formatador de moeda BRL compartilhado pelas telas de Planejamento. */
export const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const MESES_LONGOS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

/** "18 set 2027" — datas em cards/listas compactas. */
export function formatDataCurta(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = parseLocalDate(iso)
  if (!d) return null
  return `${String(d.getDate()).padStart(2, '0')} ${MESES_CURTOS[d.getMonth()]} ${d.getFullYear()}`
}

/** "18 de setembro de 2027" — datas em cabeçalhos/detalhe. */
export function formatDataLonga(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = parseLocalDate(iso)
  if (!d) return null
  return `${String(d.getDate()).padStart(2, '0')} de ${MESES_LONGOS[d.getMonth()]} de ${d.getFullYear()}`
}

/** Dias até a data (negativo = passado, 0 = hoje). null se sem data. */
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null
  const d = parseLocalDate(iso)
  if (!d) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

/** true se a data já passou (não inclui hoje). */
export function isPast(iso: string | null | undefined): boolean {
  if (!iso) return false
  const d = parseLocalDate(iso)
  if (!d) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return d < today
}
