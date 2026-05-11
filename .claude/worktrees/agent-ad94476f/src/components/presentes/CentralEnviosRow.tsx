import { useState } from 'react'
import { ChevronDown, ExternalLink, AlertTriangle, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import type { GiftAssignmentFull } from '@/hooks/useAllGiftAssignments'
import { getNextStatus, getGiftItemName } from '@/hooks/useCardGifts'
import GiftStatusTracker from '@/components/card/gifts/GiftStatusTracker'
import GiftItemRow from '@/components/card/gifts/GiftItemRow'
import GiftDeliveryInfo from '@/components/card/gifts/GiftDeliveryInfo'
import GiftBudgetSummary from '@/components/card/gifts/GiftBudgetSummary'
import { useGiftAssignment } from '@/hooks/useCardGifts'

const formatBRL = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

interface CentralEnviosRowProps {
    assignment: GiftAssignmentFull
    isSelected: boolean
    onToggleSelect: () => void
    onStatusChange: () => void
}

export default function CentralEnviosRow({ assignment, isSelected, onToggleSelect, onStatusChange }: CentralEnviosRowProps) {
    const [expanded, setExpanded] = useState(false)
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
    const [confirmCancel, setConfirmCancel] = useState(false)
    const navigate = useNavigate()

    const giftOps = useGiftAssignment(assignment.id, assignment.card_id || '')

    const contatoNome = assignment.contato
        ? (assignment.contato.sobrenome ? `${assignment.contato.nome} ${assignment.contato.sobrenome}` : assignment.contato.nome)
        : 'Sem contato'

    const initials = assignment.contato
        ? `${assignment.contato.nome[0]}${(assignment.contato.sobrenome?.[0] || '').toUpperCase()}`.toUpperCase()
        : '??'

    const totalCost = assignment.items?.reduce((s, i) => s + i.quantity * i.unit_price_snapshot, 0) ?? 0
    const itemCount = assignment.items?.length ?? 0
    const itemSummary = assignment.items?.slice(0, 2).map(i => getGiftItemName(i)).join(', ') || 'Sem itens'
    const extraItems = itemCount > 2 ? ` +${itemCount - 2}` : ''

    const nextStatus = getNextStatus(assignment.status)
    const isReadOnly = assignment.status === 'enviado' || assignment.status === 'entregue' || assignment.status === 'cancelado'

    const isOverdue = (assignment.status === 'pendente' || assignment.status === 'preparando') &&
        assignment.scheduled_ship_date &&
        assignment.scheduled_ship_date < new Date().toISOString().split('T')[0]

    const handleAdvanceStatus = async () => {
        if (!nextStatus) return
        setIsUpdatingStatus(true)
        try {
            void 0 // supabase already imported
            const updates: Record<string, unknown> = {
                status: nextStatus,
                updated_at: new Date().toISOString(),
            }
            if (nextStatus === 'enviado') {
                updates.shipped_at = new Date().toISOString()
            } else if (nextStatus === 'entregue') {
                updates.delivered_at = new Date().toISOString()
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any).from('card_gift_assignments').update(updates).eq('id', assignment.id)
            onStatusChange()
        } finally {
            setIsUpdatingStatus(false)
        }
    }

    const handleCancel = async () => {
        setIsUpdatingStatus(true)
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sb = supabase as any; void sb
            // Return stock
            for (const item of assignment.items || []) {
                if (!item.product_id) continue
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (supabase as any).from('inventory_movements').insert({
                    product_id: item.product_id,
                    quantity: item.quantity,
                    movement_type: 'devolucao',
                    reason: `Cancelamento — ${contatoNome}`,
                    reference_id: item.id,
                })
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any).from('card_gift_assignments')
                .update({ status: 'cancelado', updated_at: new Date().toISOString() })
                .eq('id', assignment.id)
            onStatusChange()
        } finally {
            setIsUpdatingStatus(false)
            setConfirmCancel(false)
        }
    }

    return (
        <div className={cn(
            'border rounded-xl transition-colors',
            isOverdue ? 'border-red-300 bg-red-50/50' : 'border-slate-200 bg-white',
            assignment.status === 'cancelado' && 'opacity-60',
        )}>
            {/* Main row */}
            <div className="flex items-center gap-3 px-4 py-3">
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={onToggleSelect}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />

                {/* Avatar */}
                <div className="h-8 w-8 rounded-full bg-pink-100 flex items-center justify-center shrink-0">
                    <span className="text-xs font-medium text-pink-700">{initials}</span>
                </div>

                {/* Contact */}
                <div className="min-w-0 w-36">
                    <p className="text-sm font-medium text-slate-900 truncate">{contatoNome}</p>
                </div>

                {/* Type badge */}
                <span className={cn(
                    'px-2 py-0.5 text-[10px] font-medium rounded-full shrink-0',
                    assignment.gift_type === 'premium' ? 'bg-pink-100 text-pink-700' : 'bg-indigo-100 text-indigo-700'
                )}>
                    {assignment.gift_type === 'premium' ? 'Premium' : 'Viagem'}
                </span>

                {/* Occasion / Card */}
                <div className="min-w-0 w-40">
                    {assignment.gift_type === 'trip' && assignment.card ? (
                        <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/cards/${assignment.card!.id}`) }}
                            className="text-xs text-indigo-600 hover:text-indigo-700 truncate flex items-center gap-1"
                        >
                            {assignment.card.titulo}
                            <ExternalLink className="h-3 w-3 shrink-0" />
                        </button>
                    ) : assignment.occasion ? (
                        <span className="text-xs text-slate-500 truncate block">{assignment.occasion}</span>
                    ) : (
                        <span className="text-xs text-slate-400">—</span>
                    )}
                </div>

                {/* Items summary */}
                <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-600 truncate">{itemSummary}{extraItems}</p>
                </div>

                {/* Cost */}
                <span className="text-sm font-medium text-slate-700 tabular-nums shrink-0 w-24 text-right">
                    {formatBRL(totalCost)}
                </span>

                {/* Ship date */}
                <div className="w-24 shrink-0 text-right">
                    {assignment.scheduled_ship_date ? (
                        <span className={cn(
                            'text-xs',
                            isOverdue ? 'text-red-600 font-medium' : 'text-slate-500'
                        )}>
                            {isOverdue && <AlertTriangle className="h-3 w-3 inline mr-1" />}
                            {new Date(assignment.scheduled_ship_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                        </span>
                    ) : (
                        <span className="text-xs text-slate-400">—</span>
                    )}
                </div>

                {/* Status badge */}
                <span className={cn(
                    'px-2.5 py-1 text-[10px] font-medium rounded-full shrink-0',
                    assignment.status === 'pendente' && 'bg-slate-100 text-slate-600',
                    assignment.status === 'preparando' && 'bg-amber-100 text-amber-700',
                    assignment.status === 'enviado' && 'bg-blue-100 text-blue-700',
                    assignment.status === 'entregue' && 'bg-emerald-100 text-emerald-700',
                    assignment.status === 'cancelado' && 'bg-red-100 text-red-600',
                )}>
                    {assignment.status.charAt(0).toUpperCase() + assignment.status.slice(1)}
                </span>

                {/* Quick advance button */}
                {nextStatus && (
                    <button
                        onClick={(e) => { e.stopPropagation(); handleAdvanceStatus() }}
                        disabled={isUpdatingStatus}
                        className="px-2.5 py-1 text-[10px] font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shrink-0"
                    >
                        {isUpdatingStatus ? <Loader2 className="h-3 w-3 animate-spin" /> : `→ ${nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1)}`}
                    </button>
                )}

                {/* Expand */}
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="p-1 rounded hover:bg-slate-100 transition-colors shrink-0"
                >
                    <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', expanded && 'rotate-180')} />
                </button>
            </div>

            {/* Expanded details */}
            {expanded && (
                <div className="border-t border-slate-100 px-4 py-4 space-y-4">
                    {/* Status tracker */}
                    <GiftStatusTracker
                        status={assignment.status}
                        nextStatus={nextStatus}
                        onAdvance={handleAdvanceStatus}
                        onCancel={() => setConfirmCancel(true)}
                        isUpdating={isUpdatingStatus}
                        shippedAt={assignment.shipped_at}
                        deliveredAt={assignment.delivered_at}
                    />

                    {/* Cancel confirmation */}
                    {confirmCancel && (
                        <div className="flex items-center gap-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                            <span className="text-xs text-red-700 flex-1">Cancelar presente? Os itens do estoque serão devolvidos.</span>
                            <button onClick={handleCancel} disabled={isUpdatingStatus} className="px-2.5 py-1 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                                {isUpdatingStatus ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirmar'}
                            </button>
                            <button onClick={() => setConfirmCancel(false)} className="text-xs text-slate-500 hover:text-slate-700">Não</button>
                        </div>
                    )}

                    {/* Items */}
                    {assignment.items?.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-xs font-medium text-slate-500">Itens ({itemCount})</p>
                            {assignment.items.map(item => (
                                <GiftItemRow
                                    key={item.id}
                                    item={item}
                                    onRemove={() => giftOps.removeItem.mutate(item)}
                                    onUpdateNotes={(notes) => giftOps.updateItemNotes.mutate({ itemId: item.id, notes })}
                                    isRemoving={giftOps.removeItem.isPending}
                                    readOnly={isReadOnly}
                                />
                            ))}
                        </div>
                    )}

                    {/* Budget summary */}
                    {itemCount > 0 && (
                        <GiftBudgetSummary
                            totalCost={totalCost}
                            budget={assignment.budget}
                            itemCount={itemCount}
                        />
                    )}

                    {/* Delivery info */}
                    <GiftDeliveryInfo
                        deliveryAddress={assignment.delivery_address}
                        deliveryDate={assignment.delivery_date}
                        deliveryMethod={assignment.delivery_method}
                        budget={assignment.budget}
                        notes={assignment.notes}
                        onSave={(data) => giftOps.updateDelivery.mutate(data)}
                        isSaving={giftOps.updateDelivery.isPending}
                        readOnly={isReadOnly}
                    />

                    {/* Link to card */}
                    {assignment.card && (
                        <button
                            onClick={() => navigate(`/cards/${assignment.card!.id}`)}
                            className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                        >
                            <ExternalLink className="h-3 w-3" />
                            Abrir card: {assignment.card.titulo}
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}
