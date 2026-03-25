import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    ShieldCheck, Package, GitPullRequest, Users, ChevronUp, ChevronDown, DollarSign, Wallet,
} from 'lucide-react'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line,
} from 'recharts'
import KpiCard from '../KpiCard'
import ChartCard from '../ChartCard'
import { useOperationsData } from '@/hooks/analytics/useOperationsData'
import { useDrillDownStore } from '@/hooks/analytics/useAnalyticsDrillDown'
import { QueryErrorState } from '@/components/ui/QueryErrorState'
import { formatCurrency } from '@/utils/whatsappFormatters'
import { cn } from '@/lib/utils'

type SortKey = 'viagens' | 'mudancas' | 'additions' | 'changes' | 'mudancas_por_viagem' | 'receita'
type SortDir = 'asc' | 'desc'

export default function OperationsView() {
    const navigate = useNavigate()
    const drillDown = useDrillDownStore()
    const { data: ops, isLoading, error: opsError, refetch } = useOperationsData()

    const [sortKey, setSortKey] = useState<SortKey>('viagens')
    const [sortDir, setSortDir] = useState<SortDir>('desc')

    const kpis = ops?.kpis
    const subStats = ops?.sub_card_stats
    const planners = useMemo(() => ops?.per_planner || [], [ops?.per_planner])
    const timeline = ops?.timeline || []

    const sortedPlanners = useMemo(() => {
        if (planners.length === 0) return planners
        return [...planners].sort((a, b) => {
            const aVal = a[sortKey]
            const bVal = b[sortKey]
            if (aVal === bVal) return 0
            const dir = sortDir === 'desc' ? -1 : 1
            return aVal > bVal ? dir : -dir
        })
    }, [planners, sortKey, sortDir])

    function handleSort(key: SortKey) {
        if (key === sortKey) {
            setSortDir(d => d === 'desc' ? 'asc' : 'desc')
        } else {
            setSortKey(key)
            setSortDir('desc')
        }
    }

    const sortIcon = (col: SortKey) => {
        if (col !== sortKey) return <ChevronDown className="inline w-3 h-3 ml-0.5 opacity-30" />
        return sortDir === 'desc'
            ? <ChevronDown className="inline w-3 h-3 ml-0.5 text-indigo-600" />
            : <ChevronUp className="inline w-3 h-3 ml-0.5 text-indigo-600" />
    }

    return (
        <div className="space-y-6">
            {opsError && (
                <QueryErrorState
                    compact
                    title="Erro ao carregar dados operacionais"
                    onRetry={() => refetch()}
                />
            )}

            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                <KpiCard
                    title="Viagens Realizadas"
                    value={kpis?.viagens_realizadas ?? 0}
                    icon={Package}
                    color="text-green-600"
                    bgColor="bg-green-50"
                    isLoading={isLoading}
                    onClick={() => drillDown.open({ label: 'Viagens Realizadas', drillStatus: 'ganho', drillSource: 'closed_deals' })}
                    clickHint="Ver cards"
                />
                <KpiCard
                    title="Faturamento"
                    value={formatCurrency(kpis?.valor_total ?? 0)}
                    icon={DollarSign}
                    color="text-teal-600"
                    bgColor="bg-teal-50"
                    isLoading={isLoading}
                    onClick={() => navigate('/analytics/financial')}
                    clickHint="Ver financeiro"
                />
                <KpiCard
                    title="Receita (Margem)"
                    value={formatCurrency(kpis?.receita ?? 0)}
                    icon={Wallet}
                    color="text-rose-600"
                    bgColor="bg-rose-50"
                    isLoading={isLoading}
                    onClick={() => navigate('/analytics/financial')}
                    clickHint="Ver financeiro"
                />
                <KpiCard
                    title="Itens / Viagem"
                    value={subStats?.changes_per_trip ?? 0}
                    subtitle={subStats ? `${subStats.additions_count ?? 0} extras, ${subStats.changes_count ?? 0} mudanças` : undefined}
                    icon={GitPullRequest}
                    color="text-amber-600"
                    bgColor="bg-amber-50"
                    isLoading={isLoading}
                />
                <KpiCard
                    title="Viagens com Mudança"
                    value={subStats?.cards_with_changes ?? 0}
                    icon={ShieldCheck}
                    color="text-indigo-600"
                    bgColor="bg-indigo-50"
                    isLoading={isLoading}
                />
                <button
                    type="button"
                    className="text-left rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    onClick={() => navigate('/analytics/team')}
                    title="Ver equipe"
                >
                    <KpiCard
                        title="Planners Ativos"
                        value={planners.length}
                        icon={Users}
                        color="text-slate-700"
                        bgColor="bg-slate-100"
                        isLoading={isLoading}
                    />
                </button>
            </div>

            {/* NPS Placeholder */}
            <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400">
                        <ShieldCheck size={20} />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-800">NPS / Satisfação do Cliente</p>
                        <p className="text-xs text-slate-400">Sistema de feedback em desenvolvimento. Dados estarão disponíveis após implementação.</p>
                    </div>
                </div>
            </div>

            {/* Timeline de Sub-cards */}
            <ChartCard
                title="Solicitações de Mudança"
                description="Tendência semanal de sub-cards criados"
                isLoading={isLoading}
            >
                {timeline.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                        <LineChart data={timeline} margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis
                                dataKey="week"
                                tick={{ fontSize: 11, fill: '#64748b' }}
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={(v: string) => v.slice(5)}
                            />
                            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                            <Line type="monotone" dataKey="count" name="Mudanças" stroke="#6366f1" strokeWidth={2} dot={{ r: 3, fill: '#6366f1' }} activeDot={{ r: 5 }} />
                        </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-[250px] flex items-center justify-center text-sm text-slate-400">
                        Nenhum dado de mudanças
                    </div>
                )}
            </ChartCard>

            {/* Qualidade por Planner */}
            <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                    <h3 className="text-sm font-semibold text-slate-800">Qualidade por Planner</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Taxa de mudanças por Planner que montou a viagem</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/50">
                                <th className="text-left px-6 py-3 font-medium text-slate-500">Planner</th>
                                <th
                                    className="text-right px-4 py-3 font-medium text-slate-500 cursor-pointer select-none hover:text-slate-700 whitespace-nowrap"
                                    onClick={() => handleSort('viagens')}
                                >
                                    Viagens {sortIcon('viagens')}
                                </th>
                                <th
                                    className="text-right px-4 py-3 font-medium text-slate-500 cursor-pointer select-none hover:text-slate-700 whitespace-nowrap"
                                    onClick={() => handleSort('additions')}
                                >
                                    Extras {sortIcon('additions')}
                                </th>
                                <th
                                    className="text-right px-4 py-3 font-medium text-slate-500 cursor-pointer select-none hover:text-slate-700 whitespace-nowrap"
                                    onClick={() => handleSort('changes')}
                                >
                                    Mudanças {sortIcon('changes')}
                                </th>
                                <th
                                    className="text-right px-4 py-3 font-medium text-slate-500 cursor-pointer select-none hover:text-slate-700 whitespace-nowrap"
                                    onClick={() => handleSort('mudancas_por_viagem')}
                                >
                                    Itens/Viagem {sortIcon('mudancas_por_viagem')}
                                </th>
                                <th
                                    className="text-right px-6 py-3 font-medium text-slate-500 cursor-pointer select-none hover:text-slate-700 whitespace-nowrap"
                                    onClick={() => handleSort('receita')}
                                >
                                    Receita {sortIcon('receita')}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                Array.from({ length: 3 }).map((_, i) => (
                                    <tr key={i} className="border-b border-slate-50">
                                        <td colSpan={6} className="px-6 py-4">
                                            <div className="h-4 bg-slate-100 rounded animate-pulse" />
                                        </td>
                                    </tr>
                                ))
                            ) : sortedPlanners.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                                        Nenhum planner com viagens no período
                                    </td>
                                </tr>
                            ) : (
                                sortedPlanners.map((p) => (
                                    <tr
                                        key={p.planner_nome}
                                        className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors cursor-pointer"
                                        onClick={() => drillDown.open({ label: `${p.planner_nome} — Viagens`, drillStatus: 'ganho', drillSource: 'closed_deals', drillOwnerId: p.planner_id })}
                                    >
                                        <td className="px-6 py-3 font-medium text-slate-800">{p.planner_nome}</td>
                                        <td className="text-right px-4 py-3 text-slate-600">{p.viagens}</td>
                                        <td className="text-right px-4 py-3 text-purple-600">{p.additions ?? 0}</td>
                                        <td className="text-right px-4 py-3 text-orange-600">{p.changes ?? 0}</td>
                                        <td className="text-right px-4 py-3">
                                            <span className={cn(
                                                'font-medium',
                                                p.mudancas_por_viagem <= 0.5 ? 'text-green-600' :
                                                    p.mudancas_por_viagem <= 1 ? 'text-amber-600' : 'text-rose-600'
                                            )}>
                                                {p.mudancas_por_viagem}
                                            </span>
                                        </td>
                                        <td className="text-right px-6 py-3 text-slate-700 font-medium">{formatCurrency(p.receita)}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Workload Chart */}
            <ChartCard
                title="Viagens por Planner"
                description="Distribuição de viagens realizadas"
                isLoading={isLoading}
            >
                {planners.length > 0 ? (
                    <ResponsiveContainer width="100%" height={Math.max(200, planners.length * 40 + 40)}>
                        <BarChart
                            data={planners.map(p => ({ name: p.planner_nome, viagens: p.viagens, extras: p.additions ?? 0, mudancas: p.changes ?? 0, planner_id: p.planner_id }))}
                            layout="vertical"
                            margin={{ left: 10, right: 30 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                            <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                            <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11, fill: '#334155' }} axisLine={false} tickLine={false} tickFormatter={(v: string) => v.length > 16 ? v.slice(0, 15) + '…' : v} />
                            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            <Bar dataKey="viagens" fill="#22c55e" radius={[0, 4, 4, 0]} barSize={18} name="Viagens" cursor="pointer" onClick={(data: any) => { const d = data?.payload || data; if (d?.planner_id) drillDown.open({ label: `${d.name} — Viagens`, drillOwnerId: d.planner_id, drillStatus: 'ganho', drillSource: 'closed_deals' }) }} />
                            <Bar dataKey="extras" fill="#a855f7" radius={[0, 4, 4, 0]} barSize={18} name="Extras" />
                            <Bar dataKey="mudancas" fill="#f97316" radius={[0, 4, 4, 0]} barSize={18} name="Mudanças" />
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-[200px] flex items-center justify-center text-sm text-slate-400">
                        Nenhum dado de viagens por planner
                    </div>
                )}
            </ChartCard>
        </div>
    )
}
