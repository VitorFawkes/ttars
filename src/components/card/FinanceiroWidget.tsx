import { useState } from 'react'
import { Package, Plus, Pencil, Trash2, TrendingUp, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SectionCollapseToggle } from './DynamicSectionWidget'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useReceitaPermission } from '@/hooks/useReceitaPermission'
import FinancialItemsModal from './FinancialItemsModal'
import type { Database } from '@/database.types'
import { toast } from 'sonner'

type Card = Database['public']['Tables']['cards']['Row']

interface FinanceiroWidgetProps {
    cardId: string
    card: Card
    isExpanded?: boolean
    onToggleCollapse?: () => void
}

const PRODUCT_TYPE_LABELS: Record<string, string> = {
    hotel: 'Hotel',
    aereo: 'Aéreo',
    transfer: 'Transfer',
    experiencia: 'Experiência',
    seguro: 'Seguro',
    custom: 'Outros',
}

const formatBRL = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

interface FinancialItem {
    id: string
    product_type: string
    description: string | null
    sale_value: number
    supplier_cost: number
}

export default function FinanceiroWidget({ cardId, isExpanded, onToggleCollapse }: FinanceiroWidgetProps) {
    const receitaPerm = useReceitaPermission()
    const queryClient = useQueryClient()
    const [showModal, setShowModal] = useState(false)
    const [editingItemId, setEditingItemId] = useState<string | null>(null)

    const { data: items = [], isLoading } = useQuery({
        queryKey: ['financial-items', cardId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('card_financial_items')
                .select('id, product_type, description, sale_value, supplier_cost')
                .eq('card_id', cardId)
                .order('created_at')
            if (error) throw error
            return (data || []) as FinancialItem[]
        },
        enabled: !!cardId,
    })

    const deleteMutation = useMutation({
        mutationFn: async (itemId: string) => {
            const { error } = await (supabase
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .from('card_financial_items') as any)
                .delete()
                .eq('id', itemId)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['financial-items', cardId] })
            recalcMutation.mutate()
        },
        onError: () => toast.error('Erro ao remover produto'),
    })

    const recalcMutation = useMutation({
        mutationFn: async () => {
            const { data, error } = await supabase.rpc('recalcular_financeiro_manual', {
                p_card_id: cardId,
            })
            if (error) throw error
            return data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['card-detail', cardId] })
            queryClient.invalidateQueries({ queryKey: ['pipeline-cards'] })
        },
    })

    if (!receitaPerm.canView) return null

    const totalVenda = items.reduce((sum, i) => sum + (Number(i.sale_value) || 0), 0)
    const totalLiquido = items.reduce((sum, i) => sum + (Number(i.supplier_cost) || 0), 0)
    const totalReceita = totalVenda - totalLiquido
    const marginPercent = totalVenda > 0 ? (totalReceita / totalVenda) * 100 : 0

    const handleOpenAdd = () => {
        setEditingItemId(null)
        setShowModal(true)
    }

    const handleOpenEdit = (itemId: string) => {
        setEditingItemId(itemId)
        setShowModal(true)
    }

    const handleDelete = (e: React.MouseEvent, itemId: string) => {
        e.stopPropagation()
        if (confirm('Remover este produto?')) {
            deleteMutation.mutate(itemId)
        }
    }

    return (
        <>
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                {/* Header */}
                <div
                    className={cn(
                        "flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50/50",
                        onToggleCollapse && "cursor-pointer hover:bg-gray-100/50 transition-colors"
                    )}
                    onClick={onToggleCollapse}
                >
                    <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <Package className="h-4 w-4 text-amber-600" />
                        Produtos
                    </h3>
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        {receitaPerm.canEdit && (
                            <button
                                onClick={handleOpenAdd}
                                className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 font-medium"
                            >
                                <Plus className="h-3.5 w-3.5" />
                                Adicionar
                            </button>
                        )}
                        {onToggleCollapse && (
                            <SectionCollapseToggle isExpanded={isExpanded ?? true} onToggle={onToggleCollapse} />
                        )}
                    </div>
                </div>

                {/* Content */}
                <div className="divide-y divide-gray-100">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-6">
                            <RefreshCw className="h-4 w-4 animate-spin text-gray-300" />
                        </div>
                    ) : items.length === 0 ? (
                        <div className="px-4 py-6 text-center">
                            <Package className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                            <p className="text-xs text-gray-400">Nenhum produto adicionado</p>
                            {receitaPerm.canEdit && (
                                <button
                                    onClick={handleOpenAdd}
                                    className="mt-2 text-xs text-amber-600 hover:text-amber-800 font-medium"
                                >
                                    + Adicionar primeiro produto
                                </button>
                            )}
                        </div>
                    ) : (
                        <>
                            {/* Product list */}
                            {items.map((item) => {
                                const itemLiquido = (Number(item.sale_value) || 0) - (Number(item.supplier_cost) || 0)
                                return (
                                    <div
                                        key={item.id}
                                        className={cn(
                                            "px-4 py-2.5 group",
                                            receitaPerm.canEdit && "cursor-pointer hover:bg-gray-50/80 transition-colors"
                                        )}
                                        onClick={() => receitaPerm.canEdit && handleOpenEdit(item.id)}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="text-sm font-medium text-gray-900 truncate">
                                                    {item.description || PRODUCT_TYPE_LABELS[item.product_type] || 'Produto'}
                                                </span>
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0">
                                                    {PRODUCT_TYPE_LABELS[item.product_type] || item.product_type}
                                                </span>
                                            </div>
                                            {receitaPerm.canEdit && (
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                                    <Pencil className="h-3 w-3 text-gray-400" />
                                                    <button
                                                        onClick={(e) => handleDelete(e, item.id)}
                                                        className="p-0.5 text-gray-300 hover:text-red-500 transition-colors"
                                                    >
                                                        <Trash2 className="h-3 w-3" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-4 text-xs">
                                            <span className="text-gray-500">
                                                Venda <span className="font-medium text-gray-700">{formatBRL(Number(item.sale_value) || 0)}</span>
                                            </span>
                                            <span className="text-gray-500">
                                                Líquido <span className={cn("font-medium", itemLiquido >= 0 ? "text-emerald-600" : "text-red-600")}>{formatBRL(itemLiquido)}</span>
                                            </span>
                                        </div>
                                    </div>
                                )
                            })}

                            {/* Footer totals */}
                            <div className="px-4 py-2.5 bg-gray-50/80">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-gray-500 font-medium">Total</span>
                                    <div className="flex items-center gap-4">
                                        <span className="text-gray-500">
                                            Venda <span className="font-semibold text-gray-900">{formatBRL(totalVenda)}</span>
                                        </span>
                                        <span className="text-gray-500">
                                            Líquido <span className={cn("font-semibold", totalReceita >= 0 ? "text-emerald-600" : "text-red-600")}>{formatBRL(totalReceita)}</span>
                                        </span>
                                        {totalVenda > 0 && (
                                            <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                                                <TrendingUp className="h-3 w-3" />
                                                {marginPercent.toFixed(0)}%
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Modal for add/edit */}
            <FinancialItemsModal
                isOpen={showModal}
                onClose={() => { setShowModal(false); setEditingItemId(null) }}
                cardId={cardId}
                editItemId={editingItemId}
            />
        </>
    )
}
