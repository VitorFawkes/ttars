import { useState } from 'react'
import { Gift, Search, Package, PenLine, Loader2, Plus, X, Check, Users, AlertTriangle, MessageSquare, Upload } from 'lucide-react'
import { useInventoryProducts, type InventoryProduct } from '@/hooks/useInventoryProducts'
import InventoryImageHoverPreview from '@/components/inventory/InventoryImageHoverPreview'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const formatBRL = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

type ItemMode = 'stock' | 'custom'

export interface IndividualGiftAdderContact {
    id: string
    nome: string
    sobrenome: string | null
}

interface Props {
    contacts: IndividualGiftAdderContact[]
    onSubmit: (input: {
        productId: string | null
        customName?: string
        customImagePath?: string | null
        quantity: number
        unitPrice: number
        contacts: { id: string; name: string }[]
        notes?: string
    }) => Promise<void> | void
    onCancel: () => void
    isSubmitting: boolean
}

export default function IndividualGiftAdder({ contacts, onSubmit, onCancel, isSubmitting }: Props) {
    const [mode, setMode] = useState<ItemMode>('stock')
    const [search, setSearch] = useState('')
    const [selectedProduct, setSelectedProduct] = useState<InventoryProduct | null>(null)
    const [showList, setShowList] = useState(false)
    const [quantity, setQuantity] = useState(1)
    const [customName, setCustomName] = useState('')
    const [customPrice, setCustomPrice] = useState(0)
    const [customImagePath, setCustomImagePath] = useState<string | null>(null)
    const [uploading, setUploading] = useState(false)
    const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(() => new Set())
    const [notes, setNotes] = useState('')

    const { products } = useInventoryProducts({ search, activeOnly: true })

    const numSelected = selectedContactIds.size
    const totalUnits = quantity * numSelected
    const unitPrice = mode === 'stock' ? (selectedProduct?.unit_price ?? 0) : customPrice
    const totalCost = totalUnits * unitPrice
    const stock = mode === 'stock' ? (selectedProduct?.current_stock ?? 0) : Infinity
    const stockWarning = mode === 'stock' && selectedProduct && totalUnits > stock

    const itemReady =
        mode === 'stock' ? !!selectedProduct && quantity > 0
            : mode === 'custom' ? customName.trim().length > 0 && quantity > 0
                : false

    const canSubmit = itemReady && numSelected > 0 && !isSubmitting && !stockWarning

    const toggleContact = (id: string) => {
        setSelectedContactIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const selectAll = () => setSelectedContactIds(new Set(contacts.map(c => c.id)))
    const clearAll = () => setSelectedContactIds(new Set())

    const handleSubmit = async () => {
        if (!canSubmit) return
        const selected = contacts
            .filter(c => selectedContactIds.has(c.id))
            .map(c => ({ id: c.id, name: c.sobrenome ? `${c.nome} ${c.sobrenome}` : c.nome }))
        await onSubmit({
            productId: mode === 'stock' ? selectedProduct!.id : null,
            customName: mode === 'custom' ? customName.trim() : undefined,
            customImagePath: mode === 'custom' ? customImagePath : null,
            quantity,
            unitPrice,
            contacts: selected,
            notes: notes.trim() || undefined,
        })
    }

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setUploading(true)
        try {
            const ext = file.name.split('.').pop()
            const path = `custom/${crypto.randomUUID()}.${ext}`
            const { error } = await supabase.storage.from('inventory-images').upload(path, file)
            if (error) throw error
            setCustomImagePath(path)
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Erro ao enviar imagem'
            toast.error(msg)
        } finally {
            setUploading(false)
        }
    }

    return (
        <div className="border border-indigo-200 rounded-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 bg-indigo-50 border-b border-indigo-200">
                <div className="flex items-center gap-2">
                    <Gift className="h-4 w-4 text-indigo-600" />
                    <span className="text-sm font-semibold text-indigo-700">Adicionar presente individual</span>
                </div>
                <button onClick={onCancel} className="p-1 rounded hover:bg-indigo-100 text-indigo-400 hover:text-indigo-600">
                    <X className="h-4 w-4" />
                </button>
            </div>

            <div className="p-3 space-y-3">
                {/* Mode toggle */}
                <div className="flex gap-2">
                    <button
                        onClick={() => { setMode('stock'); setCustomName(''); setCustomPrice(0) }}
                        className={cn(
                            'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium border transition-colors',
                            mode === 'stock'
                                ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                                : 'border-slate-200 text-slate-500 hover:border-indigo-300'
                        )}
                    >
                        <Package className="h-3.5 w-3.5" />
                        Do Estoque
                    </button>
                    <button
                        onClick={() => { setMode('custom'); setSelectedProduct(null); setSearch('') }}
                        className={cn(
                            'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium border transition-colors',
                            mode === 'custom'
                                ? 'bg-pink-50 border-pink-300 text-pink-700'
                                : 'border-slate-200 text-slate-500 hover:border-pink-300'
                        )}
                    >
                        <PenLine className="h-3.5 w-3.5" />
                        Item Avulso
                    </button>
                </div>

                {/* Stock picker */}
                {mode === 'stock' && (
                    <div className="space-y-2">
                        {!selectedProduct ? (
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar produto..."
                                    value={search}
                                    onChange={e => { setSearch(e.target.value); setShowList(true) }}
                                    onFocus={() => setShowList(true)}
                                    className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                                {showList && products.length > 0 && (
                                    <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                        {products.map(p => (
                                            <InventoryImageHoverPreview key={p.id} imagePath={p.image_path} productName={p.name}>
                                                <button
                                                    onClick={() => { setSelectedProduct(p); setShowList(false); setSearch('') }}
                                                    disabled={p.current_stock === 0}
                                                    className={cn(
                                                        'w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between text-sm',
                                                        p.current_stock === 0 && 'opacity-40 cursor-not-allowed'
                                                    )}
                                                >
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <Package className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                                        <span className="truncate">{p.name}</span>
                                                        {p.unit_price > 0 && (
                                                            <span className="text-xs text-slate-400 shrink-0">{formatBRL(p.unit_price)}</span>
                                                        )}
                                                    </div>
                                                    <span className={cn('text-xs shrink-0', p.current_stock === 0 ? 'text-red-500' : 'text-slate-400')}>
                                                        {p.current_stock === 0 ? 'Sem estoque' : `${p.current_stock} disp.`}
                                                    </span>
                                                </button>
                                            </InventoryImageHoverPreview>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 text-sm">
                                    <Package className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                    <span className="font-medium flex-1 truncate">{selectedProduct.name}</span>
                                    <span className="text-xs text-slate-500">{formatBRL(selectedProduct.unit_price)}</span>
                                    <span className="text-slate-400 text-xs">{selectedProduct.current_stock} disp.</span>
                                    <button
                                        onClick={() => setSelectedProduct(null)}
                                        className="ml-1 text-slate-400 hover:text-slate-600"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                                <div className="flex items-center gap-2">
                                    <label className="text-xs text-slate-500">Qtd por pessoa:</label>
                                    <button
                                        onClick={() => setQuantity(q => Math.max(1, q - 1))}
                                        className="w-7 h-7 flex items-center justify-center border border-slate-200 rounded text-sm hover:bg-slate-50"
                                    >-</button>
                                    <input
                                        type="number"
                                        min="1"
                                        value={quantity}
                                        onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                                        className="w-14 text-center text-sm border border-slate-200 rounded py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                    <button
                                        onClick={() => setQuantity(q => q + 1)}
                                        className="w-7 h-7 flex items-center justify-center border border-slate-200 rounded text-sm hover:bg-slate-50"
                                    >+</button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Custom item */}
                {mode === 'custom' && (
                    <div className="space-y-2">
                        <div className="grid grid-cols-3 gap-2">
                            <div className="col-span-3">
                                <input
                                    type="text"
                                    placeholder="Nome do item (ex: Camiseta personalizada)"
                                    value={customName}
                                    onChange={e => setCustomName(e.target.value)}
                                    className="w-full px-2.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
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
                                    className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] text-slate-500 mb-0.5 block">Qtd por pessoa</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={quantity}
                                    onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                                    className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
                                />
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="text-[10px] text-slate-500">Foto (opcional)</label>
                            {customImagePath ? (
                                <div className="flex items-center gap-1.5 bg-white border border-pink-200 rounded-md pl-1 pr-1.5 py-0.5">
                                    <img
                                        src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/inventory-images/${customImagePath}`}
                                        alt="preview"
                                        className="h-6 w-6 object-cover rounded"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setCustomImagePath(null)}
                                        className="text-slate-400 hover:text-red-600"
                                        aria-label="Remover foto"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            ) : (
                                <label className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-pink-200 text-pink-700 text-[11px] rounded-md cursor-pointer hover:bg-pink-50 transition-colors">
                                    {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                                    {uploading ? 'Enviando...' : 'Anexar foto'}
                                    <input
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp"
                                        onChange={handleImageUpload}
                                        disabled={uploading}
                                        className="hidden"
                                    />
                                </label>
                            )}
                        </div>
                    </div>
                )}

                {/* Destinatários */}
                <div className="border-t border-slate-100 pt-3 space-y-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                            <Users className="h-3.5 w-3.5 text-slate-400" />
                            Quem vai receber este presente?
                            {numSelected > 0 && (
                                <span className="text-indigo-600">({numSelected} {numSelected === 1 ? 'pessoa' : 'pessoas'})</span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={selectAll}
                                className="text-[11px] text-indigo-600 hover:text-indigo-700 font-medium"
                            >
                                Todos
                            </button>
                            <span className="text-slate-300">·</span>
                            <button
                                onClick={clearAll}
                                className="text-[11px] text-slate-500 hover:text-slate-700"
                            >
                                Limpar
                            </button>
                        </div>
                    </div>

                    {contacts.length === 0 ? (
                        <p className="text-xs text-slate-400 italic py-2">Adicione contatos ao card primeiro.</p>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {contacts.map(c => {
                                const selected = selectedContactIds.has(c.id)
                                const displayName = c.sobrenome ? `${c.nome} ${c.sobrenome}` : c.nome
                                return (
                                    <button
                                        key={c.id}
                                        onClick={() => toggleContact(c.id)}
                                        className={cn(
                                            'flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left transition-colors',
                                            selected
                                                ? 'border-indigo-300 bg-indigo-50 text-indigo-900'
                                                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                                        )}
                                    >
                                        <div className={cn(
                                            'flex h-4 w-4 items-center justify-center rounded border-2 shrink-0',
                                            selected ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300 bg-white'
                                        )}>
                                            {selected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                                        </div>
                                        <span className="text-sm truncate">{displayName}</span>
                                    </button>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* Observação */}
                <div className="border-t border-slate-100 pt-3 space-y-1.5">
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                        <MessageSquare className="h-3.5 w-3.5 text-slate-400" />
                        Observação <span className="text-slate-400 font-normal">(opcional)</span>
                    </label>
                    <textarea
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder="Endereço alternativo, preferências, instruções para o pacote…"
                        rows={2}
                        className="w-full px-2.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                </div>

                {/* Stock warning */}
                {stockWarning && (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>
                            Estoque insuficiente: precisaria de {totalUnits} unidades, mas só há {stock} disponíveis.
                        </span>
                    </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                    <div className="text-xs text-slate-500">
                        {itemReady && numSelected > 0 ? (
                            <>
                                {totalUnits} {totalUnits === 1 ? 'unidade' : 'unidades'}
                                {unitPrice > 0 && <> · {formatBRL(totalCost)}</>}
                            </>
                        ) : (
                            <span className="italic">Escolha o item e quem recebe</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onCancel}
                            disabled={isSubmitting}
                            className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={!canSubmit}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                            Adicionar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
