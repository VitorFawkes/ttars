import { useState } from 'react'
import { Search, Plus, Package, Loader2 } from 'lucide-react'
import { useInventoryProducts, type InventoryProduct } from '@/hooks/useInventoryProducts'
import { cn } from '@/lib/utils'

interface GiftItemPickerProps {
    onAdd: (product: InventoryProduct, quantity: number) => void
    isAdding: boolean
    existingProductIds: string[]
}

export default function GiftItemPicker({ onAdd, isAdding, existingProductIds }: GiftItemPickerProps) {
    const [search, setSearch] = useState('')
    const [selectedProduct, setSelectedProduct] = useState<InventoryProduct | null>(null)
    const [quantity, setQuantity] = useState(1)
    const [showList, setShowList] = useState(false)

    const { products } = useInventoryProducts({ search, activeOnly: true })
    const available = products.filter(p => !existingProductIds.includes(p.id))

    const handleAdd = () => {
        if (!selectedProduct) return
        onAdd(selectedProduct, quantity)
        setSelectedProduct(null)
        setQuantity(1)
        setSearch('')
        setShowList(false)
    }

    return (
        <div className="border border-dashed border-slate-300 rounded-lg p-3 space-y-2">
            <p className="text-xs font-medium text-slate-500">Adicionar item</p>

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
                                    </div>
                                    <span className={cn(
                                        'text-xs',
                                        p.current_stock === 0 ? 'text-red-500' : 'text-slate-400'
                                    )}>
                                        {p.current_stock} em estoque
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-50 rounded-lg px-3 py-1.5 text-sm">
                        <span className="font-medium">{selectedProduct.name}</span>
                        <span className="text-slate-400 ml-1">({selectedProduct.current_stock} disp.)</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setQuantity(q => Math.max(1, q - 1))}
                            className="w-7 h-7 flex items-center justify-center border border-slate-200 rounded text-sm hover:bg-slate-50"
                        >
                            -
                        </button>
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
                        >
                            +
                        </button>
                    </div>
                    <button
                        onClick={handleAdd}
                        disabled={isAdding || quantity > selectedProduct.current_stock}
                        className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    >
                        {isAdding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                        Adicionar
                    </button>
                    <button
                        onClick={() => { setSelectedProduct(null); setSearch('') }}
                        className="text-xs text-slate-400 hover:text-slate-600"
                    >
                        Cancelar
                    </button>
                </div>
            )}
        </div>
    )
}
