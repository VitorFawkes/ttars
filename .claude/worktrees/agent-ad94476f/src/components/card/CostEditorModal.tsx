import { useState, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/Button'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { DollarSign, RefreshCw, TrendingUp, Plane } from 'lucide-react'
import { toast } from 'sonner'
import { proposalKeys } from '@/hooks/useProposal'

interface CostEditorModalProps {
    isOpen: boolean
    onClose: () => void
    cardId: string
}

interface ItemRow {
    id: string
    title: string
    base_price: number
    supplier_cost: number
    item_type: string
    source: 'item' | 'flight'
}

export default function CostEditorModal({ isOpen, onClose, cardId }: CostEditorModalProps) {
    const queryClient = useQueryClient()
    // Store only the user's edits as a map of id -> supplier_cost
    const [costEdits, setCostEdits] = useState<Record<string, number>>({})

    // Fetch accepted proposal items + flights
    const { data: items, isLoading } = useQuery({
        queryKey: ['cost-editor-items', cardId],
        queryFn: async () => {
            const { data: proposals, error: pError } = await supabase
                .from('proposals')
                .select('id, accepted_version_id, active_version_id')
                .eq('card_id', cardId)
                .eq('status', 'accepted')
                .limit(1)

            if (pError) throw pError
            if (!proposals || proposals.length === 0) return []

            const proposal = proposals[0]
            const versionId = proposal.accepted_version_id || proposal.active_version_id
            if (!versionId) return []

            const { data: sections, error: sError } = await supabase
                .from('proposal_sections')
                .select('id')
                .eq('version_id', versionId)

            if (sError) throw sError
            if (!sections || sections.length === 0) return []

            const sectionIds = sections.map(s => s.id)

            // Fetch items and flights in parallel
            const [itemsResult, flightsResult] = await Promise.all([
                supabase
                    .from('proposal_items')
                    .select('id, title, base_price, supplier_cost, item_type')
                    .in('section_id', sectionIds)
                    .order('ordem'),
                supabase
                    .from('proposal_flights')
                    .select('id, origin_airport, destination_airport, price_total, supplier_cost')
                    .eq('proposal_id', proposal.id),
            ])

            if (itemsResult.error) throw itemsResult.error
            if (flightsResult.error) throw flightsResult.error

            const mappedItems: ItemRow[] = (itemsResult.data || []).map(item => ({
                id: item.id,
                title: item.title || 'Item sem título',
                base_price: Number(item.base_price) || 0,
                supplier_cost: Number(item.supplier_cost) || 0,
                item_type: item.item_type || 'custom',
                source: 'item' as const,
            }))

            const mappedFlights: ItemRow[] = (flightsResult.data || []).map(f => ({
                id: f.id,
                title: `${f.origin_airport || '?'} → ${f.destination_airport || '?'}`,
                base_price: Number(f.price_total) || 0,
                supplier_cost: Number(f.supplier_cost) || 0,
                item_type: 'flight',
                source: 'flight' as const,
            }))

            return [...mappedItems, ...mappedFlights]
        },
        enabled: isOpen && !!cardId,
    })

    // Merge query data with local edits
    const localItems: ItemRow[] = useMemo(() => {
        if (!items) return []
        return items.map(item => ({
            ...item,
            supplier_cost: costEdits[item.id] ?? item.supplier_cost,
        }))
    }, [items, costEdits])

    const dirty = Object.keys(costEdits).length > 0

    // Save mutation — writes to the correct table per source
    const saveMutation = useMutation({
        mutationFn: async () => {
            for (const [rowId, cost] of Object.entries(costEdits)) {
                const row = localItems.find(i => i.id === rowId)
                if (!row) continue
                const table = row.source === 'flight' ? 'proposal_flights' : 'proposal_items'
                const { error } = await supabase
                    .from(table)
                    .update({ supplier_cost: cost })
                    .eq('id', rowId)
                if (error) throw error
            }
        },
        onSuccess: () => {
            toast.success('Custos atualizados com sucesso')
            setCostEdits({})
            queryClient.invalidateQueries({ queryKey: ['cost-editor-items', cardId] })
            queryClient.invalidateQueries({ queryKey: proposalKeys.listByCard(cardId) })
        },
        onError: () => {
            toast.error('Erro ao salvar custos')
        },
    })

    // Recalculate receita via RPC
    const recalcMutation = useMutation({
        mutationFn: async () => {
            const { data, error } = await supabase.rpc('recalcular_receita_card', {
                p_card_id: cardId,
            })
            if (error) throw error
            return data
        },
        onSuccess: (result) => {
            const receita = typeof result === 'object' && result !== null ? (result as Record<string, number>).receita : 0
            toast.success(`Receita recalculada: R$ ${Number(receita || 0).toFixed(2)}`)
            queryClient.invalidateQueries({ queryKey: ['card-detail', cardId] })
            queryClient.invalidateQueries({ queryKey: ['pipeline-cards'] })
        },
        onError: () => {
            toast.error('Erro ao recalcular receita')
        },
    })

    const handleCostChange = (itemId: string, value: number) => {
        setCostEdits(prev => ({ ...prev, [itemId]: value }))
    }

    const handleSaveAndRecalc = async () => {
        await saveMutation.mutateAsync()
        await recalcMutation.mutateAsync()
    }

    const totalFaturamento = localItems.reduce((sum, i) => sum + i.base_price, 0)
    const totalCusto = localItems.reduce((sum, i) => sum + i.supplier_cost, 0)
    const totalReceita = totalFaturamento - totalCusto
    const marginPercent = totalFaturamento > 0 ? (totalReceita / totalFaturamento) * 100 : 0

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) { setCostEdits({}); onClose() } }}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <DollarSign className="h-5 w-5 text-amber-600" />
                        Editar Custos de Fornecedor
                    </DialogTitle>
                </DialogHeader>

                {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
                    </div>
                ) : localItems.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                        <p>Nenhuma proposta aceita encontrada para este card.</p>
                        <p className="text-xs mt-1">Aceite uma proposta para editar custos de fornecedor.</p>
                    </div>
                ) : (
                    <>
                        {/* Summary Bar */}
                        <div className="grid grid-cols-4 gap-3 p-3 bg-gray-50 rounded-lg text-center">
                            <div>
                                <p className="text-[10px] uppercase text-gray-400 font-semibold">Faturamento</p>
                                <p className="text-sm font-bold text-gray-700">
                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalFaturamento)}
                                </p>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase text-amber-500 font-semibold">Custo</p>
                                <p className="text-sm font-bold text-amber-700">
                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCusto)}
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

                        {/* Items List */}
                        <div className="flex-1 overflow-y-auto space-y-2 py-2">
                            {localItems.map((item) => {
                                const itemReceita = item.base_price - item.supplier_cost
                                return (
                                    <div
                                        key={item.id}
                                        className="flex items-center gap-3 p-3 bg-white border rounded-lg"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900 truncate flex items-center gap-1.5">
                                                {item.source === 'flight' && <Plane className="h-3.5 w-3.5 text-blue-500 shrink-0" />}
                                                {item.title}
                                            </p>
                                            <p className="text-xs text-gray-400 capitalize">{item.item_type}</p>
                                        </div>

                                        <div className="flex items-center gap-4 flex-shrink-0">
                                            <div className="text-right">
                                                <p className="text-[10px] text-gray-400">Venda</p>
                                                <p className="text-sm font-medium text-gray-700">
                                                    R$ {item.base_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </p>
                                            </div>

                                            <div className="text-right">
                                                <p className="text-[10px] text-amber-500">Custo</p>
                                                <div className="flex items-center gap-1 border border-amber-200 rounded px-2 py-1 bg-amber-50">
                                                    <span className="text-xs text-amber-600">R$</span>
                                                    <input
                                                        type="number"
                                                        value={item.supplier_cost || ''}
                                                        onChange={(e) => handleCostChange(item.id, parseFloat(e.target.value) || 0)}
                                                        className="w-20 text-sm font-semibold text-amber-800 bg-transparent border-none outline-none text-right"
                                                        placeholder="0,00"
                                                        step="0.01"
                                                    />
                                                </div>
                                            </div>

                                            <div className="text-right w-20">
                                                <p className="text-[10px] text-emerald-500">Receita</p>
                                                <p className={`text-sm font-semibold ${itemReceita >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                                    R$ {itemReceita.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </>
                )}

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={onClose}>
                        Fechar
                    </Button>
                    {localItems.length > 0 && (
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
                            Salvar e Recalcular
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
