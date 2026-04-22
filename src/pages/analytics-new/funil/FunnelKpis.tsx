import { Target, Briefcase, DollarSign, Trophy } from 'lucide-react'
import KpiCard from '@/components/analytics/KpiCard'
import { formatCurrency } from '@/utils/whatsappFormatters'
import type { FunnelStageData } from '@/hooks/analytics/useFunnelConversion'
import { relativeDelta, type FunnelMetric } from './constants'

interface Props {
  isLoading: boolean
  stages: FunnelStageData[]
  previousStages: FunnelStageData[] | null
  metric: FunnelMetric
  compareEnabled: boolean
}

// `stages` já vem ordenado pelo FunnelView (ordem canônica da RPC).
function topOf(stages: FunnelStageData[]): FunnelStageData | null {
  return stages[0] ?? null
}

function bottomOf(stages: FunnelStageData[]): FunnelStageData | null {
  return stages.length ? stages[stages.length - 1] : null
}

function totalValor(stages: FunnelStageData[]): number {
  return stages.reduce((s, x) => s + (x.total_valor || 0), 0)
}

function formatDelta(d: number | null): string | undefined {
  if (d == null || isNaN(d) || !isFinite(d)) return undefined
  const sign = d >= 0 ? '+' : ''
  return `${sign}${d.toFixed(0)}% vs anterior`
}

export default function FunnelKpis({
  isLoading,
  stages,
  previousStages,
  metric,
  compareEnabled,
}: Props) {
  const top = topOf(stages)
  const bot = bottomOf(stages)
  const prevTop = previousStages ? topOf(previousStages) : null
  const prevBot = previousStages ? bottomOf(previousStages) : null

  const totalEntered = top?.current_count ?? 0
  const totalFinished = bot?.current_count ?? 0
  const conversionRate = totalEntered > 0 ? (totalFinished / totalEntered) * 100 : 0

  const prevTotalEntered = prevTop?.current_count ?? 0
  const prevTotalFinished = prevBot?.current_count ?? 0
  const prevConversionRate =
    prevTotalEntered > 0 ? (prevTotalFinished / prevTotalEntered) * 100 : 0

  const deltaEntered = compareEnabled ? relativeDelta(totalEntered, prevTotalEntered) : null
  const deltaFinished = compareEnabled ? relativeDelta(totalFinished, prevTotalFinished) : null
  const deltaConversion = compareEnabled
    ? relativeDelta(conversionRate, prevConversionRate)
    : null

  const valorTotal = totalValor(stages)
  const prevValor = previousStages ? totalValor(previousStages) : 0
  const deltaValor = compareEnabled ? relativeDelta(valorTotal, prevValor) : null

  // Nome curto da etapa (trunca em 18 chars pra caber no KPI)
  const shortName = (n: string | undefined, max = 18) =>
    !n ? '' : n.length > max ? n.slice(0, max - 1) + '…' : n
  const conversionTitle =
    top && bot
      ? `Conversão ${shortName(top.stage_nome, 14)} → ${shortName(bot.stage_nome, 14)}`
      : 'Conversão do funil'

  // Suppress unused warning on metric (kept for API compat; currency vs cards in future)
  void metric

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <KpiCard
        title={top ? `Entraram em "${shortName(top.stage_nome)}"` : 'Entraram no funil'}
        value={totalEntered.toLocaleString('pt-BR')}
        icon={Briefcase}
        color="text-blue-600"
        bgColor="bg-blue-50"
        isLoading={isLoading}
        subtitle={formatDelta(deltaEntered)}
      />
      <KpiCard
        title={bot ? `Chegaram em "${shortName(bot.stage_nome)}"` : 'Chegaram ao fim'}
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
        title="Faturamento"
        value={formatCurrency(valorTotal)}
        icon={DollarSign}
        color="text-amber-600"
        bgColor="bg-amber-50"
        isLoading={isLoading}
        subtitle={formatDelta(deltaValor)}
      />
    </div>
  )
}
