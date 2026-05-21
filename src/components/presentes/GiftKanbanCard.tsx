import { useDraggable } from '@dnd-kit/core'
import { Calendar, MessageSquare, Package, AlertTriangle, Crown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GiftAssignmentFull } from '@/hooks/useAllGiftAssignments'
import { getGiftItemName } from '@/hooks/useCardGifts'

const formatBRL = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

function formatDateBR(iso: string | null): string | null {
    if (!iso) return null
    const [y, m, d] = iso.slice(0, 10).split('-')
    if (!y || !m || !d) return null
    return `${d}/${m}`
}

interface Props {
    assignment: GiftAssignmentFull
    onOpen: () => void
    isOverlay?: boolean
}

export default function GiftKanbanCard({ assignment, onOpen, isOverlay = false }: Props) {
    const dnd = useDraggable({
        id: `gift:${assignment.id}`,
        data: { assignment },
        disabled: isOverlay,
    })

    const contatoNome = assignment.contato
        ? (assignment.contato.sobrenome ? `${assignment.contato.nome} ${assignment.contato.sobrenome}` : assignment.contato.nome)
        : 'Sem contato'

    const initials = assignment.contato
        ? `${assignment.contato.nome[0] || ''}${assignment.contato.sobrenome?.[0] || ''}`.toUpperCase()
        : '??'

    const itemCount = assignment.items?.length ?? 0
    const totalCost = assignment.items?.reduce((s, i) => s + i.quantity * i.unit_price_snapshot, 0) ?? 0
    const itemSummary = assignment.items?.slice(0, 2).map(getGiftItemName).join(', ') || 'Sem itens'
    const extraItems = itemCount > 2 ? ` +${itemCount - 2}` : ''

    const today = new Date().toISOString().split('T')[0]
    const isOverdue = (assignment.status === 'pendente' || assignment.status === 'preparando' || assignment.status === 'a_enviar') &&
        !!assignment.scheduled_ship_date &&
        assignment.scheduled_ship_date < today

    const hasNotes = !!assignment.notes?.trim()
    const cardTitulo = assignment.card?.titulo
    const occasion = assignment.occasion

    return (
        <article
            ref={!isOverlay ? dnd.setNodeRef : undefined}
            onClick={!isOverlay ? onOpen : undefined}
            className={cn(
                'bg-white border border-slate-200 shadow-sm rounded-lg p-3 flex flex-col gap-2 transition-shadow',
                !isOverlay && 'cursor-grab active:cursor-grabbing hover:shadow-md hover:border-slate-300',
                dnd.isDragging && !isOverlay && 'opacity-40',
                isOverlay && 'shadow-xl ring-2 ring-indigo-300 rotate-1',
            )}
            {...(!isOverlay ? { ...dnd.listeners, ...dnd.attributes } : {})}
        >
            <div className="flex items-start gap-2">
                <div className="h-8 w-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[11px] font-semibold shrink-0">
                    {initials}
                </div>
                <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-semibold text-slate-900 truncate" title={contatoNome}>
                        {contatoNome}
                    </h4>
                    {(cardTitulo || occasion) && (
                        <p className="text-[11px] text-slate-500 truncate flex items-center gap-1" title={cardTitulo || occasion || ''}>
                            {assignment.gift_type === 'premium' ? (
                                <Crown className="h-2.5 w-2.5 shrink-0 text-pink-500" />
                            ) : null}
                            <span className="truncate">{cardTitulo || occasion}</span>
                        </p>
                    )}
                </div>
                {isOverdue && (
                    <span title="Envio atrasado">
                        <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                    </span>
                )}
            </div>

            <p className="text-[11px] text-slate-600 truncate" title={itemSummary}>
                <Package className="h-2.5 w-2.5 inline-block mr-1 -mt-0.5 text-slate-400" />
                {itemSummary}{extraItems}
            </p>

            <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span className="tabular-nums font-medium text-slate-700">{formatBRL(totalCost)}</span>
                <div className="flex items-center gap-2">
                    {hasNotes && (
                        <span title="Tem observação">
                            <MessageSquare className="h-3 w-3 text-indigo-500" />
                        </span>
                    )}
                    {assignment.scheduled_ship_date && (
                        <span className="inline-flex items-center gap-0.5 tabular-nums">
                            <Calendar className="h-3 w-3" />
                            {formatDateBR(assignment.scheduled_ship_date)}
                        </span>
                    )}
                </div>
            </div>
        </article>
    )
}
