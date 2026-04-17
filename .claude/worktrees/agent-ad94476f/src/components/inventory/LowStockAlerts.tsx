import { useState } from 'react'
import { AlertTriangle, XCircle } from 'lucide-react'
import { useLowStockProducts } from '@/hooks/useInventoryStats'
import { cn } from '@/lib/utils'
import StockAdjustmentModal from './StockAdjustmentModal'
import type { InventoryProduct } from '@/hooks/useInventoryProducts'

export default function LowStockAlerts() {
    const { data: products = [], isLoading } = useLowStockProducts()
    const [adjustingProduct, setAdjustingProduct] = useState<InventoryProduct | null>(null)

    if (isLoading) return <div className="text-center py-12 text-slate-500">Carregando alertas...</div>

    if (products.length === 0) {
        return (
            <div className="text-center py-12">
                <div className="p-3 rounded-full bg-emerald-50 w-fit mx-auto mb-3">
                    <AlertTriangle className="h-6 w-6 text-emerald-600" />
                </div>
                <p className="text-slate-500">Nenhum produto com estoque baixo</p>
            </div>
        )
    }

    return (
        <div className="space-y-3">
            {products.map(product => {
                const isOut = product.current_stock === 0
                const deficit = product.low_stock_threshold - product.current_stock

                return (
                    <div
                        key={product.id}
                        className={cn(
                            'flex items-center justify-between p-3 rounded-lg border',
                            isOut ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
                        )}
                    >
                        <div className="flex items-center gap-3">
                            {isOut ? (
                                <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                            ) : (
                                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                            )}
                            <div>
                                <p className="text-sm font-medium text-slate-900">{product.name}</p>
                                <p className="text-xs text-slate-500">
                                    Estoque: {product.current_stock} / Mínimo: {product.low_stock_threshold}
                                    {deficit > 0 && <span className="text-red-600 ml-1">(faltam {deficit})</span>}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => setAdjustingProduct(product)}
                            className="text-xs font-medium text-indigo-600 hover:text-indigo-700 px-3 py-1.5 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
                        >
                            Repor Estoque
                        </button>
                    </div>
                )
            })}

            {adjustingProduct && (
                <StockAdjustmentModal
                    product={adjustingProduct}
                    onClose={() => setAdjustingProduct(null)}
                />
            )}
        </div>
    )
}
