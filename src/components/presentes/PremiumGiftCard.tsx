import { useState } from 'react'
import { ChevronDown, AlertTriangle, Loader2, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import type { GiftAssignmentFull } from '@/hooks/useAllGiftAssignments'
import { getNextStatus } from '@/hooks/useCardGifts'
import { useGiftAssignment } from '@/hooks/useCardGifts'
import GiftStatusTracker from '@/components/card/gifts/GiftStatusTracker'
import GiftItemRow from '@/components/card/gifts/GiftItemRow'
import GiftItemPicker from '@/components/card/gifts/GiftItemPicker'
import GiftDeliveryInfo from '@/components/card/gifts/GiftDeliveryInfo'
import GiftBudgetSummary from '@/components/card/gifts/GiftBudgetSummary'
import type { InventoryProduct } from '@/hooks/useInventoryProducts'

const formatBRL = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

interface PremiumGiftCardProps {
    assignment: GiftAssignmentFull
    onStatusChange: () => void
    onDuplicate?: () => void
}

export default function PremiumGiftCard({ assignment, onStatusChange, onDuplicate }: PremiumGiftCardProps) {
    const [expanded, setExpanded] = useState(false)
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
    const [confirmCancel, setConfirmCancel] = useState(false)
    const [showDelivery, setShowDelivery] = useState(false)

    const giftOps = useGiftAssignment(assignment.id, assignment.card_id || '')

    const contatoNome = assignment.contato
        ? (assignment.contato.sobrenome ? `${assignment.contato.nome} ${assignment.contato.sobrenome}` : assignment.contato.nome)
        : 'Sem contato'

    const initials = assignment.contato
        ? `${assignment.contato.nome[0]}${(assignment.contato.sobrenome?.[0] || '')}`.toUpperCase()
        : '??'

    const totalCost = assignment.items?.reduce((s, i) => s + i.quantity * i.unit_price_snapshot, 0) ?? 0
    const itemCount = assignment.items?.length ?? 0
    const nextStatus = getNextStatus(assignment.status)
    const isReadOnly = assignment.status === 'enviado' || assignment.status === 'entregue' || assignment.status === 'cancelado'

    const handleAdvance = async () => {
        if (!nextStatus) return
        setIsUpdatingStatus(true)
        try {
            void 0 // supabase already imported
            const updates: Record<string, unknown> = { status: nextStatus, updated_at: new Date().toISOString() }
            if (nextStatus === 'enviado') updates.shipped_at = new Date().toISOString()
            else if (nextStatus === 'entregue') updates.delivered_at = new Date().toISOString()
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
            void 0 // supabase already imported
            for (const item of assignment.items || []) {
                if (!item.product_id) continue
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (supabase as any).from('inventory_movements').insert({
                    product_id: item.product_id,
                    quantity: item.quantity,
                    movement_type: 'devolucao',
                    reason: `Cancelamento avulso — ${contatoNome}`,
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

    const handleAddStock = (product: InventoryProduct, quantity: number, unitPrice: number) => {
        giftOps.addItem.mutate({ productId: product.id, quantity, unitPrice })
    }

    const handleAddCustom = (name: string, unitPrice: number, quantity: number) => {
        giftOps.addCustomItem.mutate({ customName: name, unitPrice, quantity })
    }

    return (
        <div className={cn(
            'border rounded-xl transition-colors',
            assignment.status === 'cancelado' ? 'border-red-200 bg-red-50/30' :
            assignment.status === 'entregue' ? 'border-emerald-200 bg-emerald-50/30' :
            'border-slate-200 bg-white',
        )}>
            {/* Header */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
            >
                <div className="h-9 w-9 rounded-full bg-pink-100 flex items-center justify-center shrink-0">
                    <span className="text-xs font-medium text-pink-700">{initials}</span>
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-900 truncate">{contatoNome}</p>
                        {assignment.occasion && (
                            <span className="px-2 py-0.5 text-[10px] font-medium bg-purple-100 text-purple-700 rounded-full shrink-0">
                                {assignment.occasion.split(' — ')[0]}
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-slate-400">
                        {itemCount} {itemCount === 1 ? 'item' : 'itens'} · {formatBRL(totalCost)}
                        {assignment.scheduled_ship_date && ` · Envio: ${new Date(assignment.scheduled_ship_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`}
                    </p>
                </div>

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

                <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform shrink-0', expanded && 'rotate-180')} />
            </button>

            {/* Expanded */}
            {expanded && (
                <div className="border-t border-slate-100 px-4 py-4 space-y-4">
                    <GiftStatusTracker
                        status={assignment.status}
                        nextStatus={nextStatus}
                        onAdvance={handleAdvance}
                        onCancel={() => setConfirmCancel(true)}
                        isUpdating={isUpdatingStatus}
                        shippedAt={assignment.shipped_at}
                        deliveredAt={assignment.delivered_at}
                    />

                    {confirmCancel && (
                        <div className="flex items-center gap-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                            <span className="text-xs text-red-700 flex-1">Cancelar presente? Itens do estoque serão devolvidos.</span>
                            <button onClick={handleCancel} disabled={isUpdatingStatus} className="px-2.5 py-1 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                                {isUpdatingStatus ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirmar'}
                            </button>
                            <button onClick={() => setConfirmCancel(false)} className="text-xs text-slate-500">Não</button>
                        </div>
                    )}

                    {/* Occasion detail */}
                    {assignment.occasion && assignment.occasion.includes(' — ') && (
                        <div className="px-3 py-2 bg-purple-50 rounded-lg">
                            <p className="text-xs text-purple-700">{assignment.occasion}</p>
                        </div>
                    )}

                    {/* Items */}
                    {assignment.items?.length > 0 && (
                        <div className="space-y-2">
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

                    {/* Add more items */}
                    {!isReadOnly && (
                        <GiftItemPicker
                            onAddStock={handleAddStock}
                            onAddCustom={handleAddCustom}
                            isAdding={giftOps.addItem.isPending || giftOps.addCustomItem.isPending}
                            existingProductIds={assignment.items?.filter(i => i.product_id).map(i => i.product_id!) || []}
                        />
                    )}

                    {itemCount > 0 && (
                        <GiftBudgetSummary totalCost={totalCost} budget={assignment.budget} itemCount={itemCount} />
                    )}

                    {/* Delivery toggle */}
                    <button
                        onClick={() => setShowDelivery(!showDelivery)}
                        className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                    >
                        {showDelivery ? 'Ocultar info de entrega' : 'Mostrar info de entrega'}
                    </button>

                    {showDelivery && (
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
                    )}

                    {/* Actions */}
                    {onDuplicate && (
                        <button
                            onClick={onDuplicate}
                            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 font-medium"
                        >
                            <Copy className="h-3 w-3" />
                            Duplicar para outro contato
                        </button>
                    )}

                    <p className="text-[10px] text-slate-400">
                        Criado em {new Date(assignment.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                </div>
            )}
        </div>
    )
}
