import { useDraggable } from '@dnd-kit/core'
import { Heart, Calendar, MapPin, Users, CheckCircle2, Lock, Bell } from 'lucide-react'
import { cn } from '../../lib/utils'
import { formatDataCurta, isPast } from '../../lib/planejamento/format'
import type { EtapaPlanejamento } from '../../hooks/planejamento/types'
import type { WeddingPlanejamento } from '../../hooks/planejamento/usePlanejamentoWeddings'

const ACCENT: Record<EtapaPlanejamento, string> = {
  boas_vindas: 'border-l-slate-300',
  onboarding: 'border-l-sky-400',
  propostas: 'border-l-violet-400',
  definicao: 'border-l-indigo-500',
  passagem: 'border-l-amber-400',
  aditivo: 'border-l-emerald-500',
}

interface PlanejamentoCardProps {
  wedding: WeddingPlanejamento
  onClick?: () => void
  isOverlay?: boolean
}

export function PlanejamentoCard({ wedding, onClick, isOverlay = false }: PlanejamentoCardProps) {
  const dnd = useDraggable({
    id: `plan:${wedding.id}`,
    data: { wedding },
    disabled: isOverlay,
  })

  const dateLabel = formatDataCurta(wedding.wedding_date)
  const past = isPast(wedding.wedding_date)
  const { confirmado, total } = wedding.counts

  return (
    <article
      ref={!isOverlay ? dnd.setNodeRef : undefined}
      onClick={onClick}
      className={cn(
        'bg-white border border-slate-200 border-l-4 shadow-sm rounded-lg p-3 flex flex-col gap-2 transition-shadow',
        ACCENT[wedding.planejamentoEtapa],
        !isOverlay && 'cursor-grab active:cursor-grabbing hover:shadow-md',
        dnd.isDragging && !isOverlay && 'opacity-40',
        isOverlay && 'shadow-xl ring-2 ring-indigo-300',
        past && !isOverlay && 'opacity-70',
      )}
      {...(!isOverlay ? { ...dnd.listeners, ...dnd.attributes } : {})}
    >
      <h4 className="text-sm font-semibold text-slate-900 break-words inline-flex items-start gap-1.5" title={wedding.titulo}>
        <Heart className="w-3.5 h-3.5 shrink-0 text-rose-400 mt-0.5" />
        <span className="min-w-0">{wedding.titulo}</span>
      </h4>

      <div className="flex flex-col gap-1 text-[11.5px] text-slate-500">
        {dateLabel && (
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="w-3 h-3 shrink-0" />
            <span className={cn(past && 'text-slate-400')}>{dateLabel}</span>
          </span>
        )}
        {wedding.local && (
          <span className="inline-flex items-center gap-1.5 truncate" title={wedding.local}>
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="truncate">{wedding.local}</span>
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <Users className="w-3 h-3 shrink-0" />
          {total > 0 ? (
            <span>
              <span className="font-semibold text-emerald-600 tabular-nums">{confirmado}</span>
              <span className="text-slate-400"> / {total} convidados</span>
            </span>
          ) : (
            <span className="text-slate-400 italic">sem convidados</span>
          )}
        </span>
      </div>

      {/* Trava real da etapa atual (Fase 4): tarefas 🔒 não-feitas seguram o avanço */}
      <div className="pt-1.5 border-t border-slate-100 flex items-center gap-1.5 flex-wrap">
        {wedding.travaPendentes.length === 0 ? (
          <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
            <CheckCircle2 className="w-3 h-3" /> Pronto para avançar
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200"
            title={wedding.travaPendentes.map((t) => t.titulo).join('; ')}
          >
            <Lock className="w-3 h-3" /> Travada · {wedding.travaPendentes.length}
          </span>
        )}
        {wedding.cobrancasVencidas > 0 && (
          <span
            className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full border bg-indigo-50 text-indigo-600 border-indigo-100"
            title={`${wedding.cobrancasVencidas} tarefa(s) vencida(s) viram cobrança automática`}
          >
            <Bell className="w-3 h-3" /> {wedding.cobrancasVencidas}
          </span>
        )}
      </div>
    </article>
  )
}
