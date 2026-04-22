import { useMemo } from 'react'
import ChartCard from '@/components/analytics/ChartCard'
import { formatCurrency } from '@/utils/whatsappFormatters'
import { cn } from '@/lib/utils'
import type { FunnelStageData } from '@/hooks/analytics/useFunnelConversion'
import { getPhaseColor, relativeDelta, type FunnelMetric } from './constants'

interface Props {
  isLoading: boolean
  stages: FunnelStageData[]
  previousStages: FunnelStageData[] | null
  metric: FunnelMetric
  onStageDrill: (stageId: string, stageName: string) => void
}

interface ComputedStage {
  stage_id: string
  stage_nome: string
  phase_slug: string
  value: number
  valor: number
  receita: number
  avgDays: number
  p75Days: number
  widthPct: number
  pctFromTop: number
  pctFromPrev: number | null
  deltaPrev: number | null // comparação com período anterior (mesma etapa)
}

function getValueForMetric(stage: FunnelStageData, metric: FunnelMetric): number {
  if (metric === 'cards') return stage.current_count
  if (metric === 'faturamento') return stage.total_valor || 0
  return stage.receita_total || 0
}

function formatValue(v: number, metric: FunnelMetric): string {
  if (metric === 'cards') return v.toLocaleString('pt-BR')
  return formatCurrency(v)
}

export default function FunnelVisual({
  isLoading,
  stages,
  previousStages,
  metric,
  onStageDrill,
}: Props) {
  const computed = useMemo<ComputedStage[]>(() => {
    if (!stages.length) return []
    const sorted = [...stages].sort((a, b) => a.ordem - b.ordem)
    const topValue = getValueForMetric(sorted[0], metric) || 1

    const prevByStage = new Map<string, FunnelStageData>()
    if (previousStages) {
      for (const p of previousStages) prevByStage.set(p.stage_id, p)
    }

    return sorted.map((s, idx) => {
      const value = getValueForMetric(s, metric)
      const prevStageRaw = idx > 0 ? sorted[idx - 1] : null
      const prevStageValue = prevStageRaw ? getValueForMetric(prevStageRaw, metric) : null

      const periodPrev = prevByStage.get(s.stage_id)
      const periodPrevValue = periodPrev ? getValueForMetric(periodPrev, metric) : null

      return {
        stage_id: s.stage_id,
        stage_nome: s.stage_nome,
        phase_slug: s.phase_slug,
        value,
        valor: s.total_valor || 0,
        receita: s.receita_total || 0,
        avgDays: s.avg_days_in_stage || 0,
        p75Days: s.p75_days_in_stage || 0,
        widthPct: topValue > 0 ? Math.max(4, (value / topValue) * 100) : 0,
        pctFromTop: topValue > 0 ? (value / topValue) * 100 : 0,
        pctFromPrev: prevStageValue != null ? relativeDelta(value, prevStageValue) : null,
        deltaPrev: periodPrevValue != null ? relativeDelta(value, periodPrevValue) : null,
      }
    })
  }, [stages, previousStages, metric])

  return (
    <ChartCard
      title="Funil de Vendas"
      description={
        metric === 'cards'
          ? 'Cards por etapa — clique para ver os cards'
          : metric === 'faturamento'
            ? 'Faturamento por etapa — clique para ver os cards'
            : 'Receita por etapa — clique para ver os cards'
      }
      colSpan={2}
      isLoading={isLoading}
    >
      <div className="px-6 pb-6 pt-2 space-y-1.5">
        {computed.length === 0 && !isLoading && (
          <div className="py-12 text-center text-slate-400 text-sm">
            Sem dados no período selecionado
          </div>
        )}

        {computed.map((s, idx) => {
          const color = getPhaseColor(s.phase_slug)
          const hasDelta = s.deltaPrev != null && !isNaN(s.deltaPrev) && isFinite(s.deltaPrev)
          const deltaUp = hasDelta && s.deltaPrev! > 0
          const deltaDown = hasDelta && s.deltaPrev! < 0

          return (
            <button
              key={s.stage_id}
              onClick={() => onStageDrill(s.stage_id, s.stage_nome)}
              className="group w-full flex items-stretch gap-4 rounded-lg p-2 hover:bg-slate-50 transition-colors text-left"
            >
              {/* Barra proporcional */}
              <div className="flex-1 relative">
                <div
                  className="flex items-center h-11 rounded-md transition-all group-hover:ring-2 group-hover:ring-offset-1 group-hover:ring-indigo-300"
                  style={{
                    width: `${s.widthPct}%`,
                    background: color,
                    minWidth: '60px',
                  }}
                >
                  <span className="px-3 text-white font-semibold text-sm tabular-nums">
                    {formatValue(s.value, metric)}
                  </span>
                </div>
              </div>

              {/* Metadata lateral */}
              <div className="flex-shrink-0 w-[260px] flex flex-col justify-center">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-800 truncate" title={s.stage_nome}>
                    {s.stage_nome}
                  </span>
                  {hasDelta && (
                    <span
                      className={cn(
                        'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums',
                        deltaUp && 'bg-emerald-50 text-emerald-700',
                        deltaDown && 'bg-rose-50 text-rose-700',
                        !deltaUp && !deltaDown && 'bg-slate-100 text-slate-500'
                      )}
                      title="Variação vs período anterior"
                    >
                      {s.deltaPrev! > 0 ? '+' : ''}
                      {s.deltaPrev!.toFixed(0)}%
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2.5 mt-0.5 text-[11px] text-slate-500 tabular-nums">
                  <span>{s.pctFromTop.toFixed(1)}% do topo</span>
                  {idx > 0 && s.pctFromPrev != null && (
                    <>
                      <span className="text-slate-300">·</span>
                      <span>
                        {s.pctFromPrev.toFixed(1)}% vs etapa anterior
                      </span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2.5 mt-0.5 text-[11px] text-slate-400 tabular-nums">
                  <span>p50 {s.avgDays.toFixed(0)}d</span>
                  <span className="text-slate-300">·</span>
                  <span>p75 {s.p75Days.toFixed(0)}d</span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </ChartCard>
  )
}
