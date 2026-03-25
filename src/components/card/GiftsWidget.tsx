import { useState } from 'react'
import { Gift, Plus, Loader2, AlertTriangle, Trash2, ChevronDown, ChevronRight, User, Calendar, Check, Clock, Truck, PackageCheck, Users, X, Package, PenLine, Search } from 'lucide-react'
import { SectionCollapseToggle } from './DynamicSectionWidget'
import { useCardGifts, useGiftAssignment, getNextStatus, getContactDisplayName } from '@/hooks/useCardGifts'
import type { GiftAssignment } from '@/hooks/useCardGifts'
import type { InventoryProduct } from '@/hooks/useInventoryProducts'
import { useInventoryProducts } from '@/hooks/useInventoryProducts'
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

const formatBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

/** Temporary kit item (before assignment is created) */
interface KitItem {
    id: string // temp ID for key
    productId: string | null
    productName: string
    customName?: string
    quantity: number
    unitPrice: number
    stock?: number
    imagePath?: string | null
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function GiftsWidget({ cardId, card: _card, isExpanded, onToggleCollapse }: GiftsWidgetProps) {
    const {
        assignments,
        isLoading,
        createBulkAssignments,
        updateShipDate,
        updateStatus,
        deleteAssignment,
        totalItems,
        totalCost,
        statusCounts,
    } = useCardGifts(cardId)

    const { people, isLoading: loadingPeople } = useCardPeople(cardId)

    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [showKitBuilder, setShowKitBuilder] = useState(false)

    // Contacts that already have a gift
    const contactsWithGift = new Set(assignments.map(a => a.contato_id).filter(Boolean))
    const contactsWithoutGift = (people || []).filter(p => !contactsWithGift.has(p.id))

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

                        {/* Kit Builder */}
                        {showKitBuilder && contactsWithoutGift.length > 0 && (
                            <KitBuilder
                                contacts={contactsWithoutGift}
                                onSubmit={async (selectedContacts, items, shipDate) => {
                                    try {
                                        await createBulkAssignments.mutateAsync({
                                            contacts: selectedContacts,
                                            items: items.map(i => ({
                                                productId: i.productId,
                                                customName: i.customName,
                                                quantity: i.quantity,
                                                unitPrice: i.unitPrice,
                                            })),
                                            scheduledShipDate: shipDate || undefined,
                                        })
                                        toast.success(`Presentes criados para ${selectedContacts.length} pessoa${selectedContacts.length > 1 ? 's' : ''}`)
                                        setShowKitBuilder(false)
                                    } catch {
                                        toast.error('Erro ao criar presentes')
                                    }
                                }}
                                onCancel={() => setShowKitBuilder(false)}
                                isSubmitting={createBulkAssignments.isPending}
                            />
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
                                onDelete={async () => {
                                    try {
                                        await deleteAssignment.mutateAsync({ assignmentId: assignment.id, tarefaId: assignment.tarefa_id })
                                        toast.success('Presente excluído')
                                    } catch { toast.error('Erro ao excluir') }
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

                        {/* Add gift button — only when there are contacts without gift and kit builder is hidden */}
                        {!showKitBuilder && contactsWithoutGift.length > 0 && (
                            <button
                                onClick={() => setShowKitBuilder(true)}
                                className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-pink-300 rounded-lg text-sm font-medium text-pink-600 hover:bg-pink-50/50 transition-colors"
                            >
                                <Plus className="h-4 w-4" />
                                Montar Kit de Presentes
                            </button>
                        )}

                        {/* Empty state when no people at all */}
                        {!people?.length && assignments.length === 0 && (
                            <div className="text-center py-6">
                                <Gift className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                                <p className="text-sm text-slate-500">Adicione contatos ao card para configurar presentes</p>
                            </div>
                        )}

                        {/* All contacts already have gifts */}
                        {people && people.length > 0 && contactsWithoutGift.length === 0 && assignments.length > 0 && !showKitBuilder && (
                            <p className="text-xs text-slate-400 text-center">Todos os contatos já possuem presente</p>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}

/** ─── Kit Builder ─── Choose items first, then select contacts */
function KitBuilder({
    contacts,
    onSubmit,
    onCancel,
    isSubmitting,
}: {
    contacts: { id: string; nome: string; sobrenome: string | null }[]
    onSubmit: (selectedContacts: { id: string; name: string }[], items: KitItem[], shipDate: string | null) => void
    onCancel: () => void
    isSubmitting: boolean
}) {
    const [kitItems, setKitItems] = useState<KitItem[]>([])
    const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set())
    const [shipDate, setShipDate] = useState('')
    const [pickerMode, setPickerMode] = useState<'idle' | 'stock' | 'custom'>('idle')

    // Stock picker state
    const [search, setSearch] = useState('')
    const [selectedProduct, setSelectedProduct] = useState<InventoryProduct | null>(null)
    const [quantity, setQuantity] = useState(1)
    const [showList, setShowList] = useState(false)

    // Custom item state
    const [customName, setCustomName] = useState('')
    const [customPrice, setCustomPrice] = useState(0)
    const [customQty, setCustomQty] = useState(1)

    const { products } = useInventoryProducts({ search, activeOnly: true })
    const existingProductIds = kitItems.filter(i => i.productId).map(i => i.productId!)
    const available = products.filter(p => !existingProductIds.includes(p.id))

    const totalCost = kitItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
    const totalCostAll = totalCost * selectedContactIds.size

    const resetPicker = () => {
        setPickerMode('idle')
        setSearch('')
        setSelectedProduct(null)
        setQuantity(1)
        setShowList(false)
        setCustomName('')
        setCustomPrice(0)
        setCustomQty(1)
    }

    const addStockItem = () => {
        if (!selectedProduct) return
        setKitItems(prev => [...prev, {
            id: crypto.randomUUID(),
            productId: selectedProduct.id,
            productName: selectedProduct.name,
            quantity,
            unitPrice: selectedProduct.unit_price,
            stock: selectedProduct.current_stock,
            imagePath: selectedProduct.image_path,
        }])
        resetPicker()
    }

    const addCustomItem = () => {
        if (!customName.trim()) return
        setKitItems(prev => [...prev, {
            id: crypto.randomUUID(),
            productId: null,
            productName: customName.trim(),
            customName: customName.trim(),
            quantity: customQty,
            unitPrice: customPrice,
        }])
        resetPicker()
    }

    const removeKitItem = (id: string) => {
        setKitItems(prev => prev.filter(i => i.id !== id))
    }

    const toggleContact = (id: string) => {
        setSelectedContactIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const selectAll = () => {
        if (selectedContactIds.size === contacts.length) {
            setSelectedContactIds(new Set())
        } else {
            setSelectedContactIds(new Set(contacts.map(c => c.id)))
        }
    }

    // Check stock availability for N contacts
    const stockWarning = kitItems.some(i => i.productId && i.stock !== undefined && i.quantity * selectedContactIds.size > i.stock)

    const canSubmit = kitItems.length > 0 && selectedContactIds.size > 0 && !isSubmitting && !stockWarning

    const handleSubmit = () => {
        const selectedContacts = contacts
            .filter(c => selectedContactIds.has(c.id))
            .map(c => ({ id: c.id, name: `${c.nome}${c.sobrenome ? ' ' + c.sobrenome : ''}` }))
        onSubmit(selectedContacts, kitItems, shipDate || null)
    }

    return (
        <div className="border border-pink-200 rounded-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 bg-pink-50 border-b border-pink-200">
                <div className="flex items-center gap-2">
                    <Gift className="h-4 w-4 text-pink-600" />
                    <span className="text-sm font-semibold text-pink-700">Montar Kit de Presentes</span>
                </div>
                <button onClick={onCancel} className="p-1 rounded hover:bg-pink-100 text-pink-400 hover:text-pink-600">
                    <X className="h-4 w-4" />
                </button>
            </div>

            <div className="p-3 space-y-4">
                {/* ─── Step 1: Items ─── */}
                <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                        <Package className="h-3.5 w-3.5" />
                        1. Escolha os itens
                    </p>

                    {/* Kit items list */}
                    {kitItems.length > 0 && (
                        <div className="space-y-1.5">
                            {kitItems.map(item => (
                                <div key={item.id} className="flex items-center gap-3 py-2 px-3 bg-slate-50 rounded-lg">
                                    <div className="h-7 w-7 rounded bg-white border border-slate-200 flex items-center justify-center shrink-0">
                                        {item.productId ? (
                                            item.imagePath ? (
                                                <img
                                                    src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/inventory-images/${item.imagePath}`}
                                                    alt={item.productName}
                                                    className="h-full w-full rounded object-cover"
                                                />
                                            ) : (
                                                <Package className="h-3.5 w-3.5 text-slate-300" />
                                            )
                                        ) : (
                                            <PenLine className="h-3.5 w-3.5 text-pink-400" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-sm font-medium text-slate-900 truncate">{item.productName}</span>
                                            {!item.productId && (
                                                <span className="text-[10px] bg-pink-100 text-pink-600 px-1.5 py-0.5 rounded font-medium shrink-0">avulso</span>
                                            )}
                                        </div>
                                        <span className="text-xs text-slate-400">{item.quantity}x {formatBRL(item.unitPrice)}</span>
                                    </div>
                                    <span className="text-sm font-medium text-slate-700 tabular-nums shrink-0">
                                        {formatBRL(item.quantity * item.unitPrice)}
                                    </span>
                                    <button
                                        onClick={() => removeKitItem(item.id)}
                                        className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            ))}
                            <div className="text-right">
                                <span className="text-xs text-slate-500">Total por pessoa: <span className="font-semibold text-slate-700">{formatBRL(totalCost)}</span></span>
                            </div>
                        </div>
                    )}

                    {/* Add item picker */}
                    {pickerMode === 'idle' && (
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPickerMode('stock')}
                                className="flex-1 flex items-center justify-center gap-2 py-2 border border-dashed border-slate-300 rounded-lg text-xs font-medium text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
                            >
                                <Package className="h-3.5 w-3.5" />
                                Do Estoque
                            </button>
                            <button
                                onClick={() => setPickerMode('custom')}
                                className="flex-1 flex items-center justify-center gap-2 py-2 border border-dashed border-slate-300 rounded-lg text-xs font-medium text-slate-500 hover:border-pink-400 hover:text-pink-600 transition-colors"
                            >
                                <PenLine className="h-3.5 w-3.5" />
                                Item Avulso
                            </button>
                        </div>
                    )}

                    {pickerMode === 'stock' && (
                        <div className="border border-dashed border-slate-300 rounded-lg p-3 space-y-2">
                            <div className="flex items-center justify-between">
                                <p className="text-xs font-medium text-slate-500">Adicionar do estoque</p>
                                <button onClick={resetPicker} className="text-[10px] text-slate-400 hover:text-slate-600">Voltar</button>
                            </div>
                            {!selectedProduct ? (
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Buscar produto..."
                                        value={search}
                                        onChange={e => { setSearch(e.target.value); setShowList(true) }}
                                        onFocus={() => setShowList(true)}
                                        className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        autoFocus
                                    />
                                    {showList && available.length > 0 && (
                                        <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                            {available.map(p => (
                                                <button
                                                    key={p.id}
                                                    onClick={() => { setSelectedProduct(p); setShowList(false); setSearch('') }}
                                                    disabled={p.current_stock === 0}
                                                    className={cn(
                                                        'w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between text-sm',
                                                        p.current_stock === 0 && 'opacity-40 cursor-not-allowed'
                                                    )}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <Package className="h-3.5 w-3.5 text-slate-400" />
                                                        <span>{p.name}</span>
                                                        {p.unit_price > 0 && <span className="text-xs text-slate-400">{formatBRL(p.unit_price)}</span>}
                                                    </div>
                                                    <span className={cn('text-xs', p.current_stock === 0 ? 'text-red-500' : 'text-slate-400')}>
                                                        {p.current_stock === 0 ? 'Sem estoque' : `${p.current_stock} disp.`}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-1.5 text-sm">
                                        <span className="font-medium flex-1">{selectedProduct.name}</span>
                                        <span className="text-xs text-slate-500">{formatBRL(selectedProduct.unit_price)}</span>
                                        <span className="text-slate-400 text-xs">{selectedProduct.current_stock} disp.</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div>
                                            <label className="text-[10px] text-slate-500 mb-0.5 block">Qtd</label>
                                            <div className="flex items-center gap-1">
                                                <button onClick={() => setQuantity(q => Math.max(1, q - 1))} className="w-7 h-7 flex items-center justify-center border border-slate-200 rounded text-sm hover:bg-slate-50">-</button>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={quantity}
                                                    onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                                                    className="w-12 text-center text-sm border border-slate-200 rounded py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                />
                                                <button onClick={() => setQuantity(q => q + 1)} className="w-7 h-7 flex items-center justify-center border border-slate-200 rounded text-sm hover:bg-slate-50">+</button>
                                            </div>
                                        </div>
                                        <div className="flex items-end self-end ml-auto">
                                            <button
                                                onClick={addStockItem}
                                                className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                                            >
                                                <Plus className="h-3 w-3" />
                                                Adicionar
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {pickerMode === 'custom' && (
                        <div className="border border-pink-200 bg-pink-50/50 rounded-lg p-3 space-y-3">
                            <div className="flex items-center justify-between">
                                <p className="text-xs font-medium text-pink-700">Item avulso (fora do estoque)</p>
                                <button onClick={resetPicker} className="text-[10px] text-slate-400 hover:text-slate-600">Voltar</button>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="col-span-3">
                                    <input
                                        type="text"
                                        placeholder="Nome do item..."
                                        value={customName}
                                        onChange={e => setCustomName(e.target.value)}
                                        className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 bg-white"
                                        autoFocus
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-500 mb-0.5 block">Valor un. (R$)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={customPrice}
                                        onChange={e => setCustomPrice(parseFloat(e.target.value) || 0)}
                                        className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 bg-white"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-500 mb-0.5 block">Quantidade</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={customQty}
                                        onChange={e => setCustomQty(Math.max(1, parseInt(e.target.value) || 1))}
                                        className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 bg-white"
                                    />
                                </div>
                                <div className="flex items-end">
                                    <button
                                        onClick={addCustomItem}
                                        disabled={!customName.trim()}
                                        className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-pink-600 text-white text-xs font-medium rounded-lg hover:bg-pink-700 disabled:opacity-50 transition-colors"
                                    >
                                        <Plus className="h-3 w-3" />
                                        Adicionar
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* ─── Step 2: Select Contacts ─── */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5" />
                            2. Quem vai receber?
                        </p>
                        {contacts.length > 1 && (
                            <button
                                onClick={selectAll}
                                className="text-[10px] text-indigo-600 hover:text-indigo-700 font-medium"
                            >
                                {selectedContactIds.size === contacts.length ? 'Desmarcar todos' : 'Selecionar todos'}
                            </button>
                        )}
                    </div>
                    <div className="space-y-1">
                        {contacts.map(person => {
                            const isSelected = selectedContactIds.has(person.id)
                            const name = `${person.nome}${person.sobrenome ? ' ' + person.sobrenome : ''}`
                            return (
                                <button
                                    key={person.id}
                                    onClick={() => toggleContact(person.id)}
                                    className={cn(
                                        'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-left',
                                        isSelected
                                            ? 'bg-pink-50 border border-pink-300'
                                            : 'border border-slate-200 hover:border-slate-300'
                                    )}
                                >
                                    <div className={cn(
                                        'flex h-5 w-5 items-center justify-center rounded border-2 shrink-0 transition-colors',
                                        isSelected ? 'bg-pink-600 border-pink-600' : 'border-slate-300'
                                    )}>
                                        {isSelected && <Check className="h-3 w-3 text-white" />}
                                    </div>
                                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-400 flex-shrink-0">
                                        <User className="h-3.5 w-3.5" />
                                    </div>
                                    <span className={cn('text-sm font-medium', isSelected ? 'text-pink-700' : 'text-slate-600')}>
                                        {name}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* ─── Ship date ─── */}
                <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    <label className="text-xs font-medium text-slate-500">Data prevista de envio:</label>
                    <input
                        type="date"
                        value={shipDate}
                        onChange={e => setShipDate(e.target.value)}
                        className="text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                </div>

                {/* Stock warning */}
                {stockWarning && selectedContactIds.size > 0 && (
                    <div className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-200 rounded-lg">
                        <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                        <div className="text-xs text-red-700 space-y-1">
                            <p className="font-semibold">Estoque insuficiente</p>
                            {kitItems.filter(i => i.productId && i.stock !== undefined && i.quantity * selectedContactIds.size > i.stock).map(i => (
                                <p key={i.id}>
                                    {i.productName}: precisa de {i.quantity * selectedContactIds.size}, disponível {i.stock}
                                </p>
                            ))}
                        </div>
                    </div>
                )}

                {/* Submit */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <span className="text-xs text-slate-400">
                        {selectedContactIds.size > 0 && kitItems.length > 0 && (
                            <>Total: <span className="font-semibold text-slate-600">{formatBRL(totalCostAll)}</span> ({selectedContactIds.size} pessoa{selectedContactIds.size > 1 ? 's' : ''})</>
                        )}
                    </span>
                    <button
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        className="flex items-center gap-2 px-4 py-2 bg-pink-600 text-white text-sm font-medium rounded-lg hover:bg-pink-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
                        Criar Presentes
                    </button>
                </div>
            </div>
        </div>
    )
}

/** ─── Expandable card for one contact's gift assignment ─── */
function ContactGiftCard({
    assignment,
    cardId,
    isOpen,
    onToggle,
    onAdvance,
    onCancel,
    onDelete,
    onShipDateChange,
    isUpdating,
}: {
    assignment: GiftAssignment
    cardId: string
    isOpen: boolean
    onToggle: () => void
    onAdvance: () => void
    onCancel: () => void
    onDelete: () => void
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
                        {hasItems && <span>{formatBRL(itemCost)}</span>}
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
                        onDelete={assignment.status === 'cancelado' ? () => setConfirmCancel(true) : undefined}
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

                    {/* Cancel/Delete confirm */}
                    {confirmCancel && (
                        <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                            <p className="text-sm text-red-700 flex-1">
                                {assignment.status === 'cancelado'
                                    ? 'Excluir presente cancelado permanentemente?'
                                    : hasItems ? 'Cancelar presente? Os itens do estoque serão devolvidos.' : 'Remover presente?'}
                            </p>
                            <button
                                onClick={() => {
                                    if (assignment.status === 'cancelado') { onDelete(); } else { onCancel(); }
                                    setConfirmCancel(false)
                                }}
                                disabled={isUpdating}
                                className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
                            >
                                {isUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                {assignment.status === 'cancelado' ? 'Excluir' : 'Confirmar'}
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

                    {/* Picker — add more items to existing assignment */}
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
