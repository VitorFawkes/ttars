import type { WwFunilConversaoMarcos } from '@/hooks/analyticsWeddings/useWw2'

// Fonte única da verdade dos 6 marcos de venda Weddings.
// A ordem aqui é a ordem do funil (entrada → ganho).
export const MARCO_KEYS = [
  'entrou',
  'marcou_sdr',
  'fez_sdr',
  'marcou_closer',
  'fez_closer',
  'ganho',
] as const

export type MarcoKey = (typeof MARCO_KEYS)[number]

export const MARCO_LABELS: Record<MarcoKey, string> = {
  entrou: 'Entrou',
  marcou_sdr: 'Marcou reunião SDR',
  fez_sdr: 'Fez SDR (qualificou)',
  marcou_closer: 'Marcou reunião Closer',
  fez_closer: 'Fez reunião Closer',
  ganho: 'Ganho',
}

// Marcos que dependem do ciclo longo de venda (amadurecem devagar).
// Para períodos recentes, comparar esses números é enganoso.
export const MARCOS_TARDIOS: MarcoKey[] = ['fez_closer', 'ganho']

export type LinhaFunil = {
  key: MarcoKey
  label: string
  count: number
  /** % que passou da etapa anterior. null no primeiro marco ou quando a anterior é 0. */
  stepPct: number | null
  /** % do total que entrou. null quando entrou é 0. */
  cumPct: number | null
}

/** % de passagem da etapa anterior. Pode passar de 100% (marcos são flags independentes). */
export function stepPct(curr: number, prev: number): number | null {
  if (prev <= 0) return null
  return (curr / prev) * 100
}

/** % acumulado desde a entrada. */
export function cumPct(curr: number, entrou: number): number | null {
  if (entrou <= 0) return null
  return (curr / entrou) * 100
}

/** Converte o objeto de marcos do RPC nas 6 linhas ordenadas com as duas taxas. */
export function toLinhas(marcos: WwFunilConversaoMarcos): LinhaFunil[] {
  const entrou = marcos.entrou ?? 0
  return MARCO_KEYS.map((key, i) => {
    const count = marcos[key] ?? 0
    const prev = i === 0 ? 0 : (marcos[MARCO_KEYS[i - 1]] ?? 0)
    return {
      key,
      label: MARCO_LABELS[key],
      count,
      stepPct: i === 0 ? null : stepPct(count, prev),
      cumPct: cumPct(count, entrou),
    }
  })
}

/**
 * Δ de passagem (pontos percentuais) de B em relação a A, por marco.
 * Índice 0 (Entrou) sempre null. null quando uma das passagens não existe.
 */
export function deltasPassagem(a: WwFunilConversaoMarcos, b: WwFunilConversaoMarcos): (number | null)[] {
  const la = toLinhas(a)
  const lb = toLinhas(b)
  return MARCO_KEYS.map((_, i) => {
    if (i === 0) return null
    const sa = la[i].stepPct
    const sb = lb[i].stepPct
    if (sa == null || sb == null) return null
    return sb - sa
  })
}

/**
 * Índice do marco onde a conversão MAIS caiu (passagem de B − A mais negativa).
 * Retorna null se nenhuma passagem piorou (todas >= 0 ou indisponíveis).
 */
export function biggestDropStep(a: WwFunilConversaoMarcos, b: WwFunilConversaoMarcos): number | null {
  const deltas = deltasPassagem(a, b)
  let worstIdx: number | null = null
  let worstVal = 0
  deltas.forEach((d, i) => {
    if (d != null && d < worstVal) {
      worstVal = d
      worstIdx = i
    }
  })
  return worstIdx
}

/** Dias decorridos entre uma data ISO e hoje (>= 0). */
export function daysAgo(isoDate: string): number {
  const then = new Date(isoDate).getTime()
  const now = Date.now()
  return Math.max(0, Math.floor((now - then) / 86_400_000))
}

/** Formata uma taxa percentual (1 casa) ou '—' quando indisponível. */
export function fmtPct(value: number | null): string {
  if (value == null) return '—'
  return `${value.toFixed(1).replace('.', ',')}%`
}

/** Formata Δ em pontos percentuais com sinal, ou '—'. */
export function fmtDeltaPp(value: number | null): string {
  if (value == null) return '—'
  const v = Math.round(value * 10) / 10
  const sign = v > 0 ? '+' : v < 0 ? '−' : ''
  return `${sign}${Math.abs(v).toFixed(1).replace('.', ',')}pp`
}
