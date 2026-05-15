import { useDroppable } from '@dnd-kit/core'
import { cn } from '../../lib/utils'
import KanbanCard from './KanbanCard'
import StageSortPopover from './PhaseSortPopover'
import { useReceitaPermission } from '../../hooks/useReceitaPermission'
import type { Database } from '../../database.types'
import type { StageSortConfig } from '../../hooks/usePhaseSort'
import type { CardConciergeStats } from '../../hooks/concierge/types'

type Card = Database['public']['Views']['view_cards_acoes']['Row']
type Stage = Database['public']['Tables']['pipeline_stages']['Row']

interface KanbanColumnProps {
    stage: Stage
    cards: Card[]
    phaseColor: string
    phaseSlug?: string | null
    onWin?: (cardId: string) => void
    onLoss?: (cardId: string) => void
    currentSort: StageSortConfig
    hasSortOverride: boolean
    onSortChange: (config: StageSortConfig) => void
    onClearSort: () => void
    conciergeStatsMap?: Map<string, CardConciergeStats>
    /** True quando admin marcou data_prevista_fechamento como visível nesta etapa em "Campos por Etapa". */
    isDataPrevistaTracked?: boolean
}

export default function KanbanColumn({ stage, cards, phaseColor, phaseSlug, onWin, onLoss, currentSort, hasSortOverride, onSortChange, onClearSort, conciergeStatsMap, isDataPrevistaTracked = false }: KanbanColumnProps) {
    const { setNodeRef, isOver } = useDroppable({
        id: stage.id,
        data: stage
    })
    const receitaPerm = useReceitaPermission()

    const totalValue = cards.reduce((acc, card) => acc + (card.valor_display || card.valor_estimado || 0), 0)
    const totalReceita = cards.reduce((acc, card) => acc + (card.receita || 0), 0)
    const totalPrevisto = cards.reduce((acc, card) => acc + (card.valor_estimado || 0), 0)
    const totalFechado = cards.reduce((acc, card) => acc + (card.valor_final || 0), 0)
    const totalFalta = totalPrevisto - totalFechado

    // 3 variantes do header de finanças:
    // - "tp": Proposta Enviada + Reservas e Fechamento → 4 KPIs compactos
    // - "pos": pós-venda → Fechado + Receita
    // - "default": demais etapas → valor total + receita inline (sem laranja)
    const stageVariant: 'tp' | 'pos' | 'default' =
        stage.nome === 'Proposta Enviada' || stage.nome === 'Reservas e Fechamento'
            ? 'tp'
            : phaseSlug === 'pos_venda'
                ? 'pos'
                : 'default'

    const formatFull = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
    const formatShort = (v: number) => {
        if (!v) return 'R$ 0'
        if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace('.', ',')}M`
        if (v >= 1_000) return `R$ ${Math.round(v / 1_000)}k`
        return `R$ ${Math.round(v)}`
    }

    // Robust color handling
    const isHex = phaseColor.startsWith('#') || phaseColor.startsWith('rgb')
    const borderClass = !isHex && phaseColor.startsWith('bg-') ? phaseColor.replace('bg-', 'border-t-') : ''
    const style = isHex ? { borderTopColor: phaseColor } : {}

    return (
        <div
            ref={setNodeRef}
            className={cn(
                "flex w-80 min-w-[20rem] shrink-0 flex-col rounded-xl bg-gray-50 border border-gray-200 shadow-sm transition-all duration-300 hover:shadow-md hover:bg-white",
                "border-t-4 h-full",
                borderClass,
                isOver && "ring-2 ring-primary/40 ring-inset bg-primary/5"
            )}
            style={style}
        >
            {/* Header with White Strip */}
            <div className="bg-white border-b border-gray-200 p-4 rounded-t-xl shadow-sm">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-base font-bold text-gray-800 tracking-tight truncate mr-2">{stage.nome}</h3>
                    <div className="flex items-center gap-2 shrink-0">
                        <StageSortPopover
                            currentSort={currentSort}
                            hasOverride={hasSortOverride}
                            onSortChange={onSortChange}
                            onClear={onClearSort}
                        />
                        <span className="rounded-full bg-gray-100 border border-gray-200 px-2 py-0.5 text-[10px] font-bold text-gray-500">
                            {cards.length}
                        </span>
                    </div>
                </div>
                {stageVariant === 'tp' ? (
                    <div
                        className="grid grid-cols-4 gap-2 tabular-nums"
                        title={`Previsto ${formatFull(totalPrevisto)}\nFechado ${formatFull(totalFechado)}\nFalta ${formatFull(Math.abs(totalFalta))}${receitaPerm.canView ? `\nReceita ${formatFull(totalReceita)}` : ''}`}
                    >
                        <ColumnKpiCell label="Prev" value={formatShort(totalPrevisto)} />
                        <ColumnKpiCell label="Fech" value={formatShort(totalFechado)} />
                        <ColumnKpiCell label={totalFalta < 0 ? 'Exced' : 'Falta'} value={formatShort(Math.abs(totalFalta))} />
                        {receitaPerm.canView ? (
                            <ColumnKpiCell label="Rec" value={formatShort(totalReceita)} />
                        ) : (
                            <div />
                        )}
                    </div>
                ) : stageVariant === 'pos' ? (
                    <div className="flex items-center justify-between text-xs text-slate-500 tabular-nums">
                        <span className="h-1 w-12 rounded-full bg-primary/20" aria-hidden />
                        <span>
                            <span className="text-slate-400">Fechado </span>
                            <span className="text-slate-700 font-medium">{formatFull(totalFechado)}</span>
                            {receitaPerm.canView && totalReceita > 0 && (
                                <>
                                    <span className="text-slate-300 mx-1.5">·</span>
                                    <span className="text-slate-400">Rec </span>
                                    <span className="text-slate-700 font-medium">{formatShort(totalReceita)}</span>
                                </>
                            )}
                        </span>
                    </div>
                ) : (
                    <div className="flex items-center justify-between text-xs text-slate-500 tabular-nums">
                        <span className="h-1 w-12 rounded-full bg-primary/20" aria-hidden />
                        <span>
                            <span className="text-slate-700 font-medium">{formatFull(totalValue)}</span>
                            {receitaPerm.canView && totalReceita > 0 && (
                                <>
                                    <span className="text-slate-300 mx-1.5">·</span>
                                    <span className="text-slate-400">Rec </span>
                                    <span className="text-slate-700 font-medium">{formatShort(totalReceita)}</span>
                                </>
                            )}
                        </span>
                    </div>
                )}
            </div>

            <div
                className={cn(
                    "flex flex-col gap-3 overflow-y-auto transition-colors scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent px-3 pt-3 pb-6 min-h-[120px] flex-1"
                )}
            >
                {cards.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center opacity-40">
                        <div className="h-12 w-12 rounded-full bg-white/50 border-2 border-dashed border-gray-200 mb-2" />
                        <p className="text-xs text-gray-400 font-medium">Vazio</p>
                    </div>
                ) : (
                    cards.map((card) => (
                        <KanbanCard
                            key={card.id}
                            card={card}
                            phaseSlug={phaseSlug}
                            onWin={onWin}
                            onLoss={onLoss}
                            conciergeStatsMap={conciergeStatsMap}
                            isDataPrevistaTracked={isDataPrevistaTracked}
                        />
                    ))
                )}
            </div>

        </div>
    )
}

function ColumnKpiCell({ label, value }: { label: string; value: string }) {
    const isZero = value === 'R$ 0'
    return (
        <div className="min-w-0">
            <div className="text-[11px] text-slate-400 leading-none">{label}</div>
            <div className={cn(
                'text-xs font-medium leading-tight mt-1 truncate',
                isZero ? 'text-slate-400' : 'text-slate-700'
            )}>
                {value}
            </div>
        </div>
    )
}
