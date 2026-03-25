import { useState } from 'react'
import { X, Package, PenLine, Loader2, MessageSquare } from 'lucide-react'
import { getGiftItemName, type GiftItem } from '@/hooks/useCardGifts'

const formatBRL = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

interface GiftItemRowProps {
    item: GiftItem
    onRemove: () => void
    onUpdateNotes: (notes: string) => void
    isRemoving: boolean
    readOnly?: boolean
}

export default function GiftItemRow({ item, onRemove, onUpdateNotes, isRemoving, readOnly }: GiftItemRowProps) {
    const [editingNotes, setEditingNotes] = useState(false)
    const [notes, setNotes] = useState(item.notes ?? '')
    const lineTotal = item.quantity * item.unit_price_snapshot
    const isCustom = !item.product_id
    const name = getGiftItemName(item)

    const handleSaveNotes = () => {
        onUpdateNotes(notes)
        setEditingNotes(false)
    }

    return (
        <div className="py-2 px-3 bg-slate-50 rounded-lg space-y-1.5">
            <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded bg-white border border-slate-200 flex items-center justify-center shrink-0">
                    {isCustom ? (
                        <PenLine className="h-4 w-4 text-pink-400" />
                    ) : item.product?.image_path ? (
                        <img
                            src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/inventory-images/${item.product.image_path}`}
                            alt={name}
                            className="h-full w-full rounded object-cover"
                        />
                    ) : (
                        <Package className="h-4 w-4 text-slate-300" />
                    )}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-slate-900 truncate">{name}</p>
                        {isCustom && (
                            <span className="text-[10px] bg-pink-100 text-pink-600 px-1.5 py-0.5 rounded font-medium shrink-0">avulso</span>
                        )}
                    </div>
                    <p className="text-xs text-slate-400">
                        {item.quantity}x {formatBRL(item.unit_price_snapshot)}
                    </p>
                </div>

                <span className="text-sm font-medium text-slate-700 tabular-nums shrink-0">{formatBRL(lineTotal)}</span>

                {!readOnly && (
                    <div className="flex items-center gap-1 shrink-0">
                        <button
                            onClick={() => setEditingNotes(!editingNotes)}
                            className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
                            title="Observação"
                        >
                            <MessageSquare className={`h-3.5 w-3.5 ${item.notes ? 'text-indigo-500' : ''}`} />
                        </button>
                        <button
                            onClick={onRemove}
                            disabled={isRemoving}
                            className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                            title="Remover item"
                        >
                            {isRemoving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                        </button>
                    </div>
                )}
            </div>

            {/* Notes display (read-only) */}
            {readOnly && item.notes && (
                <p className="text-xs text-slate-500 italic pl-11">{item.notes}</p>
            )}

            {/* Notes edit */}
            {editingNotes && !readOnly && (
                <div className="flex items-center gap-2 pl-11">
                    <input
                        type="text"
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder="Observação para o pós-venda..."
                        className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveNotes() }}
                    />
                    <button
                        onClick={handleSaveNotes}
                        className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                    >
                        Salvar
                    </button>
                </div>
            )}

            {/* Notes display inline when not editing */}
            {!editingNotes && !readOnly && item.notes && (
                <p className="text-xs text-slate-500 italic pl-11 cursor-pointer hover:text-slate-700" onClick={() => setEditingNotes(true)}>
                    {item.notes}
                </p>
            )}
        </div>
    )
}
