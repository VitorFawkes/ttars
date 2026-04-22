import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts'
import ChartCard from '@/components/analytics/ChartCard'
import { formatCurrency } from '@/utils/whatsappFormatters'
import { cn } from '@/lib/utils'
import type {
  PipelineCurrentStage,
  PipelineCurrentOwner,
} from '@/hooks/analytics/usePipelineCurrent'
import {
  PHASE_COLORS,
  getPhaseColor,
  truncateLabel,
  type ChartGroupBy,
  type MetricMode,
  type PhaseFilter,
} from './constants'

interface Props {
  isLoading: boolean
  stages: PipelineCurrentStage[]
  owners: PipelineCurrentOwner[]
  stageDisplayNames: Map<string, string>
  metric: MetricMode
  phaseFilter: PhaseFilter
  chartGroupBy: ChartGroupBy
  setChartGroupBy: (v: ChartGroupBy) => void
  phaseLabel: (slug: string | null | undefined) => string
  onStageDrill: (stageId: string, stageName: string) => void
  onOwnerDrill: (ownerId: string, ownerName: string) => void
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RotatedXTick(props: any) {
  const { x, y, payload } = props
  if (!payload?.value) return null
  const full: string = payload.value
  const label = truncateLabel(full)
  return (
    <g transform={`translate(${x},${y})`}>
      <title>{full}</title>
      <text
        x={0}
        y={0}
        dy={8}
        textAnchor="end"
        fill="#475569"
        fontSize={10}
        transform="rotate(-45)"
      >
        {label}
      </text>
    </g>
  )
}

export default function PipelineStagesChart({
  isLoading,
  stages,
  owners,
  stageDisplayNames,
  metric,
  phaseFilter,
  chartGroupBy,
  setChartGroupBy,
  phaseLabel,
  onStageDrill,
  onOwnerDrill,
}: Props) {
  const isMonetary = metric !== 'cards'

  const stageDataKey =
    metric === 'cards' ? 'card_count' : metric === 'faturamento' ? 'valor_total' : 'receita_total'

  const chartStages = useMemo(
    () =>
      stages.map(s => ({
        ...s,
        display_nome: stageDisplayNames.get(s.stage_id) || s.stage_nome,
      })),
    [stages, stageDisplayNames]
  )

  const phaseCounts = useMemo(
    () => ({
      sdr: stages.filter(s => s.fase_slug === 'sdr').length,
      planner: stages.filter(s => s.fase_slug === 'planner').length,
      pos: stages.filter(
        s => !!s.fase_slug && !['sdr', 'planner', 'resolucao'].includes(s.fase_slug)
      ).length,
    }),
    [stages]
  )

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
      if (phaseFilter !== 'all') {
        return {
          name: o.owner_nome,
          owner_id: o.owner_id,
          [phaseFilter]: getVal(o, phaseFilter),
          total:
            metric === 'cards'
              ? o.total_cards
              : metric === 'faturamento'
                ? o.total_value
                : o.total_receita,
        }
      }
      return {
        name: o.owner_nome,
        owner_id: o.owner_id,
        sdr: getVal(o, 'sdr'),
        planner: getVal(o, 'planner'),
        'pos-venda': getVal(o, 'pos-venda'),
        total:
          metric === 'cards'
            ? o.total_cards
            : metric === 'faturamento'
              ? o.total_value
              : o.total_receita,
      }
    })
  }, [owners, phaseFilter, metric])

  const ownerBarKeys = phaseFilter !== 'all' ? [phaseFilter] : Object.keys(PHASE_COLORS)

  const formatMetricValue = (v: number) => (isMonetary ? `${(v / 1000).toFixed(0)}k` : String(v))
  const tooltipFormatter = (value: number, name: string) =>
    isMonetary ? [formatCurrency(value), phaseLabel(name) || name] : [value, phaseLabel(name) || name]

  return (
    <ChartCard
      title={chartGroupBy === 'stage' ? 'Distribuição por Etapa' : 'Distribuição por Consultor'}
      description={
        chartGroupBy === 'stage'
          ? phaseFilter === 'all'
            ? `Cards abertos por etapa — ${
                metric === 'cards' ? 'quantidade' : metric === 'faturamento' ? 'faturamento' : 'receita'
              }`
            : `Etapas de ${phaseLabel(phaseFilter)}`
          : `${metric === 'cards' ? 'Quantidade' : metric === 'faturamento' ? 'Faturamento' : 'Receita'} por consultor${phaseFilter !== 'all' ? ` em ${phaseLabel(phaseFilter)}` : ''} — clique para filtrar`
      }
      colSpan={2}
      isLoading={isLoading}
      actions={
        <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden">
          {(
            [
              ['stage', 'Etapa'],
              ['consultant', 'Consultor'],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setChartGroupBy(val)}
              className={cn(
                'px-2.5 py-1 text-[10px] font-semibold transition-colors',
                chartGroupBy === val
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-500 hover:bg-slate-50'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      }
    >
      {chartGroupBy === 'stage' ? (
        <>
          <div style={{ width: '100%', height: Math.max(280, chartStages.length * 8 + 100) }}>
            <ResponsiveContainer>
              <BarChart data={chartStages} margin={{ top: 20, right: 30, left: 10, bottom: 60 }}>
                <XAxis dataKey="display_nome" tick={RotatedXTick} interval={0} height={70} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  width={isMonetary ? 70 : 40}
                  tickFormatter={isMonetary ? (v: number) => `${(v / 1000).toFixed(0)}k` : undefined}
                />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    if (name === 'valor_total' || name === 'receita_total')
                      return [
                        formatCurrency(value),
                        name === 'valor_total' ? 'Faturamento' : 'Receita',
                      ]
                    return [value, 'Cards']
                  }}
                  labelFormatter={label => {
                    const stage = chartStages.find(s => s.display_nome === label)
                    if (!stage) return label
                    return `${label} (${stage.fase}) — ${stage.card_count} cards — ${formatCurrency(
                      stage.valor_total
                    )}`
                  }}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                />
                <Bar
                  dataKey={stageDataKey}
                  radius={[4, 4, 0, 0]}
                  cursor="pointer"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onClick={(_data: any, idx: number) => {
                    const s = chartStages[idx]
                    if (s) onStageDrill(s.stage_id, s.display_nome)
                  }}
                >
                  {chartStages.map((s, i) => (
                    <Cell key={i} fill={getPhaseColor(s.fase_slug)} />
                  ))}
                  <LabelList
                    dataKey={stageDataKey}
                    position="top"
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(v: any) => formatMetricValue(Number(v))}
                    style={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {phaseFilter === 'all' && (
            <div className="flex items-center gap-0 mx-6 mt-1 mb-2">
              {phaseCounts.sdr > 0 && (
                <div className="flex items-center gap-1.5 pr-3 border-r border-slate-200">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: PHASE_COLORS.sdr }}
                  />
                  <span className="text-[10px] font-medium text-slate-500">SDR</span>
                </div>
              )}
              {phaseCounts.planner > 0 && (
                <div className="flex items-center gap-1.5 px-3 border-r border-slate-200">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: PHASE_COLORS.planner }}
                  />
                  <span className="text-[10px] font-medium text-slate-500">Planner</span>
                </div>
              )}
              {phaseCounts.pos > 0 && (
                <div className="flex items-center gap-1.5 pl-3">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: PHASE_COLORS['pos-venda'] }}
                  />
                  <span className="text-[10px] font-medium text-slate-500">Pós-venda</span>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ width: '100%', height: Math.max(280, ownerChartData.length * 40 + 40) }}>
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
                  width={140}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  formatter={tooltipFormatter}
                  labelFormatter={label => {
                    const o = ownerChartData.find(d => d.name === label)
                    if (!o) return label
                    return `${label} — Total: ${isMonetary ? formatCurrency(o.total as number) : o.total}`
                  }}
                />
                {ownerBarKeys.map((key, i) => {
                  const isLast = i === ownerBarKeys.length - 1
                  return (
                    <Bar
                      key={key}
                      dataKey={key}
                      stackId="a"
                      fill={getPhaseColor(key)}
                      cursor="pointer"
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      onClick={(_data: any, idx: number) => {
                        const o = ownerChartData[idx]
                        if (o?.owner_id) onOwnerDrill(o.owner_id as string, o.name)
                      }}
                    >
                      {isLast && (
                        <LabelList
                          dataKey="total"
                          position="right"
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          formatter={(v: any) => {
                            const n = Number(v)
                            if (!n) return ''
                            return isMonetary
                              ? n >= 1000
                                ? `${(n / 1000).toFixed(0)}k`
                                : String(n)
                              : String(n)
                          }}
                          style={{ fontSize: 10, fill: '#475569', fontWeight: 600 }}
                        />
                      )}
                    </Bar>
                  )
                })}
              </BarChart>
            </ResponsiveContainer>
          </div>
          {phaseFilter === 'all' && (
            <div className="flex items-center gap-0 mx-6 mt-1 mb-2">
              <div className="flex items-center gap-1.5 pr-3 border-r border-slate-200">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: PHASE_COLORS.sdr }}
                />
                <span className="text-[10px] font-medium text-slate-500">SDR</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 border-r border-slate-200">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: PHASE_COLORS.planner }}
                />
                <span className="text-[10px] font-medium text-slate-500">Planner</span>
              </div>
              <div className="flex items-center gap-1.5 pl-3">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: PHASE_COLORS['pos-venda'] }}
                />
                <span className="text-[10px] font-medium text-slate-500">Pós-venda</span>
              </div>
            </div>
          )}
        </>
      )}
    </ChartCard>
  )
}
