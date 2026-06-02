import { useMemo, useState } from 'react'
import { X, Ban, Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { formatPhoneBR } from '../../utils/normalizePhone'
import { useDisparoFila } from '../../hooks/disparo/useDisparos'
import { useDisparoActions } from '../../hooks/disparo/useDisparoActions'
import type { DisparoFilaItem, DisparoFilaStatus } from '../../hooks/disparo/types'

interface Props {
  open: boolean
  campaignId: string
  titulo: string
  onClose: () => void
}

const STATUS_LABEL: Record<DisparoFilaStatus, { label: string; cls: string }> = {
  sent:       { label: 'Enviada',   cls: 'text-emerald-600' },
  pending:    { label: 'Na fila',   cls: 'text-slate-500' },
  processing: { label: 'Enviando',  cls: 'text-indigo-600' },
  failed:     { label: 'Falhou',    cls: 'text-rose-600' },
  opt_out:    { label: 'Saiu',      cls: 'text-amber-600' },
  cancelado:  { label: 'Cancelada', cls: 'text-slate-400' },
}

const FILTERS: { key: 'all' | DisparoFilaStatus; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'sent', label: 'Enviadas' },
  { key: 'pending', label: 'Na fila' },
  { key: 'failed', label: 'Falhas' },
  { key: 'opt_out', label: 'Saíram' },
]

export function DisparoRelatorioModal({ open, campaignId, titulo, onClose }: Props) {
  const { data: itens = [], isLoading } = useDisparoFila(open ? campaignId : null)
  const { marcarOptOut } = useDisparoActions()
  const [filter, setFilter] = useState<'all' | DisparoFilaStatus>('all')
  const [busyId, setBusyId] = useState<string | null>(null)

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const i of itens) c[i.status] = (c[i.status] ?? 0) + 1
    return c
  }, [itens])

  const filtered = useMemo(
    () => (filter === 'all' ? itens : itens.filter((i) => i.status === filter)),
    [itens, filter],
  )

  const handleOptOut = async (item: DisparoFilaItem) => {
    setBusyId(item.id)
    try { await marcarOptOut(campaignId, item.contact_id) } finally { setBusyId(null) }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{titulo}</h2>
            <p className="text-xs text-slate-500 mt-0.5">Relatório do disparo</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-3 border-b border-slate-100 flex items-center gap-1.5 flex-wrap">
          {FILTERS.map((f) => {
            const n = f.key === 'all' ? itens.length : counts[f.key] ?? 0
            return (
              <button
                key={f.key} type="button" onClick={() => setFilter(f.key)}
                className={cn('inline-flex items-center gap-1.5 h-7 px-2.5 text-xs font-medium rounded-full border transition-colors',
                  filter === f.key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')}
              >{f.label}<span className="tabular-nums opacity-80">{n}</span></button>
            )
          })}
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-slate-500">Carregando…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">Nada aqui.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map((i) => {
                const meta = STATUS_LABEL[i.status]
                return (
                  <div key={i.id} className="px-6 py-2.5 flex items-center gap-3 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="text-slate-800 tabular-nums">{formatPhoneBR(i.telefone_normalizado)}</div>
                      {i.erro_motivo && i.status === 'failed' && (
                        <div className="text-xs text-rose-500 truncate">{i.erro_motivo}</div>
                      )}
                    </div>
                    <span className={cn('text-xs font-medium shrink-0', meta.cls)}>{meta.label}</span>
                    {(i.status === 'pending' || i.status === 'sent') && (
                      <button
                        type="button" title="Marcar que pediu pra sair" onClick={() => handleOptOut(i)} disabled={busyId === i.id}
                        className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-slate-200 text-slate-400 hover:text-amber-600 hover:border-amber-200 hover:bg-amber-50 disabled:opacity-50"
                      >{busyId === i.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}</button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
