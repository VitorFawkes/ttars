import { useState } from 'react'
import { Gift, Plus, Loader2, AlertTriangle, Trash2, ChevronDown, ChevronRight, User, Calendar, Check, Clock, Truck, PackageCheck } from 'lucide-react'
import { SectionCollapseToggle } from './DynamicSectionWidget'
import { useCardGifts, useGiftAssignment, getNextStatus, getContactDisplayName } from '@/hooks/useCardGifts'
import type { GiftAssignment } from '@/hooks/useCardGifts'
import type { InventoryProduct } from '@/hooks/useInventoryProducts'
import { useCardPeople } from '@/hooks/useCardPeople'
import type { Database } from '@/database.types'
import GiftStatusTracker from './gifts/GiftStatusTracker'
import GiftItemPicker from './gifts/GiftItemPicker'
import GiftItemRow from './gifts/GiftItemRow'
import GiftDeliveryInfo from './gifts/GiftDeliveryInfo'
import GiftBudgetSummary from './gifts/GiftBudgetSummary'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type Card = Database['public']['Tables']['cards']['Row']

interface GiftsWidgetProps {
    cardId: string
    card: Card
    isExpanded?: boolean
    onToggleCollapse?: () => void
}

const STATUS_ICON: Record<string, typeof Clock> = {
    pendente: Clock,
    preparando: PackageCheck,
    enviado: Truck,
    entregue: Check,
}

const STATUS_COLOR: Record<string, string> = {
    pendente: 'bg-slate-100 text-slate-600',
    preparando: 'bg-amber-100 text-amber-700',
    enviado: 'bg-blue-100 text-blue-700',
    entregue: 'bg-emerald-100 text-emerald-700',
    cancelado: 'bg-red-100 text-red-700',
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function GiftsWidget({ cardId, card: _card, isExpanded, onToggleCollapse }: GiftsWidgetProps) {
    const {
        assignments,
        isLoading,
        createAssignment,
        updateShipDate,
        updateStatus,
        deleteAssignment,
        totalItems,
        totalCost,
        statusCounts,
    } = useCardGifts(cardId)

    const { people, isLoading: loadingPeople } = useCardPeople(cardId)

    const [expandedId, setExpandedId] = useState<string | null>(null)

    // Contacts that don't have a gift yet
    const contactsWithGift = new Set(assignments.map(a => a.contato_id).filter(Boolean))
    const contactsWithoutGift = (people || []).filter(p => !contactsWithGift.has(p.id))

    const handleCreate = async (contatoId: string, contatoName: string) => {
        try {
            const result = await createAssignment.mutateAsync({ contatoId, contatoName })
            setExpandedId(result.id)
            toast.success(`Presente criado para ${contatoName}`)
        } catch {
            toast.error('Erro ao criar presente')
        }
    }

    const formatBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

    return (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-pink-50">
                <div className="flex items-center gap-2">
                    <Gift className="h-4 w-4 text-pink-700" />
                    <h3 className="text-sm font-semibold text-pink-700">
                        Presentes
                        {assignments.length > 0 && ` (${assignments.length})`}
                    </h3>
                </div>
                {onToggleCollapse && (
                    <SectionCollapseToggle isExpanded={!!isExpanded} onToggle={onToggleCollapse} />
                )}
            </div>

            <div className="p-4 space-y-3">
                {(isLoading || loadingPeople) ? (
                    <div className="flex items-center justify-center py-6">
                        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                    </div>
                ) : (
                    <>
                        {/* Summary bar */}
                        {assignments.length > 0 && (
                            <div className="flex items-center gap-2 flex-wrap">
                                {Object.entries(statusCounts).map(([status, count]) => {
                                    const Icon = STATUS_ICON[status] || Clock
                                    return (
                                        <span key={status} className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium', STATUS_COLOR[status] || 'bg-slate-100 text-slate-600')}>
                                            <Icon className="h-3 w-3" />
                                            {count} {status}
                                        </span>
                                    )
                                })}
                                <span className="text-xs text-slate-400 ml-auto">
                                    {totalItems} itens · {formatBRL(totalCost)}
                                </span>
                            </div>
                        )}

                        {/* Per-contact assignments */}
                        {assignments.map(assignment => (
                            <ContactGiftCard
                                key={assignment.id}
                                assignment={assignment}
                                cardId={cardId}
                                isOpen={expandedId === assignment.id}
                                onToggle={() => setExpandedId(expandedId === assignment.id ? null : assignment.id)}
                                onAdvance={async () => {
                                    const next = getNextStatus(assignment.status)
                                    if (!next) return
                                    try {
                                        await updateStatus.mutateAsync({ assignmentId: assignment.id, newStatus: next, items: assignment.items })
                                        toast.success(`Status atualizado para ${next}`)
                                    } catch { toast.error('Erro ao atualizar status') }
                                }}
                                onCancel={async () => {
                                    try {
                                        if (!assignment.items?.length) {
                                            await deleteAssignment.mutateAsync({ assignmentId: assignment.id, tarefaId: assignment.tarefa_id })
                                        } else {
                                            await updateStatus.mutateAsync({ assignmentId: assignment.id, newStatus: 'cancelado', items: assignment.items })
                                            toast.success('Presente cancelado. Estoque devolvido.')
                                        }
                                    } catch { toast.error('Erro ao cancelar') }
                                }}
                                onShipDateChange={async (date) => {
                                    try {
                                        await updateShipDate.mutateAsync({
                                            assignmentId: assignment.id,
                                            date,
                                            contatoName: getContactDisplayName(assignment.contato),
                                            currentTarefaId: assignment.tarefa_id,
                                        })
                                        toast.success(date ? 'Data de envio definida' : 'Data de envio removida')
                                    } catch { toast.error('Erro ao atualizar data') }
                                }}
                                isUpdating={updateStatus.isPending || deleteAssignment.isPending || updateShipDate.isPending}
                            />
                        ))}

                        {/* Contacts without gifts */}
                        {contactsWithoutGift.length > 0 && (
                            <div className="space-y-1.5">
                                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Adicionar presente para</p>
                                {contactsWithoutGift.map(person => (
                                    <button
                                        key={person.id}
                                        onClick={() => handleCreate(person.id, `${person.nome}${person.sobrenome ? ' ' + person.sobrenome : ''}`)}
                                        disabled={createAssignment.isPending}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 border border-dashed border-slate-200 rounded-lg hover:border-pink-300 hover:bg-pink-50/50 transition-colors text-left group"
                                    >
                                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-400 group-hover:bg-pink-100 group-hover:text-pink-600 flex-shrink-0">
                                            <User className="h-3.5 w-3.5" />
                                        </div>
                                        <span className="text-sm text-slate-600 group-hover:text-pink-700 font-medium flex-1">
                                            {person.nome}{person.sobrenome ? ` ${person.sobrenome}` : ''}
                                        </span>
                                        <Plus className="h-3.5 w-3.5 text-slate-300 group-hover:text-pink-500" />
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Empty state when no people at all */}
                        {!people?.length && assignments.length === 0 && (
                            <div className="text-center py-6">
                                <Gift className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                                <p className="text-sm text-slate-500">Adicione contatos ao card para configurar presentes</p>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}

/** Expandable card for one contact's gift assignment */
function ContactGiftCard({
    assignment,
    cardId,
    isOpen,
    onToggle,
    onAdvance,
    onCancel,
    onShipDateChange,
    isUpdating,
}: {
    assignment: GiftAssignment
    cardId: string
    isOpen: boolean
    onToggle: () => void
    onAdvance: () => void
    onCancel: () => void
    onShipDateChange: (date: string | null) => void
    isUpdating: boolean
}) {
    const ops = useGiftAssignment(assignment.id, cardId)
    const [confirmCancel, setConfirmCancel] = useState(false)
    const [showDelivery, setShowDelivery] = useState(false)

    const hasItems = (assignment.items?.length ?? 0) > 0
    const isReadOnly = assignment.status === 'enviado' || assignment.status === 'entregue' || assignment.status === 'cancelado'
    const nextStatus = getNextStatus(assignment.status)
    const itemCost = assignment.items?.reduce((s, i) => s + i.quantity * i.unit_price_snapshot, 0) ?? 0
    const contactName = getContactDisplayName(assignment.contato)

    const StatusIcon = STATUS_ICON[assignment.status] || Clock

    const handleAddStock = async (product: InventoryProduct, quantity: number, unitPrice: number) => {
        try {
            await ops.addItem.mutateAsync({ productId: product.id, quantity, unitPrice })
            toast.success(`${product.name} adicionado`)
        } catch { toast.error('Erro ao adicionar item') }
    }

    const handleAddCustom = async (name: string, unitPrice: number, quantity: number) => {
        try {
            await ops.addCustomItem.mutateAsync({ customName: name, quantity, unitPrice })
            toast.success(`${name} adicionado`)
        } catch { toast.error('Erro ao adicionar item') }
    }

    const handleSaveDelivery = async (data: Parameters<typeof ops.updateDelivery.mutateAsync>[0]) => {
        try {
            await ops.updateDelivery.mutateAsync(data)
            toast.success('Informações de entrega salvas')
        } catch { toast.error('Erro ao salvar entrega') }
    }

    return (
        <div className={cn(
            'border rounded-xl overflow-hidden transition-colors',
            assignment.status === 'cancelado' ? 'border-red-200 bg-red-50/30' :
            assignment.status === 'entregue' ? 'border-emerald-200 bg-emerald-50/30' :
            'border-slate-200'
        )}>
            {/* Collapsed header */}
            <button
                onClick={onToggle}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50/50 transition-colors text-left"
            >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-pink-100 text-pink-600 flex-shrink-0 text-xs font-bold">
                    {contactName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{contactName}</p>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                        {hasItems && <span>{assignment.items.length} itens</span>}
                        {hasItems && <span>·</span>}
                        {hasItems && <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(itemCost)}</span>}
                        {assignment.scheduled_ship_date && (
                            <>
                                <span>·</span>
                                <Calendar className="h-3 w-3" />
                                <span>{new Date(assignment.scheduled_ship_date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                            </>
                        )}
                    </div>
                </div>
                <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium', STATUS_COLOR[assignment.status])}>
                    <StatusIcon className="h-3 w-3" />
                    {assignment.status}
                </span>
                {isOpen ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
            </button>

            {/* Expanded content */}
            {isOpen && (
                <div className="border-t border-slate-100 p-3 space-y-3">
                    {/* Status tracker */}
                    <GiftStatusTracker
                        status={assignment.status}
                        nextStatus={nextStatus}
                        onAdvance={onAdvance}
                        onCancel={() => setConfirmCancel(true)}
                        isUpdating={isUpdating}
                        shippedAt={assignment.shipped_at}
                        deliveredAt={assignment.delivered_at}
                    />

                    {/* Scheduled ship date */}
                    <div className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                        <label className="text-xs font-medium text-slate-500">Data prevista de envio:</label>
                        <input
                            type="date"
                            value={assignment.scheduled_ship_date || ''}
                            onChange={e => onShipDateChange(e.target.value || null)}
                            disabled={isReadOnly}
                            className="text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                        />
                    </div>

                    {/* Cancel confirm */}
                    {confirmCancel && (
                        <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                            <p className="text-sm text-red-700 flex-1">
                                {hasItems ? 'Cancelar presente? Os itens do estoque serão devolvidos.' : 'Remover presente?'}
                            </p>
                            <button
                                onClick={() => { onCancel(); setConfirmCancel(false) }}
                                disabled={isUpdating}
                                className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
                            >
                                {isUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                Confirmar
                            </button>
                            <button onClick={() => setConfirmCancel(false)} className="text-xs text-slate-500 hover:text-slate-700 font-medium">Não</button>
                        </div>
                    )}

                    {/* Items */}
                    {hasItems && (
                        <div className="space-y-2">
                            {assignment.items.map(item => (
                                <GiftItemRow
                                    key={item.id}
                                    item={item}
                                    onRemove={() => ops.removeItem.mutate(item)}
                                    onUpdateNotes={(notes) => ops.updateItemNotes.mutate({ itemId: item.id, notes })}
                                    isRemoving={ops.removeItem.isPending}
                                    readOnly={isReadOnly}
                                />
                            ))}
                        </div>
                    )}

                    {/* Picker */}
                    {!isReadOnly && (
                        <GiftItemPicker
                            onAddStock={handleAddStock}
                            onAddCustom={handleAddCustom}
                            isAdding={ops.addItem.isPending || ops.addCustomItem.isPending}
                            existingProductIds={assignment.items?.map(i => i.product_id).filter(Boolean) as string[] ?? []}
                        />
                    )}

                    {/* Budget summary */}
                    {hasItems && (
                        <GiftBudgetSummary
                            totalCost={itemCost}
                            budget={assignment.budget}
                            itemCount={assignment.items.length}
                        />
                    )}

                    {/* Delivery info toggle */}
                    <div>
                        <button
                            onClick={() => setShowDelivery(!showDelivery)}
                            className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                        >
                            {showDelivery ? 'Ocultar' : 'Mostrar'} info de entrega
                        </button>
                        {showDelivery && (
                            <div className="mt-3">
                                <GiftDeliveryInfo
                                    deliveryAddress={assignment.delivery_address}
                                    deliveryDate={assignment.delivery_date}
                                    deliveryMethod={assignment.delivery_method}
                                    budget={assignment.budget}
                                    notes={assignment.notes}
                                    onSave={handleSaveDelivery}
                                    isSaving={ops.updateDelivery.isPending}
                                    readOnly={isReadOnly}
                                />
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
