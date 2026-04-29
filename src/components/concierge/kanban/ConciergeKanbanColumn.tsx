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
    <div className="flex flex-col w-72 flex-shrink-0">
      <div className={cn(
        'sticky top-0 z-10 px-3 py-2.5 rounded-t-xl border-x border-t bg-white',
        tone.border,
      )}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {emoji && <span className="text-base leading-none">{emoji}</span>}
            <div className="min-w-0">
              <div className={cn('text-xs font-semibold tracking-wide uppercase truncate', tone.text)}>
                {label}
              </div>
              {hint && <div className="text-[10.5px] text-slate-500 truncate">{hint}</div>}
            </div>
          </div>
          <span className={cn('inline-flex items-center justify-center min-w-[28px] h-6 rounded-full text-xs font-bold px-2', tone.bg, tone.text)}>
            {count}
          </span>
        </div>
      </div>

      <div
        ref={droppable ? setNodeRef : undefined}
        className={cn(
          'flex-1 px-2 py-2 space-y-2 border-x border-b rounded-b-xl bg-slate-50/40 min-h-[200px] transition-colors',
          tone.border,
          isOver && 'bg-indigo-50 ring-2 ring-indigo-400 ring-inset'
        )}
      >
        {children}
      </div>
    </div>
  )
}
