type Cell = {
  linha: string
  coluna: string
  entraram: number
  fecharam: number
  taxa_pct: number | null
}

type Props = {
  cells: Cell[]
  rowsOrder?: string[]
  colsOrder?: string[]
  rowLabel: string
  colLabel: string
  onCellClick?: (linha: string, coluna: string) => void
  emptyMessage?: string
}

/**
 * Heatmap genérico linha×coluna. Cores baseadas na taxa de conversão da célula.
 * Clique na célula chama onCellClick(linha, coluna) para abrir drill.
 */
export function MatrixHeatmap({ cells, rowsOrder, colsOrder, rowLabel, colLabel, onCellClick, emptyMessage = 'Sem combinações suficientes (mín. 2 leads por célula)' }: Props) {
  if (!cells || cells.length === 0) {
    return <div className="text-xs text-slate-400 p-6 text-center">{emptyMessage}</div>
  }

  // Ordem canônica + qualquer bucket fora dela vai pro FIM (nunca some da tabela —
  // já perdemos o balde '50-100' inteiro por ele não estar no mapa de ordem).
  const ordenarCom = (order: string[] | undefined, valores: string[]): string[] => {
    if (!order) return valores
    const conhecidos = order.filter(v => valores.includes(v))
    const desconhecidos = valores.filter(v => !order.includes(v))
    return [...conhecidos, ...desconhecidos]
  }
  const linhas = ordenarCom(rowsOrder, Array.from(new Set(cells.map(c => c.linha))))
  const colunas = colsOrder
    ? ordenarCom(colsOrder, Array.from(new Set(cells.map(c => c.coluna))))
    : Array.from(new Set(cells.map(c => c.coluna))).sort((a, b) => {
        const sa = cells.filter(c => c.coluna === a).reduce((s, c) => s + c.entraram, 0)
        const sb = cells.filter(c => c.coluna === b).reduce((s, c) => s + c.entraram, 0)
        return sb - sa
      })

  const cellMap = new Map(cells.map(c => [`${c.linha}|${c.coluna}`, c]))
  const maxTaxa = Math.max(1, ...cells.map(c => c.taxa_pct ?? 0))

  return (
    <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
      <table className="w-full text-xs">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-slate-500 sticky left-0 bg-slate-50 z-10 whitespace-nowrap">
              {rowLabel} ↓ / {colLabel} →
            </th>
            {colunas.map(c => (
              <th key={c} className="px-3 py-2 text-center font-medium text-slate-700 min-w-[90px]">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map(l => (
            <tr key={l} className="border-t border-slate-100">
              <td className="px-3 py-2 text-slate-900 font-medium whitespace-nowrap sticky left-0 bg-white z-10">{l}</td>
              {colunas.map(c => {
                const cell = cellMap.get(`${l}|${c}`)
                if (!cell) {
                  return <td key={c} className="px-3 py-2 text-center bg-slate-50 text-slate-300">—</td>
                }
                const taxa = cell.taxa_pct ?? 0
                const bg = cell.fecharam === 0 ? 'bg-rose-50 text-rose-900'
                  : taxa >= 10 ? 'bg-emerald-200 text-emerald-900'
                  : taxa >= 5 ? 'bg-emerald-100 text-emerald-900'
                  : taxa >= 2 ? 'bg-emerald-50 text-emerald-900'
                  : 'bg-amber-50 text-amber-900'
                const intensidade = Math.min(1, taxa / maxTaxa)
                const Cell = onCellClick ? ('button' as const) : ('div' as const)
                return (
                  <td key={c} className={`p-0 ${bg}`} style={{ opacity: 0.55 + 0.45 * intensidade }}
                      title={`${cell.entraram} entraram · ${cell.fecharam} fecharam · ${taxa}%`}>
                    <Cell
                      onClick={onCellClick ? () => onCellClick(l, c) : undefined}
                      className={`w-full h-full px-2 py-2 text-center block ${onCellClick ? 'cursor-pointer hover:ring-2 hover:ring-ww-gold focus:ring-2 focus:ring-ww-gold focus:outline-none' : ''}`}
                    >
                      <div className="font-semibold text-sm">{taxa}%</div>
                      <div className="text-[10px] opacity-75 mt-0.5">{cell.entraram} → {cell.fecharam}</div>
                    </Cell>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
