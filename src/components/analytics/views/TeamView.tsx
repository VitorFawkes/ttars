import { useState } from 'react'
import {
    Users, CheckCircle, DollarSign, Briefcase, TrendingUp,
} from 'lucide-react'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import KpiCard from '../KpiCard'
import ChartCard from '../ChartCard'
import { useTeamPerformance, type TeamMember } from '@/hooks/analytics/useTeamPerformance'
import { cn } from '@/lib/utils'

const TABS = [
    { key: 'SDR', label: 'SDR' },
    { key: 'Vendas', label: 'Planner' },
    { key: 'Pos-Venda', label: 'Pós-Venda' },
] as const

type TabKey = typeof TABS[number]['key']

function formatCurrency(value: number): string {
    if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)} mi`
    if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)} mil`
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
}

export default function TeamView() {
    const [activeTab, setActiveTab] = useState<TabKey>('SDR')
    const { data: teamData, isLoading } = useTeamPerformance(activeTab)

    const members = (teamData || []).filter(m => m.phase === activeTab)
    const totals = members.reduce((acc, m) => ({
        total_cards: acc.total_cards + m.total_cards,
        won_cards: acc.won_cards + m.won_cards,
        lost_cards: acc.lost_cards + m.lost_cards,
        total_receita: acc.total_receita + m.total_receita,
        active_cards: acc.active_cards + m.active_cards,
    }), { total_cards: 0, won_cards: 0, lost_cards: 0, total_receita: 0, active_cards: 0 })

    const avgConversion = totals.total_cards > 0
        ? Math.round(totals.won_cards / totals.total_cards * 100 * 10) / 10
        : 0

    return (
        <div className="space-y-6">
            {/* Tab Toggle */}
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 w-fit">
                {TABS.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={cn(
                            'px-4 py-2 text-sm font-medium rounded-md transition-colors',
                            activeTab === tab.key
                                ? 'bg-indigo-600 text-white'
                                : 'text-slate-600 hover:bg-slate-50'
                        )}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <KpiCard
                    title={activeTab === 'SDR' ? 'Leads Criados' : 'Leads Recebidos'}
                    value={totals.total_cards}
                    icon={Users}
                    color="text-blue-600"
                    bgColor="bg-blue-50"
                    isLoading={isLoading}
                />
                <KpiCard
                    title="Ganhos"
                    value={totals.won_cards}
                    icon={CheckCircle}
                    color="text-green-600"
                    bgColor="bg-green-50"
                    isLoading={isLoading}
                />
                <KpiCard
                    title="Conversão %"
                    value={`${avgConversion}%`}
                    icon={TrendingUp}
                    color="text-emerald-600"
                    bgColor="bg-emerald-50"
                    isLoading={isLoading}
                />
                <KpiCard
                    title="Receita"
                    value={formatCurrency(totals.total_receita)}
                    icon={DollarSign}
                    color="text-slate-700"
                    bgColor="bg-slate-100"
                    isLoading={isLoading}
                />
                <KpiCard
                    title="Cards Ativos"
                    value={totals.active_cards}
                    icon={Briefcase}
                    color="text-amber-600"
                    bgColor="bg-amber-50"
                    isLoading={isLoading}
                />
            </div>

            {/* Performance Table */}
            <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                    <h3 className="text-sm font-semibold text-slate-800">Performance Individual</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/50">
                                <th className="text-left px-6 py-3 font-medium text-slate-500">Consultor</th>
                                <th className="text-right px-4 py-3 font-medium text-slate-500">Cards</th>
                                <th className="text-right px-4 py-3 font-medium text-slate-500">Ganhos</th>
                                <th className="text-right px-4 py-3 font-medium text-slate-500">Conversão</th>
                                <th className="text-right px-4 py-3 font-medium text-slate-500">Receita</th>
                                <th className="text-right px-4 py-3 font-medium text-slate-500">Ticket Médio</th>
                                <th className="text-right px-4 py-3 font-medium text-slate-500">Ciclo (dias)</th>
                                <th className="text-right px-6 py-3 font-medium text-slate-500">Ativos</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                Array.from({ length: 3 }).map((_, i) => (
                                    <tr key={i} className="border-b border-slate-50">
                                        <td colSpan={8} className="px-6 py-4">
                                            <div className="h-4 bg-slate-100 rounded animate-pulse" />
                                        </td>
                                    </tr>
                                ))
                            ) : members.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-8 text-center text-slate-400">
                                        Nenhum consultor com cards neste período
                                    </td>
                                </tr>
                            ) : (
                                members.map((m) => (
                                    <TeamRow key={m.user_id} member={m} />
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Workload Chart */}
            <ChartCard
                title="Carga de Trabalho"
                description="Cards ativos por consultor"
                isLoading={isLoading}
            >
                {members.length > 0 ? (
                    <ResponsiveContainer width="100%" height={Math.max(200, members.length * 40 + 40)}>
                        <BarChart
                            data={members.map(m => ({ name: m.user_nome.split(' ')[0], ativos: m.active_cards }))}
                            layout="vertical"
                            margin={{ left: 10, right: 30 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                            <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                            <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12, fill: '#334155' }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                            <Bar dataKey="ativos" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={20} name="Ativos" />
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-[200px] flex items-center justify-center text-sm text-slate-400">
                        Nenhum dado de carga de trabalho
                    </div>
                )}
            </ChartCard>
        </div>
    )
}

function TeamRow({ member: m }: { member: TeamMember }) {
    return (
        <tr className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
            <td className="px-6 py-3 font-medium text-slate-800">{m.user_nome}</td>
            <td className="text-right px-4 py-3 text-slate-600">{m.total_cards}</td>
            <td className="text-right px-4 py-3 text-green-600 font-medium">{m.won_cards}</td>
            <td className="text-right px-4 py-3">
                <span className={cn(
                    'font-medium',
                    m.conversion_rate >= 30 ? 'text-green-600' : m.conversion_rate >= 15 ? 'text-amber-600' : 'text-slate-500'
                )}>
                    {m.conversion_rate}%
                </span>
            </td>
            <td className="text-right px-4 py-3 text-slate-700 font-medium">{formatCurrency(m.total_receita)}</td>
            <td className="text-right px-4 py-3 text-slate-600">{formatCurrency(m.ticket_medio)}</td>
            <td className="text-right px-4 py-3 text-slate-600">{m.ciclo_medio_dias}</td>
            <td className="text-right px-6 py-3 text-indigo-600 font-medium">{m.active_cards}</td>
        </tr>
    )
}
