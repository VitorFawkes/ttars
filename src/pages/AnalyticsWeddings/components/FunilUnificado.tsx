import type { WwFunilConversaoMarcos } from '@/hooks/analyticsWeddings/useWw2'
import { toLinhas, deltasPassagem, MARCO_KEYS, MARCO_LABELS, fmtPct, fmtDeltaPp } from '../lib/funil'
import { formatNumber } from '../lib/format'
import { EmptyState, ErrorBanner, LoadingSkeleton } from './ui'

// Funil etapa por etapa, comparando dois períodos (B = colorido/foco; A = cinza/referência),
// na MESMA escala. Cada etapa mostra a passagem ("avançaram da etapa anterior"), a contagem
// "X de Y", o acumulado "do topo" e a variação (Δ pp). A maior queda fica destacada.
// Os marcos A/B já chegam FILTRADOS (a tela passa o resultado filtrado da RPC).

type Props = {
  marcosA: WwFunilConversaoMarcos | undefined
  marcosB: WwFunilConversaoMarcos | undefined
  labelA: string
  labelB: string
  isLoading: boolean
  error?: unknown
  dropIdx: number | null
  aRecente?: boolean
  bRecente?: boolean
}

export function FunilUnificado({ marcosA, marcosB, labelA, labelB, isLoading, error, dropIdx }: Props) {
  const linhasA = marcosA ? toLinhas(marcosA) : []
  const linhasB = marcosB ? toLinhas(marcosB) : []
  const deltas = marcosA && marcosB ? deltasPassagem(marcosA, marcosB) : []
  const entrouA = marcosA?.entrou ?? 0
  const entrouB = marcosB?.entrou ?? 0

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5">
      {isLoading ? (
        <LoadingSkeleton rows={6} />
      ) : error ? (
        <ErrorBanner error={error as Error} />
      ) : entrouA === 0 && entrouB === 0 ? (
        <EmptyState message="Nenhum lead com esse perfil nos períodos escolhidos." />
      ) : (
        <>
          {/* Topo do funil — base */}
          <div className="flex items-baseline justify-between pb-3 border-b border-slate-200">
            <div>
              <span className="text-sm text-slate-500">Entraram no funil </span>
              <span className="text-lg font-bold text-slate-900 tabular-nums">{formatNumber(entrouB)}</span>
              <span className="text-sm text-slate-500"> pessoas</span>
            </div>
            <span className="text-xs text-slate-400">base · 100%</span>
          </div>

          {MARCO_KEYS.slice(1).map((key, idx) => {
            const i = idx + 1
            const lb = linhasB[i]
            const la = linhasA[i]
            const prevB = linhasB[i - 1]
            const d = deltas[i] ?? null
            const isDrop = dropIdx === i
            const wA = Math.max(1.5, Math.min(100, la?.stepPct ?? 0))
            const wB = Math.max(1.5, Math.min(100, lb?.stepPct ?? 0))
            const up = d != null && d > 0
            const down = d != null && d < 0
            const barB = up ? 'bg-emerald-500' : down ? 'bg-rose-500' : 'bg-slate-400'
            const deltaCls = up ? 'bg-emerald-50 text-emerald-700' : down ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-400'

            return (
              <div key={key} className="py-3.5 border-b border-slate-100 last:border-0">
                {/* cabeçalho da etapa */}
                <div className="flex items-start justify-between gap-3 mb-2.5">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Avançaram até</div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800">{MARCO_LABELS[key]}</span>
                      {isDrop && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-rose-100 text-rose-700">maior queda</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-slate-600">
                      <span className="font-semibold tabular-nums text-slate-900">{formatNumber(lb?.count ?? 0)}</span> de <span className="tabular-nums">{formatNumber(prevB?.count ?? 0)}</span> avançaram
                    </div>
                    <div className="text-[11px] text-slate-400">
                      do topo: <span className="font-medium text-slate-500 tabular-nums">{fmtPct(lb?.cumPct ?? null)}</span> {labelB} · <span className="font-medium text-slate-500 tabular-nums">{fmtPct(la?.cumPct ?? null)}</span> {labelA}
                    </div>
                  </div>
                </div>

                {/* barra A — período de referência (cinza) */}
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-28 shrink-0 text-[11px] text-slate-400 truncate" title={labelA}>{labelA}</span>
                  <div className="flex-1 h-3.5 rounded bg-slate-100 overflow-hidden">
                    <div className="h-full rounded bg-slate-300" style={{ width: `${wA}%` }} />
                  </div>
                  <span className="w-36 shrink-0 text-right text-xs tabular-nums text-slate-500">{fmtPct(la?.stepPct ?? null)}</span>
                </div>

                {/* barra B — período em foco (colorido) */}
                <div className="flex items-center gap-2">
                  <span className="w-28 shrink-0 text-[11px] font-medium text-slate-600 truncate" title={labelB}>{labelB}</span>
                  <div className="flex-1 h-3.5 rounded bg-slate-100 overflow-hidden">
                    <div className={`h-full rounded ${barB}`} style={{ width: `${wB}%` }} />
                  </div>
                  <div className="w-36 shrink-0 flex items-center justify-end gap-2">
                    <span className="text-base font-bold tabular-nums text-slate-900">{fmtPct(lb?.stepPct ?? null)}</span>
                    {d != null && (
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded tabular-nums whitespace-nowrap ${deltaCls}`}>
                        {up ? '▲' : down ? '▼' : ''} {fmtDeltaPp(d)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          <p className="text-[11px] text-slate-400 pt-3">
            A <strong className="font-semibold text-slate-500">barra colorida</strong> ({labelB}) e a <strong className="font-semibold text-slate-500">barra cinza</strong> ({labelA}) estão na mesma escala — a diferença de comprimento é a variação, também no número à direita.
          </p>
        </>
      )}
    </div>
  )
}
