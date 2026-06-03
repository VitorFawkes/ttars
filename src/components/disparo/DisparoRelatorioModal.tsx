import { useEffect, useMemo, useState } from 'react'
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
  sent:       { label: 'Enviada',   cls: 'text-ww-success' },
  pending:    { label: 'Na fila',   cls: 'text-ww-n500' },
  processing: { label: 'Enviando',  cls: 'text-ww-gold-ink' },
  failed:     { label: 'Falhou',    cls: 'text-ww-error' },
  opt_out:    { label: 'Saiu',      cls: 'text-ww-olive-ink' },
  cancelado:  { label: 'Cancelada', cls: 'text-ww-n400' },
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

  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!open) { setShown(false); return }
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [open])

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
    <div
      className={cn('fixed inset-0 z-50 flex items-center justify-center bg-ww-n700/35 backdrop-blur-sm p-4 transition-opacity duration-200 ease-ww-soft', shown ? 'opacity-100' : 'opacity-0')}
      onClick={onClose}
    >
      <div
        className={cn('bg-ww-paper rounded-2xl border border-ww-sand shadow-ww-modal w-full max-w-3xl max-h-[88vh] flex flex-col origin-center transition-[transform,opacity] duration-200 ease-ww-soft', shown ? 'scale-100 opacity-100' : 'scale-[0.97] opacity-0')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-7 py-5 border-b border-ww-sand">
          <div>
            <h2 className="font-ww-serif text-2xl leading-none text-ww-n700">{titulo}</h2>
            <p className="mt-1.5 text-sm text-ww-n500">Quem recebeu, quem está na fila e quem falhou.</p>
          </div>
          <button onClick={onClose} className="text-ww-n400 hover:text-ww-n700 rounded-lg p-1 transition-colors duration-150"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-7 py-3 border-b border-ww-sand/70 flex items-center gap-2 flex-wrap">
          {FILTERS.map((f) => {
            const n = f.key === 'all' ? itens.length : counts[f.key] ?? 0
            return (
              <button
                key={f.key} type="button" onClick={() => setFilter(f.key)}
                className={cn('inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-full border transition-[background-color,color,transform] duration-150 ease-ww-soft active:scale-[0.97]',
                  filter === f.key ? 'bg-ww-gold text-white border-ww-gold shadow-ww-lift' : 'bg-white text-ww-n600 border-ww-sand hover:bg-ww-cream')}
              >{f.label}<span className="tabular-nums opacity-80">{n}</span></button>
            )
          })}
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-10 text-center text-sm text-ww-n500">Carregando…</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-ww-n500">Nada aqui.</div>
          ) : (
            <div className="divide-y divide-ww-sand/60">
              {filtered.map((i) => {
                const meta = STATUS_LABEL[i.status]
                return (
                  <div key={i.id} className="px-7 py-3 flex items-center gap-3 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="text-ww-n700 tabular-nums">{formatPhoneBR(i.telefone_normalizado)}</div>
                      {i.erro_motivo && i.status === 'failed' && (
                        <div className="text-xs text-ww-error/80 truncate">{i.erro_motivo}</div>
                      )}
                    </div>
                    <span className={cn('text-xs font-semibold shrink-0', meta.cls)}>{meta.label}</span>
                    {(i.status === 'pending' || i.status === 'sent') && (
                      <button
                        type="button" title="Marcar que pediu pra sair" onClick={() => handleOptOut(i)} disabled={busyId === i.id}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-ww-sand text-ww-n400 hover:text-ww-olive-ink hover:border-ww-olive/30 hover:bg-ww-olive-soft active:scale-[0.96] transition-[transform,background-color,color] duration-150 ease-ww-soft disabled:opacity-50"
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
