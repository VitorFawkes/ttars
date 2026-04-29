import { useDraggable } from '@dnd-kit/core'
import { TIPO_LABEL, CATEGORIAS_CONCIERGE, SOURCE_LABEL } from '../../../hooks/concierge/types'
import type { KanbanTarefaItem } from '../../../hooks/concierge/useKanbanTarefas'
import { SourceIcon } from '../Badges'
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
}

export function AtendimentoCard({ item, onClick, isOverlay = false }: AtendimentoCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.atendimento_id,
    data: { item },
  })

  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined
  const meta = TIPO_LABEL[item.tipo_concierge]
  const cat = CATEGORIAS_CONCIERGE[item.categoria as keyof typeof CATEGORIAS_CONCIERGE]
  const prazo = relPrazo(item.data_vencimento)
  const valor = fmtBRL(item.valor)
  const isVencido = item.status_apresentacao === 'vencido'

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      style={style}
      data-draggable
      className={cn(
        'group relative bg-white border border-slate-200 rounded-lg shadow-sm cursor-grab active:cursor-grabbing transition-shadow hover:shadow-md',
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

      <div className="pl-3 pr-2.5 py-2.5">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h4 className="text-[13px] font-semibold text-slate-900 leading-snug line-clamp-2 flex-1">
            {item.titulo || cat?.label || item.categoria}
          </h4>
          {isVencido && (
            <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-red-100 text-red-700 tracking-wide">
              VENCIDO
            </span>
          )}
        </div>

        <div className="text-[11.5px] text-slate-500 truncate mb-1.5">{item.card_titulo}</div>

        <div className="flex items-center gap-1.5 text-[10.5px] text-slate-500 mb-2">
          <span className={cn('inline-flex items-center gap-1 font-medium', meta.color)}>
            <span className={cn('w-1 h-1 rounded-full', meta.dotColor)} />
            {meta.label}
          </span>
          <span className="text-slate-300">·</span>
          <span className="truncate">{cat?.label ?? item.categoria}</span>
          <span className="text-slate-300">·</span>
          <span className="inline-flex items-center gap-0.5 shrink-0">
            <SourceIcon source={item.source} className="w-2.5 h-2.5 text-slate-400" />
            {SOURCE_LABEL[item.source].label}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 text-[10.5px]">
          {prazo ? (
            <div>
              <div className="text-[9.5px] text-slate-400 uppercase tracking-wide">Prazo</div>
              <div className={cn('font-mono font-semibold text-[11px]', prazo.overdue ? 'text-red-600' : 'text-slate-700')}>
                {prazo.label}
              </div>
            </div>
          ) : <div />}

          {item.dias_pra_embarque != null && (
            <div className="text-center">
              <div className="text-[9.5px] text-slate-400 uppercase tracking-wide">Embarque</div>
              <div className="font-mono font-semibold text-[11px] text-slate-700">
                {item.dias_pra_embarque < 0 ? `+${-item.dias_pra_embarque}d` : `${item.dias_pra_embarque}d`}
              </div>
            </div>
          )}

          {valor && (
            <div className="text-right">
              <div className="text-[9.5px] text-slate-400 uppercase tracking-wide">Valor</div>
              <div className="font-mono font-semibold text-[11px] text-emerald-700">{valor}</div>
            </div>
          )}
        </div>

        {item.notificou_cliente_em && (
          <div className="mt-2 pt-1.5 border-t border-slate-100 text-[10px] text-amber-600 inline-flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-amber-500" />
            cliente notificado
          </div>
        )}
      </div>
    </div>
  )
}
