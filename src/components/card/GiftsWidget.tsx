import { useState } from 'react'
import { Gift, Plus, Loader2 } from 'lucide-react'
import { SectionCollapseToggle } from './DynamicSectionWidget'
import { useCardGifts } from '@/hooks/useCardGifts'
import type { InventoryProduct } from '@/hooks/useInventoryProducts'
import type { Database } from '@/database.types'
import GiftStatusTracker from './gifts/GiftStatusTracker'
import GiftItemPicker from './gifts/GiftItemPicker'
import GiftItemRow from './gifts/GiftItemRow'
import GiftDeliveryInfo from './gifts/GiftDeliveryInfo'
import GiftBudgetSummary from './gifts/GiftBudgetSummary'
import { toast } from 'sonner'

type Card = Database['public']['Tables']['cards']['Row']

interface GiftsWidgetProps {
    cardId: string
    card: Card
    isExpanded?: boolean
    onToggleCollapse?: () => void
}

export default function GiftsWidget({ cardId, card: _card, isExpanded, onToggleCollapse }: GiftsWidgetProps) {
    const {
        assignment,
        isLoading,
        createAssignment,
        addItem,
        removeItem,
        updateStatus,
        updateDelivery,
        nextStatus,
        totalCost,
    } = useCardGifts(cardId)

    const [showDelivery, setShowDelivery] = useState(false)

    const isReadOnly = assignment?.status === 'enviado' || assignment?.status === 'entregue' || assignment?.status === 'cancelado'

    const handleCreate = async () => {
        try {
            await createAssignment.mutateAsync({})
            toast.success('Kit de presentes criado')
        } catch {
            toast.error('Erro ao criar kit de presentes')
        }
    }

    const handleAddItem = async (product: InventoryProduct, quantity: number) => {
        if (!assignment) return
        try {
            await addItem.mutateAsync({
                assignmentId: assignment.id,
                productId: product.id,
                quantity,
                unitPrice: product.unit_price,
            })
            toast.success(`${product.name} adicionado`)
        } catch {
            toast.error('Erro ao adicionar item. Verifique o estoque.')
        }
    }

    const handleAdvanceStatus = async () => {
        if (!nextStatus) return
        try {
            await updateStatus.mutateAsync(nextStatus)
            toast.success(`Status atualizado para ${nextStatus}`)
        } catch {
            toast.error('Erro ao atualizar status')
        }
    }

    const handleCancel = async () => {
        if (!confirm('Cancelar presente? Os itens serão devolvidos ao estoque.')) return
        try {
            await updateStatus.mutateAsync('cancelado')
            toast.success('Presente cancelado. Estoque devolvido.')
        } catch {
            toast.error('Erro ao cancelar')
        }
    }

    const handleSaveDelivery = async (data: Parameters<typeof updateDelivery.mutateAsync>[0]) => {
        try {
            await updateDelivery.mutateAsync(data)
            toast.success('Informações de entrega salvas')
        } catch {
            toast.error('Erro ao salvar entrega')
        }
    }

    return (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-pink-50">
                <div className="flex items-center gap-2">
                    <Gift className="h-4 w-4 text-pink-700" />
                    <h3 className="text-sm font-semibold text-pink-700">
                        Presentes
                        {assignment?.items?.length ? ` (${assignment.items.length})` : ''}
                    </h3>
                </div>
                {onToggleCollapse && (
                    <SectionCollapseToggle isExpanded={!!isExpanded} onToggle={onToggleCollapse} />
                )}
            </div>

            <div className="p-4 space-y-4">
                {isLoading ? (
                    <div className="flex items-center justify-center py-6">
                        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                    </div>
                ) : !assignment ? (
                    <div className="text-center py-6">
                        <Gift className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                        <p className="text-sm text-slate-500 mb-3">Nenhum presente configurado</p>
                        <button
                            onClick={handleCreate}
                            disabled={createAssignment.isPending}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-pink-600 text-white text-sm font-medium rounded-lg hover:bg-pink-700 disabled:opacity-50 transition-colors"
                        >
                            {createAssignment.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                            Montar Kit de Presentes
                        </button>
                    </div>
                ) : (
                    <>
                        <GiftStatusTracker
                            status={assignment.status}
                            nextStatus={nextStatus}
                            onAdvance={handleAdvanceStatus}
                            onCancel={handleCancel}
                            isUpdating={updateStatus.isPending}
                            shippedAt={assignment.shipped_at}
                            deliveredAt={assignment.delivered_at}
                        />

                        {assignment.items?.length > 0 && (
                            <div className="space-y-2">
                                {assignment.items.map(item => (
                                    <GiftItemRow
                                        key={item.id}
                                        item={item}
                                        onRemove={() => removeItem.mutate(item)}
                                        isRemoving={removeItem.isPending}
                                        readOnly={isReadOnly}
                                    />
                                ))}
                            </div>
                        )}

                        {!isReadOnly && (
                            <GiftItemPicker
                                onAdd={handleAddItem}
                                isAdding={addItem.isPending}
                                existingProductIds={assignment.items?.map(i => i.product_id) ?? []}
                            />
                        )}

                        <GiftBudgetSummary
                            totalCost={totalCost}
                            budget={assignment.budget}
                            itemCount={assignment.items?.length ?? 0}
                        />

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
                                        isSaving={updateDelivery.isPending}
                                        readOnly={isReadOnly}
                                    />
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
