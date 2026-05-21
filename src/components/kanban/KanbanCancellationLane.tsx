import { useNavigate } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { useCancellationGhosts } from '@/hooks/cancelamento/useCancelamento'
import { CancellationGhostCard } from './CancellationGhostCard'

interface KanbanCancellationLaneProps {
  tpOwnerId: string | undefined
  orgId: string | undefined
}

/** Coluna virtual "Cancelamento" no kanban do TP.
 *  Aparece SOMENTE quando há viagens em cancelamento aberto onde current user é TP.
 *  Cards-ghost não arrastáveis. Click navega para o card real (em pós-venda). */
export function KanbanCancellationLane({ tpOwnerId, orgId }: KanbanCancellationLaneProps) {
  const navigate = useNavigate()
  const { data: ghosts = [], isLoading } = useCancellationGhosts(tpOwnerId, orgId)

  // Não renderiza se não há ghosts (some quando vazia, conforme requisito)
  if (isLoading) return null
  if (ghosts.length === 0) return null

  return (
    <>
      {/* Divisor visual grosso entre o funil normal e a raia */}
      <div className="w-px bg-amber-300 shrink-0 mx-1.5 my-2 rounded-full" aria-hidden />

      <div className="shrink-0 w-72 bg-amber-50/40 rounded-lg border-2 border-amber-200 border-dashed flex flex-col h-full">
        {/* Header */}
        <div className="px-3 py-2.5 border-b border-amber-200 bg-amber-100/40 rounded-t-lg">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-amber-800">
              <AlertTriangle className="w-4 h-4" />
              <span className="font-semibold text-sm">Cancelamento</span>
            </div>
            <span className="text-xs font-medium text-amber-700 bg-amber-200/60 px-2 py-0.5 rounded-full">
              {ghosts.length}
            </span>
          </div>
          <div className="text-[10px] text-amber-700 mt-0.5 uppercase tracking-wide">
            Fora do funil
          </div>
        </div>

        {/* Lista de ghosts */}
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {ghosts.map((g) => (
            <CancellationGhostCard
              key={g.viagem_id}
              ghost={g}
              onClick={() => {
                if (g.card_id) navigate(`/cards/${g.card_id}`)
              }}
            />
          ))}
        </div>
      </div>
    </>
  )
}
