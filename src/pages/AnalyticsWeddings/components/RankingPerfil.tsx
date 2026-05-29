import type { WwFunilRanking, WwFunilRankingDim, WwFunilRankingRow } from '@/hooks/analyticsWeddings/useWw2'
import { fmtPct } from '../lib/funil'
import { formatNumber } from '../lib/format'
import { EmptyState, LoadingSkeleton } from './ui'

// "Lentes": dimensão única ou cruzamentos de 2/3 dimensões.
const LENTES: { label: string; dims: WwFunilRankingDim[] }[] = [
  { label: 'Investimento', dims: ['faixa'] },
  { label: 'Convidados', dims: ['convidados'] },
  { label: 'Destino', dims: ['destino'] },
  { label: 'Convidados × Destino', dims: ['convidados', 'destino'] },
  { label: 'Investimento × Convidados', dims: ['faixa', 'convidados'] },
  { label: 'Investimento × Destino', dims: ['faixa', 'destino'] },
  { label: 'Os 3 juntos', dims: ['faixa', 'convidados', 'destino'] },
]

const AMOSTRA_MINIMA = 10 // abaixo disso, marca "poucos casos"

type Props = {
  dims: WwFunilRankingDim[]
  onDims: (d: WwFunilRankingDim[]) => void
  data: WwFunilRanking | undefined
  isLoading: boolean
  /** filtros de perfil atuais, pra destacar a linha selecionada. */
  sel: { faixas: string[]; convidados: string[]; destinos: string[] }
  onPick: (row: WwFunilRankingRow) => void
}

function linhaSelecionada(row: WwFunilRankingRow, sel: Props['sel']): boolean {
  const checa = (val: string | null, arr: string[]) => val == null || (arr.length === 1 && arr[0] === val)
  // selecionada quando TODAS as dimensões presentes batem com o filtro (e há ao menos uma)
  const presentes = [row.faixa, row.convidados, row.destino].filter((v) => v != null).length
  return presentes > 0 && checa(row.faixa, sel.faixas) && checa(row.convidados, sel.convidados) && checa(row.destino, sel.destinos)
}

export function RankingPerfil({ dims, onDims, data, isLoading, sel, onPick }: Props) {
  const rows = data?.rows ?? []
  const ehCruzamento = dims.length > 1
  const dimsKey = dims.join('+')

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5">
      <div className="flex items-baseline justify-between mb-1 flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-slate-900 tracking-tight">Quais perfis mais viram casamento</h3>
        <select
          value={dimsKey}
          onChange={(e) => { const l = LENTES.find((x) => x.dims.join('+') === e.target.value); if (l) onDims(l.dims) }}
          className="px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {LENTES.map((l) => <option key={l.dims.join('+')} value={l.dims.join('+')}>{l.label}</option>)}
        </select>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        No período A (a época), ordenado por quem mais fechou. <span className="text-indigo-600 font-medium">Clique num perfil</span> pra comparar com agora.
        {ehCruzamento && ' Cruzamentos com poucos casos são puxados pra baixo automaticamente — confie nos que têm mais leads.'}
      </p>

      {isLoading ? (
        <LoadingSkeleton rows={5} />
      ) : rows.length === 0 ? (
        <EmptyState message="Sem leads suficientes nesse período pra ranquear. Amplie o período A." />
      ) : (
        <div className="space-y-1.5">
          {rows.slice(0, 15).map((r) => {
            const isSel = linhaSelecionada(r, sel)
            const poucos = r.entrou < AMOSTRA_MINIMA
            const width = Math.max(3, Math.min(100, r.taxa_pct ?? 0))
            return (
              <button
                key={r.label}
                onClick={() => onPick(r)}
                className={`w-full text-left rounded-lg border px-3 py-2 transition ${
                  isSel ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className={`text-sm font-medium truncate ${isSel ? 'text-indigo-800' : 'text-slate-800'}`}>
                    {r.label}
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
