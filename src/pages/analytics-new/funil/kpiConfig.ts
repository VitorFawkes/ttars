import { formatCurrency } from '@/utils/whatsappFormatters'
import type { FunnelStageV3 } from './useFunnelData'

// ── Tipos ────────────────────────────────────────────────────────────────

export type KpiType = 'volume_stage' | 'conversion' | 'aggregate' | 'time_stage'
export type KpiAggregate = 'cards' | 'faturamento' | 'receita' | 'ticket'

export interface KpiConfig {
  /** Identificador estável do slot (1..4). */
  id: string
  /** Tipo da métrica. */
  type: KpiType
  /** Nome customizado pelo usuário. Se vazio, usa label padrão derivado do tipo. */
  label: string
  /** Volume numa etapa / Tempo numa etapa. */
  stageId?: string
  /** Conversão: etapa origem. */
  fromStageId?: string
  /** Conversão: etapa destino. */
  toStageId?: string
  /** Agregado do funil. */
  aggregate?: KpiAggregate
}

export const AGGREGATE_LABELS: Record<KpiAggregate, string> = {
  cards: 'Total de cards no período',
  faturamento: 'Faturamento do período',
  receita: 'Receita do período',
  ticket: 'Ticket médio',
}

export const KPI_TYPE_LABELS: Record<KpiType, string> = {
  volume_stage: 'Volume numa etapa',
  conversion: 'Conversão entre etapas',
  aggregate: 'Agregado do funil',
  time_stage: 'Tempo numa etapa (mediana)',
}

// ── Computação de valor ─────────────────────────────────────────────────

export interface KpiResult {
  title: string
  value: string
  color: 'indigo' | 'blue' | 'emerald' | 'amber' | 'rose' | 'slate'
  /** Campo útil pro delta vs período anterior (quando aplicável). */
  numericValue: number | null
  /** Descrição opcional pra tooltip. */
  hint?: string
}

const COLOR_BY_TYPE: Record<KpiType, KpiResult['color']> = {
  volume_stage: 'blue',
  conversion: 'indigo',
  aggregate: 'amber',
  time_stage: 'slate',
}

export function getDefaultLabel(config: KpiConfig, stagesById: Map<string, FunnelStageV3>): string {
  switch (config.type) {
    case 'volume_stage': {
      const s = config.stageId ? stagesById.get(config.stageId) : null
      return s ? `Volume em ${s.stage_nome}` : 'Volume numa etapa'
    }
    case 'conversion': {
      const from = config.fromStageId ? stagesById.get(config.fromStageId) : null
      const to = config.toStageId ? stagesById.get(config.toStageId) : null
      if (from && to) return `Conversão ${from.stage_nome} → ${to.stage_nome}`
      return 'Conversão entre etapas'
    }
    case 'aggregate':
      return config.aggregate ? AGGREGATE_LABELS[config.aggregate] : 'Agregado'
    case 'time_stage': {
      const s = config.stageId ? stagesById.get(config.stageId) : null
      return s ? `Tempo em ${s.stage_nome}` : 'Tempo numa etapa'
    }
  }
}

export function computeKpi(
  config: KpiConfig,
  stages: FunnelStageV3[],
  stagesById: Map<string, FunnelStageV3>
): KpiResult {
  const title = config.label.trim() || getDefaultLabel(config, stagesById)
  const color = COLOR_BY_TYPE[config.type]

  switch (config.type) {
    case 'volume_stage': {
      const s = config.stageId ? stagesById.get(config.stageId) : null
      if (!s) return { title, value: '—', color, numericValue: null, hint: 'Escolha uma etapa' }
      return {
        title,
        value: s.period_count.toLocaleString('pt-BR'),
        color,
        numericValue: s.period_count,
      }
    }

    case 'conversion': {
      const from = config.fromStageId ? stagesById.get(config.fromStageId) : null
      const to = config.toStageId ? stagesById.get(config.toStageId) : null
      if (!from || !to) {
        return { title, value: '—', color, numericValue: null, hint: 'Escolha as duas etapas' }
      }
      const rate = from.period_count > 0 ? (to.period_count / from.period_count) * 100 : null
      if (rate == null) {
        return { title, value: '—', color, numericValue: null, hint: 'Etapa de origem sem cards' }
      }
      return {
        title,
        value: `${rate.toFixed(1)}%`,
        color,
        numericValue: rate,
        hint: `${to.period_count} de ${from.period_count} cards`,
      }
    }

    case 'aggregate': {
      if (!config.aggregate) {
        return { title, value: '—', color, numericValue: null, hint: 'Escolha a métrica' }
      }
      if (config.aggregate === 'cards') {
        const total = stages.reduce((s, x) => s + x.period_count, 0)
        return { title, value: total.toLocaleString('pt-BR'), color, numericValue: total }
      }
      if (config.aggregate === 'faturamento') {
        const total = stages.reduce((s, x) => s + (x.period_valor || 0), 0)
        return { title, value: formatCurrency(total), color, numericValue: total }
      }
      if (config.aggregate === 'receita') {
        const total = stages.reduce((s, x) => s + (x.period_receita || 0), 0)
        return { title, value: formatCurrency(total), color, numericValue: total }
      }
      // ticket médio
      const totalValor = stages.reduce((s, x) => s + (x.period_valor || 0), 0)
      const totalCount = stages.reduce((s, x) => s + x.period_count, 0)
      const ticket = totalCount > 0 ? totalValor / totalCount : 0
      return {
        title,
        value: formatCurrency(ticket),
        color,
        numericValue: ticket,
        hint: `${totalCount} cards · ${formatCurrency(totalValor)} total`,
      }
    }

    case 'time_stage': {
      const s = config.stageId ? stagesById.get(config.stageId) : null
      if (!s) return { title, value: '—', color, numericValue: null, hint: 'Escolha uma etapa' }
      const p50 = Number(s.p50_days_in_stage) || 0
      const p75 = Number(s.p75_days_in_stage) || 0
      return {
        title,
        value: `${p50.toFixed(1)}d`,
        color,
        numericValue: p50,
        hint: `p50 · p75 = ${p75.toFixed(1)}d`,
      }
    }
  }
}

// ── Default configs ─────────────────────────────────────────────────────

/** Gera os 4 KPIs padrão baseados nas etapas do funil visível. */
export function makeDefaultKpis(stages: FunnelStageV3[]): KpiConfig[] {
  const top = stages[0]
  const bot = stages[stages.length - 1]
  return [
    {
      id: 'slot-1',
      type: 'volume_stage',
      label: '',
      stageId: top?.stage_id,
    },
    {
      id: 'slot-2',
      type: 'volume_stage',
      label: '',
      stageId: bot?.stage_id,
    },
    {
      id: 'slot-3',
      type: 'conversion',
      label: '',
      fromStageId: top?.stage_id,
      toStageId: bot?.stage_id,
    },
    {
      id: 'slot-4',
      type: 'aggregate',
      label: '',
      aggregate: 'cards',
    },
  ]
}
