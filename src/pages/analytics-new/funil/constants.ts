import { SystemPhase } from '@/types/pipeline'

// RPC `analytics_funnel_conversion` só retorna `current_count` e `total_valor`.
// Receita não existe nessa RPC — por isso só duas métricas.
export type FunnelMetric = 'cards' | 'faturamento'
/** Modos de análise — mesmos nomes usados no resto do app (GlobalControls legacy). */
export type FunnelMode = 'entries' | 'ganho_sdr' | 'ganho_planner' | 'ganho_total'

export const PHASE_COLORS: Record<string, string> = {
  sdr: '#3b82f6',
  planner: '#8b5cf6',
  'pos-venda': '#10b981',
}

export function getPhaseColor(slug: string | null | undefined): string {
  if (!slug) return '#94a3b8'
  return PHASE_COLORS[slug] || '#94a3b8'
}

export function slugToSystemPhase(slug: string | null | undefined): string | null {
  if (!slug) return null
  if (slug === 'sdr') return SystemPhase.SDR
  if (slug === 'planner') return SystemPhase.PLANNER
  if (slug === 'pos-venda' || slug === 'pos_venda') return SystemPhase.POS_VENDA
  return slug
}

/** Calcula período imediatamente anterior com a mesma duração. */
export function getPreviousPeriod(start: string, end: string): { start: string; end: string } {
  const s = new Date(start).getTime()
  const e = new Date(end).getTime()
  const diff = e - s
  const prevEnd = new Date(s).toISOString()
  const prevStart = new Date(s - diff).toISOString()
  return { start: prevStart, end: prevEnd }
}

/** Delta relativo em %, null se base == 0. */
export function relativeDelta(current: number, previous: number): number | null {
  if (!previous) return null
  return ((current - previous) / previous) * 100
}

/** Labels em português dos modos — iguais aos do GlobalControls legacy. */
export const MODE_LABELS: Record<FunnelMode, string> = {
  entries: 'Entradas por Etapa',
  ganho_sdr: 'Ganho SDR',
  ganho_planner: 'Ganho Planner',
  ganho_total: 'Ganho Total',
}

/** Explicação curta abaixo do label (tooltip). */
export const MODE_HINTS: Record<FunnelMode, string> = {
  entries:
    'Cards que entraram em cada etapa no período (por criação ou por transição de outra etapa)',
  ganho_sdr: 'Cards marcados como ganhos SDR no período',
  ganho_planner: 'Cards marcados como ganhos Planner no período',
  ganho_total: 'Todos os cards ganhos no período (SDR + Planner)',
}

export const METRIC_LABELS: Record<FunnelMetric, string> = {
  cards: 'Qtd',
  faturamento: 'Fat.',
}
