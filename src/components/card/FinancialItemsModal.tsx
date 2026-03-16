import { useState, useMemo, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/Button'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Package, RefreshCw, TrendingUp, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface FinancialItemsModalProps {
    isOpen: boolean
    onClose: () => void
    cardId: string
    editItemId?: string | null
}

const PRODUCT_TYPES = [
    { value: 'hotel', label: 'Hotel' },
    { value: 'aereo', label: 'Aéreo' },
    { value: 'transfer', label: 'Transfer' },
    { value: 'experiencia', label: 'Experiência' },
    { value: 'seguro', label: 'Seguro' },
    { value: 'custom', label: 'Outros' },
] as const

interface FinancialItem {
    id: string
    product_type: string
    description: string | null
    sale_value: number
    supplier_cost: number
}

interface LocalItem extends FinancialItem {
    _isNew?: boolean
    _deleted?: boolean
}

let tempIdCounter = 0

export default function FinancialItemsModal({ isOpen, onClose, cardId, editItemId }: FinancialItemsModalProps) {
    const queryClient = useQueryClient()
    const [localEdits, setLocalEdits] = useState<Record<string, Partial<LocalItem>>>({})
    const [newItems, setNewItems] = useState<LocalItem[]>([])
    const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())

    const { data: items, isLoading } = useQuery({
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
        enabled: isOpen && !!cardId,
    })

    // Auto-add empty item when opening in "add" mode (no editItemId)
    useEffect(() => {
        if (isOpen && !editItemId && items && items.length === 0 && newItems.length === 0) {
            handleAddItem()
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, editItemId, items])

    const allItems: LocalItem[] = useMemo(() => {
        const existing = (items || [])
            .filter(item => !deletedIds.has(item.id))
            .map(item => ({
                ...item,
                ...localEdits[item.id],
            }))
        return [...existing, ...newItems]
    }, [items, localEdits, newItems, deletedIds])

    // Filter to single item when editing
    const displayItems = editItemId
        ? allItems.filter(i => i.id === editItemId)
        : allItems

    const dirty = Object.keys(localEdits).length > 0 || newItems.length > 0 || deletedIds.size > 0

    const handleFieldChange = (id: string, field: keyof LocalItem, value: string | number) => {
        const isNew = newItems.find(i => i.id === id)
        if (isNew) {
            setNewItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i))
        } else {
            setLocalEdits(prev => ({
                ...prev,
                [id]: { ...prev[id], [field]: value },
            }))
        }
    }

    const handleAddItem = () => {
        const newItem: LocalItem = {
            id: `_new_${++tempIdCounter}`,
            product_type: 'custom',
            description: null,
            sale_value: 0,
            supplier_cost: 0,
            _isNew: true,
        }
        setNewItems(prev => [...prev, newItem])
    }

    // When user types receita, derive supplier_cost = sale_value - receita
    const handleReceitaChange = (id: string, receita: number) => {
        const item = allItems.find(i => i.id === id)
        if (!item) return
        const saleValue = Number(item.sale_value) || 0
        handleFieldChange(id, 'supplier_cost', Math.round((saleValue - receita) * 100) / 100)
    }

    // When user types %, derive supplier_cost from percentage
    const handlePercentChange = (id: string, pct: number) => {
        const item = allItems.find(i => i.id === id)
        if (!item) return
        const saleValue = Number(item.sale_value) || 0
        const receita = saleValue * (pct / 100)
        handleFieldChange(id, 'supplier_cost', Math.round((saleValue - receita) * 100) / 100)
    }

    const handleDeleteItem = (id: string) => {
        if (id.startsWith('_new_')) {
            setNewItems(prev => prev.filter(i => i.id !== id))
        } else {
            setDeletedIds(prev => new Set([...prev, id]))
            setLocalEdits(prev => {
                const next = { ...prev }
                delete next[id]
                return next
            })
        }
    }

    const saveMutation = useMutation({
        mutationFn: async () => {
            // 1. Delete removed items
            if (deletedIds.size > 0) {
                const { error } = await (supabase
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .from('card_financial_items') as any)
                    .delete()
                    .in('id', [...deletedIds])
                if (error) throw error
            }

            // 2. Update existing items
            for (const [id, edits] of Object.entries(localEdits)) {
                if (deletedIds.has(id)) continue
                const { error } = await (supabase
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .from('card_financial_items') as any)
                    .update({
                        product_type: edits.product_type,
                        description: edits.description,
                        sale_value: edits.sale_value,
                        supplier_cost: edits.supplier_cost,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', id)
                if (error) throw error
            }

            // 3. Insert new items
            if (newItems.length > 0) {
                const inserts = newItems.map(item => ({
                    card_id: cardId,
                    product_type: item.product_type,
                    description: item.description,
                    sale_value: item.sale_value,
                    supplier_cost: item.supplier_cost,
                }))
                const { error } = await (supabase
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .from('card_financial_items') as any)
                    .insert(inserts)
                if (error) throw error
            }
        },
        onSuccess: () => {
            toast.success('Produtos salvos')
            resetState()
            queryClient.invalidateQueries({ queryKey: ['financial-items', cardId] })
        },
        onError: () => {
            toast.error('Erro ao salvar produtos')
        },
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
        onError: () => {
            toast.error('Erro ao recalcular valores')
        },
    })

    const handleSaveAndRecalc = async () => {
        await saveMutation.mutateAsync()
        await recalcMutation.mutateAsync()
    }

    const totalVenda = allItems.reduce((sum, i) => sum + (Number(i.sale_value) || 0), 0)
    const totalReceita = allItems.reduce((sum, i) => {
        const sv = Number(i.sale_value) || 0
        const sc = Number(i.supplier_cost) || 0
        return sum + (sv - sc)
    }, 0)
    const marginPercent = totalVenda > 0 ? (totalReceita / totalVenda) * 100 : 0

    const resetState = () => {
        setLocalEdits({})
        setNewItems([])
        setDeletedIds(new Set())
    }

    const handleClose = () => {
        resetState()
        onClose()
    }

    const modalTitle = editItemId ? 'Editar Produto' : 'Produtos'

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose() }}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Package className="h-5 w-5 text-amber-600" />
                        {modalTitle}
                    </DialogTitle>
                </DialogHeader>

                {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
                    </div>
                ) : (
                    <>
                        {/* Summary Bar — only in full list mode */}
                        {!editItemId && (
                            <div className="grid grid-cols-3 gap-3 p-3 bg-gray-50 rounded-lg text-center">
                                <div>
                                    <p className="text-[10px] uppercase text-gray-400 font-semibold">Venda</p>
                                    <p className="text-sm font-bold text-gray-700">
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalVenda)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase text-emerald-500 font-semibold">Receita</p>
                                    <p className="text-sm font-bold text-emerald-700">
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalReceita)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase text-gray-400 font-semibold">Margem</p>
                                    <p className="text-sm font-bold text-gray-700">
                                        {marginPercent.toFixed(1)}%
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Items List */}
                        <div className="flex-1 overflow-y-auto space-y-2 py-2">
                            {displayItems.length === 0 && (
                                <div className="text-center py-8 text-gray-400 text-sm">
                                    Nenhum produto adicionado. Clique em "Adicionar produto" para começar.
                                </div>
                            )}
                            {displayItems.map((item) => {
                                const saleValue = Number(item.sale_value) || 0
                                const supplierCost = Number(item.supplier_cost) || 0
                                const itemReceita = saleValue - supplierCost
                                const itemPct = saleValue > 0 ? (itemReceita / saleValue) * 100 : 0
                                return (
                                    <div
                                        key={item.id}
                                        className="p-3 bg-white border rounded-lg space-y-2"
                                    >
                                        <div className="flex items-center gap-2">
                                            <select
                                                value={item.product_type}
                                                onChange={(e) => handleFieldChange(item.id, 'product_type', e.target.value)}
                                                className="text-xs border border-gray-200 rounded px-2 py-1 bg-gray-50 text-gray-700"
                                            >
                                                {PRODUCT_TYPES.map(t => (
                                                    <option key={t.value} value={t.value}>{t.label}</option>
                                                ))}
                                            </select>
                                            <input
                                                type="text"
                                                value={item.description || ''}
                                                onChange={(e) => handleFieldChange(item.id, 'description', e.target.value)}
                                                className="flex-1 text-sm border border-gray-200 rounded px-2 py-1 text-gray-700 placeholder-gray-300"
                                                placeholder="Ex: Passagem Lucas, Hotel Cancún..."
                                            />
                                            {!editItemId && (
                                                <button
                                                    onClick={() => handleDeleteItem(item.id)}
                                                    className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="flex-1">
                                                <p className="text-[10px] text-gray-400 mb-0.5">Venda</p>
                                                <div className="flex items-center gap-1 border border-gray-200 rounded px-2 py-1 bg-white">
                                                    <span className="text-xs text-gray-400">R$</span>
                                                    <input
                                                        type="number"
                                                        value={item.sale_value || ''}
                                                        onChange={(e) => handleFieldChange(item.id, 'sale_value', parseFloat(e.target.value) || 0)}
                                                        className="w-full text-sm font-medium text-gray-700 bg-transparent border-none outline-none text-right"
                                                        placeholder="0,00"
                                                        step="0.01"
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-[10px] text-emerald-500 mb-0.5">Receita</p>
                                                <div className="flex items-center gap-1 border border-emerald-200 rounded px-2 py-1 bg-emerald-50">
                                                    <span className="text-xs text-emerald-600">R$</span>
                                                    <input
                                                        type="number"
                                                        value={itemReceita || ''}
                                                        onChange={(e) => handleReceitaChange(item.id, parseFloat(e.target.value) || 0)}
                                                        className="w-full text-sm font-semibold text-emerald-800 bg-transparent border-none outline-none text-right"
                                                        placeholder="0,00"
                                                        step="0.01"
                                                    />
                                                </div>
                                            </div>
                                            <div className="w-20">
                                                <p className="text-[10px] text-gray-400 mb-0.5">%</p>
                                                <div className="flex items-center gap-1 border border-gray-200 rounded px-2 py-1 bg-gray-50">
                                                    <input
                                                        type="number"
                                                        value={saleValue > 0 ? parseFloat(itemPct.toFixed(2)) : ''}
                                                        onChange={(e) => handlePercentChange(item.id, parseFloat(e.target.value) || 0)}
                                                        className="w-full text-sm font-medium text-gray-700 bg-transparent border-none outline-none text-right"
                                                        placeholder="0"
                                                        step="0.5"
                                                    />
                                                    <span className="text-xs text-gray-400">%</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        {/* Add Button — only in full list mode */}
                        {!editItemId && (
                            <button
                                onClick={handleAddItem}
                                className="flex items-center gap-2 text-sm text-amber-600 hover:text-amber-800 font-medium py-2"
                            >
                                <Plus className="h-4 w-4" />
                                Adicionar produto
                            </button>
                        )}
                    </>
                )}

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={handleClose}>
                        Fechar
                    </Button>
                    <Button
                        onClick={handleSaveAndRecalc}
                        disabled={!dirty || saveMutation.isPending || recalcMutation.isPending}
                        className="bg-amber-600 hover:bg-amber-700 text-white"
                    >
                        {saveMutation.isPending || recalcMutation.isPending ? (
                            <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                            <TrendingUp className="h-4 w-4 mr-2" />
                        )}
                        Salvar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
