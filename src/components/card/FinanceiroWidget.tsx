import { useState, useRef } from 'react'
import { Package, TrendingUp, RefreshCw, Trash2, Check, ChevronDown, ChevronRight, Paperclip, ClipboardList, MessageSquare, Users, Calendar, Building2, FileText, AlertCircle, DownloadCloud } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SectionCollapseToggle } from './DynamicSectionWidget'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProductRequirements } from '@/hooks/useProductRequirements'
import { useAutoCalcTripDate } from '@/hooks/useAutoCalcTripDate'
import { useFinancialItemPassengers } from '@/hooks/useFinancialItemPassengers'
import { useDeleteFinancialItem } from '@/hooks/useDeleteFinancialItem'
import type { FinancialItemPassenger } from '@/hooks/useFinancialItemPassengers'
import { useCardFinancialSummary, type FinancialItem } from '@/hooks/useCardFinancialSummary'
import { useCardMondeVendas, useReconcileMondeVenda } from '@/hooks/useCardMondeVendas'
import { useMondePullCard } from '@/hooks/useMondePullCard'
import type { Database } from '@/database.types'

type Card = Database['public']['Tables']['cards']['Row']

interface FinanceiroWidgetProps {
    cardId: string
    card: Card
    isExpanded?: boolean
    onToggleCollapse?: () => void
}

interface CardPhaseInfo {
    slug: string | null
    isTerminalPhase: boolean
    isEntryPhase: boolean
}

/** Derives phase slug and capabilities from the card's current stage */
function useCardPhaseInfo(stageId: string | null): CardPhaseInfo {
    const { data } = useQuery({
        queryKey: ['stage-phase-info', stageId],
        queryFn: async () => {
            if (!stageId) return null
            const { data, error } = await supabase
                .from('pipeline_stages')
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .select('pipeline_phases!pipeline_stages_phase_id_fkey(slug, is_terminal_phase, is_entry_phase)' as any)
                .eq('id', stageId)
                .single()
            if (error) return null
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const phase = (data as any)?.pipeline_phases as Record<string, unknown> | null
            return {
                slug: (phase?.slug as string | null) ?? null,
                isTerminalPhase: (phase?.is_terminal_phase as boolean | null) ?? false,
                isEntryPhase: (phase?.is_entry_phase as boolean | null) ?? false,
            }
        },
        enabled: !!stageId,
        staleTime: 1000 * 60 * 5,
    })
    return data ?? { slug: null, isTerminalPhase: false, isEntryPhase: false }
}

const formatBRL = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

export default function FinanceiroWidget({ cardId, card, isExpanded, onToggleCollapse }: FinanceiroWidgetProps) {
    const { slug: phaseSlug, isTerminalPhase } = useCardPhaseInfo(card.pipeline_stage_id)
    // Terminal phases (e.g. Pós-Venda, Resolução) are in execution mode — use isTerminalPhase from DB,
    // falling back to slug comparison for backwards compat while DB columns are being populated.
    const isPostSales = isTerminalPhase || phaseSlug === 'pos_venda'

    // Auto-calcula Data Viagem c/ Welcome a partir das datas dos produtos
    useAutoCalcTripDate(cardId)

    const deleteItem = useDeleteFinancialItem(cardId)

    const handleDeleteItem = (item: FinancialItem) => {
        const label = item.fornecedor || item.description || 'sem nome'
        const isReadyWarning = item.is_ready
            ? 'Esse produto está marcado como pronto. '
            : ''
        if (confirm(`${isReadyWarning}Apagar o produto "${label}"? Pode recuperar depois se precisar.`)) {
            deleteItem.mutate(item.id)
        }
    }

    const summary = useCardFinancialSummary(cardId, card)
    const { items, isLoading, readyCount, obsCount } = summary
    const { data: mondeVendas = [] } = useCardMondeVendas(cardId)
    const pullMonde = useMondePullCard(cardId)
    const totalVenda = summary.fechado
    const valorPrevisto = summary.orcamentoPrevisto
    const showComparativo = summary.hasOrcamento
    const delta = -summary.falta
    const percentAtingido = valorPrevisto > 0
        ? Math.min((totalVenda / valorPrevisto) * 100, 100)
        : 0

    return (
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
                    Produto - Vendas
                    {isPostSales && items.length > 0 && (
                        <span className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                            readyCount === items.length
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-amber-100 text-amber-700"
                        )}>
                            {readyCount}/{items.length}
                        </span>
                    )}
                    {obsCount > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700 flex items-center gap-0.5">
                            <AlertCircle className="h-3 w-3" />
                            {obsCount} obs. do Planner
                        </span>
                    )}
                </h3>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {card.produto === 'TRIPS' && (
                        <button
                            type="button"
                            onClick={() => pullMonde.mutate()}
                            disabled={pullMonde.isPending}
                            title="Buscar as vendas deste card direto no Monde e atualizar valor/receita"
                            className="flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-md px-2 py-1 transition-colors disabled:opacity-50"
                        >
                            <DownloadCloud className={cn("h-3.5 w-3.5", pullMonde.isPending && "animate-pulse")} />
                            {pullMonde.isPending ? 'Puxando…' : 'Puxar do Monde'}
                        </button>
                    )}
                    {onToggleCollapse && (
                        <SectionCollapseToggle isExpanded={isExpanded ?? true} onToggle={onToggleCollapse} />
                    )}
                </div>
            </div>

            {/* Comparativo Previsto vs Fechado */}
            {showComparativo && (
                <div className="px-4 py-3 border-b border-gray-100 bg-slate-50/50">
                    <div className="grid grid-cols-3 gap-3 text-xs">
                        <div>
                            <div className="text-slate-500">Previsto</div>
                            <div className="font-semibold text-slate-900 mt-0.5">{formatBRL(valorPrevisto)}</div>
                        </div>
                        <div>
                            <div className="text-slate-500">Fechado</div>
                            <div className="font-semibold text-slate-900 mt-0.5">{formatBRL(totalVenda)}</div>
                        </div>
                        <div>
                            <div className="text-slate-500">{delta >= 0 ? 'Excedeu' : 'Falta'}</div>
                            <div className={cn(
                                "font-semibold mt-0.5",
                                delta >= 0 ? "text-emerald-600" : "text-amber-600"
                            )}>
                                {formatBRL(Math.abs(delta))}
                            </div>
                        </div>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                        <div
                            className={cn(
                                "h-full transition-all",
                                delta >= 0 ? "bg-emerald-500" : "bg-indigo-500"
                            )}
                            style={{ width: `${percentAtingido}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Planner observations banner — visible to pós-venda */}
            {isPostSales && obsCount > 0 && (
                <div className="mx-3 mt-2 mb-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                    <div className="flex items-start gap-2 mb-1.5">
                        <AlertCircle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                        <p className="text-xs font-semibold text-amber-800">
                            Observações do Travel Planner
                        </p>
                    </div>
                    <div className="space-y-1.5 ml-5.5">
                        {items.filter(i => i.observacoes).map(item => (
                            <div key={item.id} className="flex items-start gap-2">
                                <span className="text-[11px] font-medium text-amber-700 shrink-0 min-w-[80px] truncate">
                                    {item.fornecedor || item.description || 'Produto'}:
                                </span>
                                <span className="text-[11px] text-amber-900 leading-snug">
                                    {item.observacoes}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Content */}
            <div className="divide-y divide-gray-100">
                {isLoading ? (
                    <div className="flex items-center justify-center py-6">
                        <RefreshCw className="h-4 w-4 animate-spin text-gray-300" />
                    </div>
                ) : items.length === 0 && mondeVendas.length === 0 ? (
                    <div className="px-4 py-6 text-center">
                        <Package className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                        <p className="text-xs text-gray-400">Nenhum produto cadastrado</p>
                    </div>
                ) : (
                    <>
                        {(() => {
                            const groups = new Map<string, FinancialItem[]>()
                            for (const it of items) {
                                const key = it.monde_venda_num || '__manual__'
                                const arr = groups.get(key) ?? []
                                arr.push(it)
                                groups.set(key, arr)
                            }
                            // Garantir grupo para cada venda declarada no card,
                            // mesmo sem produtos sincronizados ainda.
                            for (const v of mondeVendas) {
                                if (!groups.has(v.numero)) groups.set(v.numero, [])
                            }
                            // Ordenação: primário primeiro, demais Monde por número, manual no fim
                            const primary = mondeVendas.find(v => v.is_primary)?.numero
                            const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
                                if (a === '__manual__') return 1
                                if (b === '__manual__') return -1
                                if (primary && a === primary) return -1
                                if (primary && b === primary) return 1
                                return a.localeCompare(b)
                            })
                            return sortedKeys.map((vendaKey) => {
                                const groupItems = groups.get(vendaKey) ?? []
                                const isMonde = vendaKey !== '__manual__'
                                return (
                                    <div key={vendaKey}>
                                        {isMonde && (
                                            <VendaMondeHeader vendaNum={vendaKey} cardId={cardId} qtd={groupItems.length} />
                                        )}
                                        {groupItems.length === 0 && isMonde ? (
                                            <div className="px-4 py-3 text-center bg-slate-50/30">
                                                <p className="text-[11px] text-slate-400">
                                                    Nenhum produto sincronizado ainda — clique em <span className="font-medium text-slate-500">Re-sincronizar</span> ou importe a planilha Monde dessa venda.
                                                </p>
                                            </div>
                                        ) : (
                                            groupItems.map((item) => (
                                                isPostSales ? (
                                                    <ProductItemOperational key={item.id} item={item} cardId={cardId} onDelete={() => handleDeleteItem(item)} />
                                                ) : (
                                                    <ProductItemReadOnly key={item.id} item={item} cardId={cardId} phaseSlug={phaseSlug ?? undefined} onDelete={() => handleDeleteItem(item)} />
                                                )
                                            ))
                                        )}
                                    </div>
                                )
                            })
                        })()}

                        {/* Footer totals */}
                        <div className="px-4 py-2.5 bg-gray-50/80">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-500 font-medium">Total</span>
                                <div className="flex items-center gap-4">
                                    <span className="text-gray-500">
                                        Venda <span className="font-semibold text-gray-900">{formatBRL(totalVenda)}</span>
                                    </span>
                                    <span className="text-gray-500">
                                        Receita <span className={cn("font-semibold", summary.receitaFechada >= 0 ? "text-emerald-600" : "text-red-600")}>{formatBRL(summary.receitaFechada)}</span>
                                    </span>
                                    {totalVenda > 0 && (
                                        <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                                            <TrendingUp className="h-3 w-3" />
                                            {summary.marginPercent.toFixed(0)}%
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

// ═══════════════════════════════════════════════════════════
// Cabeçalho de grupo por venda Monde — com botão de re-sincronizar
// ═══════════════════════════════════════════════════════════

function VendaMondeHeader({ vendaNum, cardId, qtd }: { vendaNum: string; cardId: string; qtd: number }) {
    const reconcile = useReconcileMondeVenda(cardId)
    return (
        <div className="px-4 py-1.5 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">
                Venda Monde <span className="font-semibold text-slate-700">{vendaNum}</span>
                <span className="text-slate-400"> · {qtd} {qtd === 1 ? 'produto' : 'produtos'}</span>
            </span>
            <button
                onClick={() => reconcile.mutate(vendaNum)}
                disabled={reconcile.isPending}
                className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors",
                    reconcile.isPending
                        ? "text-slate-400 cursor-wait"
                        : "text-slate-500 hover:text-indigo-600 hover:bg-indigo-50"
                )}
                title="Re-sincronizar produtos com o arquivo Monde atual"
            >
                <RefreshCw className={cn("h-3 w-3", reconcile.isPending && "animate-spin")} />
                {reconcile.isPending ? 'Sincronizando…' : 'Re-sincronizar'}
            </button>
        </div>
    )
}

// ═══════════════════════════════════════════════════════════
// Read-Only Item (SDR, Planner, etc.)
// ═══════════════════════════════════════════════════════════

function formatDateBR(iso: string | null) {
    if (!iso) return null
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
}

function ProductItemReadOnly({ item, cardId, phaseSlug, onDelete }: { item: FinancialItem; cardId: string; phaseSlug?: string; onDelete?: () => void }) {
    const sv = Number(item.sale_value) || 0
    const sc = Number(item.supplier_cost) || 0
    const itemReceita = sv - sc
    const itemPct = sv > 0 ? (itemReceita / sv) * 100 : 0
    const hasExtras = item.fornecedor || item.representante || item.documento || item.data_inicio || item.data_fim
    // O time de fechamento pode editar obs; outras fases (ReadOnly) veem como texto.
    // Fase de fechamento: 'planner' no Trips, 'closer' no Weddings.
    const isClosingPhase = phaseSlug === 'planner' || phaseSlug === 'closer'

    return (
        <div className="px-4 py-2.5 group">
            <div className="mb-1">
                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 truncate">
                        {item.fornecedor || item.description || 'Produto'}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                            <TrendingUp className="h-3 w-3" />
                            {itemPct.toFixed(0)}%
                        </span>
                        {onDelete && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onDelete() }}
                                className="p-1 rounded text-gray-300 hover:bg-red-50 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Apagar produto"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                </div>
                {item.fornecedor && item.description && (
                    <span className="text-[11px] text-gray-400">{item.description}</span>
                )}
            </div>
            <div className="flex items-center gap-4 text-xs">
                <span className="text-gray-500">
                    Venda <span className="font-medium text-gray-700">{formatBRL(sv)}</span>
                </span>
                <span className="text-gray-500">
                    Receita <span className={cn("font-medium", itemReceita >= 0 ? "text-emerald-600" : "text-red-600")}>{formatBRL(itemReceita)}</span>
                </span>
            </div>
            {hasExtras && (
                <ExtraFieldsRow item={item} />
            )}
            {isClosingPhase ? (
                <ObservacoesField item={item} cardId={cardId} />
            ) : item.observacoes ? (
                <div className="mt-1.5 flex items-start gap-1.5 rounded bg-amber-50 border border-amber-100 px-2 py-1.5">
                    <AlertCircle className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-[11px] text-amber-800 leading-snug">
                        <span className="font-medium">Planner:</span> {item.observacoes}
                    </p>
                </div>
            ) : null}
        </div>
    )
}

// ═══════════════════════════════════════════════════════════
// Extra fields row (shared between ReadOnly and Operational)
// ═══════════════════════════════════════════════════════════

function ExtraFieldsRow({ item, className }: { item: FinancialItem; className?: string }) {
    return (
        <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-gray-500", className)}>
            {item.fornecedor && (
                <span className="flex items-center gap-1">
                    <Building2 className="h-3 w-3 text-gray-400" />
                    {item.fornecedor}
                </span>
            )}
            {item.representante && (
                <span className="text-gray-400">via {item.representante}</span>
            )}
            {item.documento && (
                <span className="flex items-center gap-1">
                    <FileText className="h-3 w-3 text-gray-400" />
                    {item.documento}
                </span>
            )}
            {(item.data_inicio || item.data_fim) && (
                <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3 text-gray-400" />
                    {formatDateBR(item.data_inicio)}{item.data_fim && item.data_fim !== item.data_inicio ? ` → ${formatDateBR(item.data_fim)}` : ''}
                </span>
            )}
        </div>
    )
}

// ═══════════════════════════════════════════════════════════
// Operational Item (Pós-Vendas)
// ═══════════════════════════════════════════════════════════

function ProductItemOperational({ item, cardId, onDelete }: { item: FinancialItem; cardId: string; onDelete?: () => void }) {
    const queryClient = useQueryClient()
    const [isOpen, setIsOpen] = useState(false)
    const [editingNotes, setEditingNotes] = useState(false)
    const [notesValue, setNotesValue] = useState(item.notes || '')

    const { byProduct, progressByProduct, toggleStatus, updateRequirement, deleteRequirement, uploadFile } = useProductRequirements(cardId)
    const reqs = byProduct(item.id)
    const progress = progressByProduct(item.id)

    const {
        byProduct: passengersByProduct,
        progressByProduct: paxProgressByProduct,
        toggleStatus: togglePaxStatus,
        updateObservation,
        deletePassenger,
    } = useFinancialItemPassengers(cardId)
    const passengers = passengersByProduct(item.id)
    const paxProgress = paxProgressByProduct(item.id)

    const sv = Number(item.sale_value) || 0
    const sc = Number(item.supplier_cost) || 0
    const itemReceita = sv - sc

    const toggleReady = useMutation({
        mutationFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase.from('card_financial_items') as any)
                .update({ is_ready: !item.is_ready })
                .eq('id', item.id)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['financial-items', cardId] })
            queryClient.invalidateQueries({ queryKey: ['pipeline-cards'] })
        },
    })

    const saveNotes = useMutation({
        mutationFn: async (notes: string) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase.from('card_financial_items') as any)
                .update({ notes: notes || null })
                .eq('id', item.id)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['financial-items', cardId] })
            setEditingNotes(false)
        },
    })

    const hasChangeAlert = !!item.last_change_summary && !item.is_ready

    return (
        <div className={cn(
            "border-l-2 transition-colors group",
            hasChangeAlert ? "border-l-orange-500 bg-orange-50/40"
                : item.is_ready ? "border-l-emerald-400 bg-emerald-50/30"
                : "border-l-amber-400"
        )}>
            {/* Product header */}
            <div className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                    {/* Ready checkbox */}
                    <button
                        onClick={() => toggleReady.mutate()}
                        className={cn(
                            "flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
                            item.is_ready
                                ? "bg-emerald-500 border-emerald-500 text-white"
                                : "border-gray-300 hover:border-amber-400"
                        )}
                    >
                        {item.is_ready && <Check className="h-3 w-3" />}
                    </button>

                    {/* Expand toggle */}
                    <button onClick={() => setIsOpen(!isOpen)} className="text-gray-400 hover:text-gray-600">
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>

                    {/* Fornecedor (primary) + produto (secondary) */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                            <span className={cn(
                                "text-sm font-medium truncate",
                                item.is_ready ? "text-emerald-700 line-through" : "text-gray-900"
                            )}>
                                {item.fornecedor || item.description || 'Produto'}
                            </span>
                            <span className="text-xs text-gray-500 shrink-0 ml-2">{formatBRL(sv)}</span>
                        </div>
                        {/* Secondary line: produto type + dates (when collapsed) */}
                        {!isOpen && (
                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-400 truncate">
                                {item.fornecedor && item.description && (
                                    <span className="truncate">{item.description}</span>
                                )}
                                {(item.data_inicio || item.data_fim) && (
                                    <span className="flex items-center gap-1 shrink-0">
                                        <Calendar className="h-3 w-3 text-gray-300" />
                                        {formatDateBR(item.data_inicio)}{item.data_fim && item.data_fim !== item.data_inicio ? ` → ${formatDateBR(item.data_fim)}` : ''}
                                    </span>
                                )}
                            </div>
                        )}
                        {/* Planner observation preview — always visible even collapsed */}
                        {!isOpen && item.observacoes && (
                            <div className="mt-1 flex items-start gap-1.5 rounded bg-amber-50 border border-amber-100 px-2 py-1">
                                <AlertCircle className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                                <p className="text-[11px] text-amber-800 leading-snug line-clamp-2">
                                    <span className="font-medium">Planner:</span> {item.observacoes}
                                </p>
                            </div>
                        )}
                        {/* Monde re-import change alert — visible até a equipe re-marcar feito */}
                        {hasChangeAlert && (
                            <div className="mt-1 flex items-start gap-1.5 rounded bg-orange-50 border border-orange-200 px-2 py-1">
                                <AlertCircle className="h-3 w-3 text-orange-500 mt-0.5 shrink-0" />
                                <div className="text-[11px] leading-snug min-w-0">
                                    <span className="font-semibold text-orange-800">Alterado no Monde</span>
                                    <span className="text-orange-700"> · {item.last_change_summary}</span>
                                    <span className="text-orange-500 italic"> — confira e marque feito de novo</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Progress badges */}
                    {progress.total > 0 && (
                        <span className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0",
                            progress.completed === progress.total
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-gray-100 text-gray-500"
                        )}>
                            {progress.completed}/{progress.total}
                        </span>
                    )}
                    {paxProgress.total > 0 && (
                        <span className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 flex items-center gap-0.5",
                            paxProgress.completed === paxProgress.total
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-indigo-50 text-indigo-500"
                        )}>
                            <Users className="h-2.5 w-2.5" />
                            {paxProgress.completed}/{paxProgress.total}
                        </span>
                    )}
                    {onDelete && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onDelete() }}
                            className="p-1 rounded text-gray-300 hover:bg-red-50 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                            title="Apagar produto"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Expanded content */}
            {isOpen && (
                <div className="px-4 pb-3 space-y-2">
                    {/* Financial summary */}
                    <div className="flex items-center gap-4 text-xs ml-12">
                        <span className="text-gray-500">
                            Venda <span className="font-medium text-gray-700">{formatBRL(sv)}</span>
                        </span>
                        <span className="text-gray-500">
                            Receita <span className={cn("font-medium", itemReceita >= 0 ? "text-emerald-600" : "text-red-600")}>{formatBRL(itemReceita)}</span>
                        </span>
                    </div>

                    {/* Extra fields (fornecedor, representante, doc, datas) */}
                    {(item.fornecedor || item.representante || item.documento || item.data_inicio || item.data_fim) && (
                        <ExtraFieldsRow item={item} className="ml-12" />
                    )}

                    {/* Observações */}
                    <ObservacoesField item={item} cardId={cardId} />

                    {/* Sub-items (requirements) */}
                    {reqs.length > 0 && (
                        <div className="ml-12 space-y-1">
                            {reqs.map(req => (
                                <RequirementRow
                                    key={req.id}
                                    req={req}
                                    cardId={cardId}
                                    financialItemId={item.id}
                                    onToggle={() => toggleStatus.mutate(req.id)}
                                    onUpdate={(updates) => updateRequirement.mutate({ id: req.id, ...updates })}
                                    onDelete={() => deleteRequirement.mutate(req.id)}
                                    onUpload={(file) => uploadFile.mutate({ requirementId: req.id, financialItemId: item.id, file })}
                                />
                            ))}
                        </div>
                    )}

                    {/* Passengers section */}
                    <div className="ml-12 space-y-1">
                        {passengers.length > 0 && (
                            <>
                                <div className="flex items-center gap-1.5 mb-1 pt-1 border-t border-gray-100">
                                    <Users className="h-3 w-3 text-indigo-400" />
                                    <span className="text-[10px] font-medium text-indigo-500 uppercase tracking-wide">Passageiros</span>
                                </div>
                                {passengers.map(pax => (
                                    <PassengerRow
                                        key={pax.id}
                                        passenger={pax}
                                        onToggle={() => togglePaxStatus.mutate(pax.id)}
                                        onUpdateObservation={(obs) => updateObservation.mutate({ id: pax.id, observacao: obs })}
                                        onDelete={() => deletePassenger.mutate(pax.id)}
                                    />
                                ))}
                            </>
                        )}
                    </div>

                    {/* Nota operacional (pós-venda) */}
                    <div className="ml-12">
                        {editingNotes ? (
                            <div className="flex items-start gap-2">
                                <textarea
                                    value={notesValue}
                                    onChange={e => setNotesValue(e.target.value)}
                                    placeholder="Nota operacional (uso interno pós-venda)..."
                                    className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 text-gray-700 placeholder-gray-300 resize-none focus:outline-none focus:ring-1 focus:ring-amber-300"
                                    rows={2}
                                    autoFocus
                                />
                                <button
                                    onClick={() => saveNotes.mutate(notesValue)}
                                    className="text-xs text-amber-600 hover:text-amber-800 font-medium shrink-0"
                                >
                                    Salvar
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => { setNotesValue(item.notes || ''); setEditingNotes(true) }}
                                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
                            >
                                <MessageSquare className="h-3 w-3" />
                                {item.notes ? (
                                    <span className="text-gray-500 italic truncate max-w-[200px]">{item.notes}</span>
                                ) : (
                                    'Nota operacional'
                                )}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

// ═══════════════════════════════════════════════════════════
// Observações (editable field)
// ═══════════════════════════════════════════════════════════

function ObservacoesField({ item, cardId }: { item: FinancialItem; cardId: string }) {
    const queryClient = useQueryClient()
    const [editing, setEditing] = useState(false)
    const [value, setValue] = useState(item.observacoes || '')

    const save = useMutation({
        mutationFn: async (obs: string) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase.from('card_financial_items') as any)
                .update({ observacoes: obs || null })
                .eq('id', item.id)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['financial-items', cardId] })
            setEditing(false)
        },
    })

    const cancel = () => { setValue(item.observacoes || ''); setEditing(false) }

    return (
        <div className="ml-12">
            {editing ? (
                <div className="flex items-start gap-2">
                    <textarea
                        value={value}
                        onChange={e => setValue(e.target.value)}
                        onBlur={() => cancel()}
                        onKeyDown={e => {
                            if (e.key === 'Escape') cancel()
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save.mutate(value) }
                        }}
                        placeholder="Observação do Planner sobre este produto..."
                        className="flex-1 text-xs border border-amber-200 rounded px-2 py-1 text-gray-700 placeholder-gray-400 resize-none focus:outline-none focus:ring-1 focus:ring-amber-300 bg-amber-50/50"
                        rows={2}
                        autoFocus
                    />
                    <button
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => save.mutate(value)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium shrink-0"
                    >
                        Salvar
                    </button>
                </div>
            ) : (
                <button
                    onClick={() => { setValue(item.observacoes || ''); setEditing(true) }}
                    className={cn(
                        "flex items-start gap-1.5 text-xs rounded px-2 py-1 transition-colors",
                        item.observacoes
                            ? "bg-amber-50 border border-amber-100 text-amber-800 hover:bg-amber-100"
                            : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                    )}
                >
                    <ClipboardList className={cn("h-3 w-3 mt-0.5 shrink-0", item.observacoes ? "text-amber-500" : "")} />
                    {item.observacoes ? (
                        <span className="text-left leading-snug"><span className="font-medium">Planner:</span> {item.observacoes}</span>
                    ) : (
                        <span>Adicionar observação do Planner</span>
                    )}
                </button>
            )}
        </div>
    )
}

// ═══════════════════════════════════════════════════════════
// Passenger Row (passageiro de um produto)
// ═══════════════════════════════════════════════════════════

function PassengerRow({ passenger, onToggle, onUpdateObservation, onDelete }: {
    passenger: FinancialItemPassenger
    onToggle: () => void
    onUpdateObservation: (obs: string) => void
    onDelete: () => void
}) {
    const isDone = passenger.status === 'concluido'
    const [showObs, setShowObs] = useState(false)
    const [obsValue, setObsValue] = useState(passenger.observacao || '')

    const handleSaveObs = () => {
        onUpdateObservation(obsValue)
        setShowObs(false)
    }

    return (
        <div className="group flex items-start gap-2 py-1">
            {/* Status checkbox */}
            <button
                onClick={onToggle}
                className={cn(
                    "flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors mt-0.5",
                    isDone
                        ? "bg-emerald-500 border-emerald-500 text-white"
                        : "border-gray-300 hover:border-indigo-400"
                )}
            >
                {isDone && <Check className="h-2.5 w-2.5" />}
            </button>

            <div className="flex-1 min-w-0">
                <span className={cn(
                    "text-xs",
                    isDone ? "text-gray-400 line-through" : "text-gray-700"
                )}>
                    {passenger.nome}
                </span>

                {/* Observation inline */}
                {showObs ? (
                    <div className="flex items-center gap-1 mt-1">
                        <input
                            type="text"
                            value={obsValue}
                            onChange={e => setObsValue(e.target.value)}
                            placeholder="Observação..."
                            autoFocus
                            className="flex-1 text-[11px] border border-gray-200 rounded px-1.5 py-0.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                            onKeyDown={e => { if (e.key === 'Enter') handleSaveObs() }}
                        />
                        <button
                            onClick={handleSaveObs}
                            className="text-[10px] text-indigo-600 font-medium"
                        >
                            OK
                        </button>
                    </div>
                ) : passenger.observacao ? (
                    <button
                        onClick={() => { setObsValue(passenger.observacao || ''); setShowObs(true) }}
                        className="text-[10px] text-slate-400 italic truncate block max-w-[200px]"
                    >
                        {passenger.observacao}
                    </button>
                ) : null}
            </div>

            {/* Actions (on hover) */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                    onClick={() => { setObsValue(passenger.observacao || ''); setShowObs(true) }}
                    className="p-0.5 text-gray-300 hover:text-indigo-500"
                    title="Observação"
                >
                    <MessageSquare className="h-3 w-3" />
                </button>
                <button
                    onClick={onDelete}
                    className="p-0.5 text-gray-300 hover:text-red-500"
                    title="Remover passageiro"
                >
                    <Trash2 className="h-3 w-3" />
                </button>
            </div>
        </div>
    )
}

// ═══════════════════════════════════════════════════════════
// Requirement Row (sub-item de um produto)
// ═══════════════════════════════════════════════════════════

interface RequirementRowProps {
    req: { id: string; titulo: string; status: string; data_value: string | null; arquivo_id: string | null }
    cardId: string
    financialItemId: string
    onToggle: () => void
    onUpdate: (updates: { data_value?: string | null }) => void
    onDelete: () => void
    onUpload: (file: File) => void
}

function RequirementRow({ req, onToggle, onUpdate, onDelete, onUpload }: RequirementRowProps) {
    const isDone = req.status === 'concluido'
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [showDataInput, setShowDataInput] = useState(false)
    const [dataValue, setDataValue] = useState(req.data_value || '')

    return (
        <div className="group flex items-start gap-2 py-1">
            {/* Status checkbox */}
            <button
                onClick={onToggle}
                className={cn(
                    "flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors mt-0.5",
                    isDone
                        ? "bg-emerald-500 border-emerald-500 text-white"
                        : "border-gray-300 hover:border-amber-400"
                )}
            >
                {isDone && <Check className="h-2.5 w-2.5" />}
            </button>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className={cn(
                        "text-xs",
                        isDone ? "text-gray-400 line-through" : "text-gray-700"
                    )}>
                        {req.titulo}
                    </span>

                    {/* File indicator */}
                    {req.arquivo_id && (
                        <Paperclip className="h-3 w-3 text-blue-400 shrink-0" />
                    )}

                    {/* Data value indicator */}
                    {req.data_value && !showDataInput && (
                        <button
                            onClick={() => setShowDataInput(true)}
                            className="text-[10px] text-blue-600 bg-blue-50 px-1 py-0.5 rounded truncate max-w-[120px]"
                        >
                            {req.data_value}
                        </button>
                    )}
                </div>

                {/* Data input */}
                {showDataInput && (
                    <div className="flex items-center gap-1 mt-1">
                        <input
                            type="text"
                            value={dataValue}
                            onChange={e => setDataValue(e.target.value)}
                            placeholder="Informação..."
                            className="flex-1 text-[11px] border border-gray-200 rounded px-1.5 py-0.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-300"
                            autoFocus
                            onKeyDown={e => {
                                if (e.key === 'Enter') {
                                    onUpdate({ data_value: dataValue || null })
                                    setShowDataInput(false)
                                }
                            }}
                        />
                        <button
                            onClick={() => { onUpdate({ data_value: dataValue || null }); setShowDataInput(false) }}
                            className="text-[10px] text-amber-600 font-medium"
                        >
                            OK
                        </button>
                    </div>
                )}
            </div>

            {/* Actions (on hover) */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                {/* Data field toggle */}
                {!showDataInput && (
                    <button
                        onClick={() => setShowDataInput(true)}
                        className="p-0.5 text-gray-300 hover:text-blue-500"
                        title="Adicionar informação"
                    >
                        <ClipboardList className="h-3 w-3" />
                    </button>
                )}

                {/* File upload */}
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="p-0.5 text-gray-300 hover:text-blue-500"
                    title="Anexar arquivo"
                >
                    <Paperclip className="h-3 w-3" />
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={e => {
                        const file = e.target.files?.[0]
                        if (file) onUpload(file)
                    }}
                />

                {/* Delete */}
                <button
                    onClick={onDelete}
                    className="p-0.5 text-gray-300 hover:text-red-500"
                >
                    <Trash2 className="h-3 w-3" />
                </button>
            </div>
        </div>
    )
}
