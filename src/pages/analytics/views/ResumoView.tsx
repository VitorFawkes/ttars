import { useEffect, useMemo } from 'react'
import { DollarSign, TrendingUp, Target, Calculator } from 'lucide-react'
import {
    ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import KpiCard from '@/components/analytics/KpiCard'
import ChartCard from '@/components/analytics/ChartCard'
import { QueryErrorState } from '@/components/ui/QueryErrorState'
import { useOverviewKpis, useRevenueTimeseries } from '@/hooks/analytics/useOverviewData'
import { useAnalyticsFilters } from '@/hooks/analytics/useAnalyticsFilters'
import { useProductContext } from '@/hooks/useProductContext'
import TripsProductWidgets from '@/components/analytics/resumo/TripsProductWidgets'
import WeddingProductWidgets from '@/components/analytics/resumo/WeddingProductWidgets'
import { formatCurrency } from '@/utils/whatsappFormatters'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RevenueTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null
    const first = payload[0]
    const row = first?.payload
    if (!row) return null
    return (
        <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs space-y-1">
            <p className="font-medium text-slate-900">{row.period}</p>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {payload.map((entry: any, i: number) => (
                <p key={i} style={{ color: entry.color }}>
                    {entry.name}: <span className="font-semibold">{formatCurrency(Number(entry.value))}</span>
                </p>
            ))}
        </div>
    )
}

export default function ResumoView() {
    const { setActiveView } = useAnalyticsFilters()
    const { currentProduct } = useProductContext()
    const { data: kpis, isLoading: kpisLoading, error: kpisError, refetch: refetchKpis } = useOverviewKpis()
    const { data: revenue, isLoading: revenueLoading } = useRevenueTimeseries()

    useEffect(() => { setActiveView('resumo') }, [setActiveView])

    const chartData = useMemo(() =>
        (revenue ?? []).map(p => ({
            period: p.period,
            period_start: p.period_start,
            'Faturamento': Number(p.total_valor),
            'Receita': Number(p.total_receita),
        })),
    [revenue])

    const hasError = !!kpisError

    return (
        <div className="space-y-6">
            {hasError && (
                <QueryErrorState compact title="Erro ao carregar resumo" onRetry={() => refetchKpis()} />
            )}

            <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Resumo</h1>
                <p className="text-sm text-slate-500 mt-1">Os números principais do período selecionado.</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard
                    title="Receita"
                    value={formatCurrency(kpis?.receita_total ?? 0)}
                    icon={DollarSign}
                    color="text-emerald-600"
                    bgColor="bg-emerald-50"
                    isLoading={kpisLoading}
                    subtitle={`${kpis?.total_won ?? 0} fechamentos`}
                />
                <KpiCard
                    title="Ticket médio"
                    value={formatCurrency(kpis?.ticket_medio ?? 0)}
                    icon={Calculator}
                    color="text-indigo-600"
                    bgColor="bg-indigo-50"
                    isLoading={kpisLoading}
                />
                <KpiCard
                    title="Conversão"
                    value={`${Math.round((kpis?.conversao_venda_rate ?? 0) * 10) / 10}%`}
                    icon={TrendingUp}
                    color={(kpis?.conversao_venda_rate ?? 0) >= 25 ? 'text-emerald-600' : (kpis?.conversao_venda_rate ?? 0) >= 10 ? 'text-amber-600' : 'text-rose-600'}
                    bgColor={(kpis?.conversao_venda_rate ?? 0) >= 25 ? 'bg-emerald-50' : (kpis?.conversao_venda_rate ?? 0) >= 10 ? 'bg-amber-50' : 'bg-rose-50'}
                    isLoading={kpisLoading}
                    subtitle="Leads → ganhos no período"
                />
                <KpiCard
                    title="Ciclo médio"
                    value={kpis ? `${kpis.ciclo_medio_dias}d` : '—'}
                    icon={Target}
                    color="text-slate-700"
                    bgColor="bg-slate-100"
                    isLoading={kpisLoading}
                    subtitle="Criação → fechamento (ganhos)"
                />
            </div>

            <ChartCard title="Evolução da receita" isLoading={revenueLoading}>
                {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                        <ComposedChart data={chartData} margin={{ left: 0, right: 10, top: 10, bottom: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis
                                dataKey="period"
                                tick={{ fontSize: 11, fill: '#64748b' }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis
                                tick={{ fontSize: 11, fill: '#64748b' }}
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                            />
                            <Tooltip content={<RevenueTooltip />} cursor={{ fill: 'rgba(99, 102, 241, 0.05)' }} />
                            <Bar dataKey="Faturamento" fill="#4f46e5" radius={[4, 4, 0, 0]} barSize={18} />
                            <Line
                                type="monotone"
                                dataKey="Receita"
                                stroke="#10b981"
                                strokeWidth={2}
                                dot={{ fill: '#10b981', r: 3 }}
                                activeDot={{ r: 5 }}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-[240px] flex items-center justify-center text-sm text-slate-400">
                        Ainda sem receita registrada no período.
                    </div>
                )}
            </ChartCard>

            {/* Variantes por produto */}
            {currentProduct === 'TRIPS' && <TripsProductWidgets />}
            {currentProduct === 'WEDDING' && <WeddingProductWidgets />}
        </div>
    )
}
