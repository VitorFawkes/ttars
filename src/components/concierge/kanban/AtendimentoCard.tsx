import { useDraggable } from '@dnd-kit/core'
import { Calendar, Flame, Clock, MessageCircle } from 'lucide-react'
import { TipoBadge } from '../Badges'
import { CATEGORIAS_CONCIERGE } from '../../../hooks/concierge/types'
import type { KanbanTarefaItem } from '../../../hooks/concierge/useKanbanTarefas'
import { cn } from '../../../lib/utils'

function fmtBRL(v: number | null | undefined) {
  if (!v) return null
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}

function fmtPrazo(iso: string | null) {
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
}

export function AtendimentoCard({ item, onClick, isOverlay = false }: AtendimentoCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.atendimento_id,
    data: { item },
  })

  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined
  const prazo = fmtPrazo(item.data_vencimento)
  const categoriaLabel = CATEGORIAS_CONCIERGE[item.categoria as keyof typeof CATEGORIAS_CONCIERGE]?.label ?? item.categoria
  const valor = fmtBRL(item.valor)
  const isVencido = item.status_apresentacao === 'vencido'

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      style={style}
      data-draggable
      className={cn(
        'bg-white border border-slate-200 rounded-lg shadow-sm p-3 cursor-grab active:cursor-grabbing transition-shadow',
        isVencido && 'border-red-300',
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
      <div className="flex items-start justify-between gap-2 mb-2">
        <TipoBadge tipo={item.tipo_concierge} size="xs" />
        {isVencido && (
          <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-red-700">
            <Flame className="w-3 h-3" strokeWidth={2.5} />
            vencido
          </span>
        )}
      </div>

      <div className="text-sm font-semibold text-slate-900 leading-snug line-clamp-2 mb-1">
        {item.titulo || categoriaLabel}
      </div>

      <div className="text-xs text-slate-600 truncate mb-2">{item.card_titulo}</div>

      <div className="flex items-center gap-3 text-[11px] text-slate-500">
        {prazo && (
          <span className={cn('inline-flex items-center gap-1', prazo.overdue && 'text-red-600 font-semibold')}>
            <Clock className="w-3 h-3" />
            {prazo.label}
          </span>
        )}
        {item.notificou_cliente_em && (
          <span className="inline-flex items-center gap-1 text-amber-600">
            <MessageCircle className="w-3 h-3" />
            notificado
          </span>
        )}
        {valor && (
          <span className="ml-auto font-semibold text-emerald-700">{valor}</span>
        )}
      </div>

      {item.dias_pra_embarque !== null && item.dias_pra_embarque >= 0 && item.dias_pra_embarque <= 30 && (
        <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-1 text-[10.5px] text-slate-500">
          <Calendar className="w-3 h-3" />
          embarca em {item.dias_pra_embarque}d
        </div>
      )}
    </div>
  )
}
