import type { WwFunilRankingPerfil, WwFunilRankingDim } from '@/hooks/analyticsWeddings/useWw2'
import { fmtPct } from '../lib/funil'
import { formatNumber } from '../lib/format'
import { EmptyState, LoadingSkeleton } from './ui'

const DIM_LABEL: Record<WwFunilRankingDim, string> = {
  faixa: 'Investimento',
  convidados: 'Convidados',
  destino: 'Destino',
}

// Abaixo disso, a taxa é volátil — mostramos com aviso (decisão do Vitor: mostrar todos, com aviso).
const AMOSTRA_MINIMA = 10

type Props = {
  dimensao: WwFunilRankingDim
  onDimensao: (d: WwFunilRankingDim) => void
  data: WwFunilRankingPerfil | undefined
  isLoading: boolean
  /** bucket atualmente selecionado nessa dimensão (pra destacar). */
  selecionado: string | null
  onPick: (dimensao: WwFunilRankingDim, bucket: string) => void
}

export function RankingPerfil({ dimensao, onDimensao, data, isLoading, selecionado, onPick }: Props) {
  const rows = data?.rows ?? []
  const maxTaxa = rows.reduce((m, r) => Math.max(m, r.taxa_pct ?? 0), 0) || 1

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5">
      <div className="flex items-baseline justify-between mb-1 flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-slate-900 tracking-tight">Quais perfis mais viram casamento</h3>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
          {(['faixa', 'convidados', 'destino'] as WwFunilRankingDim[]).map((d) => (
            <button
              key={d}
              onClick={() => onDimensao(d)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${
                dimensao === d ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {DIM_LABEL[d]}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        No período A (a época), ordenado por quem mais fechou. <span className="text-indigo-600 font-medium">Clique num perfil</span> pra comparar com agora.
      </p>

      {isLoading ? (
        <LoadingSkeleton rows={5} />
      ) : rows.length === 0 ? (
        <EmptyState message="Sem leads suficientes nesse período pra ranquear. Amplie o período A." />
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => {
            const isSel = selecionado === r.bucket
            const poucos = r.entrou < AMOSTRA_MINIMA
            const width = Math.max(3, Math.min(100, ((r.taxa_pct ?? 0) / maxTaxa) * 100))
            return (
              <button
                key={r.bucket}
                onClick={() => onPick(dimensao, r.bucket)}
                className={`w-full text-left rounded-lg border px-3 py-2 transition ${
                  isSel ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className={`text-sm font-medium truncate ${isSel ? 'text-indigo-800' : 'text-slate-800'}`}>
                    {r.bucket}
                    {poucos && (
                      <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 align-middle">poucos casos</span>
                    )}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-slate-900 shrink-0">{fmtPct(r.taxa_pct)}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full rounded-full ${isSel ? 'bg-indigo-500' : 'bg-indigo-300'}`} style={{ width: `${width}%` }} />
                  </div>
                  <span className="text-[11px] text-slate-500 tabular-nums shrink-0">
                    {formatNumber(r.ganho)} de {formatNumber(r.entrou)} viraram casamento
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}
      <p className="mt-3 text-[11px] text-slate-400">
        Baseado no que o casal declarou no formulário do site (não no valor fechado de verdade).
      </p>
    </div>
  )
}
