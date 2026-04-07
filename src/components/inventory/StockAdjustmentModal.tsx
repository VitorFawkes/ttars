import { useState, useRef, useEffect } from 'react'
import { X, Loader2, Plus, Minus } from 'lucide-react'
import { useAddMovement } from '@/hooks/useInventoryMovements'
import type { InventoryProduct } from '@/hooks/useInventoryProducts'
import { toast } from 'sonner'

type AdjustMode = 'set' | 'add' | 'remove'

interface StockAdjustmentModalProps {
    product: InventoryProduct
    onClose: () => void
}

export default function StockAdjustmentModal({ product, onClose }: StockAdjustmentModalProps) {
    const addMovement = useAddMovement()
    const [mode, setModeRaw] = useState<AdjustMode>('set')
    const [value, setValue] = useState(product.current_stock)
    const [reason, setReason] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        setTimeout(() => inputRef.current?.select(), 50)
    }, [])

    const setMode = (m: AdjustMode) => {
        setModeRaw(m)
        setValue(m === 'set' ? product.current_stock : 0)
    }

    const newStock = mode === 'set' ? value
        : mode === 'add' ? product.current_stock + value
        : product.current_stock - value

    const delta = newStock - product.current_stock
    const isValid = value >= 0 && newStock >= 0 && delta !== 0

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!isValid) return

        try {
            await addMovement.mutateAsync({
                product_id: product.id,
                quantity: delta,
                movement_type: delta > 0 ? 'entrada' : 'ajuste',
                reason: reason || `${mode === 'set' ? 'Estoque definido para' : mode === 'add' ? 'Entrada de' : 'Saída de'} ${Math.abs(delta)} un.`,
            })
            toast.success(`Estoque atualizado: ${product.current_stock} → ${newStock}`)
            onClose()
        } catch {
            toast.error('Erro ao ajustar estoque')
        }
    }

    const modes: { key: AdjustMode; label: string; icon: typeof Plus; color: string; activeColor: string }[] = [
        { key: 'set', label: 'Definir', icon: X, color: 'text-slate-600', activeColor: 'bg-indigo-50 border-indigo-300 text-indigo-700' },
        { key: 'add', label: 'Entrada', icon: Plus, color: 'text-slate-600', activeColor: 'bg-emerald-50 border-emerald-300 text-emerald-700' },
        { key: 'remove', label: 'Saída', icon: Minus, color: 'text-slate-600', activeColor: 'bg-amber-50 border-amber-300 text-amber-700' },
    ]

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-4 border-b border-slate-200">
                    <h2 className="text-lg font-semibold text-slate-900">Ajustar Estoque</h2>
                    <button onClick={onClose} className="p-1 rounded hover:bg-slate-100">
                        <X className="h-5 w-5 text-slate-400" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <div className="bg-slate-50 rounded-lg p-3 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-slate-900">{product.name}</p>
                            <p className="text-xs text-slate-500">SKU: {product.sku}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-2xl font-semibold text-slate-900 tabular-nums">{product.current_stock}</p>
                            <p className="text-xs text-slate-500">em estoque</p>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Operação</label>
                        <div className="flex gap-2">
                            {modes.map(m => (
                                <button
                                    key={m.key}
                                    type="button"
                                    onClick={() => setMode(m.key)}
                                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                                        mode === m.key ? m.activeColor : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                                    }`}
                                >
                                    {m.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            {mode === 'set' ? 'Novo estoque' : 'Quantidade'}
                        </label>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setValue(v => Math.max(0, v - 1))}
                                className="flex items-center justify-center w-10 h-10 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 transition-colors"
                            >
                                <Minus className="h-4 w-4" />
                            </button>
                            <input
                                ref={inputRef}
                                type="number"
                                min="0"
                                value={value}
                                onChange={e => setValue(Math.max(0, parseInt(e.target.value) || 0))}
                                className="flex-1 px-3 py-2 text-center text-lg font-semibold tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <button
                                type="button"
                                onClick={() => setValue(v => v + 1)}
                                className="flex items-center justify-center w-10 h-10 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 transition-colors"
                            >
                                <Plus className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    {delta !== 0 && (
                        <div className={`rounded-lg p-3 text-sm ${
                            delta > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}>
                            <span className="font-medium">{product.current_stock}</span>
                            <span className="mx-1">→</span>
                            <span className="font-medium">{newStock}</span>
                            <span className="ml-1 opacity-70">({delta > 0 ? '+' : ''}{delta})</span>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Motivo <span className="text-slate-400 font-normal">(opcional)</span></label>
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
                            disabled={!isValid || addMovement.isPending}
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
