import { useDroppable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import type { GiftAssignmentFull } from '@/hooks/useAllGiftAssignments'
import type { GiftKanbanStatus } from '@/hooks/useGiftStatusKanban'
import GiftKanbanCard from './GiftKanbanCard'

interface ColumnTone {
    label: string
    accent: string
    chip: string
}

interface Props {
    status: GiftKanbanStatus
    tone: ColumnTone
    assignments: GiftAssignmentFull[]
    onOpenAssignment: (assignment: GiftAssignmentFull) => void
}

export default function GiftKanbanColumn({ status, tone, assignments, onOpenAssignment }: Props) {
    const { setNodeRef, isOver } = useDroppable({ id: status })

    return (
        <div className="flex flex-col flex-1 min-w-[200px] min-h-0">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col h-full min-h-0 overflow-hidden">
                <div className="relative px-3 py-2.5 border-b border-slate-100 bg-white shrink-0">
                    <span className={cn('absolute left-0 top-0 bottom-0 w-[3px]', tone.accent)} />
                    <div className="flex items-center justify-between gap-2 pl-2">
                        <div className="text-sm font-semibold text-slate-900 truncate">{tone.label}</div>
                        <span
                            className={cn(
                                'font-mono text-[11px] px-1.5 h-5 inline-flex items-center rounded-md font-semibold tabular-nums border',
                                tone.chip,
                            )}
                        >
                            {assignments.length}
                        </span>
                    </div>
                </div>
                <div
                    ref={setNodeRef}
                    className={cn(
                        'flex-1 min-h-0 px-2 py-2 space-y-2 bg-slate-50/40 overflow-y-auto transition-colors',
                        isOver && 'bg-indigo-50/60 ring-2 ring-indigo-400 ring-inset',
                    )}
                >
                    {assignments.length === 0 ? (
                        <p className="text-[11px] text-slate-400 italic text-center py-6">Sem presentes aqui.</p>
                    ) : (
                        assignments.map(a => (
                            <GiftKanbanCard
                                key={a.id}
                                assignment={a}
                                onOpen={() => onOpenAssignment(a)}
                            />
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}
