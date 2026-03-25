import { useState } from 'react'
import { Gift, Plus, Loader2, AlertTriangle, Trash2 } from 'lucide-react'
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
        addCustomItem,
        removeItem,
        updateItemNotes,
        updateStatus,
        updateDelivery,
        deleteAssignment,
        nextStatus,
        totalCost,
    } = useCardGifts(cardId)

    const [showDelivery, setShowDelivery] = useState(false)
    const [confirmCancel, setConfirmCancel] = useState(false)

    const hasItems = (assignment?.items?.length ?? 0) > 0
    const isReadOnly = assignment?.status === 'enviado' || assignment?.status === 'entregue' || assignment?.status === 'cancelado'

    const handleCreate = async () => {
        try {
            await createAssignment.mutateAsync({})
            toast.success('Kit de presentes criado')
        } catch {
            toast.error('Erro ao criar kit de presentes')
        }
    }

    const handleAddStock = async (product: InventoryProduct, quantity: number) => {
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

    const handleAddCustom = async (name: string, unitPrice: number, quantity: number) => {
        if (!assignment) return
        try {
            await addCustomItem.mutateAsync({
                assignmentId: assignment.id,
                customName: name,
                quantity,
                unitPrice,
            })
            toast.success(`${name} adicionado`)
        } catch {
            toast.error('Erro ao adicionar item')
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
        try {
            if (!hasItems) {
                // Sem itens, apaga silenciosamente
                await deleteAssignment.mutateAsync()
            } else {
                // Com itens, cancela e devolve estoque
                await updateStatus.mutateAsync('cancelado')
                toast.success('Presente cancelado. Estoque devolvido.')
            }
            setConfirmCancel(false)
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
                        {hasItems ? ` (${assignment!.items.length})` : ''}
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
                            onCancel={() => setConfirmCancel(true)}
                            isUpdating={updateStatus.isPending}
                            shippedAt={assignment.shipped_at}
                            deliveredAt={assignment.delivered_at}
                        />

                        {/* Confirm cancel inline */}
                        {confirmCancel && (
                            <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                                <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                                <p className="text-sm text-red-700 flex-1">
                                    {hasItems
                                        ? 'Cancelar presente? Os itens do estoque serão devolvidos.'
                                        : 'Remover kit de presentes?'}
                                </p>
                                <button
                                    onClick={handleCancel}
                                    disabled={updateStatus.isPending || deleteAssignment.isPending}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
                                >
                                    {(updateStatus.isPending || deleteAssignment.isPending) ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                        <Trash2 className="h-3 w-3" />
                                    )}
                                    Confirmar
                                </button>
                                <button
                                    onClick={() => setConfirmCancel(false)}
                                    className="text-xs text-slate-500 hover:text-slate-700 font-medium"
                                >
                                    Não
                                </button>
                            </div>
                        )}

                        {hasItems && (
                            <div className="space-y-2">
                                {assignment.items.map(item => (
                                    <GiftItemRow
                                        key={item.id}
                                        item={item}
                                        onRemove={() => removeItem.mutate(item)}
                                        onUpdateNotes={(notes) => updateItemNotes.mutate({ itemId: item.id, notes })}
                                        isRemoving={removeItem.isPending}
                                        readOnly={isReadOnly}
                                    />
                                ))}
                            </div>
                        )}

                        {!isReadOnly && (
                            <GiftItemPicker
                                onAddStock={handleAddStock}
                                onAddCustom={handleAddCustom}
                                isAdding={addItem.isPending || addCustomItem.isPending}
                                existingProductIds={assignment.items?.map(i => i.product_id).filter(Boolean) as string[] ?? []}
                            />
                        )}

                        {hasItems && (
                            <GiftBudgetSummary
                                totalCost={totalCost}
                                budget={assignment.budget}
                                itemCount={assignment.items.length}
                            />
                        )}

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
