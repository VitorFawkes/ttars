import { Calendar, Flame, Clock, CheckCircle2 } from 'lucide-react'
import { TIPO_LABEL } from '../../../hooks/concierge/types'
import type { ViagemKanbanItem, SaudeViagem } from '../../../hooks/concierge/useKanbanViagens'
import { cn } from '../../../lib/utils'

const SAUDE_ACCENT: Record<SaudeViagem, string> = {
  critica:      'bg-red-500',
  em_andamento: 'bg-amber-500',
  concluida:    'bg-emerald-500',
}

function fmtDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
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
      className="group relative w-full text-left bg-white border border-slate-200 rounded-lg shadow-sm hover:shadow-md hover:border-slate-300 transition-all"
    >
      <span className={cn('absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg', SAUDE_ACCENT[viagem.saude])} />

      <div className="pl-3 pr-2.5 py-2.5">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h4 className="text-[13px] font-semibold text-slate-900 leading-snug line-clamp-2 flex-1">
            {viagem.card_titulo}
          </h4>
          {isCritica && <Flame className="w-3.5 h-3.5 text-red-600 shrink-0" strokeWidth={2.5} />}
          {isConcluida && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" strokeWidth={2.5} />}
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-2">
          <span className="font-medium text-slate-600 uppercase tracking-wide text-[10px]">{viagem.produto?.toUpperCase()}</span>
          <span className="text-slate-300">·</span>
          <span className="inline-flex items-center gap-0.5">
            <Calendar className="w-2.5 h-2.5" />
            {dataLabel}
          </span>
        </div>

        {viagem.tipos_pendentes.length > 0 && (
          <div className="flex items-center gap-1 mb-2">
            {viagem.tipos_pendentes.slice(0, 4).map(t => (
              <span
                key={t}
                className={cn('w-2 h-2 rounded-full', TIPO_LABEL[t].dotColor)}
                title={TIPO_LABEL[t].label}
              />
            ))}
            <span className="text-[10.5px] text-slate-500 ml-1">
              {viagem.abertos} {viagem.abertos === 1 ? 'aberto' : 'abertos'}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 text-[10.5px]">
          <div className="flex items-center gap-1.5 flex-wrap">
            {viagem.vencidos > 0 && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-bold">
                <Flame className="w-2.5 h-2.5" strokeWidth={3} />
                {viagem.vencidos}
              </span>
            )}
            {viagem.hoje > 0 && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-bold">
                <Clock className="w-2.5 h-2.5" />
                {viagem.hoje}
              </span>
            )}
            {viagem.esta_semana > 0 && viagem.vencidos === 0 && viagem.hoje === 0 && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                {viagem.esta_semana} esta semana
              </span>
            )}
          </div>
          {viagem.dias_pra_embarque != null && viagem.dias_pra_embarque >= 0 && (
            <div className="text-right">
              <div className="font-mono font-semibold text-[11px] text-slate-700">
                {viagem.dias_pra_embarque}d
              </div>
              <div className="text-[9.5px] text-slate-400 uppercase tracking-wide leading-none">embarque</div>
            </div>
          )}
        </div>
      </div>
    </button>
  )
}
