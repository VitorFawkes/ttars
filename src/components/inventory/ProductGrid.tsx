import { useState } from 'react'
import { Plus, Search, Package } from 'lucide-react'
import { useInventoryProducts, type InventoryProduct } from '@/hooks/useInventoryProducts'
import { cn } from '@/lib/utils'
import ProductFormModal from './ProductFormModal'
import StockAdjustmentModal from './StockAdjustmentModal'

const formatBRL = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

function StockBadge({ product, onClick }: { product: InventoryProduct; onClick: (e: React.MouseEvent) => void }) {
    const isOut = product.current_stock === 0
    const isLow = product.current_stock <= product.low_stock_threshold && !isOut

    return (
        <button
            onClick={onClick}
            className={cn(
                'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all',
                'hover:ring-2 hover:ring-offset-1 cursor-pointer',
                isOut && 'bg-red-100 text-red-700 hover:ring-red-300',
                isLow && 'bg-amber-100 text-amber-700 hover:ring-amber-300',
                !isOut && !isLow && 'bg-emerald-100 text-emerald-700 hover:ring-emerald-300',
            )}
            title="Clique para ajustar estoque"
        >
            {product.current_stock} un.
        </button>
    )
}

export default function ProductGrid() {
    const [search, setSearch] = useState('')
    const [editingProduct, setEditingProduct] = useState<InventoryProduct | null>(null)
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [adjustingProduct, setAdjustingProduct] = useState<InventoryProduct | null>(null)

    const { products, isLoading } = useInventoryProducts({ search })

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
                                    <StockBadge
                                        product={product}
                                        onClick={e => { e.stopPropagation(); setAdjustingProduct(product) }}
                                    />
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{product.category}</span>
                                    <span className="text-sm font-medium text-slate-700">{formatBRL(product.unit_price)}</span>
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
