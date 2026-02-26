import { useState, useMemo } from 'react'
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
import { useOverviewKpis, useFunnelData, useRevenueTimeseries } from '@/hooks/analytics/useOverviewData'
import { useFunnelByOwner } from '@/hooks/analytics/useFunnelByOwner'

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

function formatCurrency(value: number): string {
    if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)} mi`
    if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)} mil`
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
}

function formatCurrencyFull(value: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Recharts custom tick typing
function CustomXAxisTick(props: any) {
    const { x, y, payload } = props
    if (!payload?.value) return null
    const words: string[] = payload.value.split(' ')
    const mid = Math.ceil(words.length / 2)
    const line1 = words.slice(0, mid).join(' ')
    const line2 = words.slice(mid).join(' ')
    return (
        <g transform={`translate(${x},${y})`}>
            <text x={0} y={0} dy={16} textAnchor="middle" fill="#64748b" fontSize={11}>
                <tspan x={0} dy="0em">{line1}</tspan>
                {line2 && <tspan x={0} dy="1.2em">{line2}</tspan>}
            </text>
        </g>
    )
}

type PhaseViewMode = 'all' | 'sdr' | 'planner' | 'pos'

export default function OverviewView() {
    const { data: kpis, isLoading: kpisLoading, error: kpisError } = useOverviewKpis()
    const { data: funnelData, isLoading: funnelLoading, error: funnelError } = useFunnelData()
    const { data: revenueData, isLoading: revenueLoading, error: revenueError } = useRevenueTimeseries()
    const { chartData, allOwners, isLoading: funnelByOwnerLoading, error: funnelByOwnerError } = useFunnelByOwner()

    const hasError = !!(kpisError || funnelError || revenueError || funnelByOwnerError)

    const [viewMode, setViewMode] = useState<PhaseViewMode>('all')

    const k = kpis || {
        total_leads: 0, total_won: 0, total_lost: 0, total_open: 0,
        conversao_venda_rate: 0, receita_total: 0, margem_total: 0,
        ticket_medio: 0, ciclo_medio_dias: 0, viagens_vendidas: 0,
        taxa_paga_count: 0, taxa_paga_rate: 0,
        briefing_count: 0, briefing_agendado_rate: 0,
        proposta_count: 0, proposta_enviada_rate: 0,
        viagem_confirmada_count: 0, viagem_confirmada_rate: 0,
    }

    // Filter stages by phase based on viewMode
    const filteredStageData = useMemo(() => {
        if (!chartData?.length) return []
        if (viewMode === 'all') return chartData
        if (viewMode === 'sdr') return chartData.filter(d => d.fase === 'SDR')
        if (viewMode === 'planner') return chartData.filter(d => d.fase === 'Planner')
        // Pós-venda: handle accent variations
        return chartData.filter(d =>
            d.fase !== 'SDR' && d.fase !== 'Planner'
        )
    }, [chartData, viewMode])

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
                <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700">
                    Erro ao carregar dados do overview. Verifique sua conexão e tente novamente.
                </div>
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
                />
                <KpiCard
                    title="% Taxa Paga"
                    value={`${k.taxa_paga_rate}% (${k.taxa_paga_count})`}
                    icon={DollarSign}
                    color="text-emerald-600"
                    bgColor="bg-emerald-50"
                    isLoading={kpisLoading}
                />
                <KpiCard
                    title="% Briefing Agendado"
                    value={`${k.briefing_agendado_rate}% (${k.briefing_count})`}
                    icon={Phone}
                    color="text-indigo-600"
                    bgColor="bg-indigo-50"
                    isLoading={kpisLoading}
                />
                <KpiCard
                    title="% Proposta Enviada"
                    value={`${k.proposta_enviada_rate}% (${k.proposta_count})`}
                    icon={FileText}
                    color="text-purple-600"
                    bgColor="bg-purple-50"
                    isLoading={kpisLoading}
                />
                <KpiCard
                    title="% Viagem Confirmada"
                    value={`${k.viagem_confirmada_rate}% (${k.viagem_confirmada_count})`}
                    icon={CheckCircle}
                    color="text-green-600"
                    bgColor="bg-green-50"
                    isLoading={kpisLoading}
                />
                <KpiCard
                    title="Conversão (Venda)"
                    value={`${k.conversao_venda_rate}%`}
                    icon={TrendingUp}
                    color="text-cyan-600"
                    bgColor="bg-cyan-50"
                    isLoading={kpisLoading}
                />
                <KpiCard
                    title="Viagens Vendidas"
                    value={k.viagens_vendidas}
                    icon={Plane}
                    color="text-sky-600"
                    bgColor="bg-sky-50"
                    isLoading={kpisLoading}
                />
                <KpiCard
                    title="Faturamento (Ganhos)"
                    value={formatCurrency(k.receita_total)}
                    icon={TrendingUp}
                    color="text-teal-600"
                    bgColor="bg-teal-50"
                    isLoading={kpisLoading}
                />
                <KpiCard
                    title="Receita (Margem)"
                    value={formatCurrency(k.margem_total)}
                    icon={Wallet}
                    color="text-rose-600"
                    bgColor="bg-rose-50"
                    isLoading={kpisLoading}
                />
                <KpiCard
                    title="Ticket Médio"
                    value={formatCurrency(k.ticket_medio)}
                    icon={BarChart3}
                    color="text-orange-600"
                    bgColor="bg-orange-50"
                    isLoading={kpisLoading}
                />
            </div>

            {/* Funil de Vendas por Responsavel (Kanban Operacional) — Stacked */}
            <ChartCard
                title="Funil de Vendas por Responsável (Kanban Operacional)"
                isLoading={funnelByOwnerLoading}
                colSpan={2}
                actions={
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
                }
            >
                {filteredStageData.length > 0 ? (
                    <div className="w-full overflow-x-auto overflow-y-hidden pb-1 custom-scrollbar">
                        <div className={`${viewMode === 'all' ? 'min-w-[2400px]' : 'w-full'} h-[450px]`}>
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={filteredStageData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis
                                        dataKey="stage"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={<CustomXAxisTick />}
                                        interval={0}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#64748b', fontSize: 12 }}
                                    />
                                    <Tooltip
                                        cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                                        contentStyle={{
                                            borderRadius: '8px',
                                            border: 'none',
                                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                            fontSize: '12px',
                                        }}
                                    />
                                    <Legend wrapperStyle={{ paddingTop: '20px' }} />
                                    {allOwners.map((owner, idx) => (
                                        <Bar
                                            key={owner}
                                            dataKey={owner}
                                            stackId="a"
                                            fill={getOwnerColor(owner, idx)}
                                            maxBarSize={60}
                                        >
                                            <LabelList
                                                dataKey={owner}
                                                position="inside"
                                                fill="rgba(0,0,0,0.6)"
                                                className="font-bold text-[10px]"
                                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                formatter={(val: any) => (val > 0 ? val : '')}
                                            />
                                        </Bar>
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
                                            offset={10}
                                            className="font-bold text-xs fill-slate-600"
                                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                            formatter={(val: any) => (val > 0 ? val : '')}
                                        />
                                    </Line>
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                        {viewMode === 'all' && phaseCounts.sdr + phaseCounts.planner + phaseCounts.pos > 0 && (
                            <div className="flex min-w-[2400px] -mt-4 px-[20px] text-xs font-bold text-center uppercase tracking-wider gap-1">
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
                        Nenhum dado de funil no período selecionado
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
                                formatter={(value: number, name: string) => [
                                    formatCurrencyFull(value),
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
                            />
                            <Line
                                yAxisId="right"
                                type="monotone"
                                dataKey="total_receita"
                                name="Margem"
                                stroke="#22c55e"
                                strokeWidth={2.5}
                                dot={{ r: 4, fill: '#22c55e' }}
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
                <MacroFunnelSnapshot data={funnelData || []} />
            </ChartCard>
        </div>
    )
}

// Sub-component: Macro funnel snapshot (3 macro-stages)
function MacroFunnelSnapshot({ data }: { data: { stage_nome: string; fase: string; total_cards: number }[] }) {
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
                <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={24}>
                    {chartData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    )
}
