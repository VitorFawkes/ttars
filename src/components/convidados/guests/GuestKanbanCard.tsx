import { memo, useState, type MouseEvent } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { Pencil, Trash2, Phone, Mail, X, Check, Heart } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useDeleteGuest } from '../../../hooks/convidados/useGuestMutations'
import { formatPhoneBR } from '../../../utils/normalizePhone'
import type { Guest, GuestWithWedding, StatusRSVP } from '../../../hooks/convidados/types'
import { GuestDetailModal } from '../GuestDetailModal'

function hasWeddingTitle(g: Guest | GuestWithWedding): g is GuestWithWedding {
  return typeof (g as GuestWithWedding).card_titulo === 'string'
}

const ACCENT: Record<StatusRSVP, string> = {
  sem_reacao: 'border-l-slate-300',
  intencao: 'border-l-sky-400',
  confirmado: 'border-l-emerald-400',
  nao_vai: 'border-l-rose-400',
}

interface GuestKanbanCardProps {
  guest: Guest | GuestWithWedding
  isOverlay?: boolean
}

function GuestKanbanCardBase({ guest, isOverlay = false }: GuestKanbanCardProps) {
  const weddingTitle = hasWeddingTitle(guest) ? guest.card_titulo : null
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const deleteGuest = useDeleteGuest()

  const dnd = useDraggable({
    id: `guest:${guest.id}`,
    data: { guest },
    disabled: isOverlay,
  })

  const stop = (e: MouseEvent) => e.stopPropagation()
  const stopPointer = (e: React.PointerEvent) => e.stopPropagation()

  const fullName = `${guest.nome}${guest.sobrenome ? ` ${guest.sobrenome}` : ''}`

  return (
    <>
      <article
        ref={!isOverlay ? dnd.setNodeRef : undefined}
        className={cn(
          'bg-white border border-slate-200 border-l-4 shadow-sm rounded-lg p-3 flex flex-col gap-1.5 transition-shadow',
          ACCENT[guest.status_rsvp],
          !isOverlay && 'cursor-grab active:cursor-grabbing hover:shadow-md',
          dnd.isDragging && !isOverlay && 'opacity-40',
          isOverlay && 'shadow-xl ring-2 ring-indigo-300',
        )}
        {...(!isOverlay ? { ...dnd.listeners, ...dnd.attributes } : {})}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold text-slate-900 break-words" title={fullName}>
              {fullName}
            </h4>
            {weddingTitle && (
              <p className="text-[10.5px] text-slate-500 inline-flex items-center gap-1 truncate mt-0.5" title={weddingTitle}>
                <Heart className="w-2.5 h-2.5 shrink-0 text-rose-400" />
                <span className="truncate">{weddingTitle}</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onPointerDown={stopPointer}
              onMouseDown={stop}
              onClick={(e) => {
                e.stopPropagation()
                setEditing(true)
              }}
              className="h-6 w-6 inline-flex items-center justify-center rounded text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50"
              aria-label="Editar convidado"
              title="Editar"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <div className="relative">
              <button
                type="button"
                onPointerDown={stopPointer}
                onMouseDown={stop}
                onClick={(e) => {
                  e.stopPropagation()
                  setConfirming(c => !c)
                }}
                className="h-6 w-6 inline-flex items-center justify-center rounded text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                aria-label="Excluir convidado"
                title="Excluir do casamento"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              {confirming && (
                <div
                  className="absolute right-0 top-full mt-1 z-30 w-52 bg-white border border-slate-200 shadow-lg rounded-md p-2"
                  onPointerDown={stopPointer}
                  onMouseDown={stop}
                  onClick={stop}
                >
                  <p className="text-[11px] text-slate-700 mb-1.5">Remover do casamento?</p>
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setConfirming(false)
                      }}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] text-slate-600 hover:text-slate-900 rounded"
                    >
                      <X className="w-2.5 h-2.5" /> Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setConfirming(false)
                        deleteGuest.mutate({ id: guest.id })
                      }}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium text-white bg-rose-600 hover:bg-rose-700 rounded"
                    >
                      <Check className="w-2.5 h-2.5" /> OK
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        {(guest.telefone || guest.email) && (
          <div className="flex flex-col gap-0.5 text-[11px] text-slate-500">
            {guest.telefone && (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Phone className="w-3 h-3 shrink-0" />
                {formatPhoneBR(guest.telefone)}
              </span>
            )}
            {guest.email && (
              <span className="inline-flex items-center gap-1 truncate">
                <Mail className="w-3 h-3 shrink-0" />
                <span className="truncate">{guest.email}</span>
              </span>
            )}
          </div>
        )}
      </article>

      {editing && (
        <GuestDetailModal
          guest={guest}
          isOpen={editing}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  )
}

// memo: a lista renderiza milhares destes (cada um com useDraggable). Sem memo,
// qualquer re-render do board (busca, filtro, indicador de loading, drag) re-
// renderiza todos e trava a aba. O objeto `guest` é referencialmente estável
// (vem do cache do react-query), então a comparação rasa de props basta.
export const GuestKanbanCard = memo(GuestKanbanCardBase)
