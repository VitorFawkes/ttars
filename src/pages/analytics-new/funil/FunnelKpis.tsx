import { Target, Briefcase, DollarSign, Trophy } from 'lucide-react'
import KpiCard from '@/components/analytics/KpiCard'
import { formatCurrency } from '@/utils/whatsappFormatters'
import { relativeDelta, type FunnelMetric, type FunnelStatus } from './constants'
import type { FunnelStageV3 } from './useFunnelData'

interface Props {
  isLoading: boolean
  stages: FunnelStageV3[]
  previousStages: FunnelStageV3[] | null
  metric: FunnelMetric
  status: FunnelStatus
  compareEnabled: boolean
}

function topOf(stages: FunnelStageV3[]): FunnelStageV3 | null {
  return stages[0] ?? null
}

function bottomOf(stages: FunnelStageV3[]): FunnelStageV3 | null {
  return stages.length ? stages[stages.length - 1] : null
}

function sumValor(stages: FunnelStageV3[]): number {
  return stages.reduce((s, x) => s + (x.period_valor || 0), 0)
}

function sumReceita(stages: FunnelStageV3[]): number {
  return stages.reduce((s, x) => s + (x.period_receita || 0), 0)
}

function sumCount(stages: FunnelStageV3[]): number {
  return stages.reduce((s, x) => s + (x.period_count || 0), 0)
}

function formatDelta(d: number | null): string | undefined {
  if (d == null || isNaN(d) || !isFinite(d)) return undefined
  const sign = d >= 0 ? '+' : ''
  return `${sign}${d.toFixed(0)}% vs anterior`
}

const shortName = (n: string | undefined, max = 18) =>
  !n ? '' : n.length > max ? n.slice(0, max - 1) + '…' : n

export default function FunnelKpis({
  isLoading,
  stages,
  previousStages,
  metric,
  status,
  compareEnabled,
}: Props) {
  const top = topOf(stages)
  const bot = bottomOf(stages)
  const prevTop = previousStages ? topOf(previousStages) : null
  const prevBot = previousStages ? bottomOf(previousStages) : null

  // KPIs usam `period_count` (cards que "caíram" na etapa no período conforme date_ref/status).
  const totalEntered = top?.period_count ?? 0
  const totalFinished = bot?.period_count ?? 0
  const conversionRate = totalEntered > 0 ? (totalFinished / totalEntered) * 100 : 0

  const prevEntered = prevTop?.period_count ?? 0
  const prevFinished = prevBot?.period_count ?? 0
  const prevConversion = prevEntered > 0 ? (prevFinished / prevEntered) * 100 : 0

  const deltaEntered = compareEnabled ? relativeDelta(totalEntered, prevEntered) : null
  const deltaFinished = compareEnabled ? relativeDelta(totalFinished, prevFinished) : null
  const deltaConversion = compareEnabled ? relativeDelta(conversionRate, prevConversion) : null

  // Valor/receita: soma ao longo das etapas visíveis. Como um card entra em UMA etapa
  // (após deduplicação na RPC), não há double-counting. Mas representa "valor total movimentado",
  // não receita realizada — o label reflete isso conforme status/metric.
  const valorTotal = sumValor(stages)
  const receitaTotal = sumReceita(stages)
  const prevValor = previousStages ? sumValor(previousStages) : 0
  const prevReceita = previousStages ? sumReceita(previousStages) : 0

  const totalCount = sumCount(stages)
  const prevCount = previousStages ? sumCount(previousStages) : 0

  // Escolha do 4º KPI baseado em métrica + status:
  //   - metric=receita → Receita total
  //   - metric=faturamento → Faturamento
  //   - metric=cards → Total movimentado (cards)
  // Label troca conforme status:
  //   - status='won' → "Receita realizada"
  //   - status='lost' → "Perda em valor"
  //   - demais → "Em movimento" (vendas + abertas)
  const valueKpi = (() => {
    if (metric === 'receita') {
      return {
        title:
          status === 'won'
            ? 'Receita ganha'
            : status === 'lost'
              ? 'Receita perdida'
              : 'Receita no período',
        value: formatCurrency(receitaTotal),
        delta: compareEnabled ? relativeDelta(receitaTotal, prevReceita) : null,
      }
    }
    if (metric === 'faturamento') {
      return {
        title:
          status === 'won'
            ? 'Faturamento ganho'
            : status === 'lost'
              ? 'Faturamento perdido'
              : 'Faturamento no período',
        value: formatCurrency(valorTotal),
        delta: compareEnabled ? relativeDelta(valorTotal, prevValor) : null,
      }
    }
    return {
      title:
        status === 'won'
          ? 'Total de ganhos'
          : status === 'lost'
            ? 'Total de perdas'
            : 'Total no período',
      value: totalCount.toLocaleString('pt-BR'),
      delta: compareEnabled ? relativeDelta(totalCount, prevCount) : null,
    }
  })()

  const conversionTitle =
    top && bot
      ? `Conversão ${shortName(top.stage_nome, 14)} → ${shortName(bot.stage_nome, 14)}`
      : 'Conversão do funil'

  const topLabel = top ? `Entraram em "${shortName(top.stage_nome)}"` : 'Entraram no funil'
  const botLabel = bot ? `Chegaram em "${shortName(bot.stage_nome)}"` : 'Chegaram ao fim'

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <KpiCard
        title={topLabel}
        value={totalEntered.toLocaleString('pt-BR')}
        icon={Briefcase}
        color="text-blue-600"
        bgColor="bg-blue-50"
        isLoading={isLoading}
        subtitle={formatDelta(deltaEntered)}
      />
      <KpiCard
        title={botLabel}
        value={totalFinished.toLocaleString('pt-BR')}
        icon={Trophy}
        color="text-emerald-600"
        bgColor="bg-emerald-50"
        isLoading={isLoading}
        subtitle={formatDelta(deltaFinished)}
      />
      <KpiCard
        title={conversionTitle}
        value={`${conversionRate.toFixed(1)}%`}
        icon={Target}
        color="text-indigo-600"
        bgColor="bg-indigo-50"
        isLoading={isLoading}
        subtitle={formatDelta(deltaConversion)}
      />
      <KpiCard
        title={valueKpi.title}
        value={valueKpi.value}
        icon={DollarSign}
        color="text-amber-600"
        bgColor="bg-amber-50"
        isLoading={isLoading}
        subtitle={formatDelta(valueKpi.delta)}
      />
    </div>
  )
}
