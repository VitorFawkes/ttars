import { useMemo } from 'react'
import ChartCard from '@/components/analytics/ChartCard'
import { cn } from '@/lib/utils'
import type {
  PipelineCurrentAging,
  DateRef,
} from '@/hooks/analytics/usePipelineCurrent'
import { agingCellColor, truncateLabel } from './constants'

interface Props {
  isLoading: boolean
  aging: PipelineCurrentAging[]
  stageDisplayNames: Map<string, string>
  dateRef: DateRef
  onStageDrill: (stageId: string, stageName: string) => void
}

export default function PipelineAgingHeatmap({
  isLoading,
  aging,
  stageDisplayNames,
  dateRef,
  onStageDrill,
}: Props) {
  const agingTotals = useMemo(
    () => ({
      bucket_0_3: aging.reduce((s, a) => s + a.bucket_0_3, 0),
      bucket_3_7: aging.reduce((s, a) => s + a.bucket_3_7, 0),
      bucket_7_14: aging.reduce((s, a) => s + a.bucket_7_14, 0),
      bucket_14_plus: aging.reduce((s, a) => s + a.bucket_14_plus, 0),
    }),
    [aging]
  )

  return (
    <ChartCard
      title={dateRef === 'stage' ? 'Tempo na Etapa (Aging)' : 'Tempo desde Criação (Aging)'}
      description={
        dateRef === 'stage'
          ? 'Cards por faixa de dias na etapa atual'
          : 'Cards por faixa de dias desde a criação'
      }
      isLoading={isLoading}
    >
      <div className="px-4 pb-2 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left py-2 pr-3 text-slate-500 font-medium">Etapa</th>
              <th className="text-center px-2 py-2 text-slate-500 font-medium">0-3d</th>
              <th className="text-center px-2 py-2 text-slate-500 font-medium">3-7d</th>
              <th className="text-center px-2 py-2 text-slate-500 font-medium">7-14d</th>
              <th className="text-center px-2 py-2 text-slate-500 font-medium">14d+</th>
              <th className="text-center px-2 py-2 text-slate-500 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {aging.map((row: PipelineCurrentAging) => {
              const rowTotal =
                row.bucket_0_3 + row.bucket_3_7 + row.bucket_7_14 + row.bucket_14_plus
              return (
                <tr key={row.stage_id} className="border-b border-slate-50">
                  <td
                    className="py-1.5 pr-3 text-slate-700 font-medium truncate max-w-[160px]"
                    title={stageDisplayNames.get(row.stage_id) || row.stage_nome}
                  >
                    {truncateLabel(stageDisplayNames.get(row.stage_id) || row.stage_nome)}
                  </td>
                  {(['bucket_0_3', 'bucket_3_7', 'bucket_7_14', 'bucket_14_plus'] as const).map(
                    bucket => {
                      const pct = rowTotal > 0 ? Math.round((row[bucket] / rowTotal) * 100) : 0
                      const bucketLabel = bucket
                        .replace('bucket_', '')
                        .replace('_plus', '+')
                        .replace('_', '-')
                      return (
                        <td key={bucket} className="text-center px-1 py-1.5">
                          <button
                            className={cn(
                              'inline-flex items-center justify-center min-w-[2.5rem] h-6 px-1 rounded text-[10px] font-semibold transition-colors',
                              agingCellColor(row[bucket]),
                              row[bucket] > 0 &&
                                'hover:ring-1 hover:ring-indigo-300 cursor-pointer'
                            )}
                            onClick={() =>
                              row[bucket] > 0 &&
                              onStageDrill(
                                row.stage_id,
                                `${row.stage_nome} — ${bucketLabel}d`
                              )
                            }
                            disabled={row[bucket] === 0}
                          >
                            {row[bucket]}
                            {rowTotal > 0 && row[bucket] > 0 && (
                              <span className="ml-0.5 text-[8px] opacity-70">({pct}%)</span>
                            )}
                          </button>
                        </td>
                      )
                    }
                  )}
                  <td className="text-center px-2 py-1.5 text-slate-600 font-semibold tabular-nums">
                    {rowTotal}
                  </td>
                </tr>
              )
            })}
            {aging.length > 0 && (
              <tr className="border-t border-slate-200 bg-slate-50/50">
                <td className="py-1.5 pr-3 text-slate-500 font-semibold">Total</td>
                {(['bucket_0_3', 'bucket_3_7', 'bucket_7_14', 'bucket_14_plus'] as const).map(
                  bucket => (
                    <td
                      key={bucket}
                      className="text-center px-2 py-1.5 text-slate-600 font-semibold tabular-nums"
                    >
                      {agingTotals[bucket]}
                    </td>
                  )
                )}
                <td className="text-center px-2 py-1.5 text-slate-800 font-bold tabular-nums">
                  {agingTotals.bucket_0_3 +
                    agingTotals.bucket_3_7 +
                    agingTotals.bucket_7_14 +
                    agingTotals.bucket_14_plus}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </ChartCard>
  )
}
