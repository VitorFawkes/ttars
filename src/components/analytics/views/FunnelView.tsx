import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    GitBranch, TrendingDown, Clock, Users, AlertTriangle,
} from 'lucide-react'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts'
import KpiCard from '../KpiCard'
import ChartCard from '../ChartCard'
import { useFunnelConversion, useLossReasons } from '@/hooks/analytics/useFunnelConversion'
import { usePipelineStages } from '@/hooks/usePipelineStages'
import { useDrillDownStore } from '@/hooks/analytics/useAnalyticsDrillDown'
import { cn } from '@/lib/utils'
import { QueryErrorState } from '@/components/ui/QueryErrorState'
import { formatCurrency } from '@/utils/whatsappFormatters'

const FUNNEL_COLORS = ['#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#0ea5e9']

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Recharts payload typing
function TimeTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null
    const row = payload[0]?.payload
    if (!row) return null
    const slaDay = row.sla_days
    return (
        <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs">
            <p className="font-medium text-slate-900 mb-1.5">{label}</p>
            <div className="space-y-1">
                <p className="text-indigo-600">Média: <span className="font-semibold">{row.avg_days_in_stage}d</span></p>
                <p className="text-violet-500">p75: <span className="font-semibold">{row.p75_days_in_stage}d</span></p>
                {slaDay != null && slaDay > 0 && (
                    <p className={row.p75_days_in_stage > slaDay ? 'text-rose-600 font-semibold' : 'text-slate-400'}>
                        SLA: {slaDay}d {row.p75_days_in_stage > slaDay ? '— excedido' : ''}
                    </p>
                )}
            </div>
        </div>
    )
}


export default function FunnelView() {
    const { data: funnelData, isLoading: funnelLoading, error: funnelError, refetch: refetchFunnel } = useFunnelConversion()
    const { data: lossData, isLoading: lossLoading, error: lossError, refetch: refetchLoss } = useLossReasons()

    const hasError = !!(funnelError || lossError)
    const { data: pipelineStages } = usePipelineStages()

    const navigate = useNavigate()
    const drillDown = useDrillDownStore()
    const handleRetry = () => { refetchFunnel(); refetchLoss() }

    const stages = useMemo(() => funnelData || [], [funnelData])
    const totalLeads = stages.length > 0 ? stages[0].current_count : 0
    const lastStage = stages.length > 0 ? stages[stages.length - 1] : null
    const overallConversion = totalLeads > 0 && lastStage
        ? Math.round(lastStage.current_count / totalLeads * 100 * 10) / 10
        : 0

    // Merge SLA data from pipeline_stages into funnel data
    // sla_hours comes from select('*') but PipelineStage type doesn't include it
    const slaMap = useMemo(() => {
        if (!pipelineStages) return new Map<string, number>()
        return new Map(
            (pipelineStages as (typeof pipelineStages[number] & { sla_hours?: number | null })[])
                .filter(s => s.sla_hours && s.sla_hours > 0)
                .map(s => [s.id, s.sla_hours!])
        )
    }, [pipelineStages])

    const timeData = useMemo(() =>
        stages.filter(s => s.avg_days_in_stage > 0 || s.p75_days_in_stage > 0).map(s => {
            const slaHours = slaMap.get(s.stage_id) || 0
            return {
                ...s,
                sla_days: slaHours > 0 ? Math.round(slaHours / 24 * 10) / 10 : null,
                is_bottleneck: slaHours > 0 && s.p75_days_in_stage > slaHours / 24,
            }
        }),
    [stages, slaMap])

    const bottleneckCount = timeData.filter(s => s.is_bottleneck).length

    // Conversion rates between adjacent stages
    const conversionRates = stages.map((stage, i) => {
        if (i === 0) return { ...stage, conversion_from_prev: 100 }
        const prev = stages[i - 1]
        const rate = prev.current_count > 0
            ? Math.round(stage.current_count / prev.current_count * 100 * 10) / 10
            : 0
        return { ...stage, conversion_from_prev: rate }
    })

    return (
        <div className="space-y-6">
            {hasError && (
                <QueryErrorState compact title="Erro ao carregar dados do funil" onRetry={handleRetry} />
            )}

            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <KpiCard
                    title="Total no Funil"
                    value={stages.reduce((sum, s) => sum + s.current_count, 0)}
                    icon={Users}
                    color="text-blue-600"
                    bgColor="bg-blue-50"
                    isLoading={funnelLoading}
                    onClick={() => drillDown.open({ label: 'Total no Funil', drillSource: 'stage_entries', excludeTerminal: true })}
                    clickHint="Ver todos os cards"
                />
                <KpiCard
                    title="Conversão E2E"
                    value={`${overallConversion}%`}
                    icon={GitBranch}
                    color="text-indigo-600"
                    bgColor="bg-indigo-50"
                    isLoading={funnelLoading}
                />
                <KpiCard
                    title="Motivos de Perda"
                    value={(lossData || []).length}
                    icon={TrendingDown}
                    color="text-amber-600"
                    bgColor="bg-amber-50"
                    isLoading={lossLoading}
                />
                <KpiCard
                    title="Bottlenecks (p75>SLA)"
                    value={bottleneckCount}
                    icon={bottleneckCount > 0 ? AlertTriangle : Clock}
                    color={bottleneckCount > 0 ? 'text-rose-600' : 'text-sky-600'}
                    bgColor={bottleneckCount > 0 ? 'bg-rose-50' : 'bg-sky-50'}
                    isLoading={funnelLoading}
                    onClick={() => navigate('/analytics/sla')}
                    clickHint="Ver SLA"
                />
            </div>

            {/* Full Funnel Chart (horizontal bars) */}
            <ChartCard
                title="Funil Completo"
                description="Distribuição atual de cards por etapa"
                isLoading={funnelLoading}
            >
                {stages.length > 0 ? (
                    <ResponsiveContainer width="100%" height={Math.max(300, stages.length * 44 + 40)}>
                        <BarChart
                            data={stages}
                            layout="vertical"
                            margin={{ left: 10, right: 60 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                            <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                            <YAxis
                                dataKey="stage_nome"
                                type="category"
                                width={180}
                                tick={{ fontSize: 10, fill: '#334155' }}
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={(v: string) => v.length > 24 ? v.slice(0, 23) + '…' : v}
                            />
                            <Tooltip
                                content={({ active, payload, label }) => {
                                    if (!active || !payload?.length) return null
                                    const row = payload[0]?.payload
                                    if (!row) return null
                                    return (
                                        <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs">
                                            <p className="font-medium text-slate-900 mb-1.5">{label}</p>
                                            <div className="space-y-1">
                                                <p className="text-slate-700">Cards: <span className="font-semibold">{row.current_count}</span></p>
                                                {Number(row.total_valor) > 0 && (
                                                    <p className="text-teal-600">Faturamento: <span className="font-semibold">{formatCurrency(Number(row.total_valor))}</span></p>
                                                )}
                                                {Number(row.receita_total) > 0 && (
                                                    <p className="text-green-600">Receita: <span className="font-semibold">{formatCurrency(Number(row.receita_total))}</span></p>
                                                )}
                                            </div>
                                        </div>
                                    )
                                }}
                            />
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            <Bar dataKey="current_count" radius={[0, 6, 6, 0]} barSize={20} cursor="pointer" onClick={(data: any) => { const s = data?.payload || data; if (s?.stage_id) drillDown.open({ label: s.stage_nome, drillStageId: s.stage_id, drillSource: 'stage_entries', excludeTerminal: true }) }}>
                                <LabelList dataKey="current_count" position="right" fill="#64748b" fontSize={11} offset={8} />
                                {stages.map((_, i) => (
                                    <Cell key={i} fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-[300px] flex items-center justify-center text-sm text-slate-400">
                        Nenhum dado de funil
                    </div>
                )}
            </ChartCard>

            {/* Conversion Rates */}
            {conversionRates.length > 1 && (
                <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100">
                        <h3 className="text-sm font-semibold text-slate-800">Taxa de Conversão entre Etapas</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/50">
                                    <th className="text-left px-6 py-3 font-medium text-slate-500">De</th>
                                    <th className="text-left px-4 py-3 font-medium text-slate-500">Para</th>
                                    <th className="text-right px-4 py-3 font-medium text-slate-500">Entrada</th>
                                    <th className="text-right px-4 py-3 font-medium text-slate-500">Saída</th>
                                    <th className="text-right px-4 py-3 font-medium text-slate-500">Perda</th>
                                    <th className="text-right px-4 py-3 font-medium text-slate-500">Conversão</th>
                                    <th className="text-right px-4 py-3 font-medium text-slate-500">Faturamento</th>
                                    <th className="text-right px-6 py-3 font-medium text-slate-500">Receita</th>
                                </tr>
                            </thead>
                            <tbody>
                                {conversionRates.slice(1).map((stage, i) => {
                                    const rate = stage.conversion_from_prev
                                    const prevCount = conversionRates[i].current_count
                                    const drop = prevCount - stage.current_count
                                    const rateColor = rate >= 70 ? 'text-green-600' : rate >= 40 ? 'text-amber-600' : 'text-rose-600'

                                    return (
                                        <tr key={stage.stage_id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => drillDown.open({ label: `${conversionRates[i].stage_nome} → ${stage.stage_nome}`, drillStageId: stage.stage_id, drillSource: 'stage_entries', excludeTerminal: true })}>
                                            <td className="px-6 py-3 text-slate-700 font-medium max-w-[180px] truncate">{conversionRates[i].stage_nome}</td>
                                            <td className="px-4 py-3 text-slate-600 max-w-[180px] truncate">{stage.stage_nome}</td>
                                            <td className="text-right px-4 py-3 text-slate-600">{prevCount}</td>
                                            <td className="text-right px-4 py-3 text-slate-600">{stage.current_count}</td>
                                            <td className="text-right px-4 py-3">
                                                {drop > 0 ? <span className="text-rose-500 font-medium">-{drop}</span> : <span className="text-slate-300">0</span>}
                                            </td>
                                            <td className="text-right px-4 py-3">
                                                <span className={cn('font-bold', rateColor)}>{rate}%</span>
                                            </td>
                                            <td className="text-right px-4 py-3 text-slate-600 tabular-nums">{formatCurrency(Number(stage.total_valor))}</td>
                                            <td className="text-right px-6 py-3 tabular-nums">
                                                <span className={Number(stage.receita_total) > 0 ? 'text-green-600 font-medium' : 'text-slate-400'}>{formatCurrency(Number(stage.receita_total))}</span>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Time per Stage — avg + p75 */}
            <ChartCard
                title="Velocidade por Etapa (dias)"
                description="Média e percentil 75 — etapas vermelhas excedem SLA"
                isLoading={funnelLoading}
            >
                {timeData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={Math.max(280, timeData.length * 52 + 40)}>
                        <BarChart
                            data={timeData}
                            layout="vertical"
                            margin={{ left: 10, right: 80 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                            <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} label={{ value: 'Dias', position: 'insideBottom', offset: -5, fontSize: 11, fill: '#94a3b8' }} />
                            <YAxis
                                dataKey="stage_nome"
                                type="category"
                                width={180}
                                tick={{ fontSize: 10, fill: '#334155' }}
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={(v: string) => v.length > 24 ? v.slice(0, 23) + '…' : v}
                            />
                            <Tooltip content={<TimeTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            <Bar dataKey="avg_days_in_stage" name="Média" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={12} cursor="pointer" onClick={(data: any) => { const s = data?.payload || data; if (s?.stage_id) drillDown.open({ label: `Velocidade — ${s.stage_nome}`, drillStageId: s.stage_id, drillSource: 'stage_entries', excludeTerminal: true }) }} />
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            <Bar dataKey="p75_days_in_stage" name="p75" barSize={12} radius={[0, 4, 4, 0]} cursor="pointer" onClick={(data: any) => { const s = data?.payload || data; if (s?.stage_id) drillDown.open({ label: `Velocidade — ${s.stage_nome}`, drillStageId: s.stage_id, drillSource: 'stage_entries', excludeTerminal: true }) }}>
                                <LabelList
                                    dataKey="p75_days_in_stage"
                                    position="right"
                                    fontSize={10}
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Recharts typing
                                    formatter={(v: any) => `p75: ${v}d`}
                                    fill="#64748b"
                                    offset={6}
                                />
                                {timeData.map((entry, i) => (
                                    <Cell
                                        key={i}
                                        fill={entry.is_bottleneck ? '#f43f5e' : '#c4b5fd'}
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-[280px] flex items-center justify-center text-sm text-slate-400">
                        Nenhum dado de tempo por etapa
                    </div>
                )}
                {/* Bottleneck legend */}
                {timeData.some(s => s.is_bottleneck) && (
                    <div className="flex items-center gap-4 mt-3 px-2 text-xs text-slate-500">
                        <span className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-sm bg-[#6366f1]" /> Média
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-sm bg-[#c4b5fd]" /> p75
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-sm bg-[#f43f5e]" /> p75 excede SLA
                        </span>
                    </div>
                )}
            </ChartCard>

            {/* Loss Reasons */}
            <ChartCard
                title="Motivos de Perda"
                description="Por que perdemos clientes?"
                isLoading={lossLoading}
            >
                {(lossData || []).length > 0 ? (
                    <ResponsiveContainer width="100%" height={Math.max(200, (lossData || []).length * 35 + 40)}>
                        <BarChart
                            data={lossData}
                            layout="vertical"
                            margin={{ left: 10, right: 50 }}
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
                                tickFormatter={(v: string) => v.length > 28 ? v.slice(0, 27) + '…' : v}
                            />
                            <Tooltip
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Recharts payload typing
                                formatter={(value: number, _key: string, entry: any) => [`${value} (${entry?.payload?.percentage ?? 0}%)`, 'Cards perdidos']}
                            />
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            <Bar dataKey="count" fill="#f43f5e" radius={[0, 4, 4, 0]} barSize={18} cursor="pointer" onClick={(data: any) => { const m = data?.payload?.motivo || data?.motivo; if (m) drillDown.open({ label: `Motivo: ${m}`, drillLossReason: m, drillStatus: 'perdido', drillSource: 'lost_deals' }) }}>
                                <LabelList dataKey="count" position="right" fill="#64748b" fontSize={11} />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-[200px] flex items-center justify-center text-sm text-slate-400">
                        Nenhum card perdido no período
                    </div>
                )}
            </ChartCard>
        </div>
    )
}
