import type { WwFunilConversaoMarcos } from '@/hooks/analyticsWeddings/useWw2'
import { toLinhas, deltasPassagem, MARCO_KEYS, MARCO_LABELS, MARCOS_TARDIOS, fmtPct, fmtDeltaPp } from '../lib/funil'
import { formatNumber } from '../lib/format'
import { EmptyState, ErrorBanner, LoadingSkeleton } from './ui'

// Funil etapa por etapa: a CONVERSÃO entre etapas é a estrela.
// Cada etapa = uma barra (agora=sólida, época=fantasma de referência atrás).
// Entre as etapas, um selo grande com a conversão da passagem (agora vs época + Δ).
// A maior queda fica destacada em vermelho. Etapas tardias recentes: "amadurecendo".

type Props = {
  marcosA: WwFunilConversaoMarcos | undefined
  marcosB: WwFunilConversaoMarcos | undefined
  labelA: string
  labelB: string
  isLoading: boolean
  error?: unknown
  dropIdx: number | null
  aRecente: boolean
  bRecente: boolean
}

export function FunilUnificado({ marcosA, marcosB, labelA, labelB, isLoading, error, dropIdx, aRecente, bRecente }: Props) {
  const linhasA = marcosA ? toLinhas(marcosA) : []
  const linhasB = marcosB ? toLinhas(marcosB) : []
  const deltas = marcosA && marcosB ? deltasPassagem(marcosA, marcosB) : []
  const entrouA = marcosA?.entrou ?? 0
  const entrouB = marcosB?.entrou ?? 0

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-900 tracking-tight">Funil de venda — etapa por etapa</h3>
          <p className="text-xs text-slate-500 mt-0.5">Entre as etapas: quantos avançaram (a conversão). A barra é quanto do total chegou até ali.</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm border border-slate-300 bg-slate-100" /> {labelA}</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-indigo-600" /> {labelB}</span>
        </div>
      </div>

      {isLoading ? (
        <LoadingSkeleton rows={6} />
      ) : error ? (
        <ErrorBanner error={error as Error} />
      ) : entrouA === 0 && entrouB === 0 ? (
        <EmptyState message="Nenhum lead com esse perfil nos períodos escolhidos." />
      ) : (
        <div>
          {MARCO_KEYS.map((key, i) => {
            const la = linhasA[i]
            const lb = linhasB[i]
            const d = deltas[i] ?? null
            const isDrop = dropIdx === i
            const maturing = (bRecente || aRecente) && MARCOS_TARDIOS.includes(key)
            const wB = Math.max(1.5, Math.min(100, lb?.cumPct ?? 0))
            const wA = Math.max(0, Math.min(100, la?.cumPct ?? 0))
            const stepB = lb?.stepPct ?? null
            const stepA = la?.stepPct ?? null
            const chipCls = d == null ? 'bg-slate-100 text-slate-500 border-slate-200'
              : d > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : d < 0 ? 'bg-rose-50 text-rose-700 border-rose-200'
              : 'bg-slate-100 text-slate-500 border-slate-200'

            return (
              <div key={key}>
                {/* Selo de conversão da passagem (entre a etapa anterior e esta) */}
                {i > 0 && (
                  <div className="flex items-center gap-3 py-1.5 pl-1">
                    <div className="flex flex-col items-center w-7 shrink-0 text-slate-400">
                      <svg width="14" height="18" viewBox="0 0 14 18" fill="none"><path d="M7 0v13M7 18l-5-6M7 18l5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <div className={`inline-flex items-baseline gap-2 rounded-lg border px-3 py-1.5 ${isDrop ? 'bg-rose-50 border-rose-300' : chipCls}`}>
                      <span className={`text-lg font-bold tabular-nums ${isDrop ? 'text-rose-700' : ''}`}>{fmtPct(stepB)}</span>
                      <span className="text-xs opacity-70">avançaram</span>
                      {stepA != null && (
                        <span className="text-xs opacity-60">· antes {fmtPct(stepA)}</span>
                      )}
                      {d != null && <span className="text-xs font-semibold">({fmtDeltaPp(d)})</span>}
                    </div>
                    {isDrop && <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-rose-200 text-rose-800">maior queda</span>}
                    {maturing && <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700">amadurecendo</span>}
                  </div>
                )}

                {/* Etapa: rótulo + barra (agora sólida, época = fantasma atrás) */}
                <div className={`rounded-lg px-2 py-2 ${isDrop ? 'bg-rose-50/60' : ''}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-800">{MARCO_LABELS[key]}</span>
                    <span className="text-xs tabular-nums text-slate-500">
                      <span className="text-slate-900 font-semibold">{formatNumber(lb?.count ?? 0)}</span> · {fmtPct(lb?.cumPct ?? null)}
                      <span className="text-slate-400"> · antes {formatNumber(la?.count ?? 0)} ({fmtPct(la?.cumPct ?? null)})</span>
                    </span>
                  </div>
                  <div className="relative h-6 rounded-md bg-slate-100 overflow-hidden">
                    {/* fantasma A (referência) */}
                    <div className="absolute inset-y-0 left-0 rounded-md border-2 border-dashed border-slate-300/80" style={{ width: `${wA}%` }} />
                    {/* barra B (agora) */}
                    <div className={`absolute inset-y-0 left-0 rounded-md ${isDrop ? 'bg-rose-500' : 'bg-indigo-600'}`} style={{ width: `${wB}%` }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
