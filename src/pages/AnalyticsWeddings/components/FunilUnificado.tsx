import type { WwFunilConversaoMarcos } from '@/hooks/analyticsWeddings/useWw2'
import { toLinhas, deltasPassagem, MARCO_KEYS, MARCO_LABELS, fmtPct, fmtDeltaPp, type MarcoKey } from '../lib/funil'
import { formatNumber } from '../lib/format'
import { EmptyState, ErrorBanner, LoadingSkeleton } from './ui'

// Funil etapa por etapa comparando dois períodos (A = referência, B = foco), na MESMA escala.
// Cada barra tem, na SUA linha: a quantidade de pessoas e a % de passagem (mesmo tamanho;
// a melhor em verde, a pior em vermelho). No topo da etapa, o Δ em pontos percentuais
// (queda/aumento). Embaixo, sutil, a conversão "do topo" (acumulada desde a entrada).
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
  /** Clique numa barra de etapa → lista de casais daquele marco/período */
  onEtapaClick?: (marco: MarcoKey, periodo: 'A' | 'B') => void
}

export function FunilUnificado({ marcosA, marcosB, labelA, labelB, isLoading, error, dropIdx, onEtapaClick }: Props) {
  const linhasA = marcosA ? toLinhas(marcosA) : []
  const linhasB = marcosB ? toLinhas(marcosB) : []
  const deltas = marcosA && marcosB ? deltasPassagem(marcosA, marcosB) : []
  const entrouA = marcosA?.entrou ?? 0
  const entrouB = marcosB?.entrou ?? 0

  const Linha = ({ label, w, count, pct, pctCls, barCls, strong, onClick }: {
    label: string; w: number; count: number; pct: number | null; pctCls: string; barCls: string; strong?: boolean; onClick?: () => void
  }) => {
    const inner = (
      <>
        <span className={`w-28 shrink-0 text-[11px] truncate ${strong ? 'text-slate-500 font-medium' : 'text-slate-400'}`} title={label}>{label}</span>
        <div className="flex-1 h-4 rounded bg-slate-100 overflow-hidden">
          <div className={`h-full rounded ${barCls}`} style={{ width: `${w}%` }} />
        </div>
        <span className="w-14 shrink-0 text-right text-xs tabular-nums text-slate-500">{formatNumber(count)}</span>
        <span className={`w-16 shrink-0 text-right text-sm font-bold tabular-nums ${pctCls}`}>{fmtPct(pct)}</span>
      </>
    )
    if (onClick) {
      return (
        <button onClick={onClick} className="w-full flex items-center gap-2.5 text-left rounded hover:bg-slate-50 transition-colors" title={`Ver casais: ${label}`}>
          {inner}
        </button>
      )
    }
    return <div className="flex items-center gap-2.5">{inner}</div>
  }

  return (
    <div className="bg-white border border-ww-sand shadow-ww-lift rounded-xl p-5">
      {isLoading ? (
        <LoadingSkeleton rows={6} />
      ) : error ? (
        <ErrorBanner error={error as Error} />
      ) : entrouA === 0 && entrouB === 0 ? (
        <EmptyState message="Nenhum lead com esse perfil nos períodos escolhidos." />
      ) : (
        <>
          {/* Topo do funil — base dos DOIS períodos comparados */}
          <div className="flex items-end justify-between gap-4 pb-3 border-b border-slate-200">
            <div className="min-w-0">
              <div className="text-sm text-slate-500">Entraram no funil</div>
              <div className="mt-1.5 flex items-baseline gap-x-6 gap-y-1 flex-wrap">
                <button className="flex items-baseline gap-1.5 group" onClick={onEtapaClick ? () => onEtapaClick('entrou', 'B') : undefined} disabled={!onEtapaClick} title="Ver casais que entraram">
                  <span className={`text-2xl font-bold text-slate-900 tabular-nums leading-none ${onEtapaClick ? 'group-hover:text-ww-gold-ink transition-colors' : ''}`}>{formatNumber(entrouB)}</span>
                  <span className="text-xs font-medium text-slate-500">{labelB}</span>
                </button>
                <button className="flex items-baseline gap-1.5 group" onClick={onEtapaClick ? () => onEtapaClick('entrou', 'A') : undefined} disabled={!onEtapaClick} title="Ver casais que entraram">
                  <span className={`text-2xl font-bold text-slate-400 tabular-nums leading-none ${onEtapaClick ? 'group-hover:text-ww-gold-ink transition-colors' : ''}`}>{formatNumber(entrouA)}</span>
                  <span className="text-xs font-medium text-slate-400">{labelA}</span>
                </button>
              </div>
            </div>
            <span className="shrink-0 text-xs text-slate-400">base · 100%</span>
          </div>

          {/* cabeçalho das colunas */}
          <div className="flex items-center gap-2.5 pt-2.5 pb-0.5">
            <span className="w-28 shrink-0" />
            <span className="flex-1" />
            <span className="w-14 shrink-0 text-right text-[10px] uppercase tracking-wide text-slate-400">pessoas</span>
            <span className="w-16 shrink-0 text-right text-[10px] uppercase tracking-wide text-slate-400">conversão</span>
          </div>

          {MARCO_KEYS.slice(1).map((key, idx) => {
            const i = idx + 1
            const lb = linhasB[i]
            const la = linhasA[i]
            const stepA = la?.stepPct ?? null
            const stepB = lb?.stepPct ?? null
            const d = deltas[i] ?? null
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

            const up = d != null && d > 0
            const down = d != null && d < 0
            const deltaCls = up ? 'bg-emerald-50 text-emerald-700' : down ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-400'

            return (
              <div key={key} className="py-3 border-b border-slate-100 last:border-0">
                {/* cabeçalho da etapa + Δ pp */}
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-semibold text-slate-800">{MARCO_LABELS[key]}</span>
                    {isDrop && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-rose-100 text-rose-700">maior queda</span>}
                  </div>
                  {d != null && (
                    <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full tabular-nums whitespace-nowrap ${deltaCls}`}>
                      {up ? '▲' : down ? '▼' : ''} {fmtDeltaPp(d)}
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Linha label={labelA} w={wA} count={la?.count ?? 0} pct={stepA} pctCls={pctA} barCls={barA}
                    onClick={onEtapaClick ? () => onEtapaClick(key, 'A') : undefined} />
                  <Linha label={labelB} w={wB} count={lb?.count ?? 0} pct={stepB} pctCls={pctB} barCls={barB} strong
                    onClick={onEtapaClick ? () => onEtapaClick(key, 'B') : undefined} />
                </div>

                {/* do topo — sutil */}
                <div className="text-[10px] text-slate-400 mt-1.5 text-right">
                  do topo (acumulado): <span className="tabular-nums">{fmtPct(lb?.cumPct ?? null)}</span> {labelB} · <span className="tabular-nums">{fmtPct(la?.cumPct ?? null)}</span> {labelA}
                </div>
              </div>
            )
          })}

          <p className="text-[11px] text-slate-400 pt-3">
            Cada linha = um período, na mesma escala. À direita: <strong className="font-semibold text-slate-600">pessoas</strong> e <strong className="font-semibold text-slate-600">conversão</strong> da etapa anterior, a melhor em <strong className="font-semibold text-emerald-600">verde</strong>, a pior em <strong className="font-semibold text-rose-600">vermelho</strong>. O Δ pp no topo é {labelB} vs {labelA}.
          </p>
        </>
      )}
    </div>
  )
}
