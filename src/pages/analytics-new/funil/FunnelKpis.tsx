import { Settings, Briefcase, Target, DollarSign, Clock, Scale } from 'lucide-react'
import { useMemo } from 'react'
import KpiCard from '@/components/analytics/KpiCard'
import { relativeDelta } from './constants'
import { computeKpi, type KpiConfig, type KpiResult } from './kpiConfig'
import type { FunnelStageV3 } from './useFunnelData'

interface Props {
  isLoading: boolean
  stages: FunnelStageV3[]
  previousStages: FunnelStageV3[] | null
  compareEnabled: boolean
  configs: KpiConfig[]
  onOpenEditor: () => void
}

const ICON_BY_TYPE = {
  volume_stage: Briefcase,
  conversion: Target,
  aggregate: DollarSign,
  time_stage: Clock,
}

const COLOR_CLASSES: Record<KpiResult['color'], { text: string; bg: string }> = {
  blue: { text: 'text-blue-600', bg: 'bg-blue-50' },
  emerald: { text: 'text-emerald-600', bg: 'bg-emerald-50' },
  indigo: { text: 'text-indigo-600', bg: 'bg-indigo-50' },
  amber: { text: 'text-amber-600', bg: 'bg-amber-50' },
  rose: { text: 'text-rose-600', bg: 'bg-rose-50' },
  slate: { text: 'text-slate-600', bg: 'bg-slate-50' },
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
  compareEnabled,
  configs,
  onOpenEditor,
}: Props) {
  const stagesById = useMemo(() => {
    const m = new Map<string, FunnelStageV3>()
    for (const s of stages) m.set(s.stage_id, s)
    return m
  }, [stages])

  const prevStagesById = useMemo(() => {
    const m = new Map<string, FunnelStageV3>()
    if (previousStages) for (const s of previousStages) m.set(s.stage_id, s)
    return m
  }, [previousStages])

  const results = useMemo(() => {
    return configs.map(cfg => {
      const current = computeKpi(cfg, stages, stagesById)
      let delta: number | null = null
      if (compareEnabled && previousStages) {
        const prev = computeKpi(cfg, previousStages, prevStagesById)
        if (
          current.numericValue != null &&
          prev.numericValue != null &&
          prev.numericValue !== 0
        ) {
          delta = relativeDelta(current.numericValue, prev.numericValue)
        }
      }
      return { cfg, result: current, delta }
    })
  }, [configs, stages, previousStages, stagesById, prevStagesById, compareEnabled])

  return (
    <div className="relative">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {results.map(({ cfg, result, delta }) => {
          const Icon = cfg.type === 'aggregate' && cfg.aggregate === 'ticket'
            ? Scale
            : ICON_BY_TYPE[cfg.type]
          const colors = COLOR_CLASSES[result.color]
          return (
            <KpiCard
              key={cfg.id}
              title={result.title}
              value={result.value}
              icon={Icon}
              color={colors.text}
              bgColor={colors.bg}
              isLoading={isLoading}
              subtitle={result.hint ?? formatDelta(delta)}
            />
          )
        })}
      </div>

      {/* Engrenagem no canto superior direito — abre editor */}
      <button
        type="button"
        onClick={onOpenEditor}
        title="Personalizar KPIs"
        className="absolute -top-2 -right-2 h-7 w-7 flex items-center justify-center rounded-full bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-300 shadow-sm transition-colors"
      >
        <Settings className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
