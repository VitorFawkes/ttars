import { X, Package, Loader2 } from 'lucide-react'
import type { GiftItem } from '@/hooks/useCardGifts'

const formatBRL = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

interface GiftItemRowProps {
    item: GiftItem
    onRemove: () => void
    isRemoving: boolean
    readOnly?: boolean
}

export default function GiftItemRow({ item, onRemove, isRemoving, readOnly }: GiftItemRowProps) {
    const lineTotal = item.quantity * item.unit_price_snapshot

    return (
        <div className="flex items-center gap-3 py-2 px-3 bg-slate-50 rounded-lg">
            <div className="h-8 w-8 rounded bg-white border border-slate-200 flex items-center justify-center shrink-0">
                {item.product?.image_path ? (
                    <img
                        src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/inventory-images/${item.product.image_path}`}
                        alt={item.product.name}
                        className="h-full w-full rounded object-cover"
                    />
                ) : (
                    <Package className="h-4 w-4 text-slate-300" />
                )}
            </div>

            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{item.product?.name ?? 'Produto removido'}</p>
                <p className="text-xs text-slate-400">
                    {item.quantity}x {formatBRL(item.unit_price_snapshot)}
                </p>
            </div>

            <span className="text-sm font-medium text-slate-700 tabular-nums">{formatBRL(lineTotal)}</span>

            {!readOnly && (
                <button
                    onClick={onRemove}
                    disabled={isRemoving}
                    className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                    title="Remover item"
                >
                    {isRemoving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                </button>
            )}
        </div>
    )
}
