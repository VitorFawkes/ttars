import { useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useWw2DrillDown, type DrillFilters, type Ww2DrillRow } from '@/hooks/analyticsWeddings/useWw2'
import { formatCurrency, formatNumber } from '../lib/format'
import { OpenInACButton } from './OpenInACButton'

export type DrillContext = DrillFilters & { title: string; subtitle?: string }

export function DrillDrawer({ ctx, onClose }: { ctx: DrillContext | null; onClose: () => void }) {
  const { data, isLoading, error } = useWw2DrillDown(ctx)

  // Filtros que a RPC ww2_drill_down ainda não conhece — aplicados client-side.
  const filteredRows = useMemo<Ww2DrillRow[]>(() => {
    if (!data?.rows) return []
    let rows = data.rows
    if (ctx?.tipo) rows = rows.filter(r => r.tipo_casamento === ctx.tipo)
    if (ctx?.campaign) rows = rows.filter(r => (r.campaign ?? '') === ctx.campaign)
    if (ctx?.medium) rows = rows.filter(r => (r.medium ?? '') === ctx.medium)
    return rows
  }, [data, ctx])

  // Esc fecha o drawer
  useEffect(() => {
    if (!ctx) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [ctx, onClose])

  if (!ctx) return null

  const totalDisplay = data ? (
    filteredRows.length === data.rows.length
      ? data.total
      : filteredRows.length
  ) : 0

  return (
    <>
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-full max-w-3xl bg-white shadow-2xl z-50 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 tracking-tight">{ctx.title}</h2>
            {ctx.subtitle && <p className="text-xs text-slate-500 mt-0.5">{ctx.subtitle}</p>}
            {data && (
              <p className="text-xs text-slate-500 mt-0.5">
                {formatNumber(totalDisplay)} casal{totalDisplay !== 1 ? 'is' : ''} encontrado{totalDisplay !== 1 ? 's' : ''}
                {data.total > data.rows.length && ` · mostrando primeiros ${data.rows.length}`}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500" aria-label="Fechar painel">
            <svg viewBox="0 0 16 16" className="w-4 h-4" aria-hidden="true"><path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading && <div className="p-5 text-sm text-slate-500">Carregando casais…</div>}
          {error != null && (
            <div className="p-5 text-sm text-rose-600">
              Não consegui carregar a lista. Tente de novo; se continuar, me avise.
              <div className="mt-1 text-xs text-rose-400 break-all">{(error as { message?: string })?.message ?? JSON.stringify(error)}</div>
            </div>
          )}
          {data && filteredRows.length === 0 && (
            <div className="p-10 text-center text-sm text-slate-400">Nenhum casal encontrado com esses filtros.</div>
          )}
          {data && filteredRows.length > 0 && (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
                <tr className="text-left text-slate-600">
                  <th className="px-4 py-2 font-medium">Casal · Card</th>
                  <th className="px-2 py-2 font-medium">Etapa</th>
                  <th className="px-2 py-2 font-medium">Dono</th>
                  <th className="px-2 py-2 font-medium text-center">Valor</th>
                  <th className="px-2 py-2 font-medium text-center">Parado</th>
                  <th className="px-2 py-2 font-medium text-center">Active</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(r => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                    <td className="px-4 py-2.5">
                      <Link
                        to={`/cards/${r.id}`}
                        className="text-indigo-700 hover:underline font-medium block"
                        title={r.titulo}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {r.titulo.length > 48 ? r.titulo.slice(0, 48) + '…' : r.titulo}
                      </Link>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                        {r.contato_nome && <span className="font-medium text-slate-700">{r.contato_nome}</span>}
                        {r.contato_telefone && <span>· {r.contato_telefone}</span>}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {r.faixa && <span className="mr-2">{r.faixa}</span>}
                        {r.destino && <span className="mr-2">{r.destino}</span>}
                        {r.origem && r.origem !== 'Desconhecida' && <span className="mr-2">{r.origem}</span>}
                        {r.tipo_casamento && <span className="mr-2">· {r.tipo_casamento}</span>}
                      </div>
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="text-slate-700">{r.stage_name}</div>
                      <div className="text-[11px] text-slate-400">{r.phase_label}</div>
                    </td>
                    <td className="px-2 py-2.5 text-slate-700">{r.dono_nome ?? <span className="text-slate-400">—</span>}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      {r.valor_final ? formatCurrency(r.valor_final) : r.valor_estimado ? <span className="text-slate-500">~{formatCurrency(r.valor_estimado)}</span> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      <span className={r.dias_parado > 14 ? 'text-rose-600 font-medium' : r.dias_parado > 7 ? 'text-amber-600' : 'text-slate-500'}>
                        {r.dias_parado}d
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <OpenInACButton dealId={r.ac_deal_id} externalId={r.contato_external_id} contactName={r.contato_nome} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-5 py-3 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between gap-3">
          <span>
            {data && `Total: ${formatNumber(totalDisplay)}`}
            <span className="ml-2 text-slate-400">· a lista vem dos cards do CRM e respeita os filtros da aba; totais podem diferir levemente dos agregados (fonte Active)</span>
          </span>
          <button onClick={onClose} className="text-indigo-600 hover:text-indigo-700 font-medium shrink-0">Fechar</button>
        </div>
      </div>
    </>
  )
}
