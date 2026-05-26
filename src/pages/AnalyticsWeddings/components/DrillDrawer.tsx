import { useWw2DrillDown, type DrillFilters } from '@/hooks/analyticsWeddings/useWw2'
import { formatCurrency, formatNumber } from '../lib/format'
import { Link } from 'react-router-dom'

export type DrillContext = DrillFilters & { title: string }

export function DrillDrawer({ ctx, onClose }: { ctx: DrillContext | null; onClose: () => void }) {
  const { data, isLoading, error } = useWw2DrillDown(ctx)

  if (!ctx) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-full max-w-2xl bg-white shadow-2xl z-50 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 tracking-tight">{ctx.title}</h2>
            {data && (
              <p className="text-xs text-slate-500 mt-0.5">
                {formatNumber(data.total)} card{data.total !== 1 ? 's' : ''} encontrado{data.total !== 1 ? 's' : ''}
                {data.total > data.rows.length && ` · mostrando primeiros ${data.rows.length}`}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500">
            <svg viewBox="0 0 16 16" className="w-4 h-4"><path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading && <div className="p-5 text-sm text-slate-500">Carregando…</div>}
          {error && <div className="p-5 text-sm text-rose-600">Erro: {String(error)}</div>}
          {data && data.rows.length === 0 && (
            <div className="p-10 text-center text-sm text-slate-400">Nenhum card encontrado com esses filtros.</div>
          )}
          {data && data.rows.length > 0 && (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-slate-600">
                  <th className="px-4 py-2 font-medium">Card</th>
                  <th className="px-2 py-2 font-medium">Etapa</th>
                  <th className="px-2 py-2 font-medium">Dono</th>
                  <th className="px-2 py-2 font-medium text-right">Valor</th>
                  <th className="px-2 py-2 font-medium text-right">Parado</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map(r => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <Link to={`/cards/${r.id}`} className="text-indigo-700 hover:underline font-medium" title={r.titulo}>
                        {r.titulo.length > 42 ? r.titulo.slice(0, 42) + '…' : r.titulo}
                      </Link>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {r.faixa && <span className="mr-2">{r.faixa}</span>}
                        {r.destino && <span className="mr-2">{r.destino}</span>}
                        {r.origem && r.origem !== 'Desconhecida' && <span>{r.origem}</span>}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <div className="text-slate-700">{r.stage_name}</div>
                      <div className="text-[11px] text-slate-400">{r.phase_label}</div>
                    </td>
                    <td className="px-2 py-2 text-slate-700">{r.dono_nome ?? <span className="text-slate-400">—</span>}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {r.valor_final ? formatCurrency(r.valor_final) : r.valor_estimado ? <span className="text-slate-500">~{formatCurrency(r.valor_estimado)}</span> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      <span className={r.dias_parado > 14 ? 'text-rose-600 font-medium' : r.dias_parado > 7 ? 'text-amber-600' : 'text-slate-500'}>
                        {r.dias_parado}d
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-5 py-3 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
          <span>{data && `Total: ${formatNumber(data.total)}`}</span>
          <button onClick={onClose} className="text-indigo-600 hover:text-indigo-700 font-medium">Fechar</button>
        </div>
      </div>
    </>
  )
}
