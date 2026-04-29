import { useDroppable } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import { cn } from '../../../lib/utils'

interface ConciergeKanbanColumnProps {
  id: string
  label: string
  hint?: string
  count: number
  tone: { bg: string; text: string; border: string; accent: string }
  emoji?: string
  droppable?: boolean
  children: ReactNode
}

export function ConciergeKanbanColumn({
  id,
  label,
  hint,
  count,
  tone,
  emoji,
  droppable = true,
  children,
}: ConciergeKanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !droppable })

  return (
    <div className="flex flex-col w-[300px] flex-shrink-0">
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col h-full overflow-hidden">
        <div className="relative px-3 py-2.5 border-b border-slate-100 bg-white">
          <span className={cn('absolute left-0 top-0 bottom-0 w-[3px]', tone.accent)} />
          <div className="flex items-center justify-between gap-2 pl-2">
            <div className="flex items-center gap-1.5 min-w-0">
              {emoji && <span className="text-[13px] leading-none">{emoji}</span>}
              <div className="min-w-0">
                <div className="text-[11.5px] font-semibold text-slate-900 truncate">{label}</div>
                {hint && <div className="text-[10.5px] text-slate-500 truncate">{hint}</div>}
              </div>
            </div>
            <span className="font-mono text-[11px] text-slate-600 bg-slate-100 px-1.5 h-5 inline-flex items-center rounded-md font-semibold">
              {count}
            </span>
          </div>
        </div>

        <div
          ref={droppable ? setNodeRef : undefined}
          className={cn(
            'flex-1 px-2 py-2 space-y-1.5 bg-slate-50/40 min-h-[260px] overflow-y-auto transition-colors',
            isOver && 'bg-indigo-50/60 ring-2 ring-indigo-400 ring-inset'
          )}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
