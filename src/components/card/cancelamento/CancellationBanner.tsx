import { AlertTriangle, Info } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import type { ViagemCancelamentoState } from '@/hooks/cancelamento/useCancelamento'
import { modoCancelamentoLabel } from '@/hooks/cancelamento/useCancelamento'

function tempoRelativo(iso: string | null): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffMin = Math.max(1, Math.round((now - then) / 60_000))
  if (diffMin < 60) return `há ${diffMin}min`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `há ${diffHr}h`
  const diffDays = Math.round(diffHr / 24)
  return `há ${diffDays}d`
}

interface CancellationBannerProps {
  state: ViagemCancelamentoState
  motivoNome?: string | null
  itensCanceladosCount?: number
  tarefasPendentesCount?: number
  onOpenPanel: () => void
}

/** Banner âmbar exibido enquanto o cancelamento está em curso (não concluído). */
export function CancellationBanner({
  state,
  motivoNome,
  itensCanceladosCount,
  tarefasPendentesCount,
  onOpenPanel,
}: CancellationBannerProps) {
  if (!state.modo_cancelamento || state.cancelamento_concluido_em) return null

  return (
    <div className="bg-amber-50 border-b-2 border-amber-400">
      <div className="px-4 py-3 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-amber-900 text-sm">
            CANCELAMENTO {modoCancelamentoLabel(state.modo_cancelamento).toUpperCase()} EM CURSO
          </div>
          <div className="text-sm text-amber-800 mt-0.5">
            Aberto {tempoRelativo(state.cancelamento_aberto_em)}
            {motivoNome ? <> · Motivo: <span className="font-medium">{motivoNome}</span></> : null}
          </div>
          {(itensCanceladosCount !== undefined || tarefasPendentesCount !== undefined) && (
            <div className="text-xs text-amber-700 mt-1">
              {tarefasPendentesCount !== undefined && (
                <>
                  <span className="font-medium">{tarefasPendentesCount}</span> tarefa
                  {tarefasPendentesCount === 1 ? '' : 's'} pendente
                  {tarefasPendentesCount === 1 ? '' : 's'}
                </>
              )}
              {itensCanceladosCount !== undefined && tarefasPendentesCount !== undefined && ' · '}
              {itensCanceladosCount !== undefined && (
                <>
                  <span className="font-medium">{itensCanceladosCount}</span> ite
                  {itensCanceladosCount === 1 ? 'm' : 'ns'} cancelad
                  {itensCanceladosCount === 1 ? 'o' : 'os'}
                </>
              )}
            </div>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenPanel}
          className="shrink-0 border-amber-400 text-amber-800 hover:bg-amber-100"
        >
          Ver detalhes →
        </Button>
      </div>
    </div>
  )
}

interface CancellationCompletedBannerProps {
  state: ViagemCancelamentoState
  abertoPorNome?: string | null
  itensCanceladosCount?: number
  tarefasPendentesCount?: number
  onOpenPanel: () => void
  className?: string
}

/** Banner cinza-claro exibido por 7 dias após conclusão de cancelamento PARCIAL/MUDANÇA.
 * Não exibe para TOTAL (card já saiu do kanban operacional). */
export function CancellationCompletedBanner({
  state,
  abertoPorNome,
  itensCanceladosCount,
  tarefasPendentesCount,
  onOpenPanel,
  className,
}: CancellationCompletedBannerProps) {
  if (!state.cancelamento_concluido_em) return null
  if (state.modo_cancelamento === 'total') return null

  const concluidoEm = new Date(state.cancelamento_concluido_em).getTime()
  const dias = (Date.now() - concluidoEm) / 86_400_000
  if (dias > 7) return null

  const dataFmt = new Date(state.cancelamento_concluido_em).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  })

  return (
    <div className={cn('bg-slate-50 border-b border-slate-200', className)}>
      <div className="px-4 py-2.5 flex items-center gap-3">
        <Info className="w-4 h-4 text-slate-500 shrink-0" />
        <div className="flex-1 min-w-0 text-sm text-slate-700">
          Cancelamento {modoCancelamentoLabel(state.modo_cancelamento ?? 'parcial').toLowerCase()}{' '}
          concluído em {dataFmt}
          {abertoPorNome ? <> por {abertoPorNome}</> : null}
          {(itensCanceladosCount !== undefined || tarefasPendentesCount !== undefined) && (
            <span className="text-slate-500">
              {' · '}
              {itensCanceladosCount !== undefined && (
                <>
                  {itensCanceladosCount} ite{itensCanceladosCount === 1 ? 'm removido' : 'ns removidos'}
                </>
              )}
              {itensCanceladosCount !== undefined && tarefasPendentesCount !== undefined && ' · '}
              {tarefasPendentesCount !== undefined && tarefasPendentesCount > 0 && (
                <>{tarefasPendentesCount} ajuste{tarefasPendentesCount === 1 ? '' : 's'} pendente{tarefasPendentesCount === 1 ? '' : 's'}</>
              )}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onOpenPanel}
          className="text-xs font-medium text-slate-600 hover:text-slate-900 underline-offset-2 hover:underline shrink-0"
        >
          Ver tarefas
        </button>
      </div>
    </div>
  )
}
