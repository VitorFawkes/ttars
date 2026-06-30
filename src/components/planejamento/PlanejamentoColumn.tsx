import type { ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { EtapaPlanejamento } from '../../hooks/planejamento/types'

export interface ColumnTone {
  accent: string
  chip: string
}

interface PlanejamentoColumnProps {
  id: EtapaPlanejamento
  label: string
  count: number
  tone: ColumnTone
  collapsed?: boolean
  onToggleCollapsed?: () => void
  children: ReactNode
}

export function PlanejamentoColumn({
  id,
  label,
  count,
  tone,
  collapsed = false,
  onToggleCollapsed,
  children,
}: PlanejamentoColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id })

  if (collapsed) {
    return (
      <div
        ref={setNodeRef}
        onClick={onToggleCollapsed}
        title={`${label} (${count}) — clique para expandir`}
        className={cn(
          'flex flex-col w-[44px] flex-shrink-0 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden cursor-pointer transition-colors',
          isOver && 'bg-[#FBF6E8]/70 ring-2 ring-[#E6D3B3]',
        )}
      >
        <div className="relative h-full flex flex-col items-center py-3 gap-2">
          <span className={cn('absolute left-0 top-0 bottom-0 w-[3px]', tone.accent)} />
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-mono text-[11px] px-1.5 h-5 inline-flex items-center rounded-md font-semibold text-slate-600 bg-slate-100">
            {count}
          </span>
          <div
            className="text-[11.5px] font-semibold text-slate-900 whitespace-nowrap"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            {label}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-w-[260px] max-w-[440px] min-h-0">
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col h-full min-h-0 overflow-hidden">
        <div className="relative px-3 py-2.5 border-b border-slate-100 bg-white shrink-0">
          <span className={cn('absolute left-0 top-0 bottom-0 w-[3px]', tone.accent)} />
          <div className="flex items-center justify-between gap-2 pl-2">
            <div className="text-sm font-semibold text-slate-900 truncate" title={label}>{label}</div>
            <div className="flex items-center gap-1">
              <span
                className={cn(
                  'font-mono text-[11px] px-1.5 h-5 inline-flex items-center rounded-md font-semibold tabular-nums border',
                  tone.chip,
                )}
              >
                {count}
              </span>
              {onToggleCollapsed && (
                <button
                  type="button"
                  onClick={onToggleCollapsed}
                  className="p-0.5 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                  title="Recolher coluna"
                  aria-label={`Recolher ${label}`}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div
          ref={setNodeRef}
          className={cn(
            'flex-1 min-h-0 px-2 py-2 space-y-2 bg-slate-50/40 overflow-y-auto transition-colors',
            isOver && 'bg-indigo-50/60 ring-2 ring-indigo-400 ring-inset',
          )}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
