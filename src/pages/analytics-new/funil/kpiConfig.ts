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
  /**
   * Volume numa etapa: lista de etapas que são SOMADAS.
   * 1 etapa = comportamento simples. 2+ etapas = "Volume em X + Y + Z" (soma).
   */
  stageIds?: string[]
  /** Conversão: etapa(s) origem. Soma os volumes se > 1. */
  fromStageIds?: string[]
  /** Conversão: etapa(s) destino. Soma os volumes se > 1. */
  toStageIds?: string[]
  /** Tempo numa etapa: sempre uma única etapa. */
  stageId?: string
  /** Agregado do funil. */
  aggregate?: KpiAggregate
}

/**
 * Converte configs antigos (com stageId/fromStageId/toStageId singulares)
 * para o formato novo baseado em arrays. Idempotente.
 */
export function migrateConfig(raw: Partial<KpiConfig> & { stageId?: string; fromStageId?: string; toStageId?: string }): KpiConfig {
  const out: KpiConfig = {
    id: raw.id || 'slot-?',
    type: (raw.type as KpiType) || 'volume_stage',
    label: raw.label || '',
  }

  if (out.type === 'volume_stage') {
    if (raw.stageIds && raw.stageIds.length > 0) {
      out.stageIds = raw.stageIds
    } else if (raw.stageId) {
      out.stageIds = [raw.stageId]
    }
  } else if (out.type === 'conversion') {
    if (raw.fromStageIds && raw.fromStageIds.length > 0) {
      out.fromStageIds = raw.fromStageIds
    } else if (raw.fromStageId) {
      out.fromStageIds = [raw.fromStageId]
    }
    if (raw.toStageIds && raw.toStageIds.length > 0) {
      out.toStageIds = raw.toStageIds
    } else if (raw.toStageId) {
      out.toStageIds = [raw.toStageId]
    }
  } else if (out.type === 'time_stage') {
    out.stageId = raw.stageId || (raw.stageIds && raw.stageIds[0]) || undefined
  } else if (out.type === 'aggregate') {
    out.aggregate = raw.aggregate || 'cards'
  }

  return out
}

export const AGGREGATE_LABELS: Record<KpiAggregate, string> = {
  cards: 'Total de cards no período',
  faturamento: 'Faturamento do período',
  receita: 'Receita do período',
  ticket: 'Ticket médio',
}

export const KPI_TYPE_LABELS: Record<KpiType, string> = {
  volume_stage: 'Volume numa etapa (ou soma de várias)',
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

/**
 * Resolve os nomes das etapas numa lista curta e legível:
 *   - 1 etapa: "Oportunidade"
 *   - 2 etapas: "Oportunidade + Proposta"
 *   - 3 etapas: "Oportunidade + 2"
 *   - 4+ etapas: "4 etapas"
 */
function formatStageList(ids: string[] | undefined, stagesById: Map<string, FunnelStageV3>): string {
  if (!ids || ids.length === 0) return ''
  const names = ids.map(id => stagesById.get(id)?.stage_nome).filter(Boolean) as string[]
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} + ${names[1]}`
  if (names.length === 3) return `${names[0]} + 2`
  return `${names.length} etapas`
}

function sumPeriodCount(ids: string[] | undefined, stagesById: Map<string, FunnelStageV3>): number {
  if (!ids || ids.length === 0) return 0
  return ids.reduce((acc, id) => {
    const s = stagesById.get(id)
    return acc + (s?.period_count ?? 0)
  }, 0)
}

export function getDefaultLabel(config: KpiConfig, stagesById: Map<string, FunnelStageV3>): string {
  switch (config.type) {
    case 'volume_stage': {
      const list = formatStageList(config.stageIds, stagesById)
      return list ? `Volume em ${list}` : 'Volume numa etapa'
    }
    case 'conversion': {
      const from = formatStageList(config.fromStageIds, stagesById)
      const to = formatStageList(config.toStageIds, stagesById)
      if (from && to) return `Conversão ${from} → ${to}`
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
      const ids = config.stageIds || []
      if (ids.length === 0) {
        return { title, value: '—', color, numericValue: null, hint: 'Escolha ao menos uma etapa' }
      }
      const total = sumPeriodCount(ids, stagesById)
      const breakdown = ids.length > 1
        ? ids
            .map(id => {
              const s = stagesById.get(id)
              return s ? `${s.stage_nome}: ${s.period_count}` : null
            })
            .filter(Boolean)
            .join(' · ')
        : undefined
      return {
        title,
        value: total.toLocaleString('pt-BR'),
        color,
        numericValue: total,
        hint: breakdown,
      }
    }

    case 'conversion': {
      const fromIds = config.fromStageIds || []
      const toIds = config.toStageIds || []
      if (fromIds.length === 0 || toIds.length === 0) {
        return { title, value: '—', color, numericValue: null, hint: 'Escolha as etapas de origem e destino' }
      }
      const fromTotal = sumPeriodCount(fromIds, stagesById)
      const toTotal = sumPeriodCount(toIds, stagesById)
      if (fromTotal === 0) {
        return { title, value: '—', color, numericValue: null, hint: 'Etapa(s) de origem sem cards no período' }
      }
      const rate = (toTotal / fromTotal) * 100
      return {
        title,
        value: `${rate.toFixed(1)}%`,
        color,
        numericValue: rate,
        hint: `${toTotal} de ${fromTotal} cards`,
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
      stageIds: top ? [top.stage_id] : [],
    },
    {
      id: 'slot-2',
      type: 'volume_stage',
      label: '',
      stageIds: bot ? [bot.stage_id] : [],
    },
    {
      id: 'slot-3',
      type: 'conversion',
      label: '',
      fromStageIds: top ? [top.stage_id] : [],
      toStageIds: bot ? [bot.stage_id] : [],
    },
    {
      id: 'slot-4',
      type: 'aggregate',
      label: '',
      aggregate: 'cards',
    },
  ]
}
