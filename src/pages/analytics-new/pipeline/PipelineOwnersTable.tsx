import { useMemo } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import ChartCard from '@/components/analytics/ChartCard'
import { formatCurrency } from '@/utils/whatsappFormatters'
import { cn } from '@/lib/utils'
import type {
  PipelineCurrentOwner,
  DateRef,
} from '@/hooks/analytics/usePipelineCurrent'
import { PHASE_COLORS, type OwnerSortField, type PhaseFilter } from './constants'

interface Props {
  isLoading: boolean
  owners: PipelineCurrentOwner[]
  phaseFilter: PhaseFilter
  phaseLabel: (slug: string | null | undefined) => string
  dateRef: DateRef
  ownerIds: string[]
  onOwnerFilter: (ownerId: string | null) => void
  ownerSort: { field: OwnerSortField; dir: 'asc' | 'desc' }
  toggleOwnerSort: (field: OwnerSortField) => void
}

export default function PipelineOwnersTable({
  isLoading,
  owners,
  phaseFilter,
  phaseLabel,
  dateRef,
  ownerIds,
  onOwnerFilter,
  ownerSort,
  toggleOwnerSort,
}: Props) {
  const sortedOwners = useMemo(() => {
    let filtered = owners
    if (phaseFilter !== 'all') {
      filtered = owners
        .map(o => {
          const phKey = phaseFilter as keyof typeof o.by_phase
          return {
            ...o,
            total_cards: o.by_phase[phKey] || 0,
            total_value: o.by_phase_value[phKey] || 0,
            total_receita: o.by_phase_receita?.[phKey] || 0,
          }
        })
        .filter(o => o.total_cards > 0)
    }
    return [...filtered].sort((a, b) => {
      const { field, dir } = ownerSort
      const va = a[field] as number
      const vb = b[field] as number
      return dir === 'asc' ? va - vb : vb - va
    })
  }, [owners, phaseFilter, ownerSort])

  const sortIcon = (field: OwnerSortField) => {
    if (ownerSort.field !== field)
      return <ArrowUpDown className="w-3 h-3 text-slate-300 ml-1" />
    return ownerSort.dir === 'desc' ? (
      <ArrowDown className="w-3 h-3 text-indigo-500 ml-1" />
    ) : (
      <ArrowUp className="w-3 h-3 text-indigo-500 ml-1" />
    )
  }

  return (
    <ChartCard
      title="Performance por Consultor"
      description={`${sortedOwners.length} consultores${phaseFilter !== 'all' ? ` em ${phaseLabel(phaseFilter)}` : ''} — clique para filtrar`}
      colSpan={2}
      isLoading={isLoading}
    >
      <div className="px-4 pb-2 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2.5 pr-3 text-slate-500 font-medium">Consultor</th>
              <th className="text-left py-2.5 px-2 text-slate-500 font-medium">Fase</th>
              <th
                className="text-right py-2.5 px-2 text-slate-500 font-medium cursor-pointer hover:text-slate-700 select-none"
                onClick={() => toggleOwnerSort('total_cards')}
              >
                <span className="inline-flex items-center justify-end">
                  Cards {sortIcon('total_cards')}
                </span>
              </th>
              <th
                className="text-right py-2.5 px-2 text-slate-500 font-medium cursor-pointer hover:text-slate-700 select-none"
                onClick={() => toggleOwnerSort('total_value')}
              >
                <span className="inline-flex items-center justify-end">
                  Fat. {sortIcon('total_value')}
                </span>
              </th>
              <th
                className="text-right py-2.5 px-2 text-slate-500 font-medium cursor-pointer hover:text-slate-700 select-none"
                onClick={() => toggleOwnerSort('total_receita')}
              >
                <span className="inline-flex items-center justify-end">
                  Rec. {sortIcon('total_receita')}
                </span>
              </th>
              <th
                className="text-right py-2.5 px-2 text-slate-500 font-medium cursor-pointer hover:text-slate-700 select-none"
                onClick={() => toggleOwnerSort('avg_age_days')}
              >
                <span className="inline-flex items-center justify-end">
                  Idade {sortIcon('avg_age_days')}
                </span>
              </th>
              <th
                className="text-right py-2.5 px-2 text-slate-500 font-medium cursor-pointer hover:text-slate-700 select-none"
                onClick={() => toggleOwnerSort('sla_breach')}
              >
                <span className="inline-flex items-center justify-end">
                  SLA {sortIcon('sla_breach')}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedOwners.map(owner => {
              const isOwnerSelected =
                ownerIds.length === 1 && ownerIds[0] === owner.owner_id
              return (
                <tr
                  key={owner.owner_id ?? 'unassigned'}
                  className={cn(
                    'border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors',
                    isOwnerSelected && 'bg-indigo-50/50 border-l-2 border-l-indigo-400'
                  )}
                  onClick={() => onOwnerFilter(owner.owner_id)}
                >
                  <td className="py-2 pr-3 text-slate-800 font-medium">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600 shrink-0">
                        {owner.owner_nome.charAt(0)}
                      </div>
                      {owner.owner_nome}
                    </div>
                  </td>
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-1">
                      {owner.by_phase.sdr > 0 && (
                        <span
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold text-white"
                          style={{ background: PHASE_COLORS.sdr }}
                        >
                          {owner.by_phase.sdr}
                        </span>
                      )}
                      {owner.by_phase.planner > 0 && (
                        <span
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold text-white"
                          style={{ background: PHASE_COLORS.planner }}
                        >
                          {owner.by_phase.planner}
                        </span>
                      )}
                      {owner.by_phase['pos-venda'] > 0 && (
                        <span
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold text-white"
                          style={{ background: PHASE_COLORS['pos-venda'] }}
                        >
                          {owner.by_phase['pos-venda']}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 px-2 text-right text-slate-700 tabular-nums font-semibold">
                    {owner.total_cards}
                  </td>
                  <td className="py-2 px-2 text-right text-slate-700 tabular-nums">
                    {formatCurrency(owner.total_value)}
                  </td>
                  <td className="py-2 px-2 text-right text-slate-700 tabular-nums">
                    {formatCurrency(owner.total_receita)}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums">
                    <span
                      className={cn(
                        'text-slate-700',
                        owner.avg_age_days > (dateRef === 'stage' ? 14 : 90) &&
                          'text-rose-600 font-semibold',
                        owner.avg_age_days > (dateRef === 'stage' ? 7 : 60) &&
                          owner.avg_age_days <= (dateRef === 'stage' ? 14 : 90) &&
                          'text-amber-600 font-semibold'
                      )}
                    >
                      {owner.avg_age_days}d
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums">
                    {owner.sla_breach > 0 ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700">
                        {owner.sla_breach}
                      </span>
                    ) : (
                      <span className="text-green-600 font-medium">0</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {sortedOwners.length === 0 && !isLoading && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400">
                  Nenhum consultor com cards
                  {phaseFilter !== 'all' ? ` em ${phaseLabel(phaseFilter)}` : ''}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </ChartCard>
  )
}
