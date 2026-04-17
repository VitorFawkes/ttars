import { useRef, useEffect } from 'react'
import { cn } from '../../lib/utils'
import KanbanCollapsedPhase from './KanbanCollapsedPhase'
import { ChevronDown } from 'lucide-react'
import type { Database } from '../../database.types'

type Card = Database['public']['Views']['view_cards_acoes']['Row']
type Stage = Database['public']['Tables']['pipeline_stages']['Row']

interface KanbanPhaseGroupProps {
    phaseName: string
    isCollapsed: boolean
    onToggle: () => void
    children: React.ReactNode
    totalCount: number
    totalValue: number
    phaseColor: string
    stages: Stage[]
    cards: Card[]
}

export default function KanbanPhaseGroup({
    phaseName,
    isCollapsed,
    onToggle,
    children,
    totalCount,
    totalValue,
    phaseColor
}: KanbanPhaseGroupProps) {
    const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Handle "Hover to Expand" during drag
    const handleDragOver = () => {
        if (isCollapsed && !hoverTimerRef.current) {
            hoverTimerRef.current = setTimeout(() => {
                onToggle()
                hoverTimerRef.current = null
            }, 600) // 600ms delay before auto-expanding
        }
    }

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
        }
    }, [])

    return (
        <div className={cn(
            "relative flex shrink-0 flex-col rounded-2xl transition-all duration-300 h-full",
            isCollapsed ? "w-48 bg-gray-50 border border-gray-200 py-2" : "bg-gray-100 p-2"
        )}>
            {/* Header - Always Visible */}
            <div
                className={cn(
                    "flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer",
                    isCollapsed
                        ? "bg-gray-100 border-gray-200 hover:bg-gray-200"
                        : "bg-white border-gray-200 shadow-sm mb-3"
                )}
                onClick={onToggle}
            >
                <div className="flex items-center gap-3">
                    <div className={cn(
                        "p-1.5 rounded-md transition-transform duration-200",
                        isCollapsed ? "-rotate-90" : "rotate-0"
                    )}>
                        <ChevronDown className="w-4 h-4 text-gray-500" />
                    </div>
                    <h3 className="font-medium text-gray-900 flex items-center gap-2">
                        {phaseName}
                        <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200">
                            {totalCount}
                        </span>
                    </h3>
                </div>
            </div>

            {/* Content Container */}
            <div className={cn(
                "flex flex-1 min-h-0",
                isCollapsed ? "items-start justify-center" : "items-stretch gap-4"
            )}>
                {isCollapsed ? (
                    <KanbanCollapsedPhase
                        totalCount={totalCount}
                        totalValue={totalValue}
                        phaseColor={phaseColor}
                        onClick={onToggle}
                        onDragOver={handleDragOver}
                    />
                ) : (
                    children
                )}
            </div>
        </div >
    )
}
