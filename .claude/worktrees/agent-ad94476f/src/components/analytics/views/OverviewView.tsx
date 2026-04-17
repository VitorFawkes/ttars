import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    Users as UsersIcon,
    Phone,
    CheckCircle,
    Plane,
    DollarSign,
    TrendingUp,
    FileText,
    Wallet,
    BarChart3,
} from 'lucide-react'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    Line, Cell, ComposedChart, Legend, LabelList,
} from 'recharts'
import KpiCard from '../KpiCard'
import ChartCard from '../ChartCard'
import { QueryErrorState } from '@/components/ui/QueryErrorState'
import { useOverviewKpis, useFunnelData, useRevenueTimeseries } from '@/hooks/analytics/useOverviewData'
import { useFunnelByOwner, type FunnelMetric } from '@/hooks/analytics/useFunnelByOwner'
import { useDrillDownStore, type DrillDownContext } from '@/hooks/analytics/useAnalyticsDrillDown'
import { useAnalyticsFilters } from '@/hooks/analytics/useAnalyticsFilters'
import { formatCurrency, formatCurrencyFull } from '@/utils/whatsappFormatters'

/** Compute period end based on period_start + granularity */
function getPeriodEnd(periodStart: string, granularity: string): string {
    const d = new Date(periodStart)
    if (isNaN(d.getTime())) return new Date().toISOString()
    if (granularity === 'day') {
        d.setUTCDate(d.getUTCDate() + 1)
    } else if (granularity === 'week') {
        d.setUTCDate(d.getUTCDate() + 7)
    } else {
        // month (default) — use UTC to avoid local-timezone day overflow
        d.setUTCMonth(d.getUTCMonth() + 1)
    }
    return d.toISOString()
}

const OWNER_COLORS = [
    '#93c5fd', '#6ee7b7', '#fcd34d', '#fca5a5', '#c4b5fd',
    '#f9a8d4', '#67e8f9', '#fdba74', '#a5b4fc', '#bef264',
]

const SPECIAL_COLORS: Record<string, string> = {
    'Outros': '#94a3b8',       // slate-400
    'Não atribuído': '#cbd5e1', // slate-300
}

function getOwnerColor(owner: string, idx: number): string {
    return SPECIAL_COLORS[owner] || OWNER_COLORS[idx % OWNER_COLORS.length]
}

const LABEL_MAX = 12

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Recharts custom tick typing
function RotatedXTick(props: any) {
    const { x, y, payload } = props
    if (!payload?.value) return null
    const full: string = payload.value
    const label = full.length > LABEL_MAX ? full.slice(0, LABEL_MAX - 1) + '…' : full
    return (
        <g transform={`translate(${x},${y})`}>
            <title>{full}</title>
            <text
                x={0} y={0} dy={8}
                textAnchor="end"
                fill="#475569"
                fontSize={10}
                transform="rotate(-55)"
            >
                {label}
            </text>
        </g>
    )
}

type PhaseViewMode = 'all' | 'sdr' | 'planner' | 'pos'

export default function OverviewView() {
    const navigate = useNavigate()
    const drillDown = useDrillDownStore()
    const { granularity } = useAnalyticsFilters()
    const { data: kpis, isLoading: kpisLoading, error: kpisError, refetch: refetchKpis } = useOverviewKpis()
    const { data: funnelData, isLoading: funnelLoading, error: funnelError, refetch: refetchFunnel } = useFunnelData()
    const { data: revenueData, isLoading: revenueLoading, error: revenueError, refetch: refetchRevenue } = useRevenueTimeseries()
    const [metricMode, setMetricMode] = useState<FunnelMetric>('cards')
    const { data: funnelByOwnerRaw, chartData, allOwners, isLoading: funnelByOwnerLoading, error: funnelByOwnerError, refetch: refetchFunnelByOwner } = useFunnelByOwner(metricMode)
    const hasError = !!(kpisError || funnelError || revenueError || funnelByOwnerError)
    const handleRetry = () => { refetchKpis(); refetchFunnel(); refetchRevenue(); refetchFunnelByOwner() }
    const isFinancialMetric = metricMode !== 'cards'

    const [viewMode, setViewMode] = useState<PhaseViewMode>('all')

    // Map owner_name → owner_id for in-place drill-down
    const ownerIdMap = useMemo(() => {
        const map = new Map<string, string>()
        for (const row of (funnelByOwnerRaw || [])) {
            if (row.owner_id && row.owner_name) {
                map.set(row.owner_name, row.owner_id)
            }
        }
        return map
    }, [funnelByOwnerRaw])

    // Map stage_nome → stage_id for drill-down context
    const stageIdMap = useMemo(() => {
        const map = new Map<string, string>()
        for (const row of (funnelByOwnerRaw || [])) {
            if (row.stage_id && row.stage_nome) {
                map.set(row.stage_nome, row.stage_id)
            }
        }
        return map
    }, [funnelByOwnerRaw])

    const k = kpis || {
        total_leads: 0, total_won: 0, total_lost: 0, total_open: 0,
        conversao_venda_rate: 0, receita_total: 0, margem_total: 0,
        ticket_medio: 0, ciclo_medio_dias: 0, viagens_vendidas: 0,
        taxa_paga_count: 0, taxa_paga_rate: 0,
        briefing_count: 0, briefing_agendado_rate: 0,
        proposta_count: 0, proposta_enviada_rate: 0,
        ganho_planner_count: 0, ganho_planner_rate: 0,
    }

    // Filter stages by phase based on viewMode + hide empty stages in financial metrics
    const filteredStageData = useMemo(() => {
        if (!chartData?.length) return []
        let filtered = chartData
        if (viewMode === 'sdr') filtered = filtered.filter(d => d.fase === 'SDR')
        else if (viewMode === 'planner') filtered = filtered.filter(d => d.fase === 'Planner')
        else if (viewMode === 'pos') filtered = filtered.filter(d => d.fase !== 'SDR' && d.fase !== 'Planner')
        // In financial modes, hide stages with no data (total=0) to avoid empty bars
        if (metricMode !== 'cards') {
            filtered = filtered.filter(d => (d.total as number) > 0)
        }
        return filtered
    }, [chartData, viewMode, metricMode])

    // Phase stage counts for the indicator bar (uses filteredStageData for consistency)
    const phaseCounts = useMemo(() => {
        if (!filteredStageData?.length) return { sdr: 0, planner: 0, pos: 0 }
        return {
            sdr: filteredStageData.filter(d => d.fase === 'SDR').length,
            planner: filteredStageData.filter(d => d.fase === 'Planner').length,
            pos: filteredStageData.filter(d => d.fase !== 'SDR' && d.fase !== 'Planner').length,
        }
    }, [filteredStageData])

    return (
        <div className="space-y-6">
            {hasError && (
                <QueryErrorState
                    compact
                    title="Erro ao carregar dados do overview"
                    onRetry={handleRetry}
                />
            )}

            {/* KPI Cards - 2 rows of 5 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <KpiCard
                    title="Leads Criados"
                    value={k.total_leads}
                    icon={UsersIcon}
                    color="text-blue-600"
                    bgColor="bg-blue-50"
                    isLoading={kpisLoading}
                    onClick={() => navigate('/analytics/team')}
                    clickHint="Ver por consultor"
                />
                <KpiCard
                    title="% Taxa Paga"
                    value={`${k.taxa_paga_rate}% (${k.taxa_paga_count})`}
                    icon={DollarSign}
                    color="text-emerald-600"
                    bgColor="bg-emerald-50"
                    isLoading={kpisLoading}
                    onClick={() => navigate('/analytics/funnel')}
                    clickHint="Ver funil completo"
                />
                <KpiCard
                    title="% Oportunidade"
                    value={`${k.briefing_agendado_rate}% (${k.briefing_count})`}
                    icon={Phone}
                    color="text-indigo-600"
                    bgColor="bg-indigo-50"
                    isLoading={kpisLoading}
                    onClick={() => navigate('/analytics/funnel')}
                    clickHint="Ver funil completo"
                />
                <KpiCard
                    title="% Proposta Enviada"
                    value={`${k.proposta_enviada_rate}% (${k.proposta_count})`}
                    icon={FileText}
                    color="text-purple-600"
                    bgColor="bg-purple-50"
                    isLoading={kpisLoading}
                    onClick={() => navigate('/analytics/funnel')}
                    clickHint="Ver funil completo"
                />
                <KpiCard
                    title="% Ganho Planner"
                    value={`${k.ganho_planner_rate}% (${k.ganho_planner_count})`}
                    icon={CheckCircle}
                    color="text-green-600"
                    bgColor="bg-green-50"
                    isLoading={kpisLoading}
                    onClick={() => navigate('/analytics/funnel')}
                    clickHint="Ver funil completo"
                />
                <KpiCard
                    title="Conversão (Venda)"
                    value={`${k.conversao_venda_rate}%`}
                    icon={TrendingUp}
                    color="text-cyan-600"
                    bgColor="bg-cyan-50"
                    isLoading={kpisLoading}
                    onClick={() => navigate('/analytics/funnel')}
                    clickHint="Ver funil completo"
                />
                <KpiCard
                    title="Viagens Vendidas"
                    value={k.viagens_vendidas}
                    icon={Plane}
                    color="text-sky-600"
                    bgColor="bg-sky-50"
                    isLoading={kpisLoading}
                    onClick={() => navigate('/analytics/operations')}
                    clickHint="Ver operações"
                />
                <KpiCard
                    title="Faturamento (Ganhos)"
                    value={formatCurrency(k.receita_total)}
                    icon={TrendingUp}
                    color="text-teal-600"
                    bgColor="bg-teal-50"
                    isLoading={kpisLoading}
                    onClick={() => navigate('/analytics/financial')}
                    clickHint="Ver financeiro"
                />
                <KpiCard
                    title="Receita (Margem)"
                    value={formatCurrency(k.margem_total)}
                    icon={Wallet}
                    color="text-rose-600"
                    bgColor="bg-rose-50"
                    isLoading={kpisLoading}
                    onClick={() => navigate('/analytics/financial')}
                    clickHint="Ver financeiro"
                />
                <KpiCard
                    title="Ticket Médio"
                    value={formatCurrency(k.ticket_medio)}
                    icon={BarChart3}
                    color="text-orange-600"
                    bgColor="bg-orange-50"
                    isLoading={kpisLoading}
                    onClick={() => navigate('/analytics/financial')}
                    clickHint="Ver financeiro"
                />
            </div>

            {/* Funil de Vendas por Responsavel (Kanban Operacional) — Stacked */}
            <ChartCard
                title="Funil de Vendas por Responsável (Kanban Operacional)"
                isLoading={funnelByOwnerLoading}
                colSpan={2}
                actions={
                    <div className="flex items-center gap-2">
                        <div className="flex bg-slate-100 rounded-lg p-1">
                            {([['cards', 'Qtd'], ['faturamento', 'R$ Fat.'], ['receita', 'R$ Rec.']] as const).map(([m, label]) => (
                                <button
                                    key={m}
                                    onClick={() => setMetricMode(m)}
                                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                                        metricMode === m
                                            ? 'bg-indigo-600 text-white shadow-sm'
                                            : 'text-slate-500 hover:text-slate-700'
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <div className="flex bg-slate-100 rounded-lg p-1">
                            {(['all', 'sdr', 'planner', 'pos'] as const).map((m) => (
                                <button
                                    key={m}
                                    onClick={() => setViewMode(m)}
                                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                                        viewMode === m
                                            ? 'bg-white text-slate-900 shadow-sm'
                                            : 'text-slate-500 hover:text-slate-700'
                                    }`}
                                >
                                    {m === 'all' ? 'Todos' : m === 'pos' ? 'Pós-Venda' : m.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>
                }
            >
                {filteredStageData.length > 0 && allOwners.length > 0 ? (
                    <div className="w-full overflow-x-auto overflow-y-hidden pb-1 custom-scrollbar">
                        <div style={{ minWidth: viewMode === 'all' ? `${Math.max(900, filteredStageData.length * 80)}px` : undefined, width: viewMode !== 'all' ? '100%' : undefined, height: 480 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={filteredStageData} margin={{ top: 24, right: 20, left: 10, bottom: 100 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis
                                        dataKey="stage"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={<RotatedXTick />}
                                        interval={0}
                                        height={100}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#64748b', fontSize: 11 }}
                                        width={isFinancialMetric ? 70 : 40}
                                        tickFormatter={isFinancialMetric ? (v: number) => formatCurrency(v) : undefined}
                                    />
                                    <Tooltip
                                        cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                                        content={({ active, payload, label }) => {
                                            if (!active || !payload?.length) return null
                                            const nonZero = payload.filter(p => p.dataKey !== 'total' && (Number(p.value) || 0) > 0)
                                            if (nonZero.length === 0) return null
                                            const stageTotal = payload.find(p => p.dataKey === 'total')
                                            return (
                                                <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs max-w-[260px]">
                                                    <p className="font-medium text-slate-900 mb-1.5 truncate">{label}</p>
                                                    <div className="space-y-0.5">
                                                        {nonZero.map(entry => (
                                                            <div key={entry.dataKey as string} className="flex items-center gap-2">
                                                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                                                                <span className="text-slate-600 truncate">{entry.name}</span>
                                                                <span className="ml-auto font-semibold text-slate-800 whitespace-nowrap">
                                                                    {isFinancialMetric ? formatCurrencyFull(Number(entry.value) || 0) : entry.value}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    {stageTotal && (Number(stageTotal.value) || 0) > 0 && (
                                                        <div className="mt-1.5 pt-1.5 border-t border-slate-100 flex justify-between font-semibold text-slate-900">
                                                            <span>Total</span>
                                                            <span>{isFinancialMetric ? formatCurrencyFull(Number(stageTotal.value) || 0) : stageTotal.value}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        }}
                                    />
                                    <Legend
                                        wrapperStyle={{ paddingTop: '8px', fontSize: '11px' }}
                                        formatter={(value: string) => value.length > 20 ? value.slice(0, 18) + '…' : value}
                                    />
                                    {allOwners.map((owner, idx) => (
                                        <Bar
                                            key={owner}
                                            dataKey={owner}
                                            stackId="a"
                                            fill={getOwnerColor(owner, idx)}
                                            maxBarSize={48}
                                            cursor="pointer"
                                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                            onClick={(data: any) => {
                                                const stageName = data?.stage || data?.payload?.stage
                                                const sid = stageName ? stageIdMap.get(stageName) : undefined
                                                const oid = ownerIdMap.get(owner)
                                                if (sid || oid) {
                                                    drillDown.open({
                                                        label: `${owner} — ${stageName || 'Funil'}`,
                                                        drillStageId: sid,
                                                        drillOwnerId: oid,
                                                        drillSource: 'stage_entries',
                                                        excludeTerminal: true,
                                                    })
                                                }
                                            }}
                                        />
                                    ))}
                                    <Line
                                        type="monotone"
                                        dataKey="total"
                                        stroke="none"
                                        dot={false}
                                        activeDot={false}
                                        legendType="none"
                                    >
                                        <LabelList
                                            dataKey="total"
                                            position="top"
                                            offset={6}
                                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                            content={(props: any) => {
                                                const { x, y, width, value, index } = props
                                                if (!value || value <= 0) return null
                                                const label = isFinancialMetric ? formatCurrency(value) : value
                                                const stage = filteredStageData[index]
                                                const sid = stage ? stageIdMap.get(stage.stage as string) : undefined
                                                return (
                                                    <text
                                                        x={x + (width || 0) / 2}
                                                        y={y - 6}
                                                        textAnchor="middle"
                                                        className="font-bold text-[11px] fill-slate-700"
                                                        style={{ cursor: 'pointer' }}
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            if (sid) {
                                                                drillDown.open({
                                                                    label: `${stage.stage} — Todos`,
                                                                    drillStageId: sid,
                                                                    drillSource: 'stage_entries',
                                                                    excludeTerminal: true,
                                                                })
                                                            }
                                                        }}
                                                    >
                                                        {label}
                                                    </text>
                                                )
                                            }}
                                        />
                                    </Line>
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                        {viewMode === 'all' && phaseCounts.sdr + phaseCounts.planner + phaseCounts.pos > 0 && (
                            <div className="flex -mt-2 px-[50px] text-xs font-bold text-center uppercase tracking-wider gap-1" style={{ minWidth: `${Math.max(900, filteredStageData.length * 80)}px` }}>
                                {phaseCounts.sdr > 0 && (
                                    <div style={{ flex: phaseCounts.sdr }} className="border-t-4 border-blue-200 text-blue-500 pt-1">SDR</div>
                                )}
                                {phaseCounts.planner > 0 && (
                                    <div style={{ flex: phaseCounts.planner }} className="border-t-4 border-emerald-200 text-emerald-500 pt-1">PLANNER</div>
                                )}
                                {phaseCounts.pos > 0 && (
                                    <div style={{ flex: phaseCounts.pos }} className="border-t-4 border-purple-200 text-purple-500 pt-1">PÓS-VENDA</div>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="h-[450px] flex items-center justify-center text-sm text-slate-400">
                        {filteredStageData.length > 0 && allOwners.length === 0
                            ? `Nenhum dado de ${metricMode === 'receita' ? 'receita' : 'faturamento'} no período — tente a métrica "Qtd"`
                            : 'Nenhum dado de funil no período selecionado'}
                    </div>
                )}
            </ChartCard>

            {/* Charts Row 2: Revenue Evolution */}
            <ChartCard
                title="Evolução da Receita"
                description="Receita e margem por período"
                isLoading={revenueLoading}
            >
                {(revenueData && revenueData.length > 0) ? (
                    <ResponsiveContainer width="100%" height={300}>
                        <ComposedChart
                            data={revenueData}
                            margin={{ left: 10, right: 20, top: 10, bottom: 5 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis
                                dataKey="period"
                                tick={{ fontSize: 11, fill: '#64748b' }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis
                                yAxisId="left"
                                tick={{ fontSize: 11, fill: '#64748b' }}
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={(v) => formatCurrency(v)}
                            />
                            <YAxis
                                yAxisId="right"
                                orientation="right"
                                tick={{ fontSize: 11, fill: '#64748b' }}
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={(v) => formatCurrency(v)}
                            />
                            <Tooltip
                                contentStyle={{
                                    borderRadius: '8px',
                                    border: 'none',
                                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                    fontSize: '12px',
                                }}
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                formatter={(value: any, name: string) => [
                                    formatCurrencyFull(Number(value) || 0),
                                    name
                                ]}
                            />
                            <Legend wrapperStyle={{ fontSize: '12px' }} />
                            <Bar
                                yAxisId="left"
                                dataKey="total_valor"
                                name="Faturamento"
                                fill="#6366f1"
                                radius={[4, 4, 0, 0]}
                                barSize={30}
                                fillOpacity={0.8}
                                cursor="pointer"
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                onClick={(data: any) => {
                                    const d = data?.payload || data
                                    const period = d?.period
                                    const periodStart = d?.period_start
                                    const periodEnd = periodStart ? getPeriodEnd(periodStart, granularity) : undefined
                                    drillDown.open({
                                        label: `Faturamento — ${period || 'Período'}`,
                                        drillStatus: 'ganho',
                                        drillSource: 'closed_deals',
                                        drillPeriodStart: periodStart,
                                        drillPeriodEnd: periodEnd,
                                    })
                                }}
                            />
                            <Line
                                yAxisId="right"
                                type="monotone"
                                dataKey="total_receita"
                                name="Margem"
                                stroke="#22c55e"
                                strokeWidth={2.5}
                                dot={{ r: 4, fill: '#22c55e' }}
                                activeDot={{
                                    r: 6, cursor: 'pointer',
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    onClick: (_e: any, payload: any) => {
                                        const d = payload?.payload
                                        const period = d?.period
                                        const periodStart = d?.period_start
                                        const periodEnd = periodStart ? getPeriodEnd(periodStart, granularity) : undefined
                                        drillDown.open({
                                            label: `Margem — ${period || 'Período'}`,
                                            drillStatus: 'ganho',
                                            drillSource: 'closed_deals',
                                            drillPeriodStart: periodStart,
                                            drillPeriodEnd: periodEnd,
                                        })
                                    },
                                }}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-[280px] flex items-center justify-center text-sm text-slate-400">
                        Nenhum dado de receita no período selecionado
                    </div>
                )}
            </ChartCard>

            {/* Distribuicao no Funil */}
            <ChartCard
                title="Distribuição no Funil"
                description="Cards ativos por macro-fase no período selecionado"
                isLoading={funnelLoading}
            >
                <MacroFunnelSnapshot data={funnelData || []} onDrillDown={drillDown.open} />
            </ChartCard>
        </div>
    )
}

// Sub-component: Macro funnel snapshot (3 macro-stages)
function MacroFunnelSnapshot({ data, onDrillDown }: { data: { stage_nome: string; fase: string; total_cards: number }[]; onDrillDown?: (ctx: DrillDownContext) => void }) {
    const macroMap: Record<string, { label: string; color: string; count: number }> = {
        'SDR': { label: 'Entrada (SDR)', color: '#3b82f6', count: 0 },
        'Vendas': { label: 'Vendas (Planner)', color: '#8b5cf6', count: 0 },
        'Pos-Venda': { label: 'Pós-Venda', color: '#10b981', count: 0 },
    }

    for (const stage of data) {
        const fase = stage.fase || 'SDR'
        // Normalize fase names
        const key = fase.includes('Pos') || fase.includes('Pós') ? 'Pos-Venda'
            : fase.includes('Venda') || fase.includes('Planner') ? 'Vendas'
            : 'SDR'
        if (macroMap[key]) {
            macroMap[key].count += stage.total_cards
        }
    }

    const chartData = Object.values(macroMap).filter(d => d.count > 0)

    if (chartData.length === 0) {
        return (
            <div className="h-[200px] flex items-center justify-center text-sm text-slate-400">
                Nenhum card ativo no pipeline
            </div>
        )
    }

    return (
        <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis
                    dataKey="label"
                    type="category"
                    width={140}
                    tick={{ fontSize: 12, fill: '#334155' }}
                    axisLine={false}
                    tickLine={false}
                />
                <Tooltip
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                    formatter={(value: number) => [value, 'Cards']}
                />
                <Bar
                    dataKey="count"
                    radius={[0, 6, 6, 0]}
                    barSize={24}
                    cursor="pointer"
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    onClick={(data: any) => {
                        const label = data?.label || data?.payload?.label
                        const phaseSlug = label?.includes('SDR') ? 'sdr'
                            : label?.includes('Planner') || label?.includes('Vendas') ? 'planner'
                            : label?.includes('Pós') ? 'pos-venda' : undefined
                        if (onDrillDown && phaseSlug) {
                            onDrillDown({ label: label || 'Fase', drillPhase: phaseSlug, drillSource: 'macro_funnel' })
                        }
                    }}
                >
                    {chartData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    )
}
