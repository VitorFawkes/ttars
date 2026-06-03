import type { WwFunilConversaoMarcos } from '@/hooks/analyticsWeddings/useWw2'
import { toLinhas, MARCO_KEYS, MARCO_LABELS, fmtPct } from '../lib/funil'
import { formatNumber } from '../lib/format'
import { EmptyState, ErrorBanner, LoadingSkeleton } from './ui'

// Funil etapa por etapa comparando dois períodos (A = referência, B = foco), na MESMA escala.
// As duas % de passagem ficam lado a lado, do mesmo tamanho: a MAIOR (melhor) em verde, a
// menor (pior) em vermelho. Cada barra mostra a quantidade de pessoas à direita.
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
            const stepA = la?.stepPct ?? null
            const stepB = lb?.stepPct ?? null
            const isDrop = dropIdx === i
            const wA = Math.max(1.5, Math.min(100, stepA ?? 0))
            const wB = Math.max(1.5, Math.min(100, stepB ?? 0))

            // melhor (maior %) = verde · pior (menor %) = vermelho · empate = neutro
            const aBetter = stepA != null && stepB != null && stepA > stepB
            const bBetter = stepA != null && stepB != null && stepB > stepA
            const pctA = aBetter ? 'text-emerald-600' : bBetter ? 'text-rose-600' : 'text-slate-600'
            const pctB = bBetter ? 'text-emerald-600' : aBetter ? 'text-rose-600' : 'text-slate-600'
            const barA = aBetter ? 'bg-emerald-500' : bBetter ? 'bg-rose-400' : 'bg-slate-300'
            const barB = bBetter ? 'bg-emerald-500' : aBetter ? 'bg-rose-400' : 'bg-slate-300'

            return (
              <div key={key} className="py-3.5 border-b border-slate-100 last:border-0">
                {/* cabeçalho: etapa + as duas % lado a lado (mesmo tamanho, verde/vermelho) */}
                <div className="flex items-start justify-between gap-3 mb-2.5">
                  <div className="min-w-0 pt-0.5">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Avançaram até</div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800">{MARCO_LABELS[key]}</span>
                      {isDrop && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-rose-100 text-rose-700">maior queda</span>}
                    </div>
                  </div>
                  <div className="flex items-start gap-5 shrink-0">
                    <div className="text-right">
                      <div className={`text-xl font-bold tabular-nums leading-none ${pctA}`}>{fmtPct(stepA)}</div>
                      <div className="text-[10px] text-slate-400 mt-1 max-w-[88px] truncate" title={labelA}>{labelA}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-xl font-bold tabular-nums leading-none ${pctB}`}>{fmtPct(stepB)}</div>
                      <div className="text-[10px] text-slate-400 mt-1 max-w-[88px] truncate" title={labelB}>{labelB}</div>
                    </div>
                  </div>
                </div>

                {/* barra A — referência */}
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-28 shrink-0 text-[11px] text-slate-400 truncate" title={labelA}>{labelA}</span>
                  <div className="flex-1 h-4 rounded bg-slate-100 overflow-hidden">
                    <div className={`h-full rounded ${barA}`} style={{ width: `${wA}%` }} />
                  </div>
                  <span className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-700">{formatNumber(la?.count ?? 0)}</span>
                </div>

                {/* barra B — foco */}
                <div className="flex items-center gap-2">
                  <span className="w-28 shrink-0 text-[11px] text-slate-500 font-medium truncate" title={labelB}>{labelB}</span>
                  <div className="flex-1 h-4 rounded bg-slate-100 overflow-hidden">
                    <div className={`h-full rounded ${barB}`} style={{ width: `${wB}%` }} />
                  </div>
                  <span className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-900">{formatNumber(lb?.count ?? 0)}</span>
                </div>
              </div>
            )
          })}

          <p className="text-[11px] text-slate-400 pt-3">
            As duas barras estão na mesma escala. <strong className="font-semibold text-emerald-600">Verde</strong> = melhor conversão · <strong className="font-semibold text-rose-600">vermelho</strong> = pior, comparando {labelB} com {labelA}. O número à direita de cada barra é a <strong className="font-semibold text-slate-600">quantidade de pessoas</strong>.
          </p>
        </>
      )}
    </div>
  )
}
