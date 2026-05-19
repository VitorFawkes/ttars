import { Filter } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EngajamentoLineBreakdown } from '@/types/engagement'

interface Props {
  lines: EngajamentoLineBreakdown[]
  isLoading?: boolean
  selectedLabels: string[]
  onToggleLine: (label: string) => void
  onClearLines: () => void
}

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${value.toFixed(1)}%`
}

function hours(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value) || value < 0) return '—'
  if (value < 1) return `${Math.round(value * 60)}min`
  if (value < 24) return `${value.toFixed(1)}h`
  return `${(value / 24).toFixed(1)}d`
}

function lineAccent(label: string): { from: string; to: string; bar: string; text: string } {
  const lower = label.toLowerCase()
  if (lower.includes('elopement') || lower.includes('elopment')) {
    return {
      from: 'from-rose-50',
      to: 'to-white',
      bar: 'bg-rose-500',
      text: 'text-rose-700',
    }
  }
  if (lower.includes('sdr')) {
    return {
      from: 'from-violet-50',
      to: 'to-white',
      bar: 'bg-violet-500',
      text: 'text-violet-700',
    }
  }
  if (lower.includes('teste')) {
    return {
      from: 'from-slate-50',
      to: 'to-white',
      bar: 'bg-slate-400',
      text: 'text-slate-600',
    }
  }
  return {
    from: 'from-indigo-50',
    to: 'to-white',
    bar: 'bg-indigo-500',
    text: 'text-indigo-700',
  }
}

export default function EngajamentoBreakdownLinhas({
  lines,
  isLoading,
  selectedLabels,
  onToggleLine,
  onClearLines,
}: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div
            key={i}
            className="h-44 bg-white border border-slate-200 rounded-2xl animate-pulse"
          />
        ))}
      </div>
    )
  }

  if (lines.length === 0) return null

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 tracking-tight">
            Por linha
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Clique pra filtrar todo o dashboard só por essa linha
          </p>
        </div>
        {selectedLabels.length > 0 && (
          <button
            onClick={onClearLines}
            className="text-xs text-slate-500 hover:text-slate-900 px-2 py-1"
          >
            Ver todas
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {lines.map((l, idx) => {
          const isActive = selectedLabels.includes(l.label)
          const isDimmed = selectedLabels.length > 0 && !isActive
          const accent = lineAccent(l.label)
          const respondersPct = l.reply_rate ?? 0
          return (
            <button
              key={l.label}
              onClick={() => onToggleLine(l.label)}
              className={cn(
                'group text-left bg-gradient-to-br rounded-2xl border p-5 transition-all duration-200',
                accent.from,
                accent.to,
                isActive
                  ? 'border-slate-400 ring-2 ring-slate-200 shadow-md'
                  : 'border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300',
                isDimmed && 'opacity-50',
                'active:scale-[0.99]'
              )}
              style={{
                animation: `lineCardEnter 380ms cubic-bezier(0.23, 1, 0.32, 1) ${idx * 70 + 100}ms both`,
              }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={cn('w-2 h-2 rounded-full', accent.bar)} />
                    <h3 className="font-semibold text-slate-900 tracking-tight">
                      {l.label}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {l.total.toLocaleString('pt-BR')} pessoas no período
                  </p>
                </div>
                <Filter
                  className={cn(
                    'w-4 h-4 transition-opacity',
                    isActive
                      ? 'opacity-100 ' + accent.text
                      : 'opacity-0 group-hover:opacity-60 text-slate-400'
                  )}
                />
              </div>

              <div className="mt-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-slate-500">Taxa de resposta</span>
                  <span className="text-2xl font-bold text-slate-900 tabular-nums">
                    {pct(l.reply_rate)}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full bg-white/60 rounded-full overflow-hidden border border-slate-200/60">
                  <div
                    className={cn('h-full rounded-full', accent.bar)}
                    style={{
                      width: `${Math.min(100, respondersPct)}%`,
                      transition: 'width 600ms cubic-bezier(0.23, 1, 0.32, 1)',
                    }}
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <div className="flex items-baseline justify-between">
                  <span className="text-slate-500">1ª resposta</span>
                  <span className="font-medium text-slate-900 tabular-nums">
                    {hours(l.frt_median_hours)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-slate-500">Profundidade</span>
                  <span className="font-medium text-slate-900 tabular-nums">
                    {l.depth_avg !== null ? l.depth_avg.toFixed(1) : '—'}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-slate-500">Ativas</span>
                  <span className="font-medium text-slate-900 tabular-nums">
                    {l.active_count}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-slate-500">Ganhas</span>
                  <span className="font-medium text-emerald-700 tabular-nums">
                    {l.won_count}
                  </span>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      <style>{`
        @keyframes lineCardEnter {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
