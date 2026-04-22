import ChartCard from '@/components/analytics/ChartCard'
import { cn } from '@/lib/utils'
import type { FunnelVelocityRow } from '@/hooks/analytics/useFunnelVelocity'
import { getPhaseColor } from './constants'

interface Props {
  isLoading: boolean
  rows: FunnelVelocityRow[]
}

function durationBadge(days: number): string {
  if (days > 30) return 'text-rose-600 font-semibold'
  if (days > 14) return 'text-amber-600 font-semibold'
  return 'text-slate-700'
}

export default function FunnelVelocityTable({ isLoading, rows }: Props) {
  // `rows` já vem ordenado pelo FunnelView (ordem canônica do pipeline_stages).
  const sorted = rows

  return (
    <ChartCard
      title="Velocidade por etapa"
      description="Quantos cards passaram e quanto tempo ficaram em cada etapa"
      colSpan={2}
      isLoading={isLoading}
    >
      <div className="px-4 pb-2 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2.5 pr-3 text-slate-500 font-medium">Etapa</th>
              <th className="text-right py-2.5 px-2 text-slate-500 font-medium">Passaram</th>
              <th className="text-right py-2.5 px-2 text-slate-500 font-medium">Atuais</th>
              <th className="text-right py-2.5 px-2 text-slate-500 font-medium">Mediana</th>
              <th className="text-right py-2.5 px-2 text-slate-500 font-medium">p90</th>
              <th className="text-right py-2.5 px-2 text-slate-500 font-medium">Média</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => {
              const color = getPhaseColor(row.phase_slug)
              return (
                <tr key={row.stage_id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-slate-700 font-medium truncate max-w-[220px]">
                        {row.stage_nome}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-slate-700 font-semibold">
                    {row.cards_passaram.toLocaleString('pt-BR')}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-slate-500">
                    {row.cards_atuais.toLocaleString('pt-BR')}
                  </td>
                  <td className={cn('py-2 px-2 text-right tabular-nums', durationBadge(row.mediana_dias))}>
                    {row.mediana_dias.toFixed(0)}d
                  </td>
                  <td className={cn('py-2 px-2 text-right tabular-nums', durationBadge(row.p90_dias))}>
                    {row.p90_dias.toFixed(0)}d
                  </td>
                  <td className={cn('py-2 px-2 text-right tabular-nums', durationBadge(row.media_dias))}>
                    {row.media_dias.toFixed(1)}d
                  </td>
                </tr>
              )
            })}
            {sorted.length === 0 && !isLoading && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400">
                  Sem dados de velocidade no período
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </ChartCard>
  )
}
