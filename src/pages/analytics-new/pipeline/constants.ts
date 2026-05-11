import { SystemPhase } from '@/types/pipeline'

export type PhaseFilter = 'all' | 'sdr' | 'planner' | 'pos-venda'
export type MetricMode = 'cards' | 'faturamento' | 'receita'
export type DealSortField = 'days_in_stage' | 'valor_total' | 'receita' | 'owner_nome'
export type OwnerSortField =
  | 'total_cards'
  | 'total_value'
  | 'total_receita'
  | 'avg_age_days'
  | 'sla_breach'
export type ChartGroupBy = 'stage' | 'consultant'

export const PHASE_COLORS: Record<string, string> = {
  sdr: '#3b82f6',
  planner: '#8b5cf6',
  'pos-venda': '#10b981',
}

export const TASK_TYPE_LABELS: Record<string, string> = {
  tarefa: 'Tarefa',
  contato: 'Contato',
  ligacao: 'Ligação',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  reuniao: 'Reunião',
  solicitacao_mudanca: 'Mudança',
  enviar_proposta: 'Proposta',
  coleta_documentos: 'Documentos',
  followup: 'Follow-up',
  outro: 'Outro',
  cobranca: 'Cobrança',
}

export const LABEL_MAX = 18

export function truncateLabel(label: string): string {
  return label.length > LABEL_MAX ? label.slice(0, LABEL_MAX - 1) + '…' : label
}

export function getPhaseColor(slug: string): string {
  return PHASE_COLORS[slug] || '#94a3b8'
}

// Mapeia slug da RPC (pos-venda com dash) → slug SystemPhase (normaliza) para labels do banco
export function slugToSystemPhase(slug: string | null | undefined): string | null {
  if (!slug) return null
  if (slug === 'sdr') return SystemPhase.SDR
  if (slug === 'planner') return SystemPhase.PLANNER
  if (slug === 'pos-venda' || slug === 'pos_venda') return SystemPhase.POS_VENDA
  return slug
}

export function matchesPhase(
  slug: string | undefined | null,
  filter: PhaseFilter
): boolean {
  if (filter === 'all') return true
  if (filter === 'pos-venda')
    return !!slug && !['sdr', 'planner', 'resolucao'].includes(slug)
  return slug === filter
}

export function agingCellColor(count: number): string {
  if (count === 0) return 'bg-slate-50 text-slate-300'
  if (count <= 2) return 'bg-green-50 text-green-700'
  if (count <= 5) return 'bg-amber-50 text-amber-700'
  return 'bg-rose-50 text-rose-700'
}

export function getDealRisk(
  deal: { is_sla_breach: boolean; days_in_stage: number },
  refMode: 'stage' | 'created'
): 'critical' | 'warning' | 'normal' {
  if (deal.is_sla_breach) return 'critical'
  if (refMode === 'stage') {
    if (deal.days_in_stage > 14) return 'critical'
    if (deal.days_in_stage > 7) return 'warning'
  } else {
    if (deal.days_in_stage > 90) return 'critical'
    if (deal.days_in_stage > 60) return 'warning'
  }
  return 'normal'
}

export const RISK_STYLES: Record<'critical' | 'warning' | 'normal', string> = {
  critical: 'border-l-2 border-l-rose-500 bg-rose-50/50',
  warning: 'border-l-2 border-l-amber-400 bg-amber-50/30',
  normal: '',
}
