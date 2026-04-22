import ChartCard from '@/components/analytics/ChartCard'
import { cn } from '@/lib/utils'
import type {
  PipelineCurrentTasks,
  PipelineCurrentKpis,
} from '@/hooks/analytics/usePipelineCurrent'
import { TASK_TYPE_LABELS, getPhaseColor } from './constants'

interface Props {
  isLoading: boolean
  taskMetrics: PipelineCurrentTasks | null
  kpis: PipelineCurrentKpis
  ownerIds: string[]
  onOwnerToggle: (ownerId: string) => void
}

function rateBadge(rate: number) {
  return cn(
    'inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold',
    rate >= 70
      ? 'bg-green-100 text-green-700'
      : rate >= 40
        ? 'bg-amber-100 text-amber-700'
        : 'bg-rose-100 text-rose-700'
  )
}

export default function PipelineTasksSection({
  isLoading,
  taskMetrics,
  kpis,
  ownerIds,
  onOwnerToggle,
}: Props) {
  const hasAnyTasks = !!taskMetrics && taskMetrics.total_created > 0

  return (
    <>
      {/* Atividade — KPIs + by_type */}
      <ChartCard
        title="Atividade de Tarefas"
        description={`${taskMetrics?.total_created ?? 0} tarefas nos ${kpis.total_open} cards em aberto`}
        colSpan={2}
        isLoading={isLoading}
      >
        {hasAnyTasks ? (
          <div className="px-4 pb-4 space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-slate-900 tabular-nums">
                  {taskMetrics.total_created}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">Total</p>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-green-700 tabular-nums">
                  {taskMetrics.total_completed}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">Concluídas</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-amber-700 tabular-nums">
                  {taskMetrics.total_pending}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">Pendentes</p>
              </div>
              <div
                className={cn(
                  'rounded-lg p-3 text-center',
                  taskMetrics.total_overdue > 0 ? 'bg-rose-50' : 'bg-slate-50'
                )}
              >
                <p
                  className={cn(
                    'text-2xl font-bold tabular-nums',
                    taskMetrics.total_overdue > 0 ? 'text-rose-700' : 'text-slate-400'
                  )}
                >
                  {taskMetrics.total_overdue}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">Atrasadas</p>
              </div>
            </div>

            {taskMetrics.by_type.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 text-slate-500 font-medium">Tipo</th>
                      <th className="text-right py-2 px-2 text-slate-500 font-medium">Total</th>
                      <th className="text-right py-2 px-2 text-slate-500 font-medium">
                        Concluídas
                      </th>
                      <th className="text-right py-2 px-2 text-slate-500 font-medium">
                        Pendentes
                      </th>
                      <th className="text-right py-2 px-2 text-slate-500 font-medium">
                        Atrasadas
                      </th>
                      <th className="text-right py-2 text-slate-500 font-medium">Taxa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taskMetrics.by_type.map(row => {
                      const rate = row.total > 0 ? Math.round((row.completed / row.total) * 100) : 0
                      return (
                        <tr key={row.tipo} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="py-2 text-slate-700 font-medium">
                            {TASK_TYPE_LABELS[row.tipo] ?? row.tipo}
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums text-slate-700">
                            {row.total}
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums text-green-700 font-semibold">
                            {row.completed}
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums text-amber-700">
                            {row.pending}
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums">
                            {row.overdue > 0 ? (
                              <span className="text-rose-700 font-semibold">{row.overdue}</span>
                            ) : (
                              <span className="text-slate-300">0</span>
                            )}
                          </td>
                          <td className="py-2 text-right">
                            <span className={rateBadge(rate)}>{rate}%</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          !isLoading && (
            <div className="px-4 pb-4 text-center text-slate-400 text-sm py-8">
              Nenhuma tarefa nos cards em aberto
            </div>
          )
        )}
      </ChartCard>

      {/* By stage */}
      <ChartCard
        title="Tarefas por Etapa"
        description="Atividade de tarefas em cada etapa do pipeline"
        colSpan={2}
        isLoading={isLoading}
      >
        {taskMetrics && taskMetrics.by_stage.length > 0 ? (
          <div className="px-4 pb-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2.5 text-slate-500 font-medium">Etapa</th>
                  <th className="text-right py-2.5 px-2 text-slate-500 font-medium">Cards</th>
                  <th className="text-right py-2.5 px-2 text-slate-500 font-medium">Tarefas</th>
                  <th className="text-right py-2.5 px-2 text-slate-500 font-medium">Concluídas</th>
                  <th className="text-right py-2.5 px-2 text-slate-500 font-medium">Pendentes</th>
                  <th className="text-right py-2.5 px-2 text-slate-500 font-medium">Atrasadas</th>
                  <th className="text-right py-2.5 text-slate-500 font-medium">Taxa</th>
                </tr>
              </thead>
              <tbody>
                {taskMetrics.by_stage.map(row => {
                  const rate = row.total > 0 ? Math.round((row.completed / row.total) * 100) : 0
                  const phaseColor = getPhaseColor(row.fase_slug)
                  return (
                    <tr key={row.stage_id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: phaseColor }}
                          />
                          <span className="text-slate-700 font-medium truncate max-w-[200px]">
                            {row.stage_nome}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-slate-500">
                        {row.card_count}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-slate-700 font-medium">
                        {row.total}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-green-700 font-semibold">
                        {row.completed}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-amber-700">
                        {row.pending}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        {row.overdue > 0 ? (
                          <span className="text-rose-700 font-semibold">{row.overdue}</span>
                        ) : (
                          <span className="text-slate-300">0</span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        {row.total > 0 ? (
                          <span className={rateBadge(rate)}>{rate}%</span>
                        ) : (
                          <span className="text-slate-300 text-[10px]">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          !isLoading && (
            <div className="px-4 pb-4 text-center text-slate-400 text-sm py-8">
              Nenhuma tarefa por etapa
            </div>
          )
        )}
      </ChartCard>

      {/* By owner */}
      <ChartCard
        title="Tarefas por Consultor"
        description="Execução de tarefas por responsável do card"
        colSpan={2}
        isLoading={isLoading}
      >
        {taskMetrics && taskMetrics.by_owner.length > 0 ? (
          <div className="px-4 pb-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2.5 text-slate-500 font-medium">Consultor</th>
                  <th className="text-right py-2.5 px-2 text-slate-500 font-medium">Cards</th>
                  <th className="text-right py-2.5 px-2 text-slate-500 font-medium">Tarefas</th>
                  <th className="text-right py-2.5 px-2 text-slate-500 font-medium">Concluídas</th>
                  <th className="text-right py-2.5 px-2 text-slate-500 font-medium">Pendentes</th>
                  <th className="text-right py-2.5 px-2 text-slate-500 font-medium">Atrasadas</th>
                  <th className="text-right py-2.5 text-slate-500 font-medium">Taxa</th>
                </tr>
              </thead>
              <tbody>
                {taskMetrics.by_owner.map(row => {
                  const rate = row.total > 0 ? Math.round((row.completed / row.total) * 100) : 0
                  const isSelected = !!row.owner_id && ownerIds.includes(row.owner_id)
                  return (
                    <tr
                      key={row.owner_id ?? 'unassigned'}
                      className={cn(
                        'border-b border-slate-50 hover:bg-slate-50 cursor-pointer',
                        isSelected && 'bg-indigo-50/50 border-l-2 border-l-indigo-400'
                      )}
                      onClick={() => {
                        if (row.owner_id) onOwnerToggle(row.owner_id)
                      }}
                    >
                      <td className="py-2 pr-3 text-slate-700 font-medium">{row.owner_nome}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-slate-500">
                        {row.card_count}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-slate-700 font-medium">
                        {row.total}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-green-700 font-semibold">
                        {row.completed}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-amber-700">
                        {row.pending}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        {row.overdue > 0 ? (
                          <span className="text-rose-700 font-semibold">{row.overdue}</span>
                        ) : (
                          <span className="text-slate-300">0</span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        {row.total > 0 ? (
                          <span className={rateBadge(rate)}>{rate}%</span>
                        ) : (
                          <span className="text-slate-300 text-[10px]">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          !isLoading && (
            <div className="px-4 pb-4 text-center text-slate-400 text-sm py-8">
              Nenhuma tarefa por consultor
            </div>
          )
        )}
      </ChartCard>
    </>
  )
}
