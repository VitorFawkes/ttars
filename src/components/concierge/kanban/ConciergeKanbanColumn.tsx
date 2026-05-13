import { useDroppable } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../../../lib/utils'

interface ConciergeKanbanColumnProps {
  id: string
  label: string
  hint?: string
  count: number
  tone: { bg: string; text: string; border: string; accent: string }
  emoji?: string
  droppable?: boolean
  /** Quando true, exibe a coluna em modo retraído (vertical, só header). */
  collapsed?: boolean
  /** Chamado ao clicar no chevron de toggle. */
  onToggleCollapsed?: () => void
  /** Quando true, a coluna pulsa em amarelo pra chamar atenção (ex:
   *  "Agendados para o futuro" com cards perto do prazo). */
  pulsarUrgente?: boolean
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
  collapsed = false,
  onToggleCollapsed,
  pulsarUrgente = false,
  children,
}: ConciergeKanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !droppable })

  // Modo retraído: header vertical compacto, ainda aceita drop
  if (collapsed) {
    return (
      <div
        ref={droppable ? setNodeRef : undefined}
        className={cn(
          'flex flex-col w-[44px] flex-shrink-0 bg-white border rounded-xl shadow-sm overflow-hidden cursor-pointer transition-colors',
          pulsarUrgente
            ? 'border-amber-300 ring-2 ring-amber-200 animate-pulse bg-amber-50'
            : 'border-slate-200',
          isOver && 'bg-indigo-50/60 ring-2 ring-indigo-400'
        )}
        onClick={onToggleCollapsed}
        title={`${label} (${count})${pulsarUrgente ? ' — tem prazo chegando' : ''} — clique para expandir`}
      >
        <div className="relative h-full flex flex-col items-center py-3 gap-2">
          <span className={cn('absolute left-0 top-0 bottom-0 w-[3px]', pulsarUrgente ? 'bg-amber-400' : tone.accent)} />
          <ChevronRight className={cn('w-3.5 h-3.5', pulsarUrgente ? 'text-amber-600' : 'text-slate-400')} />
          <span className={cn(
            'font-mono text-[11px] px-1.5 h-5 inline-flex items-center rounded-md font-semibold',
            pulsarUrgente ? 'text-amber-800 bg-amber-100' : 'text-slate-600 bg-slate-100'
          )}>
            {count}
          </span>
          <div
            className={cn(
              'text-[11.5px] font-semibold whitespace-nowrap',
              pulsarUrgente ? 'text-amber-900' : 'text-slate-900'
            )}
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            {label}
          </div>
        </div>
      </div>
    )
  }

  return (
    // Colunas dividem a largura disponível: crescem até 440px, encolhem até
    // 260px se necessário pra todas caberem na tela. Abaixo disso, scroll.
    <div className="flex flex-col flex-1 min-w-[260px] max-w-[440px]">
      <div className={cn(
        'bg-white border rounded-xl shadow-sm flex flex-col h-full overflow-hidden',
        pulsarUrgente ? 'border-amber-300 ring-2 ring-amber-200' : 'border-slate-200'
      )}>
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
            <div className="flex items-center gap-1">
              <span className="font-mono text-[11px] text-slate-600 bg-slate-100 px-1.5 h-5 inline-flex items-center rounded-md font-semibold">
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
