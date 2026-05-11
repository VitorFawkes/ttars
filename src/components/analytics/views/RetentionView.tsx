import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    Repeat, Users, TrendingDown, Heart, Info,
} from 'lucide-react'
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import KpiCard from '../KpiCard'
import ChartCard from '../ChartCard'
import { QueryErrorState } from '@/components/ui/QueryErrorState'
import { useRetentionCohort, useRetentionKpis } from '@/hooks/analytics/useRetentionData'
import { useAnalyticsFilters } from '@/hooks/analytics/useAnalyticsFilters'
import { cn } from '@/lib/utils'

export default function RetentionView() {
    const { mode } = useAnalyticsFilters()
    const { data: cohortRows, isLoading: cohortLoading, error: cohortError, refetch: r1 } = useRetentionCohort()
    const { data: kpis, isLoading: kpisLoading, error: kpisError, refetch: r2 } = useRetentionKpis()

    const navigate = useNavigate()
    const handleRetry = () => { r1(); r2() }

    const hasError = !!(cohortError || kpisError)

    const isLoading = cohortLoading || kpisLoading
    const modeDoesNotApply = mode !== 'entries'

    // Build cohort matrix: rows = cohort months, cols = offsets
    const cohortMatrix = useMemo(() => {
        if (!cohortRows || cohortRows.length === 0) return { months: [], maxOffset: 0, matrix: new Map() }

        const matrix = new Map<string, Map<number, { retained: number; rate: number; total: number }>>()
        let maxOffset = 0

        for (const row of cohortRows) {
            if (!matrix.has(row.cohort_month)) {
                matrix.set(row.cohort_month, new Map())
            }
            matrix.get(row.cohort_month)!.set(row.month_offset, {
                retained: row.retained,
                rate: Number(row.retention_rate),
                total: row.total_contacts,
            })
            if (row.month_offset > maxOffset) maxOffset = row.month_offset
        }

        const months = Array.from(matrix.keys()).sort()
        return { months, maxOffset, matrix }
    }, [cohortRows])

    // Derive repurchase evolution by cohort month (M1 retention trend)
    const repurchaseEvolution = useMemo(() => {
        if (!cohortMatrix.months.length) return []
        return cohortMatrix.months.map(month => {
            const row = cohortMatrix.matrix.get(month)!
            // Aggregate: any repurchase in any offset
            let anyRetained = 0
            let total = 0
            const firstEntry = row.values().next().value
            total = firstEntry?.total ?? 0
            // Use max retained across offsets as "anyone who repurchased"
            for (const cell of row.values()) {
                if (cell.retained > anyRetained) anyRetained = cell.retained
            }
            const rate = total > 0 ? Math.round(anyRetained / total * 100 * 10) / 10 : 0
            return { month, rate, retained: anyRetained, total }
        })
    }, [cohortMatrix])

    function getRateColor(rate: number): string {
        if (rate >= 20) return 'bg-green-500 text-white'
        if (rate >= 10) return 'bg-green-300 text-green-900'
        if (rate >= 5) return 'bg-green-100 text-green-800'
        if (rate > 0) return 'bg-slate-100 text-slate-600'
        return 'bg-slate-50 text-slate-300'
    }

    return (
        <div className="space-y-6">
            {hasError && (
                <QueryErrorState
                    compact
                    title="Erro ao carregar dados de recorrência"
                    onRetry={handleRetry}
                />
            )}

            {/* Mode indicator */}
            {modeDoesNotApply && (
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                    <Info className="w-4 h-4 text-slate-400 shrink-0" />
                    <p className="text-xs text-slate-500">
                        O modo de análise selecionado não afeta esta vista. Recorrência é baseada na primeira compra do contato.
                    </p>
                </div>
            )}

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard
                    title="Taxa de Recompra"
                    value={kpis ? `${kpis.repurchase_rate}%` : '—'}
                    icon={Repeat}
                    color="text-green-600"
                    bgColor="bg-green-50"
                    isLoading={isLoading}
                />
                <KpiCard
                    title="Churn Estimado"
                    value={kpis ? `${kpis.churn_rate}%` : '—'}
                    subtitle="Sem compra há +18 meses"
                    icon={TrendingDown}
                    color="text-rose-600"
                    bgColor="bg-rose-50"
                    isLoading={isLoading}
                />
                <KpiCard
                    title="Clientes Fiéis"
                    value={kpis?.repeat_buyers ?? 0}
                    subtitle="2+ viagens"
                    icon={Heart}
                    color="text-indigo-600"
                    bgColor="bg-indigo-50"
                    isLoading={isLoading}
                    onClick={() => navigate('/people')}
                    clickHint="Ver contatos"
                />
                <KpiCard
                    title="Base com Compra"
                    value={kpis?.total_with_purchase ?? 0}
                    icon={Users}
                    color="text-slate-700"
                    bgColor="bg-slate-100"
                    isLoading={isLoading}
                    onClick={() => navigate('/people')}
                    clickHint="Ver contatos"
                />
            </div>

            {/* Nota sobre dados */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-xs text-amber-700">
                    <strong>Nota:</strong> Qualidade dos dados de recorrência depende dos campos <code className="bg-amber-100 px-1 rounded">primeira_venda_data</code> e <code className="bg-amber-100 px-1 rounded">ultima_venda_data</code> estarem populados nos contatos. Dados parciais mostrarão métricas parciais.
                </p>
            </div>

            {/* Repurchase Evolution Chart */}
            <ChartCard
                title="Evolução da Taxa de Recompra"
                description="% de recompra por cohort — tendência ao longo do tempo"
                isLoading={isLoading}
            >
                {repurchaseEvolution.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                        <AreaChart data={repurchaseEvolution} margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis
                                dataKey="month"
                                tick={{ fontSize: 11, fill: '#64748b' }}
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={(v: string) => v.slice(5)}
                            />
                            <YAxis
                                tick={{ fontSize: 11, fill: '#64748b' }}
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={(v: number) => `${v}%`}
                            />
                            <Tooltip
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                                formatter={(value: number) => [`${value}%`, 'Taxa de Recompra']}
                                labelFormatter={(label: string) => `Cohort: ${label}`}
                            />
                            <Area
                                type="monotone"
                                dataKey="rate"
                                stroke="#22c55e"
                                fill="#22c55e"
                                fillOpacity={0.15}
                                strokeWidth={2}
                                dot={{ r: 3, fill: '#22c55e' }}
                                activeDot={{ r: 5, fill: '#22c55e', cursor: 'pointer', onClick: () => navigate('/people') }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-[250px] flex items-center justify-center text-sm text-slate-400">
                        Nenhum dado de evolução de recompra
                    </div>
                )}
            </ChartCard>

            {/* Cohort Table */}
            <ChartCard
                title="Análise de Cohort"
                description="Mês de primeira compra × meses depois — % que comprou de novo"
                isLoading={isLoading}
            >
                {cohortMatrix.months.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr>
                                    <th className="text-left px-3 py-2 font-medium text-slate-500 sticky left-0 bg-white z-10">Cohort</th>
                                    <th className="text-center px-2 py-2 font-medium text-slate-500">N</th>
                                    {Array.from({ length: Math.min(cohortMatrix.maxOffset, 12) }).map((_, i) => (
                                        <th key={i} className="text-center px-2 py-2 font-medium text-slate-400">
                                            M{i + 1}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {cohortMatrix.months.map((month) => {
                                    const row = cohortMatrix.matrix.get(month)!
                                    const first = row.values().next().value
                                    const total = first?.total ?? 0

                                    return (
                                        <tr key={month} className="border-t border-slate-100">
                                            <td className="px-3 py-2 font-medium text-slate-700 sticky left-0 bg-white z-10 whitespace-nowrap">
                                                {month}
                                            </td>
                                            <td className="text-center px-2 py-2 text-slate-500 font-medium">
                                                {total}
                                            </td>
                                            {Array.from({ length: Math.min(cohortMatrix.maxOffset, 12) }).map((_, i) => {
                                                const cell = row.get(i + 1)
                                                const rate = cell?.rate ?? 0

                                                return (
                                                    <td key={i} className="text-center px-1 py-1">
                                                        <div
                                                            className={cn(
                                                                'rounded px-2 py-1.5 font-medium',
                                                                cell ? getRateColor(rate) : 'bg-slate-50 text-slate-200',
                                                                cell ? 'cursor-pointer hover:ring-2 hover:ring-indigo-400 hover:ring-offset-1 transition-all' : ''
                                                            )}
                                                            onClick={() => { if (cell) navigate('/people') }}
                                                        >
                                                            {cell ? `${rate}%` : '—'}
                                                        </div>
                                                    </td>
                                                )
                                            })}
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="h-[300px] flex items-center justify-center text-sm text-slate-400">
                        Nenhum dado de cohort disponível
                    </div>
                )}
            </ChartCard>

            {/* Summary Cards */}
            {kpis && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <button onClick={() => navigate('/people')} className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 text-center hover:border-green-300 hover:shadow-md transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:outline-none">
                        <p className="text-3xl font-bold text-green-600">{kpis.repeat_buyers}</p>
                        <p className="text-sm text-slate-500 mt-1">Compraram 2+ vezes</p>
                        <p className="text-xs text-slate-400 mt-0.5">de {kpis.total_with_purchase} com compra</p>
                    </button>
                    <button onClick={() => navigate('/people')} className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 text-center hover:border-rose-300 hover:shadow-md transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none">
                        <p className="text-3xl font-bold text-rose-600">{kpis.churned}</p>
                        <p className="text-sm text-slate-500 mt-1">Possivelmente churned</p>
                        <p className="text-xs text-slate-400 mt-0.5">Sem compra há +18 meses</p>
                    </button>
                    <button onClick={() => navigate('/people')} className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 text-center hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none">
                        <p className="text-3xl font-bold text-indigo-600">
                            {kpis.total_with_purchase - kpis.repeat_buyers - kpis.churned}
                        </p>
                        <p className="text-sm text-slate-500 mt-1">Potencial Recompra</p>
                        <p className="text-xs text-slate-400 mt-0.5">1 compra, ainda na janela</p>
                    </button>
                </div>
            )}
        </div>
    )
}
