import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { useAddMovement } from '@/hooks/useInventoryMovements'
import type { InventoryProduct } from '@/hooks/useInventoryProducts'
import { toast } from 'sonner'

interface StockAdjustmentModalProps {
    product: InventoryProduct
    onClose: () => void
}

export default function StockAdjustmentModal({ product, onClose }: StockAdjustmentModalProps) {
    const addMovement = useAddMovement()
    const [type, setType] = useState<'entrada' | 'ajuste'>('entrada')
    const [quantity, setQuantity] = useState(1)
    const [reason, setReason] = useState('')

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (quantity <= 0) {
            toast.error('Quantidade deve ser maior que zero')
            return
        }

        const finalQty = type === 'entrada' ? quantity : -quantity

        if (type === 'ajuste' && product.current_stock + finalQty < 0) {
            toast.error(`Estoque ficaria negativo (atual: ${product.current_stock})`)
            return
        }

        try {
            await addMovement.mutateAsync({
                product_id: product.id,
                quantity: finalQty,
                movement_type: type,
                reason: reason || undefined,
            })
            toast.success(type === 'entrada' ? 'Estoque adicionado' : 'Estoque ajustado')
            onClose()
        } catch {
            toast.error('Erro ao ajustar estoque')
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
                <div className="flex items-center justify-between p-4 border-b border-slate-200">
                    <h2 className="text-lg font-semibold text-slate-900">Ajustar Estoque</h2>
                    <button onClick={onClose} className="p-1 rounded hover:bg-slate-100">
                        <X className="h-5 w-5 text-slate-400" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <div className="bg-slate-50 rounded-lg p-3">
                        <p className="text-sm font-medium text-slate-900">{product.name}</p>
                        <p className="text-xs text-slate-500">SKU: {product.sku} | Estoque atual: {product.current_stock} un.</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Tipo</label>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setType('entrada')}
                                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                                    type === 'entrada'
                                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                                }`}
                            >
                                + Entrada
                            </button>
                            <button
                                type="button"
                                onClick={() => setType('ajuste')}
                                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                                    type === 'ajuste'
                                        ? 'bg-amber-50 border-amber-300 text-amber-700'
                                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                                }`}
                            >
                                - Saída/Ajuste
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Quantidade</label>
                        <input
                            type="number"
                            min="1"
                            value={quantity}
                            onChange={e => setQuantity(parseInt(e.target.value) || 0)}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        {type === 'ajuste' && (
                            <p className="text-xs text-slate-500 mt-1">
                                Novo estoque: {product.current_stock - quantity} un.
                            </p>
                        )}
                        {type === 'entrada' && (
                            <p className="text-xs text-slate-500 mt-1">
                                Novo estoque: {product.current_stock + quantity} un.
                            </p>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Motivo</label>
                        <input
                            type="text"
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            placeholder="Ex: Compra de reposição, Inventário..."
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={addMovement.isPending}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                        >
                            {addMovement.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                            Confirmar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
