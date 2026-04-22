import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import ChartCard from '@/components/analytics/ChartCard'
import { formatCurrency } from '@/utils/whatsappFormatters'
import { cn } from '@/lib/utils'
import { getPhaseAbbr } from '@/lib/pipeline/phaseLabels'
import type {
  PipelineCurrentDeal,
  DateRef,
} from '@/hooks/analytics/usePipelineCurrent'
import {
  getPhaseColor,
  getDealRisk,
  matchesPhase,
  RISK_STYLES,
  type DealSortField,
  type PhaseFilter,
} from './constants'

interface Props {
  isLoading: boolean
  deals: PipelineCurrentDeal[]
  phaseFilter: PhaseFilter
  phaseLabel: (slug: string | null | undefined) => string
  dateRef: DateRef
  ownerIds: string[]
  onOwnerFilter: (ownerId: string | null) => void
  dealSort: { field: DealSortField; dir: 'asc' | 'desc' }
  toggleDealSort: (field: DealSortField) => void
  valueRangeActive: boolean
}

export default function PipelineTopDeals({
  isLoading,
  deals,
  phaseFilter,
  phaseLabel,
  dateRef,
  ownerIds,
  onOwnerFilter,
  dealSort,
  toggleDealSort,
  valueRangeActive,
}: Props) {
  const navigate = useNavigate()

  const sortedDeals = useMemo(() => {
    const filtered =
      phaseFilter === 'all' ? deals : deals.filter(d => matchesPhase(d.fase_slug, phaseFilter))
    return [...filtered].sort((a, b) => {
      const { field, dir } = dealSort
      let va: number | string
      let vb: number | string
      switch (field) {
        case 'valor_total':
          va = a.valor_total
          vb = b.valor_total
          break
        case 'receita':
          va = a.receita || 0
          vb = b.receita || 0
          break
        case 'days_in_stage':
          va = a.days_in_stage
          vb = b.days_in_stage
          break
        case 'owner_nome':
          va = a.owner_nome
          vb = b.owner_nome
          break
        default:
          va = a.days_in_stage
          vb = b.days_in_stage
      }
      if (typeof va === 'string')
        return dir === 'asc'
          ? va.localeCompare(vb as string)
          : (vb as string).localeCompare(va)
      return dir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number)
    })
  }, [deals, phaseFilter, dealSort])

  const sortIcon = (field: DealSortField) => {
    if (dealSort.field !== field)
      return <ArrowUpDown className="w-3 h-3 text-slate-300 ml-1" />
    return dealSort.dir === 'desc' ? (
      <ArrowDown className="w-3 h-3 text-indigo-500 ml-1" />
    ) : (
      <ArrowUp className="w-3 h-3 text-indigo-500 ml-1" />
    )
  }

  const sortLabel =
    dealSort.field === 'days_in_stage'
      ? dateRef === 'stage'
        ? 'tempo na etapa'
        : 'tempo desde criação'
      : dealSort.field === 'valor_total'
        ? 'faturamento'
        : dealSort.field === 'receita'
          ? 'receita'
          : 'responsável'

  return (
    <ChartCard
      title="Deals em Risco"
      description={`Top ${sortedDeals.length} cards — ordenado por ${sortLabel} ${
        dealSort.dir === 'desc' ? '(maior)' : '(menor)'
      }`}
      colSpan={2}
      isLoading={isLoading}
    >
      <div className="px-4 pb-2 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2.5 pr-3 text-slate-500 font-medium">Titulo</th>
              <th className="text-left py-2.5 px-2 text-slate-500 font-medium">Contato</th>
              <th className="text-left py-2.5 px-2 text-slate-500 font-medium">Fase / Etapa</th>
              <th
                className="text-left py-2.5 px-2 text-slate-500 font-medium cursor-pointer hover:text-slate-700 select-none"
                onClick={() => toggleDealSort('owner_nome')}
              >
                <span className="inline-flex items-center">
                  Responsável {sortIcon('owner_nome')}
                </span>
              </th>
              <th
                className="text-right py-2.5 px-2 text-slate-500 font-medium cursor-pointer hover:text-slate-700 select-none"
                onClick={() => toggleDealSort('valor_total')}
              >
                <span className="inline-flex items-center justify-end">
                  Fat. {sortIcon('valor_total')}
                </span>
              </th>
              <th
                className="text-right py-2.5 px-2 text-slate-500 font-medium cursor-pointer hover:text-slate-700 select-none"
                onClick={() => toggleDealSort('receita')}
              >
                <span className="inline-flex items-center justify-end">
                  Rec. {sortIcon('receita')}
                </span>
              </th>
              <th
                className="text-right py-2.5 px-2 text-slate-500 font-medium cursor-pointer hover:text-slate-700 select-none"
                onClick={() => toggleDealSort('days_in_stage')}
              >
                <span className="inline-flex items-center justify-end">
                  Dias {sortIcon('days_in_stage')}
                </span>
              </th>
              <th className="text-center py-2.5 pl-2 text-slate-500 font-medium">SLA</th>
            </tr>
          </thead>
          <tbody>
            {sortedDeals.map(deal => {
              const risk = getDealRisk(deal, dateRef)
              return (
                <tr
                  key={deal.card_id}
                  className={cn(
                    'border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors',
                    RISK_STYLES[risk]
                  )}
                  onClick={() => navigate(`/cards/${deal.card_id}`)}
                >
                  <td
                    className="py-2 pr-3 text-slate-800 font-medium truncate max-w-[200px]"
                    title={deal.titulo}
                  >
                    {deal.titulo}
                  </td>
                  <td
                    className="py-2 px-2 text-slate-500 truncate max-w-[120px]"
                    title={deal.pessoa_nome || ''}
                  >
                    {deal.pessoa_nome || '—'}
                  </td>
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold text-white shrink-0"
                        style={{ background: getPhaseColor(deal.fase_slug) }}
                      >
                        {getPhaseAbbr(phaseLabel(deal.fase_slug))}
                      </span>
                      <span
                        className="text-slate-600 truncate max-w-[100px]"
                        title={deal.stage_nome}
                      >
                        {deal.stage_nome}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 px-2 truncate max-w-[120px]" title={deal.owner_nome}>
                    <button
                      className={cn(
                        'text-slate-600 hover:text-indigo-600 hover:underline transition-colors',
                        ownerIds.length === 1 &&
                          ownerIds[0] === deal.owner_id &&
                          'text-indigo-600 font-semibold'
                      )}
                      onClick={e => {
                        e.stopPropagation()
                        onOwnerFilter(deal.owner_id)
                      }}
                    >
                      {deal.owner_nome}
                    </button>
                  </td>
                  <td className="py-2 px-2 text-right text-slate-700 tabular-nums">
                    {deal.valor_total > 0 ? formatCurrency(deal.valor_total) : '—'}
                  </td>
                  <td className="py-2 px-2 text-right text-slate-700 tabular-nums">
                    {(deal.receita || 0) > 0 ? formatCurrency(deal.receita) : '—'}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums font-semibold text-slate-800">
                    {deal.days_in_stage}
                  </td>
                  <td className="py-2 pl-2 text-center">
                    {deal.sla_hours ? (
                      deal.is_sla_breach ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700">
                          Excedido
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700">
                          OK
                        </span>
                      )
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {sortedDeals.length === 0 && !isLoading && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400">
                  Nenhum card em aberto
                  {phaseFilter !== 'all' ? ` em ${phaseLabel(phaseFilter)}` : ''}
                  {valueRangeActive ? ' nesta faixa de valor' : ''}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </ChartCard>
  )
}
