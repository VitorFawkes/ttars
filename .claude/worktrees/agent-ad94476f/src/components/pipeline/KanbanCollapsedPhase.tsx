import { cn } from '../../lib/utils'

interface KanbanCollapsedPhaseProps {
    totalCount: number
    totalValue: number
    phaseColor: string
    onClick: () => void
    onDragOver?: () => void
}

export default function KanbanCollapsedPhase({
    totalValue,
    phaseColor,
    onClick,
    onDragOver
}: KanbanCollapsedPhaseProps) {
    // Robust color handling
    const isHex = phaseColor.startsWith('#') || phaseColor.startsWith('rgb')
    const borderClass = !isHex && phaseColor.startsWith('bg-') ? phaseColor.replace('bg-', 'border-t-') : ''
    const style = isHex ? { borderTopColor: phaseColor } : {}

    return (
        <div
            onClick={onClick}
            onDragOver={(e) => {
                e.preventDefault() // Allow drop/hover detection
                onDragOver?.()
            }}
            className={cn(
                "group relative flex w-48 flex-col items-center justify-end pb-24", // Increased width to w-48 to match parent
                "cursor-pointer transition-all duration-300 ease-in-out",
                "bg-gray-50 border border-gray-200 shadow-sm hover:shadow-md hover:bg-white", // Solid background
                "rounded-xl border-t-4 max-h-[calc(100vh-14rem)]",
                borderClass
            )}
            style={style}
        >
            {/* Removed internal Header (Name/Count) as it's now in PhaseGroup */}

            {/* Bottom: Total Value */}
            <div className="flex flex-col items-center gap-1 w-full px-1">
                <div className="flex flex-col items-center justify-center w-full rounded-lg bg-white border border-gray-100 py-2 shadow-sm group-hover:shadow-md transition-all">
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Total</span>
                    <span className="text-[10px] font-bold text-emerald-600">
                        {new Intl.NumberFormat('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                            notation: 'compact',
                            maximumFractionDigits: 1
                        }).format(totalValue)}
                    </span>
                </div>
            </div>
        </div>
    )
}
