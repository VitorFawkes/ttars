import { cn } from '@/lib/utils'
import type { EngajamentoFunnelStep } from '@/types/engagement'

interface Props {
  steps: EngajamentoFunnelStep[]
  isLoading?: boolean
}

const STEP_COLORS = [
  'bg-indigo-500',
  'bg-violet-500',
  'bg-sky-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-yellow-500',
]

export default function EngajamentoFunil({ steps, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6">
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-10 bg-slate-100 rounded" style={{ width: `${100 - i * 10}%` }} />
          ))}
        </div>
      </div>
    )
  }

  const top = steps[0]?.count ?? 0
  const previous = (idx: number): number => (idx === 0 ? 0 : steps[idx - 1].count)

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-slate-900 tracking-tight">Funil de Engajamento</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Cada degrau mostra quantos contatos chegaram até ali, e quantos saíram do anterior.
        </p>
      </div>

      <div className="space-y-2">
        {steps.map((s, idx) => {
          const widthPct = top === 0 ? 0 : Math.max(8, (s.count / top) * 100)
          const dropPct = idx === 0 ? null : previous(idx) === 0 ? 0 : ((previous(idx) - s.count) / previous(idx)) * 100
          const conversionPct = idx === 0 ? null : previous(idx) === 0 ? 0 : (s.count / previous(idx)) * 100

          return (
            <div key={s.step} className="flex items-center gap-3">
              <div className="w-32 text-sm font-medium text-slate-700 shrink-0">
                {s.step}
              </div>
              <div className="flex-1 relative">
                <div
                  className={cn(
                    'h-9 rounded-md flex items-center justify-between px-3 text-white text-sm font-semibold transition-all',
                    STEP_COLORS[idx % STEP_COLORS.length]
                  )}
                  style={{ width: `${widthPct}%`, minWidth: '60px' }}
                >
                  <span>{s.count.toLocaleString('pt-BR')}</span>
                  {conversionPct !== null && (
                    <span className="text-xs opacity-90">{conversionPct.toFixed(0)}%</span>
                  )}
                </div>
              </div>
              <div className="w-24 text-right text-xs text-slate-500 shrink-0">
                {dropPct !== null && dropPct > 0 ? (
                  <span className="text-rose-600">−{dropPct.toFixed(0)}%</span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
        <span>
          % verde dentro da barra = conversão do degrau anterior · vermelho à direita = queda
        </span>
      </div>
    </div>
  )
}
