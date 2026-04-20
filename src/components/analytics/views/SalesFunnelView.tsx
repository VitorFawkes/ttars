import { useEffect, useMemo } from 'react'
import { Users, TrendingUp, DollarSign } from 'lucide-react'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
    ComposedChart, Line,
} from 'recharts'
import KpiCard from '../KpiCard'
import ChartCard from '../ChartCard'
import { QueryErrorState } from '@/components/ui/QueryErrorState'
import { useFunnelConversion, useLossReasons } from '@/hooks/analytics/useFunnelConversion'
import { useFunnelVelocity } from '@/hooks/analytics/useFunnelVelocity'
import { useOverviewKpis, useRevenueTimeseries } from '@/hooks/analytics/useOverviewData'
import { useAnalyticsFilters } from '@/hooks/analytics/useAnalyticsFilters'
import { useDrillDownStore } from '@/hooks/analytics/useAnalyticsDrillDown'
import { formatCurrency } from '@/utils/whatsappFormatters'
import { cn } from '@/lib/utils'
import { getPhaseColor } from '@/lib/pipeline/phaseLabels'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function FunnelTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null
    const data = payload[0]?.payload
    if (!data) return null
    return (
        <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs">
            <p className="font-medium text-slate-900 mb-1.5">{data.stage_nome}</p>
            <div className="space-y-1">
                <p className="text-slate-700">Cards: <span className="font-semibold">{data.current_count}</span></p>
                {Number(data.total_valor) > 0 && (
                    <p className="text-teal-600">Faturamento: <span className="font-semibold">{formatCurrency(Number(data.total_valor))}</span></p>
                )}
                {Number(data.receita_total) > 0 && (
                    <p className="text-green-600">Receita: <span className="font-semibold">{formatCurrency(Number(data.receita_total))}</span></p>
                )}
                {data.avg_days_in_stage > 0 && (
                    <>
                        <p className="text-indigo-600">Média: <span className="font-semibold">{data.avg_days_in_stage}d</span></p>
                        <p className="text-violet-500">p75: <span className="font-semibold">{data.p75_days_in_stage}d</span></p>
                    </>
                )}
            </div>
        </div>
    )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RevenueTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null
    const data = payload[0]?.payload
    if (!data) return null
    return (
        <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs">
            <p className="font-medium text-slate-900 mb-1.5">{data.period}</p>
            <div className="space-y-1">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- Recharts payload items typing */}
                {payload.map((entry: any, i: number) => (
                    <p key={i} style={{ color: entry.color }}>
                        {entry.name}: <span className="font-semibold">{formatCurrency(Number(entry.value))}</span>
                    </p>
                ))}
            </div>
        </div>
    )
}

export default function SalesFunnelView() {
    const setActiveView = useAnalyticsFilters(s => s.setActiveView)
    const { data: kpiData, isLoading: kpiLoading, error: kpiError } = useOverviewKpis()
    const { data: funnelData, isLoading: funnelLoading, error: funnelError } = useFunnelConversion()
    const { data: velocityData, isLoading: velocityLoading } = useFunnelVelocity()
    const { data: lossData, isLoading: lossLoading, error: lossError } = useLossReasons()
    const { data: revenueData, isLoading: revenueLoading, error: revenueError } = useRevenueTimeseries()
    const drillDown = useDrillDownStore()

    useEffect(() => {
        setActiveView('funnel')
    }, [setActiveView])

    const hasError = !!(kpiError || funnelError || lossError || revenueError)
    const handleRetry = () => {
        // Refetch would be done by react-query automatically on retry
    }

    const stages = useMemo(() => funnelData || [], [funnelData])

    // Calculate conversion metrics
    const conversionMetrics = useMemo(() => {
        if (!stages.length) return { totalLeads: 0, conversionRate: 0, nextStageCounts: new Map() }
        const totalLeads = stages[0].current_count
        const lastStage = stages[stages.length - 1]
        const conversionRate = totalLeads > 0 && lastStage
            ? Math.round((lastStage.current_count / totalLeads) * 100 * 10) / 10
            : 0

        const nextStageCounts = new Map<string, number>()
        stages.forEach((stage, i) => {
            if (i < stages.length - 1) {
                const nextCount = stages[i + 1].current_count
                const rate = stage.current_count > 0
                    ? Math.round((nextCount / stage.current_count) * 100)
                    : 0
                nextStageCounts.set(stage.stage_id, rate)
            }
        })

        return { totalLeads, conversionRate, nextStageCounts }
    }, [stages])

    // Chart data with conversion rates
    const chartData = useMemo(() => {
        return stages.map((stage, i) => {
            const nextRate = conversionMetrics.nextStageCounts.get(stage.stage_id) || 0
            return {
                ...stage,
                conversion_to_next: i < stages.length - 1 ? nextRate : null,
            }
        })
    }, [stages, conversionMetrics])

    // Top 5 loss reasons for loss reasons chart
    const topLossReasons = useMemo(() => {
        return (lossData || []).slice(0, 5)
    }, [lossData])

    // Format revenue data for chart
    const revenueChartData = useMemo(() => {
        return (revenueData || []).map(point => ({
            period: point.period,
            period_start: point.period_start,
            'Faturamento': Number(point.total_valor),
            'Margem': Number(point.total_receita),
        }))
    }, [revenueData])

    return (
        <div className="space-y-6">
            {hasError && (
                <QueryErrorState
                    compact
                    title="Erro ao carregar dados do funil de vendas"
                    onRetry={handleRetry}
                />
            )}

            {/* Zone 1: Top KPI Cards */}
            <div className="grid grid-cols-3 gap-4">
                <KpiCard
                    title="Leads Criados"
                    value={conversionMetrics.totalLeads}
                    icon={Users}
                    color="text-blue-600"
                    bgColor="bg-blue-50"
                    isLoading={kpiLoading || funnelLoading}
                />
                <KpiCard
                    title="Taxa de Conversão"
                    value={`${conversionMetrics.conversionRate}%`}
                    icon={TrendingUp}
                    color="text-emerald-600"
                    bgColor="bg-emerald-50"
                    isLoading={kpiLoading || funnelLoading}
                />
                <KpiCard
                    title="Receita"
                    value={formatCurrency(kpiData?.receita_total ?? 0)}
                    icon={DollarSign}
                    color="text-violet-600"
                    bgColor="bg-violet-50"
                    isLoading={kpiLoading}
                />
            </div>

            {/* Zone 2: Funnel visualization */}
            <ChartCard
                title="Funil de Conversão"
                isLoading={funnelLoading}
            >
                {chartData.length > 0 ? (
                    <div className="space-y-4">
                        <ResponsiveContainer width="100%" height={Math.max(280, chartData.length * 60)}>
                            <BarChart
                                data={chartData}
                                layout="vertical"
                                margin={{ left: 10, right: 80, top: 10, bottom: 10 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                                <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                <YAxis
                                    dataKey="stage_nome"
                                    type="category"
                                    width={220}
                                    tick={{ fontSize: 11, fill: '#334155' }}
                                    axisLine={false}
                                    tickLine={false}
                                    interval={0}
                                />
                                <Tooltip content={<FunnelTooltip />} cursor={{ fill: 'rgba(99, 102, 241, 0.1)' }} />
                                <Bar
                                    dataKey="current_count"
                                    radius={[0, 6, 6, 0]}
                                    barSize={24}
                                    cursor="pointer"
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Recharts payload typing
                                    onClick={(data: any) => {
                                        const stage = data?.payload || data
                                        if (stage?.stage_id) {
                                            drillDown.open({
                                                label: stage.stage_nome,
                                                drillStageId: stage.stage_id,
                                                drillSource: 'stage_entries',
                                            })
                                        }
                                    }}
                                >
                                    {chartData.map((entry, i) => (
                                        <Cell
                                            key={i}
                                            fill={getPhaseColor(entry.phase_slug).hex}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>

                        {/* Variação entre etapas (não é conversão real — só delta de cards atuais) */}
                        <div className="mt-4 px-2">
                            <p className="text-[11px] text-slate-400 mb-2">
                                Variação de cards entre etapas adjacentes (snapshot atual; não é taxa de conversão real)
                            </p>
                            <div className="space-y-1.5">
                                {chartData.map((stage, i) => {
                                    const nextRate = stage.conversion_to_next
                                    if (nextRate === null || nextRate === undefined) return null
                                    const delta = nextRate - 100  // +X% = mais cards na próxima; -X% = menos
                                    const isSaudavel = nextRate >= 40 && nextRate <= 100
                                    return (
                                        <div key={stage.stage_id} className="flex items-center justify-between text-xs">
                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                                <span className="text-slate-600 truncate max-w-[200px]">{stage.stage_nome}</span>
                                                <span className="text-slate-400">→</span>
                                                <span className="text-slate-600 truncate max-w-[200px]">{chartData[i + 1]?.stage_nome}</span>
                                            </div>
                                            <span className={cn(
                                                'tabular-nums flex-shrink-0 ml-4 font-medium',
                                                isSaudavel ? 'text-emerald-600' : delta < 0 ? 'text-slate-500' : 'text-indigo-600'
                                            )}>
                                                {delta >= 0 ? '+' : ''}{delta}%
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="h-[280px] flex items-center justify-center text-sm text-slate-400">
                        Nenhum dado de funil disponível
                    </div>
                )}
            </ChartCard>

            {/* Zone 2b: Velocidade do Funil (mediana / p90 por etapa) */}
            <ChartCard
                title="Velocidade do funil"
                description="Tempo típico que um card passa em cada etapa (com base nas saídas da etapa no período)"
                isLoading={velocityLoading}
            >
                {(velocityData && velocityData.length > 0) ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider">
                                <tr>
                                    <th className="text-left py-2 px-3 font-medium">Etapa</th>
                                    <th className="text-right py-2 px-3 font-medium">Cards atuais</th>
                                    <th className="text-right py-2 px-3 font-medium">Passaram</th>
                                    <th className="text-right py-2 px-3 font-medium">Mediana</th>
                                    <th className="text-right py-2 px-3 font-medium">p90</th>
                                    <th className="text-right py-2 px-3 font-medium">Média</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {velocityData.filter(r => r.cards_passaram > 0 || r.cards_atuais > 0).map((r) => (
                                    <tr key={r.stage_id} className="hover:bg-slate-50 transition-colors">
                                        <td className="py-2 px-3 text-slate-900 truncate max-w-[240px]">{r.stage_nome}</td>
                                        <td className="py-2 px-3 text-right text-slate-700 tabular-nums">{r.cards_atuais}</td>
                                        <td className="py-2 px-3 text-right text-slate-500 tabular-nums">{r.cards_passaram}</td>
                                        <td className="py-2 px-3 text-right text-indigo-600 tabular-nums font-medium">{r.mediana_dias > 0 ? `${r.mediana_dias}d` : '—'}</td>
                                        <td className={cn(
                                            'py-2 px-3 text-right tabular-nums font-medium',
                                            r.p90_dias > 30 ? 'text-rose-600' : r.p90_dias > 14 ? 'text-amber-600' : 'text-violet-500'
                                        )}>{r.p90_dias > 0 ? `${r.p90_dias}d` : '—'}</td>
                                        <td className="py-2 px-3 text-right text-slate-500 tabular-nums">{r.media_dias > 0 ? `${r.media_dias}d` : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="h-[160px] flex items-center justify-center text-sm text-slate-400">
                        Ainda não há transições de etapa no período para calcular velocidade.
                    </div>
                )}
            </ChartCard>

            {/* Zone 3: Two-column bottom panels */}
            <div className="grid grid-cols-2 gap-4">
                {/* Left: Loss Reasons */}
                <ChartCard
                    title="Motivos de Perda"
                    isLoading={lossLoading}
                >
                    {topLossReasons.length > 0 ? (
                        <ResponsiveContainer width="100%" height={Math.max(200, topLossReasons.length * 40 + 40)}>
                            <BarChart
                                data={topLossReasons}
                                layout="vertical"
                                margin={{ left: 10, right: 60, top: 10, bottom: 10 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                                <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                <YAxis
                                    dataKey="motivo"
                                    type="category"
                                    width={200}
                                    tick={{ fontSize: 11, fill: '#334155' }}
                                    axisLine={false}
                                    tickLine={false}
                                    interval={0}
                                />
                                <Tooltip
                                    contentStyle={{
                                        borderRadius: '8px',
                                        border: '1px solid #e2e8f0',
                                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                        fontSize: '12px',
                                        backgroundColor: '#fff',
                                    }}
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    formatter={(value: number, _key: string, entry: any) => [
                                        `${value} (${entry?.payload?.percentage ?? 0}%)`,
                                        'Cards',
                                    ]}
                                />
                                <Bar
                                    dataKey="count"
                                    fill="#f43f5e"
                                    radius={[0, 4, 4, 0]}
                                    barSize={18}
                                    cursor="pointer"
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Recharts payload typing
                                    onClick={(data: any) => {
                                        const reason = data?.payload?.motivo || data?.motivo
                                        if (reason) {
                                            drillDown.open({
                                                label: `Motivo: ${reason}`,
                                                drillLossReason: reason,
                                                drillStatus: 'perdido',
                                                drillSource: 'lost_deals',
                                            })
                                        }
                                    }}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-[200px] flex items-center justify-center text-sm text-slate-400">
                            Nenhum card perdido no período
                        </div>
                    )}
                </ChartCard>

                {/* Right: Revenue Evolution */}
                <ChartCard
                    title="Evolução da Receita"
                    isLoading={revenueLoading}
                >
                    {revenueChartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={260}>
                            <ComposedChart
                                data={revenueChartData}
                                margin={{ left: 0, right: 10, top: 10, bottom: 10 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis
                                    dataKey="period"
                                    tick={{ fontSize: 11, fill: '#64748b' }}
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={(v: string) => v.length > 8 ? v.slice(0, 8) : v}
                                />
                                <YAxis
                                    tick={{ fontSize: 11, fill: '#64748b' }}
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                                />
                                <Tooltip content={<RevenueTooltip />} cursor={{ fill: 'rgba(99, 102, 241, 0.05)' }} />
                                { }
                                <Bar dataKey="Faturamento" fill="#4f46e5" radius={[4, 4, 0, 0]} barSize={16} />
                                { }
                                <Line
                                    type="monotone"
                                    dataKey="Margem"
                                    stroke="#10b981"
                                    strokeWidth={2}
                                    dot={{ fill: '#10b981', r: 3 }}
                                    activeDot={{ r: 5 }}
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-[260px] flex items-center justify-center text-sm text-slate-400">
                            Nenhum dado de receita disponível
                        </div>
                    )}
                </ChartCard>
            </div>
        </div>
    )
}
