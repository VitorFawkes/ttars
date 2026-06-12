import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useWwDrillCasais, type DrillFilters, type WwDrillCasalRow } from '@/hooks/analyticsWeddings/useWw2'
import { formatCurrency, formatNumber } from '../lib/format'
import { OpenInACButton } from './OpenInACButton'

export type DrillContext = DrillFilters & { title: string; subtitle?: string }

// Situação do casal no funil — derivada dos marcos (mais avançado vence)
function etapaDoCasal(r: WwDrillCasalRow): { label: string; date: string | null; cls: string } {
  if (r.ganho) return { label: 'Ganhou', date: r.ganho_at, cls: 'bg-emerald-50 text-emerald-700' }
  if (r.is_perdido) return { label: 'Perdido', date: null, cls: 'bg-rose-50 text-rose-600' }
  if (r.fez_closer_at) return { label: 'Fez reunião closer', date: r.fez_closer_at, cls: 'bg-ww-cream text-ww-gold-ink' }
  if (r.agendou_closer_at) return { label: 'Marcou closer', date: r.agendou_closer_at, cls: 'bg-ww-cream text-ww-gold-ink' }
  if (r.fez_sdr_at) return { label: 'Fez 1ª reunião', date: r.fez_sdr_at, cls: 'bg-slate-100 text-slate-600' }
  if (r.agendou_sdr_at) return { label: 'Marcou 1ª reunião', date: r.agendou_sdr_at, cls: 'bg-slate-100 text-slate-600' }
  return { label: 'Lead', date: r.lead_created_at, cls: 'bg-slate-50 text-slate-500' }
}

const fmtData = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : null)

export function DrillDrawer({ ctx, onClose }: { ctx: DrillContext | null; onClose: () => void }) {
  const { data, isLoading, error } = useWwDrillCasais(ctx)

  // Esc fecha o drawer
  useEffect(() => {
    if (!ctx) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [ctx, onClose])

  if (!ctx) return null

  const rows = data?.rows ?? []

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
                {formatNumber(data.total)} {data.total === 1 ? 'casal encontrado' : 'casais encontrados'}
                {data.total > rows.length && ` · mostrando primeiros ${rows.length}`}
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
          {data && rows.length === 0 && (
            <div className="p-10 text-center text-sm text-slate-400">Nenhum casal encontrado com esses filtros.</div>
          )}
          {data && rows.length > 0 && (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
                <tr className="text-left text-slate-600">
                  <th className="px-4 py-2 font-medium">Casal</th>
                  <th className="px-2 py-2 font-medium">Situação</th>
                  <th className="px-2 py-2 font-medium">Consultor</th>
                  <th className="px-2 py-2 font-medium text-right">Valor</th>
                  <th className="px-2 py-2 font-medium text-right">Entrou</th>
                  <th className="px-2 py-2 font-medium text-center">Active</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const titulo = r.deal_title || r.contato_nome || 'Casal sem nome'
                  const etapa = etapaDoCasal(r)
                  return (
                    <tr key={r.contact_id} className="border-b border-slate-100 hover:bg-slate-50/60">
                      <td className="px-4 py-2.5">
                        {r.card_id ? (
                          <Link
                            to={`/cards/${r.card_id}`}
                            className="text-indigo-700 hover:underline font-medium block"
                            title={titulo}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {titulo.length > 48 ? titulo.slice(0, 48) + '…' : titulo}
                          </Link>
                        ) : (
                          <span className="font-medium text-slate-800 block" title={titulo}>
                            {titulo.length > 48 ? titulo.slice(0, 48) + '…' : titulo}
                          </span>
                        )}
                        {(r.contato_nome || r.contato_telefone) && (
                          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                            {r.contato_nome && <span className="font-medium text-slate-700">{r.contato_nome}</span>}
                            {r.contato_telefone && <span>· {r.contato_telefone}</span>}
                          </div>
                        )}
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {r.faixa && <span className="mr-2">{r.faixa}</span>}
                          {r.destino && <span className="mr-2">{r.destino}</span>}
                          {r.convidados && <span className="mr-2">{r.convidados} conv.</span>}
                          {r.origem && r.origem !== 'Desconhecida' && <span className="mr-2">{r.origem}</span>}
                          {r.tipo && <span className="mr-2">· {r.tipo}</span>}
                        </div>
                        {/* Motivo só quando o casal está PERDIDO — casal com cadastro antigo morto
                            (ex: perdeu em 2024, voltou e fechou em 2026) carrega o motivo velho no
                            agregado; mostrar isso num casal ganho confunde (caso Larissa, deal 28884). */}
                        {r.motivo_perda && r.is_perdido && !r.ganho && (
                          <div className="text-[10px] text-rose-500/80 mt-0.5" title={`Motivo de perda: ${r.motivo_perda}`}>
                            ✕ {r.motivo_perda.length > 56 ? r.motivo_perda.slice(0, 56) + '…' : r.motivo_perda}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium whitespace-nowrap ${etapa.cls}`}>{etapa.label}</span>
                        {etapa.date && <div className="text-[10px] text-slate-400 mt-0.5 tabular-nums">{fmtData(etapa.date)}</div>}
                      </td>
                      <td className="px-2 py-2.5 text-slate-700">{r.consultor_nome ?? <span className="text-slate-400">—</span>}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">
                        {r.valor_final ? formatCurrency(r.valor_final) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-slate-500">{fmtData(r.lead_created_at) ?? '—'}</td>
                      <td className="px-2 py-2.5 text-center">
                        <OpenInACButton dealId={r.ac_deal_id} externalId={r.contact_id} contactName={r.contato_nome ?? r.deal_title} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-5 py-3 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between gap-3">
          <span>
            {data && `Total: ${formatNumber(data.total)}`}
            <span className="ml-2 text-slate-400">· lista alinhada à fonte Active (mesma conta dos agregados); nome em azul abre o card no CRM</span>
          </span>
          <button onClick={onClose} className="text-indigo-600 hover:text-indigo-700 font-medium shrink-0">Fechar</button>
        </div>
      </div>
    </>
  )
}
