import { useDroppable } from '@dnd-kit/core'
import { cn } from '../../lib/utils'
import KanbanCard from './KanbanCard'
import StageSortPopover from './PhaseSortPopover'
import { useReceitaPermission } from '../../hooks/useReceitaPermission'
import type { Database } from '../../database.types'
import type { StageSortConfig } from '../../hooks/usePhaseSort'

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
}

export default function KanbanColumn({ stage, cards, phaseColor, phaseSlug, onWin, onLoss, currentSort, hasSortOverride, onSortChange, onClearSort }: KanbanColumnProps) {
    const { setNodeRef, isOver } = useDroppable({
        id: stage.id,
        data: stage
    })
    const receitaPerm = useReceitaPermission()

    const totalValue = cards.reduce((acc, card) => acc + (card.valor_display || card.valor_estimado || 0), 0)
    const totalReceita = cards.reduce((acc, card) => acc + (card.receita || 0), 0)

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
                <div className="flex items-center justify-between">
                    <div className="h-1 w-12 rounded-full bg-primary/20"></div>
                    <div className="text-right">
                        <p className="text-xs font-bold text-gray-400">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValue)}
                        </p>
                        {receitaPerm.canView && totalReceita > 0 && (
                            <p className="text-[10px] font-semibold text-amber-600">
                                Rec: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact' }).format(totalReceita)}
                            </p>
                        )}
                    </div>
                </div>
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
                        <KanbanCard key={card.id} card={card} phaseSlug={phaseSlug} onWin={onWin} onLoss={onLoss} />
                    ))
                )}
            </div>

        </div>
    )
}
