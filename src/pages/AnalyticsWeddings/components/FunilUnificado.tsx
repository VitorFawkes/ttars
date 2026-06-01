import type { WwFunilConversaoMarcos } from '@/hooks/analyticsWeddings/useWw2'
import { toLinhas, deltasPassagem, MARCO_KEYS, MARCO_LABELS, MARCOS_TARDIOS, fmtPct, fmtDeltaPp } from '../lib/funil'
import { formatNumber } from '../lib/format'
import { EmptyState, ErrorBanner, LoadingSkeleton } from './ui'

// Um funil só, A (época) e B (agora) juntos por etapa. Substitui os dois
// FunilColumn lado a lado + a tabela densa + os KPI cards. Barras = % do total
// que entrou (cumulativo, já monotônico ≤100%). O badge mostra a Δ da PASSAGEM
// (avanço da etapa anterior) — é onde a conversão muda. A etapa que mais caiu
// fica destacada. Etapas tardias num período recente ganham "amadurecendo".

type Props = {
  marcosA: WwFunilConversaoMarcos | undefined
  marcosB: WwFunilConversaoMarcos | undefined
  labelA: string
  labelB: string
  isLoading: boolean
  error?: unknown
  /** índice do marco onde a passagem mais caiu (B vs A). */
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
        <h3 className="text-sm font-semibold text-slate-900 tracking-tight">Funil de venda — etapa por etapa</h3>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm bg-indigo-300" /> {labelA}</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm bg-indigo-600" /> {labelB}</span>
        </div>
      </div>

      {isLoading ? (
        <LoadingSkeleton rows={6} />
      ) : error ? (
        <ErrorBanner error={error as Error} />
      ) : entrouA === 0 && entrouB === 0 ? (
        <EmptyState message="Nenhum lead com esse perfil nos períodos escolhidos." />
      ) : (
        <div className="space-y-4">
          {MARCO_KEYS.map((key, i) => {
            const la = linhasA[i]
            const lb = linhasB[i]
            const d = deltas[i] ?? null
            const isDrop = dropIdx === i
            const maturing = (bRecente && MARCOS_TARDIOS.includes(key)) || (aRecente && MARCOS_TARDIOS.includes(key))
            const wA = Math.max(2, Math.min(100, la?.cumPct ?? 0))
            const wB = Math.max(2, Math.min(100, lb?.cumPct ?? 0))
            const dCls = i === 0 || d == null ? 'bg-slate-100 text-slate-400'
              : d > 0 ? 'bg-emerald-50 text-emerald-700'
              : d < 0 ? 'bg-rose-50 text-rose-700'
              : 'bg-slate-100 text-slate-400'
            return (
              <div key={key} className={`rounded-lg ${isDrop ? 'bg-rose-50 -mx-2 px-2 py-2' : ''}`}>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className={`text-sm font-medium flex items-center gap-1.5 ${isDrop ? 'text-rose-800' : 'text-slate-800'}`}>
                    {MARCO_LABELS[key]}
                    {isDrop && <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-rose-200 text-rose-800">maior queda</span>}
                    {maturing && <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700">amadurecendo</span>}
                  </span>
                  {i > 0 && (
                    <span className="inline-flex items-center gap-1.5 text-xs tabular-nums">
                      <span className="text-slate-400">avançaram da etapa anterior:</span>
                      <span className="text-slate-500">{fmtPct(la?.stepPct ?? null)}</span>
                      <span className="text-slate-300">→</span>
                      <span className="text-slate-900 font-semibold">{fmtPct(lb?.stepPct ?? null)}</span>
                      <span className={`px-1.5 py-0.5 rounded font-medium ${dCls}`}>{fmtDeltaPp(d)}</span>
                    </span>
                  )}
                </div>
                {/* barra A (comparação) */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-4 rounded bg-slate-100 overflow-hidden">
                    <div className="h-full rounded bg-indigo-300" style={{ width: `${wA}%` }} />
                  </div>
                  <span className="w-28 shrink-0 text-right text-xs tabular-nums text-slate-500">
                    {formatNumber(la?.count ?? 0)} · {fmtPct(la?.cumPct ?? null)}
                  </span>
                </div>
                {/* barra B (principal) */}
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-4 rounded bg-slate-100 overflow-hidden">
                    <div className="h-full rounded bg-indigo-600" style={{ width: `${wB}%` }} />
                  </div>
                  <span className="w-28 shrink-0 text-right text-xs tabular-nums text-slate-900 font-medium">
                    {formatNumber(lb?.count ?? 0)} · {fmtPct(lb?.cumPct ?? null)}
                  </span>
                </div>
              </div>
            )
          })}
          <p className="text-xs text-slate-400 pt-1">
            Barra e % à direita = quanto do total que entrou chegou até a etapa. "Avançaram da etapa anterior" = a conversão de uma etapa para a próxima, em cada período (a cor mostra a diferença em pontos).
          </p>
        </div>
      )}
    </div>
  )
}
