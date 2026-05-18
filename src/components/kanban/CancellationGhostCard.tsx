import { AlertTriangle, CheckCircle2, Clock, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  type CancellationGhostSummary,
  diasParaEmbarque,
  ghostBorderState,
  modoCancelamentoLabel,
} from '@/hooks/cancelamento/useCancelamento'

interface CancellationGhostCardProps {
  ghost: CancellationGhostSummary
  onClick: () => void
}

function tempoAberto(iso: string): string {
  const then = new Date(iso).getTime()
  const diffMin = Math.max(1, Math.round((Date.now() - then) / 60_000))
  if (diffMin < 60) return `${diffMin}min`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h`
  return `${Math.round(diffHr / 24)}d`
}

function prazoLabel(iso: string | null): string {
  if (!iso) return 'sem prazo'
  const target = new Date(iso)
  target.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dias = Math.round((target.getTime() - today.getTime()) / 86_400_000)
  if (dias === 0) return 'vence hoje'
  if (dias === 1) return 'vence amanhã'
  if (dias < 0) return `atrasou ${Math.abs(dias)}d`
  return `vence ${dias}d`
}

function isVencidoOuHoje(iso: string | null): boolean {
  if (!iso) return false
  const target = new Date(iso)
  target.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return target.getTime() <= today.getTime()
}

export function CancellationGhostCard({ ghost, onClick }: CancellationGhostCardProps) {
  const state = ghostBorderState(ghost)
  const borderClass =
    state === 'red'
      ? 'border-red-500'
      : state === 'green'
        ? 'border-emerald-500 border-dashed'
        : state === 'gray'
          ? 'border-slate-300'
          : 'border-amber-500'

  const dias = diasParaEmbarque(ghost.embarque_em)
  const embarqueLabel =
    dias === null
      ? null
      : dias < 0
        ? `embarcou há ${Math.abs(dias)}d`
        : dias === 0
          ? 'embarca hoje'
          : `embarca em ${dias}d`

  const chipColor =
    ghost.modo_cancelamento === 'total'
      ? 'bg-red-100 text-red-800 border-red-300'
      : ghost.modo_cancelamento === 'mudanca_brusca'
        ? 'bg-violet-100 text-violet-800 border-violet-300'
        : 'bg-amber-100 text-amber-800 border-amber-300'

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left bg-white rounded-lg border-2 p-3 shadow-sm hover:shadow-md transition-shadow space-y-2',
        borderClass,
      )}
    >
      {/* Cabeçalho: nome + chip */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-slate-900 truncate">
            {ghost.card_titulo ?? 'Viagem sem título'}
          </div>
          {embarqueLabel && (
            <div className="text-xs text-slate-500 mt-0.5">{embarqueLabel}</div>
          )}
        </div>
        <span
          className={cn(
            'text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 uppercase tracking-wide',
            chipColor,
          )}
        >
          ⚠ {modoCancelamentoLabel(ghost.modo_cancelamento)}
        </span>
      </div>

      {/* Estado especial: sem tarefa criada */}
      {ghost.total_tarefas === 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-xs text-slate-600 flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          Nenhuma tarefa criada — abra o painel
        </div>
      )}

      {/* Estado especial: tudo feito */}
      {ghost.total_tarefas > 0 && ghost.pendentes === 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5 text-xs text-emerald-800 flex items-center gap-1.5">
          <CheckCircle2 className="w-3 h-3 shrink-0" />
          Tudo feito · pronto pra concluir
        </div>
      )}

      {/* Contador + próximas tarefas */}
      {ghost.total_tarefas > 0 && (
        <div className="text-xs text-slate-600">
          <span className="font-medium">{ghost.total_tarefas}</span> tarefa
          {ghost.total_tarefas === 1 ? '' : 's'} ·{' '}
          <span className="font-medium">{ghost.concluidas}</span> concluída
          {ghost.concluidas === 1 ? '' : 's'}
          {ghost.atrasadas > 0 && (
            <span className="text-red-600 font-medium"> · {ghost.atrasadas} atrasada{ghost.atrasadas === 1 ? '' : 's'}</span>
          )}
        </div>
      )}

      {ghost.proximas.length > 0 && (
        <div className="border-t border-slate-100 pt-2 space-y-1">
          {ghost.proximas.map((p) => (
            <div key={p.id} className="text-xs">
              <div className="flex items-start gap-1.5">
                <Clock className="w-3 h-3 text-amber-600 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-slate-800 truncate">{p.titulo}</div>
                  <div className="text-slate-500 flex items-center gap-1">
                    <User className="w-2.5 h-2.5" />
                    {p.responsavel_nome ? `→ ${p.responsavel_nome}` : '→ sem dono'}
                    <span className="text-slate-400">·</span>
                    <span className={cn(isVencidoOuHoje(p.data_vencimento) && 'text-red-600 font-medium')}>
                      {prazoLabel(p.data_vencimento)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {ghost.pendentes > 2 && (
            <div className="text-xs text-slate-500 pl-4.5">+ {ghost.pendentes - 2} outra{ghost.pendentes - 2 === 1 ? '' : 's'}</div>
          )}
        </div>
      )}

      {/* Rodapé */}
      <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-100">
        Aberto há {tempoAberto(ghost.cancelamento_aberto_em)}
        {ghost.aberto_por_nome ? ` por ${ghost.aberto_por_nome}` : ''}
      </div>
    </button>
  )
}
