import { useState } from 'react'
import { Plus, Minus, Search, Package } from 'lucide-react'
import { useInventoryProducts, type InventoryProduct } from '@/hooks/useInventoryProducts'
import { useAddMovement } from '@/hooks/useInventoryMovements'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import ProductFormModal from './ProductFormModal'
import StockAdjustmentModal from './StockAdjustmentModal'

const formatBRL = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

function StockBadge({ product }: { product: InventoryProduct }) {
    const isOut = product.current_stock === 0
    const isLow = product.current_stock <= product.low_stock_threshold && !isOut

    return (
        <span className={cn(
            'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
            isOut && 'bg-red-100 text-red-700',
            isLow && 'bg-amber-100 text-amber-700',
            !isOut && !isLow && 'bg-emerald-100 text-emerald-700',
        )}>
            {product.current_stock} un.
        </span>
    )
}

export default function ProductGrid() {
    const [search, setSearch] = useState('')
    const [editingProduct, setEditingProduct] = useState<InventoryProduct | null>(null)
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [adjustingProduct, setAdjustingProduct] = useState<InventoryProduct | null>(null)

    const { products, isLoading } = useInventoryProducts({ search })
    const addMovement = useAddMovement()

    const handleQuickAdjust = async (e: React.MouseEvent, product: InventoryProduct, delta: number) => {
        e.stopPropagation()
        if (delta < 0 && product.current_stock === 0) return
        try {
            await addMovement.mutateAsync({
                product_id: product.id,
                quantity: delta,
                movement_type: delta > 0 ? 'entrada' : 'ajuste',
                reason: `Ajuste rápido ${delta > 0 ? '+' : ''}${delta}`,
            })
        } catch {
            toast.error('Erro ao ajustar estoque')
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Buscar produto por nome ou SKU..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                >
                    <Plus className="h-4 w-4" />
                    Novo Produto
                </button>
            </div>

            {isLoading ? (
                <div className="text-center py-12 text-slate-500">Carregando produtos...</div>
            ) : products.length === 0 ? (
                <div className="text-center py-12">
                    <Package className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500">Nenhum produto encontrado</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {products.map(product => (
                        <div
                            key={product.id}
                            className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer overflow-hidden group"
                            onClick={() => setEditingProduct(product)}
                        >
                            <div className="h-32 bg-slate-100 flex items-center justify-center">
                                {product.image_path ? (
                                    <img
                                        src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/inventory-images/${product.image_path}`}
                                        alt={product.name}
                                        className="h-full w-full object-cover"
                                    />
                                ) : (
                                    <Package className="h-10 w-10 text-slate-300" />
                                )}
                            </div>
                            <div className="p-3 space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <p className="text-sm font-medium text-slate-900 group-hover:text-indigo-600 transition-colors">{product.name}</p>
                                        <p className="text-xs text-slate-400">{product.sku}</p>
                                    </div>
                                    <StockBadge product={product} />
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{product.category}</span>
                                    <span className="text-sm font-medium text-slate-700">{formatBRL(product.unit_price)}</span>
                                </div>
                                {/* Stepper inline: -  [número clicável]  + */}
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={e => handleQuickAdjust(e, product, -1)}
                                        disabled={product.current_stock === 0}
                                        className="flex items-center justify-center w-8 h-8 border border-slate-200 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <Minus className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                        onClick={e => { e.stopPropagation(); setAdjustingProduct(product) }}
                                        className="flex-1 flex items-center justify-center gap-1 py-1.5 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
                                    >
                                        <span className="text-sm font-semibold text-slate-900 tabular-nums">{product.current_stock}</span>
                                        <span className="text-[10px] text-slate-400">un.</span>
                                    </button>
                                    <button
                                        onClick={e => handleQuickAdjust(e, product, 1)}
                                        className="flex items-center justify-center w-8 h-8 border border-slate-200 rounded-lg text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 transition-colors"
                                    >
                                        <Plus className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {(showCreateModal || editingProduct) && (
                <ProductFormModal
                    product={editingProduct}
                    onClose={() => { setShowCreateModal(false); setEditingProduct(null) }}
                />
            )}

            {adjustingProduct && (
                <StockAdjustmentModal
                    product={adjustingProduct}
                    onClose={() => setAdjustingProduct(null)}
                />
            )}
        </div>
    )
}
