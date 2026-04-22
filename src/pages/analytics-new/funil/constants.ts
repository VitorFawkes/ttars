import { SystemPhase } from '@/types/pipeline'

export type FunnelMetric = 'cards' | 'faturamento' | 'receita'
export type FunnelMode = 'entries' | 'stage_entry' | 'ganho_sdr' | 'ganho_planner' | 'ganho_total'

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

export const MODE_LABELS: Record<FunnelMode, string> = {
  entries: 'Entraram no pipeline',
  stage_entry: 'Entraram numa etapa específica',
  ganho_sdr: 'Ganhos SDR',
  ganho_planner: 'Ganhos Planner',
  ganho_total: 'Ganhos (total)',
}

export const METRIC_LABELS: Record<FunnelMetric, string> = {
  cards: 'Qtd',
  faturamento: 'Fat.',
  receita: 'Receita',
}
