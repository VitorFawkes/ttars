import type { WwPerfilCompareItem } from '@/hooks/analyticsWeddings/useWw2'
import { LiftBadge } from './LiftBadge'

type Props = {
  dados: WwPerfilCompareItem[]
  dimensao: string
  onCategoriaClick?: (categoria: string) => void
  minSample?: number
  /** Ordem canônica p/ dimensões ordinais (faixa/convidados). Sem ela, ordena por volume. */
  order?: string[]
}

/**
 * Barras espelhadas: esquerda = % no grupo "entraram", direita = % no grupo
 * "fecharam". Lift no centro. Verde = sobre-representado em vendas; rosa = sub.
 * Clicar numa linha aciona o drill (se onCategoriaClick passado).
 */
export function PerfilCompareChart({ dados, dimensao, onCategoriaClick, minSample = 1, order }: Props) {
  const filtered = dados.filter(d => d.entrada_qtd >= minSample || d.fechou_qtd >= 1)
  const sorted = order
    ? [...filtered].sort((a, b) => {
        const ia = order.indexOf(a.categoria); const ib = order.indexOf(b.categoria)
        if (ia === -1 && ib === -1) return b.entrada_qtd - a.entrada_qtd
        if (ia === -1) return 1
        if (ib === -1) return -1
        return ia - ib
      })
    : [...filtered].sort((a, b) => b.entrada_qtd - a.entrada_qtd)
  if (sorted.length === 0) {
    return <div className="text-xs text-slate-400 p-4 text-center">Sem dados suficientes nessa dimensão</div>
  }

  // Eixo: maior valor entre entradas e fechamentos
  const maxEnt = Math.max(1, ...sorted.map(d => d.entrada_pct ?? 0))
  const maxFech = Math.max(1, ...sorted.map(d => d.fechou_pct ?? 0))
  const max = Math.max(maxEnt, maxFech, 5)

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
      <div className="grid grid-cols-12 px-3 py-2 bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-medium tracking-wide text-slate-500">
        <div className="col-span-3">{labelDimensao(dimensao)}</div>
        <div className="col-span-4 text-right">% Dos leads que ENTRARAM</div>
        <div className="col-span-1 text-center">Lift</div>
        <div className="col-span-4">% Das vendas FECHADAS</div>
      </div>
      <div className="divide-y divide-slate-100">
        {sorted.map(d => {
          const entPct = d.entrada_pct ?? 0
          const fechPct = d.fechou_pct ?? 0
          const entBar = (entPct / max) * 100
          const fechBar = (fechPct / max) * 100
          const Wrap = onCategoriaClick ? ('button' as const) : ('div' as const)
          return (
            <Wrap
              key={d.categoria}
              onClick={onCategoriaClick ? () => onCategoriaClick(d.categoria) : undefined}
              className={`w-full grid grid-cols-12 items-center px-3 py-2.5 text-xs ${onCategoriaClick ? 'hover:bg-ww-cream/50 cursor-pointer text-left' : ''}`}
              title={onCategoriaClick ? `Ver casais: ${d.categoria}` : undefined}
            >
              <div className="col-span-3 font-medium text-slate-900 truncate" title={d.categoria}>{d.categoria}</div>
              <div className="col-span-4">
                <div className="flex items-center gap-2 flex-row-reverse">
                  <span className="w-12 text-right tabular-nums text-slate-600">{entPct}%</span>
                  <span className="w-10 text-right text-[10px] text-slate-400 tabular-nums">{d.entrada_qtd}</span>
                  <div className="flex-1 h-4 bg-slate-100 rounded-sm overflow-hidden relative">
                    <div className="absolute top-0 right-0 h-full bg-indigo-300" style={{ width: `${entBar}%` }} />
                  </div>
                </div>
              </div>
              <div className="col-span-1 flex items-center justify-center">
                <LiftBadge lift={d.lift} size="sm" showDelta={false} />
              </div>
              <div className="col-span-4">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-4 bg-slate-100 rounded-sm overflow-hidden relative">
                    <div className="h-full bg-emerald-400" style={{ width: `${fechBar}%` }} />
                  </div>
                  <span className="w-10 text-left text-[10px] text-slate-400 tabular-nums">{d.fechou_qtd}</span>
                  <span className="w-12 text-left tabular-nums text-slate-600">{fechPct}%</span>
                </div>
              </div>
            </Wrap>
          )
        })}
      </div>
    </div>
  )
}

function labelDimensao(d: string): string {
  switch (d) {
    case 'faixa': return 'Faixa de investimento'
    case 'destino': return 'Destino'
    case 'convidados': return 'Nº convidados'
    case 'origem': return 'Origem'
    case 'tipo': return 'Tipo de casamento'
    default: return d
  }
}
