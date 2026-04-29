import { useState } from 'react'
import { Calendar, CheckCircle2, ExternalLink, Loader2, Flame } from 'lucide-react'
import { Link } from 'react-router-dom'
import { TIPO_LABEL, CATEGORIAS_CONCIERGE, type MeuDiaItem } from '../../../hooks/concierge/types'
import { useMarcarOutcome } from '../../../hooks/concierge/useAtendimentoMutations'
import { useToggleCardCritical } from '../../../hooks/concierge/useToggleCritical'
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

interface ViagemCardProps {
  viagem: ViagemKanbanItem
  onOpenDrawer: () => void
  onOpenTask: (item: MeuDiaItem) => void
}

const MAX_INLINE_TASKS = 4

export function ViagemCard({ viagem, onOpenDrawer, onOpenTask }: ViagemCardProps) {
  const ini = fmtDate(viagem.data_viagem_inicio)
  const fim = fmtDate(viagem.data_viagem_fim)
  const dataLabel = ini && fim ? `${ini} – ${fim}` : ini ?? 'Sem data'
  const isCritica = viagem.saude === 'critica'
  const isManualCritical = viagem.card_is_critical
  const inlineTasks = viagem.abertos.slice(0, MAX_INLINE_TASKS)
  const remaining = viagem.abertos.length - inlineTasks.length

  const { mutate: toggleCritical, isPending: togglingCritical } = useToggleCardCritical()

  return (
    <div
      className={cn(
        'group relative w-full bg-white border rounded-lg shadow-sm hover:shadow-md transition-all overflow-hidden',
        isManualCritical
          ? 'border-red-400 ring-2 ring-red-100'
          : isCritica
            ? 'border-red-200'
            : 'border-slate-200'
      )}
    >
      <span className={cn('absolute left-0 top-0 bottom-0 w-[3px]', SAUDE_ACCENT[viagem.saude])} />

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); toggleCritical({ card_id: viagem.card_id, isCritical: !isManualCritical }) }}
        disabled={togglingCritical}
        className={cn(
          'absolute top-2 right-2 z-10 w-5 h-5 rounded flex items-center justify-center transition-all',
          isManualCritical
            ? 'bg-red-100 text-red-600 hover:bg-red-200 opacity-100'
            : 'text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 focus:opacity-100'
        )}
        aria-label={isManualCritical ? 'Remover marcação crítica' : 'Marcar viagem como crítica'}
        title={isManualCritical ? 'Viagem crítica — clique pra remover' : 'Marcar viagem como crítica'}
      >
        <Flame className="w-3 h-3" strokeWidth={2.5} />
      </button>

      <div className="pl-3 pr-9 pt-2.5 pb-1.5">
        <button
          type="button"
          onClick={onOpenDrawer}
          className="block w-full text-left hover:bg-slate-50/50 -mx-1 -mt-1 px-1 pt-1 pb-1 rounded"
        >
          <h4 className="text-[13px] font-semibold text-slate-900 leading-snug line-clamp-2 mb-1">
            {viagem.card_titulo}
          </h4>

          <div className="flex items-center gap-x-1.5 gap-y-0.5 text-[10.5px] text-slate-500 flex-wrap">
            <span className="font-semibold text-slate-600 uppercase tracking-wide whitespace-nowrap">{viagem.produto?.toUpperCase()}</span>
            <span className="text-slate-300">·</span>
            <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
              <Calendar className="w-2.5 h-2.5" />
              {dataLabel}
            </span>
            {viagem.dias_pra_embarque != null && viagem.dias_pra_embarque >= 0 && (
              <>
                <span className="text-slate-300">·</span>
                <span className="font-mono font-semibold text-slate-700 whitespace-nowrap">embarca em {viagem.dias_pra_embarque}d</span>
              </>
            )}
          </div>
        </button>
      </div>

      {viagem.abertos.length > 0 ? (
        <ul className="border-t border-slate-100">
          {inlineTasks.map(task => (
            <TaskInlineRow
              key={task.atendimento_id}
              task={task}
              onClick={() => onOpenTask(task)}
            />
          ))}
          {remaining > 0 && (
            <li>
              <button
                type="button"
                onClick={onOpenDrawer}
                className="w-full text-[10.5px] font-medium text-indigo-600 hover:bg-indigo-50 py-1.5 px-3 text-left transition-colors"
              >
                + {remaining} {remaining === 1 ? 'tarefa' : 'tarefas'} a mais…
              </button>
            </li>
          )}
        </ul>
      ) : (
        <div className="border-t border-slate-100 py-2 px-3 text-[10.5px] text-emerald-700 inline-flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" strokeWidth={2.5} />
          Tudo concluído
        </div>
      )}

      <div className="border-t border-slate-100 px-2.5 py-1.5 flex items-center justify-between gap-2 bg-slate-50/40">
        <div className="flex items-center gap-1 text-[10.5px]">
          {viagem.vencidos > 0 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-bold">
              {viagem.vencidos} vencido{viagem.vencidos === 1 ? '' : 's'}
            </span>
          )}
          {viagem.hoje > 0 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-bold">
              {viagem.hoje} hoje
            </span>
          )}
          {viagem.concluidos > 0 && (
            <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
              <CheckCircle2 className="w-3 h-3" strokeWidth={2.5} />
              {viagem.concluidos} concluída{viagem.concluidos === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <Link
          to={`/cards/${viagem.card_id}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-0.5 text-[10.5px] text-slate-500 hover:text-indigo-600 font-medium"
          title="Abrir card da viagem"
        >
          ver viagem <ExternalLink className="w-2.5 h-2.5" />
        </Link>
      </div>
    </div>
  )
}

function TaskInlineRow({ task, onClick }: { task: MeuDiaItem; onClick: () => void }) {
  const meta = TIPO_LABEL[task.tipo_concierge]
  const cat = CATEGORIAS_CONCIERGE[task.categoria as keyof typeof CATEGORIAS_CONCIERGE]
  const titulo = task.titulo?.trim() || cat?.label || task.categoria
  const prazo = relPrazo(task.data_vencimento)
  const isVencido = task.status_apresentacao === 'vencido'
  const isOferta = task.tipo_concierge === 'oferta'

  const { mutate: marcarOutcome, isPending } = useMarcarOutcome()
  const [done, setDone] = useState(false)

  const handleCheck = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (done || isPending) return
    setDone(true)
    marcarOutcome({
      atendimento_id: task.atendimento_id,
      outcome: isOferta ? 'aceito' : 'feito',
      valor_final: task.valor ?? null,
      cobrado_de: task.cobrado_de ?? null,
    }, {
      onError: () => setDone(false),
    })
  }

  return (
    <li className={cn('group/row border-t border-slate-50 first:border-t-0 transition-opacity', done && 'opacity-50')}>
      <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 transition-colors">
        <button
          type="button"
          onClick={handleCheck}
          disabled={done || isPending}
          className={cn(
            'shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors',
            done
              ? 'bg-emerald-500 border-emerald-500 text-white'
              : 'bg-white border-slate-300 hover:border-emerald-500 hover:bg-emerald-50'
          )}
          title={isOferta ? 'Marcar como aceito' : 'Marcar como feito'}
        >
          {isPending ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : done && <CheckCircle2 className="w-3 h-3" strokeWidth={3} />}
        </button>

        <span className={cn('shrink-0 w-1.5 h-1.5 rounded-full', meta.dotColor)} title={meta.label} />

        <button
          type="button"
          onClick={onClick}
          className="flex-1 min-w-0 text-left flex items-center gap-2"
        >
          <span className={cn('text-[12px] truncate', done ? 'line-through text-slate-400' : 'text-slate-800')}>
            {titulo}
          </span>
        </button>

        <div className="shrink-0 flex items-center gap-1.5">
          {prazo && (
            <span className={cn('font-mono text-[10.5px] font-semibold whitespace-nowrap', (prazo.overdue || isVencido) && !done ? 'text-red-600' : 'text-slate-500')}>
              {prazo.label}
            </span>
          )}
        </div>
      </div>
    </li>
  )
}
