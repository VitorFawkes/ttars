import { useDraggable } from '@dnd-kit/core'
import { Heart, Sparkles, Tag } from 'lucide-react'
import { cn } from '../../../lib/utils'
import type { ExtraStatus, GuestExtra } from '../../../hooks/convidados/types'

const ACCENT: Record<ExtraStatus, string> = {
  oferecido: 'border-l-slate-300',
  interessado: 'border-l-sky-400',
  confirmado: 'border-l-emerald-400',
  pago: 'border-l-indigo-500',
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function totalValor(g: GuestExtra): number {
  return g.itens.reduce((sum, it) => sum + (typeof it.valor === 'number' ? it.valor : 0), 0)
}

interface ExtrasKanbanCardProps {
  guest: GuestExtra
  onClick?: () => void
  isOverlay?: boolean
}

export function ExtrasKanbanCard({ guest, onClick, isOverlay = false }: ExtrasKanbanCardProps) {
  const dnd = useDraggable({
    id: `extra:${guest.guest_id}`,
    data: { guest },
    disabled: isOverlay,
  })

  const fullName = `${guest.nome}${guest.sobrenome ? ` ${guest.sobrenome}` : ''}`
  const total = totalValor(guest)
  const qtd = guest.itens.length

  return (
    <article
      ref={!isOverlay ? dnd.setNodeRef : undefined}
      onClick={onClick}
      className={cn(
        'bg-white border border-slate-200 border-l-4 shadow-sm rounded-lg p-3 flex flex-col gap-1.5 transition-shadow',
        ACCENT[guest.extras_status],
        !isOverlay && 'cursor-grab active:cursor-grabbing hover:shadow-md',
        dnd.isDragging && !isOverlay && 'opacity-40',
        isOverlay && 'shadow-xl ring-2 ring-indigo-300',
      )}
      {...(!isOverlay ? { ...dnd.listeners, ...dnd.attributes } : {})}
    >
      <div className="min-w-0">
        <h4 className="text-sm font-semibold text-slate-900 break-words" title={fullName}>
          {fullName}
        </h4>
        {guest.casamento_nome && (
          <p
            className="text-[10.5px] text-slate-500 inline-flex items-center gap-1 truncate mt-0.5"
            title={guest.casamento_nome}
          >
            <Heart className="w-2.5 h-2.5 shrink-0 text-rose-400" />
            <span className="truncate">{guest.casamento_nome}</span>
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          {qtd > 0 ? (
            <>
              <Tag className="w-3 h-3 shrink-0" />
              {qtd} {qtd === 1 ? 'extra' : 'extras'}
            </>
          ) : (
            <span className="inline-flex items-center gap-1 text-slate-400 italic">
              <Sparkles className="w-3 h-3 shrink-0" />
              sem extras ainda
            </span>
          )}
        </span>
        {total > 0 && (
          <span className="font-semibold text-slate-700 tabular-nums">{brl.format(total)}</span>
        )}
      </div>
    </article>
  )
}
