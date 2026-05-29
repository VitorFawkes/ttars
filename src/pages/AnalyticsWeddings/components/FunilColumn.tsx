import type { WwFunilConversaoMarcos } from '@/hooks/analyticsWeddings/useWw2'
import { toLinhas, fmtPct, type MarcoKey } from '../lib/funil'
import { formatNumber } from '../lib/format'
import { formatRange } from '../lib/dates'
import { EmptyState, ErrorBanner, LoadingSkeleton } from './ui'

type Props = {
  titulo: string
  dateStart: string
  dateEnd: string
  modoLabel: string
  data: WwFunilConversaoMarcos | undefined
  isLoading: boolean
  error: unknown
  /** marco a destacar (onde a conversão mais caiu vs o outro período). */
  highlightKey?: MarcoKey | null
  /** marcos que ainda estão amadurecendo nesse período (período recente). */
  maturingKeys?: MarcoKey[]
}

export function FunilColumn({ titulo, dateStart, dateEnd, modoLabel, data, isLoading, error, highlightKey, maturingKeys }: Props) {
  const linhas = data ? toLinhas(data) : []
  const entrou = data?.entrou ?? 0

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-900 tracking-tight">{titulo}</h3>
        <p className="text-xs text-slate-500 mt-0.5">{formatRange(dateStart, dateEnd)}</p>
        <p className="text-[11px] text-slate-400 mt-0.5">{modoLabel}</p>
      </div>

      {isLoading ? (
        <LoadingSkeleton rows={6} />
      ) : error ? (
        <ErrorBanner error={error as Error} />
      ) : entrou === 0 ? (
        <EmptyState message="Nenhum lead entrou nesse período com esse perfil." />
      ) : (
        <div className="space-y-2.5">
          {linhas.map((l) => {
            const width = Math.max(2, Math.min(100, l.cumPct ?? 0))
            const isHighlight = highlightKey === l.key
            const isMaturing = maturingKeys?.includes(l.key)
            return (
              <div key={l.key}>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                    {l.label}
                    {isMaturing && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700">amadurecendo</span>
                    )}
                  </span>
                  <span className="text-xs tabular-nums text-slate-900 font-semibold">{formatNumber(l.count)}</span>
                </div>
                <div className="h-7 rounded-lg bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-lg transition-all ${isHighlight ? 'bg-rose-500' : 'bg-indigo-500'}`}
                    style={{ width: `${width}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500 tabular-nums">
                  <span>{l.stepPct == null ? ' ' : `passagem ${fmtPct(l.stepPct)}`}</span>
                  <span>do total {fmtPct(l.cumPct)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
