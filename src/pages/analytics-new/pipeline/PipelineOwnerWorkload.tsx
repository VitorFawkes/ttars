import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts'
import ChartCard from '@/components/analytics/ChartCard'
import { formatCurrency } from '@/utils/whatsappFormatters'
import type { PipelineCurrentOwner } from '@/hooks/analytics/usePipelineCurrent'
import {
  PHASE_COLORS,
  getPhaseColor,
  type MetricMode,
  type PhaseFilter,
} from './constants'

interface Props {
  isLoading: boolean
  owners: PipelineCurrentOwner[]
  metric: MetricMode
  phaseFilter: PhaseFilter
  phaseLabel: (slug: string | null | undefined) => string
  onOwnerDrill: (ownerId: string, ownerName: string) => void
}

function formatBarLabel(v: number, isMonetary: boolean): string {
  if (!v) return ''
  if (!isMonetary) return String(v)
  if (v >= 1000) return `${(v / 1000).toFixed(0)}k`
  return String(v)
}

export default function PipelineOwnerWorkload({
  isLoading,
  owners,
  metric,
  phaseFilter,
  phaseLabel,
  onOwnerDrill,
}: Props) {
  const isMonetary = metric !== 'cards'

  const ownerChartData = useMemo(() => {
    let filtered = owners
    if (phaseFilter !== 'all') {
      filtered = owners
        .map(o => {
          const phKey = phaseFilter as keyof typeof o.by_phase
          const cards = o.by_phase[phKey] || 0
          const value = o.by_phase_value[phKey] || 0
          const rec = o.by_phase_receita?.[phKey] || 0
          return { ...o, total_cards: cards, total_value: value, total_receita: rec }
        })
        .filter(o => o.total_cards > 0)
        .sort((a, b) => b.total_cards - a.total_cards)
    }

    const getVal = (o: (typeof filtered)[0], phase: string) => {
      const phKey = phase as keyof typeof o.by_phase
      if (metric === 'cards') return o.by_phase[phKey] || 0
      if (metric === 'faturamento') return o.by_phase_value[phKey] || 0
      return o.by_phase_receita?.[phKey] || 0
    }

    return filtered.slice(0, 12).map(o => {
      const total =
        metric === 'cards'
          ? o.total_cards
          : metric === 'faturamento'
            ? o.total_value
            : o.total_receita
      if (phaseFilter !== 'all') {
        return {
          name: o.owner_nome,
          owner_id: o.owner_id,
          [phaseFilter]: getVal(o, phaseFilter),
          total,
        }
      }
      return {
        name: o.owner_nome,
        owner_id: o.owner_id,
        sdr: getVal(o, 'sdr'),
        planner: getVal(o, 'planner'),
        'pos-venda': getVal(o, 'pos-venda'),
        total,
      }
    })
  }, [owners, phaseFilter, metric])

  const ownerBarKeys = phaseFilter !== 'all' ? [phaseFilter] : Object.keys(PHASE_COLORS)

  const tooltipFormatter = (value: number, name: string) =>
    isMonetary ? [formatCurrency(value), phaseLabel(name) || name] : [value, phaseLabel(name) || name]

  return (
    <ChartCard
      title="Carga por Consultor"
      description={
        phaseFilter === 'all'
          ? `Por responsável — ${
              metric === 'cards' ? 'quantidade' : metric === 'faturamento' ? 'faturamento' : 'receita'
            } · clique pra ver cards`
          : `${phaseLabel(phaseFilter)} por responsável · clique pra ver cards`
      }
      isLoading={isLoading}
    >
      <div style={{ width: '100%', height: Math.max(280, ownerChartData.length * 36 + 40) }}>
        <ResponsiveContainer>
          <BarChart
            data={ownerChartData}
            layout="vertical"
            margin={{ top: 5, right: 60, left: 10, bottom: 5 }}
          >
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickFormatter={isMonetary ? (v: number) => `${(v / 1000).toFixed(0)}k` : undefined}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 11, fill: '#475569' }}
              width={130}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
              formatter={tooltipFormatter}
            />
            {ownerBarKeys.map((key, idx) => {
              const isLast = idx === ownerBarKeys.length - 1
              return (
                <Bar
                  key={key}
                  dataKey={key}
                  stackId="a"
                  fill={getPhaseColor(key)}
                  cursor="pointer"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onClick={(_data: any, i: number) => {
                    const o = ownerChartData[i]
                    if (o?.owner_id) onOwnerDrill(o.owner_id as string, o.name)
                  }}
                >
                  {isLast && (
                    <LabelList
                      dataKey="total"
                      position="right"
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(v: any) => formatBarLabel(Number(v), isMonetary)}
                      style={{ fontSize: 10, fill: '#475569', fontWeight: 600 }}
                    />
                  )}
                </Bar>
              )
            })}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
