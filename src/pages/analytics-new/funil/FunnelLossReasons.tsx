import ChartCard from '@/components/analytics/ChartCard'
import { cn } from '@/lib/utils'
import type { LossReason } from '@/hooks/analytics/useFunnelConversion'

interface Props {
  isLoading: boolean
  reasons: LossReason[]
  onReasonDrill: (reason: string) => void
}

export default function FunnelLossReasons({ isLoading, reasons, onReasonDrill }: Props) {
  const sorted = [...reasons].sort((a, b) => b.count - a.count)
  const top = sorted.slice(0, 8)
  const maxCount = top[0]?.count ?? 0

  return (
    <ChartCard
      title="Motivos de perda"
      description={
        top.length > 0
          ? `Top ${top.length} motivos — clique para ver os cards perdidos`
          : 'Sem perdas no período'
      }
      isLoading={isLoading}
    >
      <div className="px-4 pb-4 space-y-1.5">
        {top.length === 0 && !isLoading && (
          <div className="py-8 text-center text-slate-400 text-sm">
            Nenhum motivo de perda registrado
          </div>
        )}

        {top.map(r => {
          const barWidth = maxCount > 0 ? (r.count / maxCount) * 100 : 0
          return (
            <button
              key={r.motivo}
              onClick={() => onReasonDrill(r.motivo)}
              className="group w-full text-left hover:bg-slate-50 p-2 rounded-md transition-colors"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span
                  className="text-xs font-medium text-slate-700 truncate"
                  title={r.motivo}
                >
                  {r.motivo || 'Sem motivo informado'}
                </span>
                <div className="flex items-center gap-1.5 flex-shrink-0 text-[11px] text-slate-500 tabular-nums">
                  <span className="font-semibold text-slate-700">{r.count}</span>
                  <span className="text-slate-300">·</span>
                  <span>{r.percentage.toFixed(1)}%</span>
                </div>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full bg-rose-400 transition-all',
                    'group-hover:bg-rose-500'
                  )}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </button>
          )
        })}
      </div>
    </ChartCard>
  )
}
