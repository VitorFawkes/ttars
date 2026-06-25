import { useState } from 'react'
import { X, Loader2, Plus, Minus, RefreshCw } from 'lucide-react'
import { useAddInternalMovement, DESTINATION_LABELS, type InternalDestination } from '@/hooks/useInternalInventoryMovements'
import type { InternalInventoryProduct } from '@/hooks/useInternalInventoryProducts'
import { toast } from 'sonner'

type MovementMode = 'entrada' | 'saida' | 'ajuste'

interface Props {
    product: InternalInventoryProduct
    initialMode?: MovementMode
    onClose: () => void
}

const modes: { key: MovementMode; label: string; activeColor: string }[] = [
    { key: 'entrada', label: 'Entrada', activeColor: 'bg-emerald-50 border-emerald-300 text-emerald-700' },
    { key: 'saida', label: 'Saída', activeColor: 'bg-amber-50 border-amber-300 text-amber-700' },
    { key: 'ajuste', label: 'Ajustar', activeColor: 'bg-indigo-50 border-indigo-300 text-indigo-700' },
]

const destinationOptions = Object.entries(DESTINATION_LABELS) as [InternalDestination, string][]

export default function InternalStockMovementModal({ product, initialMode = 'saida', onClose }: Props) {
    const addMovement = useAddInternalMovement()
    const [mode, setMode] = useState<MovementMode>(initialMode)
    const [qty, setQty] = useState(0)            // entrada/saída: quantidade; ajuste: novo valor
    const [destination, setDestination] = useState<InternalDestination>('on_board')
    const [requestedBy, setRequestedBy] = useState('')
    const [withdrawnBy, setWithdrawnBy] = useState('')
    const [reason, setReason] = useState('')

    const current = product.current_stock
    const newStock = mode === 'entrada' ? current + qty
        : mode === 'saida' ? current - qty
        : qty // ajuste = valor absoluto

    const isValid = (() => {
        if (mode === 'ajuste') return qty >= 0 && qty !== current
        if (mode === 'entrada') return qty > 0
        // saída
        return qty > 0 && qty <= current
    })()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!isValid) return

        const delta = mode === 'ajuste' ? newStock - current
            : mode === 'entrada' ? qty
            : -qty

        try {
            await addMovement.mutateAsync({
                product_id: product.id,
                quantity: delta,
                movement_type: mode === 'ajuste' ? 'ajuste' : mode,
                destination: mode === 'saida' ? destination : null,
                requested_by_name: mode === 'saida' ? (requestedBy.trim() || null) : null,
                withdrawn_by_name: mode === 'saida' ? (withdrawnBy.trim() || null) : null,
                reason: reason.trim() || null,
            })
            toast.success(`Estoque atualizado: ${current} → ${newStock}`)
            onClose()
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Erro ao registrar movimentação'
            toast.error(msg)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-4 border-b border-slate-200">
                    <h2 className="text-lg font-semibold text-slate-900">Movimentar Estoque</h2>
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
                            <p className="text-2xl font-semibold text-slate-900 tabular-nums">{current}</p>
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
                                    onClick={() => { setMode(m.key); setQty(m.key === 'ajuste' ? current : 0) }}
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
                            {mode === 'ajuste' ? 'Novo estoque' : 'Quantidade'}
                        </label>
                        <div className="flex items-center gap-2">
                            <button type="button" onClick={() => setQty(v => Math.max(0, v - 1))}
                                className="flex items-center justify-center w-10 h-10 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 transition-colors">
                                <Minus className="h-4 w-4" />
                            </button>
                            <input
                                type="number" min="0" value={qty}
                                onChange={e => setQty(Math.max(0, parseInt(e.target.value) || 0))}
                                className="flex-1 px-3 py-2 text-center text-lg font-semibold tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <button type="button" onClick={() => setQty(v => v + 1)}
                                className="flex items-center justify-center w-10 h-10 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 transition-colors">
                                <Plus className="h-4 w-4" />
                            </button>
                        </div>
                        {mode === 'saida' && qty > current && (
                            <p className="text-xs text-red-600 mt-1">Quantidade maior que o estoque disponível ({current}).</p>
                        )}
                    </div>

                    {/* Campos exclusivos da SAÍDA — o que a área pediu */}
                    {mode === 'saida' && (
                        <div className="space-y-4 border-t border-slate-100 pt-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Destino *</label>
                                <select
                                    value={destination}
                                    onChange={e => setDestination(e.target.value as InternalDestination)}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                                >
                                    {destinationOptions.map(([key, label]) => (
                                        <option key={key} value={key}>{label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Solicitado por</label>
                                    <input
                                        type="text" value={requestedBy}
                                        onChange={e => setRequestedBy(e.target.value)}
                                        placeholder="Quem pediu"
                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Retirado por</label>
                                    <input
                                        type="text" value={withdrawnBy}
                                        onChange={e => setWithdrawnBy(e.target.value)}
                                        placeholder="Quem retirou"
                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {qty !== 0 && isValid && (
                        <div className={`rounded-lg p-3 text-sm ${
                            newStock >= current ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}>
                            <span className="font-medium">{current}</span>
                            <span className="mx-1">→</span>
                            <span className="font-medium">{newStock}</span>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            Observação <span className="text-slate-400 font-normal">(opcional)</span>
                        </label>
                        <input
                            type="text" value={reason}
                            onChange={e => setReason(e.target.value)}
                            placeholder={mode === 'entrada' ? 'Ex: Compra de reposição' : mode === 'saida' ? 'Ex: Kit de boas-vindas da Ana' : 'Ex: Inventário'}
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
                            {addMovement.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            Confirmar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
