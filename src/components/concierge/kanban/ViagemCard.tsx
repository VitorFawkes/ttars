import { Calendar, Flame, Clock, CheckCircle2 } from 'lucide-react'
import { TipoIcon } from '../Badges'
import type { ViagemKanbanItem } from '../../../hooks/concierge/useKanbanViagens'
import { cn } from '../../../lib/utils'

function fmtDate(iso: string | null) {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

interface ViagemCardProps {
  viagem: ViagemKanbanItem
  onClick: () => void
}

export function ViagemCard({ viagem, onClick }: ViagemCardProps) {
  const ini = fmtDate(viagem.data_viagem_inicio)
  const fim = fmtDate(viagem.data_viagem_fim)
  const dataLabel = ini && fim ? `${ini} – ${fim}` : ini ?? 'Sem data'
  const isCritica = viagem.saude === 'critica'
  const isConcluida = viagem.saude === 'concluida'

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left bg-white border rounded-lg shadow-sm p-3 transition-all hover:shadow-md hover:border-slate-300',
        isCritica ? 'border-red-300' : 'border-slate-200'
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-900 leading-snug line-clamp-2">
            {viagem.card_titulo}
          </div>
          <div className="text-xs text-slate-500 mt-0.5 truncate">
            {viagem.produto?.toUpperCase()} · {dataLabel}
          </div>
        </div>
        {isCritica && (
          <Flame className="w-4 h-4 text-red-600 flex-shrink-0" strokeWidth={2.5} />
        )}
        {isConcluida && (
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" strokeWidth={2.5} />
        )}
      </div>

      {viagem.tipos_pendentes.length > 0 && (
        <div className="flex items-center gap-1.5 mb-2">
          {viagem.tipos_pendentes.map(t => (
            <TipoIcon key={t} tipo={t} className="w-3.5 h-3.5" />
          ))}
          <span className="text-[11px] text-slate-500 ml-1">
            {viagem.abertos} aberto{viagem.abertos === 1 ? '' : 's'}
          </span>
        </div>
      )}

      <div className="flex items-center gap-2 text-[11px] flex-wrap">
        {viagem.vencidos > 0 && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-semibold">
            <Flame className="w-3 h-3" strokeWidth={2.5} />
            {viagem.vencidos} vencido{viagem.vencidos === 1 ? '' : 's'}
          </span>
        )}
        {viagem.hoje > 0 && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-semibold">
            <Clock className="w-3 h-3" />
            {viagem.hoje} hoje
          </span>
        )}
        {viagem.dias_pra_embarque !== null && viagem.dias_pra_embarque >= 0 && viagem.dias_pra_embarque <= 30 && (
          <span className="inline-flex items-center gap-1 text-slate-500 ml-auto">
            <Calendar className="w-3 h-3" />
            embarca em {viagem.dias_pra_embarque}d
          </span>
        )}
      </div>
    </button>
  )
}
