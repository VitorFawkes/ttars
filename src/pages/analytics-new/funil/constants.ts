import { SystemPhase } from '@/types/pipeline'

// Métrica 3-way (plano mestre princípio #4). A RPC v3 retorna os três campos.
export type FunnelMetric = 'cards' | 'faturamento' | 'receita'

// Referência do eixo temporal (plano mestre princípio #3).
export type DateRef = 'stage' | 'created'

// Status dos cards (plano mestre princípio #5). Dimensão separada da Referência.
export type FunnelStatus = 'all' | 'open' | 'won' | 'lost'

// Sub-filtro de ganhos: quando status === 'won', por quem fechou.
export type GanhoFase = 'any' | 'sdr' | 'planner' | 'pos'

export const PHASE_COLORS: Record<string, string> = {
  sdr: '#3b82f6',
  planner: '#8b5cf6',
  'pos-venda': '#10b981',
  pos_venda: '#10b981',
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

export const METRIC_LABELS: Record<FunnelMetric, string> = {
  cards: 'Qtd',
  faturamento: 'Fat.',
  receita: 'Receita',
}

export const STATUS_LABELS: Record<FunnelStatus, string> = {
  all: 'Todos',
  open: 'Abertos',
  won: 'Ganhos',
  lost: 'Perdidos',
}

export const STATUS_HINTS: Record<FunnelStatus, string> = {
  all: 'Inclui abertos, ganhos e perdidos',
  open: 'Cards ainda ativos no pipeline',
  won: 'Cards marcados como ganho',
  lost: 'Cards marcados como perdido',
}

export const GANHO_FASE_LABELS: Record<GanhoFase, string> = {
  any: 'Qualquer',
  sdr: 'SDR',
  planner: 'Planner',
  pos: 'Pós',
}

/** Traduz FunnelStatus para o array `p_status` aceito pela RPC v3. NULL = todos. */
export function statusToRpcArray(status: FunnelStatus): string[] | null {
  switch (status) {
    case 'open':
      return ['aberto']
    case 'won':
      return ['ganho']
    case 'lost':
      return ['perdido']
    case 'all':
    default:
      return null
  }
}

/** Traduz GanhoFase para `p_ganho_fase`. 'any' => NULL (qualquer). */
export function ganhoFaseToRpc(fase: GanhoFase): string | null {
  return fase === 'any' ? null : fase
}
