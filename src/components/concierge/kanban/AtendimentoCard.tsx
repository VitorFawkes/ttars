import { useDraggable } from '@dnd-kit/core'
import { Check, Flame } from 'lucide-react'
import { TIPO_LABEL, CATEGORIAS_CONCIERGE } from '../../../hooks/concierge/types'
import type { KanbanTarefaItem } from '../../../hooks/concierge/useKanbanTarefas'
import { useToggleTarefaCritica } from '../../../hooks/concierge/useToggleCritical'
import { cn } from '../../../lib/utils'

function fmtBRL(v: number | null | undefined) {
  if (v == null) return null
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}

function relPrazo(iso: string | null) {
  if (!iso) return null
  const target = new Date(iso).getTime()
  const now = Date.now()
  const diffH = Math.round((target - now) / (1000 * 60 * 60))
  const diffD = Math.round((target - now) / (1000 * 60 * 60 * 24))
  if (Math.abs(diffH) < 1) return { label: 'agora', overdue: false }
  if (diffH < 0 && diffH > -24) return { label: `há ${-diffH}h`, overdue: true }
  if (diffH < 0) return { label: `há ${-diffD}d`, overdue: true }
  if (diffH < 24) return { label: `em ${diffH}h`, overdue: false }
  return { label: `em ${diffD}d`, overdue: false }
}

interface AtendimentoCardProps {
  item: KanbanTarefaItem
  onClick: () => void
  isOverlay?: boolean
  selected?: boolean
  onToggleSelect?: () => void
  selectionMode?: boolean
}

export function AtendimentoCard({ item, onClick, isOverlay = false, selected = false, onToggleSelect, selectionMode = false }: AtendimentoCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.atendimento_id,
    data: { item },
  })

  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined
  const meta = TIPO_LABEL[item.tipo_concierge]
  const cat = CATEGORIAS_CONCIERGE[item.categoria as keyof typeof CATEGORIAS_CONCIERGE]
  const catLabel = cat?.label ?? item.categoria
  const prazo = relPrazo(item.data_vencimento)
  const valor = fmtBRL(item.valor)
  const isVencido = item.status_apresentacao === 'vencido'
  const isCritical = item.prioridade === 'critica'
  const titulo = item.titulo?.trim() || catLabel
  const showCatPill = titulo !== catLabel

  const { mutate: toggleCritica, isPending: togglingCritica } = useToggleTarefaCritica()

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      style={style}
      data-draggable
      className={cn(
        'group relative bg-white border rounded-lg shadow-sm cursor-grab active:cursor-grabbing transition-all hover:shadow-md',
        isCritical && !selected && 'border-red-400 ring-2 ring-red-100',
        selected ? 'border-indigo-400 ring-2 ring-indigo-200' : !isCritical && 'border-slate-200',
        isDragging && !isOverlay && 'opacity-40',
        isOverlay && 'shadow-xl ring-2 ring-indigo-400 cursor-grabbing rotate-1'
      )}
      onClick={(e) => {
        if (isDragging) return
        e.stopPropagation()
        onClick()
      }}
      {...(isOverlay ? {} : { ...listeners, ...attributes })}
    >
      <span className={cn('absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg', meta.dotColor)} />

      <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
        <button
          type="button"
          data-no-drag
          onClick={(e) => { e.stopPropagation(); toggleCritica({ tarefa_id: item.tarefa_id, isCritical: !isCritical }) }}
          onPointerDown={(e) => e.stopPropagation()}
          disabled={togglingCritica}
          className={cn(
            'w-5 h-5 rounded flex items-center justify-center transition-all',
            isCritical
              ? 'bg-red-100 text-red-600 hover:bg-red-200 opacity-100'
              : 'text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 focus:opacity-100'
          )}
          aria-label={isCritical ? 'Remover marcação crítica' : 'Marcar como crítica'}
          title={isCritical ? 'Tarefa crítica — clique pra remover' : 'Marcar como crítica'}
        >
          <Flame className="w-3 h-3" strokeWidth={2.5} />
        </button>

        {onToggleSelect && (
          <button
            type="button"
            data-no-drag
            onClick={(e) => { e.stopPropagation(); onToggleSelect() }}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              'w-5 h-5 rounded border flex items-center justify-center transition-all',
              selected
                ? 'bg-indigo-600 border-indigo-600 text-white opacity-100'
                : selectionMode
                ? 'bg-white border-slate-300 hover:border-indigo-400 hover:bg-indigo-50 opacity-100'
                : 'bg-white border-slate-300 hover:border-indigo-400 hover:bg-indigo-50 opacity-0 group-hover:opacity-100 focus:opacity-100'
            )}
            aria-label={selected ? 'Desmarcar' : 'Selecionar'}
            title="Selecionar para ações em massa"
          >
            {selected && <Check className="w-3 h-3" strokeWidth={3} />}
          </button>
        )}
      </div>

      <div className="pl-3 pr-12 py-2.5">
        <h4 className="text-[13px] font-semibold text-slate-900 leading-snug line-clamp-2 mb-1">
          {titulo}
        </h4>

        <div className="text-[11.5px] text-slate-600 truncate mb-2">{item.card_titulo}</div>

        {showCatPill && (
          <div className="mb-2">
            <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold', meta.bgColor, meta.color)}>
              {catLabel}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 text-[10.5px]">
          {prazo ? (
            <div className="min-w-0">
              <div className="text-[9.5px] text-slate-400 uppercase tracking-wide leading-none">Prazo</div>
              <div className={cn('font-mono font-semibold text-[11px] mt-0.5', prazo.overdue || isVencido ? 'text-red-600' : 'text-slate-700')}>
                {prazo.label}
              </div>
            </div>
          ) : <div />}

          {item.dias_pra_embarque != null && (
            <div className="min-w-0 text-center">
              <div className="text-[9.5px] text-slate-400 uppercase tracking-wide leading-none">Embarque</div>
              <div className="font-mono font-semibold text-[11px] text-slate-700 mt-0.5">
                {item.dias_pra_embarque < 0 ? `+${-item.dias_pra_embarque}d` : `${item.dias_pra_embarque}d`}
              </div>
            </div>
          )}

          {valor && (
            <div className="min-w-0 text-right">
              <div className="text-[9.5px] text-slate-400 uppercase tracking-wide leading-none">Valor</div>
              <div className="font-mono font-semibold text-[11px] text-emerald-700 mt-0.5">{valor}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
