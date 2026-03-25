import { useState } from 'react'
import { Search, Plus, Package, PenLine, Loader2 } from 'lucide-react'
import { useInventoryProducts, type InventoryProduct } from '@/hooks/useInventoryProducts'
import { cn } from '@/lib/utils'

const formatBRL = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

type Mode = 'idle' | 'stock' | 'custom'

interface GiftItemPickerProps {
    onAddStock: (product: InventoryProduct, quantity: number, unitPrice: number) => void
    onAddCustom: (name: string, unitPrice: number, quantity: number) => void
    isAdding: boolean
    existingProductIds: string[]
}

export default function GiftItemPicker({ onAddStock, onAddCustom, isAdding, existingProductIds }: GiftItemPickerProps) {
    const [mode, setMode] = useState<Mode>('idle')
    const [search, setSearch] = useState('')
    const [selectedProduct, setSelectedProduct] = useState<InventoryProduct | null>(null)
    const [quantity, setQuantity] = useState(1)
    const [unitPrice, setUnitPrice] = useState(0)
    const [showList, setShowList] = useState(false)

    // Custom item state
    const [customName, setCustomName] = useState('')
    const [customPrice, setCustomPrice] = useState(0)
    const [customQty, setCustomQty] = useState(1)

    const { products } = useInventoryProducts({ search, activeOnly: true })
    const available = products.filter(p => !existingProductIds.includes(p.id))

    const reset = () => {
        setMode('idle')
        setSearch('')
        setSelectedProduct(null)
        setQuantity(1)
        setUnitPrice(0)
        setShowList(false)
        setCustomName('')
        setCustomPrice(0)
        setCustomQty(1)
    }

    const selectProduct = (p: InventoryProduct) => {
        setSelectedProduct(p)
        setUnitPrice(p.unit_price)
        setShowList(false)
        setSearch('')
    }

    const handleAddStock = () => {
        if (!selectedProduct) return
        onAddStock(selectedProduct, quantity, unitPrice)
        reset()
    }

    const handleAddCustom = () => {
        if (!customName.trim()) return
        onAddCustom(customName.trim(), customPrice, customQty)
        reset()
    }

    if (mode === 'idle') {
        return (
            <div className="flex gap-2">
                <button
                    onClick={() => setMode('stock')}
                    className="flex-1 flex items-center justify-center gap-2 py-2 border border-dashed border-slate-300 rounded-lg text-xs font-medium text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
                >
                    <Package className="h-3.5 w-3.5" />
                    Do Estoque
                </button>
                <button
                    onClick={() => setMode('custom')}
                    className="flex-1 flex items-center justify-center gap-2 py-2 border border-dashed border-slate-300 rounded-lg text-xs font-medium text-slate-500 hover:border-pink-400 hover:text-pink-600 transition-colors"
                >
                    <PenLine className="h-3.5 w-3.5" />
                    Item Avulso
                </button>
            </div>
        )
    }

    if (mode === 'custom') {
        return (
            <div className="border border-pink-200 bg-pink-50/50 rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-pink-700">Item avulso (fora do estoque)</p>
                    <button onClick={reset} className="text-[10px] text-slate-400 hover:text-slate-600">Voltar</button>
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
                    <div className="flex items-end gap-1">
                        <button
                            onClick={handleAddCustom}
                            disabled={isAdding || !customName.trim()}
                            className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-pink-600 text-white text-xs font-medium rounded-lg hover:bg-pink-700 disabled:opacity-50 transition-colors"
                        >
                            {isAdding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                            Adicionar
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    // mode === 'stock'
    return (
        <div className="border border-dashed border-slate-300 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-500">Adicionar do estoque</p>
                <button onClick={reset} className="text-[10px] text-slate-400 hover:text-slate-600">Voltar</button>
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
                                    onClick={() => selectProduct(p)}
                                    disabled={p.current_stock === 0}
                                    className={cn(
                                        'w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between text-sm',
                                        p.current_stock === 0 && 'opacity-40 cursor-not-allowed'
                                    )}
                                >
                                    <div className="flex items-center gap-2">
                                        <Package className="h-3.5 w-3.5 text-slate-400" />
                                        <span>{p.name}</span>
                                        {p.unit_price > 0 && (
                                            <span className="text-xs text-slate-400">{formatBRL(p.unit_price)}</span>
                                        )}
                                    </div>
                                    <span className={cn(
                                        'text-xs',
                                        p.current_stock === 0 ? 'text-red-500' : 'text-slate-400'
                                    )}>
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
                        <span className="text-slate-400 text-xs">{selectedProduct.current_stock} disp.</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex-1">
                            <label className="text-[10px] text-slate-500 mb-0.5 block">Valor un. (R$)</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={unitPrice}
                                onChange={e => setUnitPrice(parseFloat(e.target.value) || 0)}
                                className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-500 mb-0.5 block">Qtd</label>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setQuantity(q => Math.max(1, q - 1))}
                                    className="w-7 h-7 flex items-center justify-center border border-slate-200 rounded text-sm hover:bg-slate-50"
                                >-</button>
                                <input
                                    type="number"
                                    min="1"
                                    max={selectedProduct.current_stock}
                                    value={quantity}
                                    onChange={e => setQuantity(Math.min(selectedProduct.current_stock, Math.max(1, parseInt(e.target.value) || 1)))}
                                    className="w-12 text-center text-sm border border-slate-200 rounded py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                                <button
                                    onClick={() => setQuantity(q => Math.min(selectedProduct.current_stock, q + 1))}
                                    className="w-7 h-7 flex items-center justify-center border border-slate-200 rounded text-sm hover:bg-slate-50"
                                >+</button>
                            </div>
                        </div>
                        <div className="flex items-end gap-1 self-end">
                            <button
                                onClick={handleAddStock}
                                disabled={isAdding || quantity > selectedProduct.current_stock}
                                className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                            >
                                {isAdding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                                Adicionar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
