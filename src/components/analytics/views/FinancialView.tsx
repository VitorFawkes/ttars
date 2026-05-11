import {
    DollarSign, TrendingUp, Target, Briefcase,
} from 'lucide-react'
import {
    ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
    BarChart, PieChart, Pie, Cell,
} from 'recharts'
import KpiCard from '../KpiCard'
import ChartCard from '../ChartCard'
import { useFinancialBreakdown, useTopDestinations, useRevenueByProduct } from '@/hooks/analytics/useFinancialData'
import { useAnalyticsFilters, type Granularity } from '@/hooks/analytics/useAnalyticsFilters'
import { useDrillDownStore } from '@/hooks/analytics/useAnalyticsDrillDown'
import { QueryErrorState } from '@/components/ui/QueryErrorState'
import { formatCurrency } from '@/utils/whatsappFormatters'

/** Parse financial period string to ISO start/end dates */
function parsePeriodBounds(period: string, granularity: Granularity): { start: string; end: string } | null {
    if (!period) return null
    if (granularity === 'month') {
        // "YYYY-MM" → "2025-01"
        const parts = period.split('-')
        if (parts.length !== 2) return null
        const year = Number(parts[0])
        const month = Number(parts[1])
        if (!year || !month) return null
        const start = new Date(Date.UTC(year, month - 1, 1))
        const end = new Date(Date.UTC(year, month, 1))
        return { start: start.toISOString(), end: end.toISOString() }
    }
    if (granularity === 'week' || granularity === 'day') {
        // "YYYY-MM-DD"
        const d = new Date(period + 'T00:00:00Z')
        if (isNaN(d.getTime())) return null
        const end = new Date(d)
        if (granularity === 'week') end.setDate(end.getDate() + 7)
        else end.setDate(end.getDate() + 1)
        return { start: d.toISOString(), end: end.toISOString() }
    }
    return null
}

const PRODUCT_COLORS: Record<string, string> = {
    TRIPS: '#6366f1',
    WEDDING: '#ec4899',
    CORP: '#f97316',
}

export default function FinancialView() {
    const drillDown = useDrillDownStore()
    const { setProduct, granularity } = useAnalyticsFilters()
    const { data: periods, isLoading: periodsLoading, error: periodsError, refetch: r1 } = useFinancialBreakdown()
    const { data: destinations, isLoading: destLoading, error: destError, refetch: r2 } = useTopDestinations()
    const { data: products, isLoading: prodLoading, error: prodError, refetch: r3 } = useRevenueByProduct()

    const handleRetry = () => { r1(); r2(); r3() }

    const hasError = !!(periodsError || destError || prodError)

    const allPeriods = periods || []
    const totalReceita = allPeriods.reduce((s, p) => s + Number(p.receita_sum), 0)
    const totalValor = allPeriods.reduce((s, p) => s + Number(p.valor_final_sum), 0)
    const totalWon = allPeriods.reduce((s, p) => s + Number(p.count_won), 0)
    const avgTicket = totalWon > 0 ? totalValor / totalWon : 0
    const marginPercent = totalValor > 0 ? Math.round(totalReceita / totalValor * 100 * 10) / 10 : 0

    return (
        <div className="space-y-6">
            {hasError && <QueryErrorState compact title="Erro ao carregar dados financeiros" onRetry={handleRetry} />}

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard
                    title="Faturamento Total"
                    value={formatCurrency(totalValor)}
                    icon={DollarSign}
                    color="text-green-600"
                    bgColor="bg-green-50"
                    isLoading={periodsLoading}
                    onClick={() => drillDown.open({ label: 'Faturamento Total', drillStatus: 'ganho', drillSource: 'closed_deals' })}
                    clickHint="Ver cards ganhos"
                />
                <KpiCard
                    title="Margem Bruta"
                    value={formatCurrency(totalReceita)}
                    subtitle={`${marginPercent}% de margem`}
                    icon={TrendingUp}
                    color="text-indigo-600"
                    bgColor="bg-indigo-50"
                    isLoading={periodsLoading}
                    onClick={() => drillDown.open({ label: 'Margem Bruta', drillStatus: 'ganho', drillSource: 'closed_deals' })}
                    clickHint="Ver cards ganhos"
                />
                <KpiCard
                    title="Ticket Médio"
                    value={formatCurrency(avgTicket)}
                    icon={Target}
                    color="text-amber-600"
                    bgColor="bg-amber-50"
                    isLoading={periodsLoading}
                    onClick={() => drillDown.open({ label: 'Ticket Médio', drillStatus: 'ganho', drillSource: 'closed_deals' })}
                    clickHint="Ver cards ganhos"
                />
                <KpiCard
                    title="Viagens Vendidas"
                    value={totalWon}
                    icon={Briefcase}
                    color="text-slate-700"
                    bgColor="bg-slate-100"
                    isLoading={periodsLoading}
                    onClick={() => drillDown.open({ label: 'Viagens Vendidas', drillStatus: 'ganho', drillSource: 'closed_deals' })}
                    clickHint="Ver cards"
                />
            </div>

            {/* Receita vs Margem */}
            <ChartCard
                title="Receita vs Margem"
                description="Evolução mensal de faturamento e lucro"
                isLoading={periodsLoading}
            >
                {allPeriods.length > 0 ? (
                    <ResponsiveContainer width="100%" height={320}>
                        <ComposedChart data={allPeriods} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
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
                                tickFormatter={(v: number) => formatCurrency(v)}
                            />
                            <YAxis
                                yAxisId="right"
                                orientation="right"
                                tick={{ fontSize: 11, fill: '#64748b' }}
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={(v: number) => formatCurrency(v)}
                            />
                            <Tooltip
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                                formatter={(value: number, name: string) => [formatCurrency(value), name]}
                            />
                            <Legend wrapperStyle={{ fontSize: '12px' }} />
                            <Bar
                                yAxisId="left"
                                dataKey="valor_final_sum"
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
                                    const bounds = period ? parsePeriodBounds(period, granularity) : null
                                    drillDown.open({
                                        label: `Faturamento — ${period || 'Período'}`,
                                        drillStatus: 'ganho',
                                        drillSource: 'closed_deals',
                                        drillPeriodStart: bounds?.start,
                                        drillPeriodEnd: bounds?.end,
                                    })
                                }}
                            />
                            <Line
                                yAxisId="right"
                                type="monotone"
                                dataKey="receita_sum"
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
                                        const bounds = period ? parsePeriodBounds(period, granularity) : null
                                        drillDown.open({
                                            label: `Margem — ${period || 'Período'}`,
                                            drillStatus: 'ganho',
                                            drillSource: 'closed_deals',
                                            drillPeriodStart: bounds?.start,
                                            drillPeriodEnd: bounds?.end,
                                        })
                                    },
                                }}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-[320px] flex items-center justify-center text-sm text-slate-400">
                        Nenhum dado financeiro no período
                    </div>
                )}
            </ChartCard>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Destinos */}
                <ChartCard
                    title="Top Destinos por Receita"
                    description="Onde a Welcome ganha mais?"
                    isLoading={destLoading}
                >
                    {(destinations || []).length > 0 ? (
                        <ResponsiveContainer width="100%" height={Math.max(250, (destinations || []).length * 30 + 40)}>
                            <BarChart
                                data={destinations}
                                layout="vertical"
                                margin={{ left: 10, right: 50 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                                <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatCurrency(v)} />
                                <YAxis
                                    dataKey="destino"
                                    type="category"
                                    width={140}
                                    tick={{ fontSize: 11, fill: '#334155' }}
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 17) + '…' : v}
                                />
                                <Tooltip
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                                    formatter={(value: number) => [formatCurrency(value), 'Receita']}
                                />
                                <Bar
                                    dataKey="receita_total"
                                    fill="#6366f1"
                                    radius={[0, 4, 4, 0]}
                                    barSize={18}
                                    name="Receita"
                                    cursor="pointer"
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    onClick={(data: any) => {
                                        const destino = data?.destino || data?.payload?.destino
                                        drillDown.open({
                                            label: `Destino: ${destino || '—'}`,
                                            drillStatus: 'ganho',
                                            drillSource: 'closed_deals',
                                            drillDestino: destino || undefined,
                                        })
                                    }}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-[250px] flex items-center justify-center text-sm text-slate-400">
                            Nenhum destino com receita
                        </div>
                    )}
                </ChartCard>

                {/* Receita por Produto */}
                <ChartCard
                    title="Receita por Produto"
                    description="TRIPS vs WEDDING vs CORP"
                    isLoading={prodLoading}
                >
                    {(products || []).length > 0 ? (
                        <div className="flex items-center gap-6">
                            <ResponsiveContainer width="60%" height={250}>
                                <PieChart>
                                    <Pie
                                        data={(products || []).map(p => ({ ...p }))}
                                        dataKey="receita_total"
                                        nameKey="produto"
                                        cx="50%"
                                        cy="50%"
                                        outerRadius={90}
                                        innerRadius={50}
                                        strokeWidth={2}
                                        stroke="#fff"
                                        cursor="pointer"
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        onClick={(data: any) => {
                                            const produto = data?.payload?.produto || data?.produto
                                            if (produto && ['TRIPS', 'WEDDING', 'CORP'].includes(produto)) {
                                                setProduct(produto as 'TRIPS' | 'WEDDING' | 'CORP')
                                                drillDown.open({ label: `${produto} — Ganhos`, drillStatus: 'ganho', drillSource: 'closed_deals' })
                                            }
                                        }}
                                    >
                                        {(products || []).map((p) => (
                                            <Cell key={p.produto} fill={PRODUCT_COLORS[p.produto] || '#94a3b8'} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                                        formatter={(value: number) => [formatCurrency(value), 'Receita']}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="flex-1 space-y-3">
                                {(products || []).map((p) => (
                                    <button
                                        key={p.produto}
                                        className="flex items-center gap-3 w-full text-left hover:bg-slate-50 rounded-lg px-2 py-1 -mx-2 transition-colors cursor-pointer"
                                        onClick={() => setProduct(p.produto as 'TRIPS' | 'WEDDING' | 'CORP')}
                                        title={`Filtrar por ${p.produto}`}
                                    >
                                        <div
                                            className="w-3 h-3 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: PRODUCT_COLORS[p.produto] || '#94a3b8' }}
                                        />
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-slate-800">{p.produto}</p>
                                            <p className="text-xs text-slate-400">{p.count_won} vendas — {formatCurrency(p.receita_total)}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="h-[250px] flex items-center justify-center text-sm text-slate-400">
                            Nenhum dado de produto
                        </div>
                    )}
                </ChartCard>
            </div>

            {/* CAC Placeholder */}
            <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400">
                        <Target size={20} />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-800">LTV / CAC</p>
                        <p className="text-xs text-slate-400">Custo de aquisição por canal em desenvolvimento. LTV disponível via contact_stats.total_spend.</p>
                    </div>
                </div>
            </div>
        </div>
    )
}
