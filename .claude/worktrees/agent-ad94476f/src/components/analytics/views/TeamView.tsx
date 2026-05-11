import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    Users, CheckCircle, DollarSign, Briefcase, TrendingUp,
} from 'lucide-react'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import KpiCard from '../KpiCard'
import ChartCard from '../ChartCard'
import { useTeamPerformance, type TeamMember } from '@/hooks/analytics/useTeamPerformance'
import { useAnalyticsFilters } from '@/hooks/analytics/useAnalyticsFilters'
import { useDrillDownStore } from '@/hooks/analytics/useAnalyticsDrillDown'
import { QueryErrorState } from '@/components/ui/QueryErrorState'
import { formatCurrency } from '@/utils/whatsappFormatters'
import { cn } from '@/lib/utils'

const TABS = [
    { key: 'SDR', label: 'SDR' },
    { key: 'Vendas', label: 'Planner' },
    { key: 'Pos-Venda', label: 'Pós-Venda' },
] as const

type TabKey = typeof TABS[number]['key']

export default function TeamView() {
    const navigate = useNavigate()
    const { ownerId, setOwnerId } = useAnalyticsFilters()
    const drillDown = useDrillDownStore()
    const [activeTab, setActiveTab] = useState<TabKey>('SDR')
    const { data: teamData, isLoading, error: teamError, refetch } = useTeamPerformance(activeTab)

    const [sortKey, setSortKey] = useState<keyof TeamMember>('total_cards')
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

    const toggleOwnerFilter = (userId: string) => {
        setOwnerId(ownerId === userId ? null : userId)
    }

    const toggleSort = (key: keyof TeamMember) => {
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        } else {
            setSortKey(key)
            setSortDir('desc')
        }
    }

    const members = useMemo(() => teamData || [], [teamData])
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

    const sortedMembers = useMemo(() =>
        [...members].sort((a, b) => {
            const av = a[sortKey] as number
            const bv = b[sortKey] as number
            return sortDir === 'asc' ? av - bv : bv - av
        }),
    [members, sortKey, sortDir])

    return (
        <div className="space-y-6">
            {teamError && (
                <QueryErrorState
                    compact
                    title="Erro ao carregar dados de equipe"
                    onRetry={() => refetch()}
                />
            )}

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
                    onClick={() => navigate('/analytics/overview')}
                    clickHint="Ver overview"
                />
                <KpiCard
                    title="Ganhos"
                    value={totals.won_cards}
                    icon={CheckCircle}
                    color="text-green-600"
                    bgColor="bg-green-50"
                    isLoading={isLoading}
                    onClick={() => navigate('/analytics/funnel')}
                    clickHint="Ver funil"
                />
                <KpiCard
                    title="Conversão %"
                    value={`${avgConversion}%`}
                    icon={TrendingUp}
                    color="text-emerald-600"
                    bgColor="bg-emerald-50"
                    isLoading={isLoading}
                    onClick={() => navigate('/analytics/funnel')}
                    clickHint="Ver funil"
                />
                <KpiCard
                    title="Receita"
                    value={formatCurrency(totals.total_receita)}
                    icon={DollarSign}
                    color="text-slate-700"
                    bgColor="bg-slate-100"
                    isLoading={isLoading}
                    onClick={() => navigate('/analytics/financial')}
                    clickHint="Ver financeiro"
                />
                <KpiCard
                    title="Cards Ativos"
                    value={totals.active_cards}
                    icon={Briefcase}
                    color="text-amber-600"
                    bgColor="bg-amber-50"
                    isLoading={isLoading}
                    onClick={() => drillDown.open({ label: 'Cards Ativos', drillStatus: 'aberto', drillSource: 'current_stage' })}
                    clickHint="Ver cards abertos"
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
                                <th className="text-right px-4 py-3">
                                    <button onClick={() => toggleSort('total_cards')} className="inline-flex items-center gap-1 font-medium text-slate-500 hover:text-slate-800">
                                        Cards {sortKey === 'total_cards' && <span className="text-indigo-500">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                                    </button>
                                </th>
                                <th className="text-right px-4 py-3">
                                    <button onClick={() => toggleSort('won_cards')} className="inline-flex items-center gap-1 font-medium text-slate-500 hover:text-slate-800">
                                        Ganhos {sortKey === 'won_cards' && <span className="text-indigo-500">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                                    </button>
                                </th>
                                <th className="text-right px-4 py-3">
                                    <button onClick={() => toggleSort('conversion_rate')} className="inline-flex items-center gap-1 font-medium text-slate-500 hover:text-slate-800">
                                        Conversão {sortKey === 'conversion_rate' && <span className="text-indigo-500">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                                    </button>
                                </th>
                                <th className="text-right px-4 py-3">
                                    <button onClick={() => toggleSort('total_receita')} className="inline-flex items-center gap-1 font-medium text-slate-500 hover:text-slate-800">
                                        Receita {sortKey === 'total_receita' && <span className="text-indigo-500">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                                    </button>
                                </th>
                                <th className="text-right px-4 py-3">
                                    <button onClick={() => toggleSort('ticket_medio')} className="inline-flex items-center gap-1 font-medium text-slate-500 hover:text-slate-800">
                                        Ticket Médio {sortKey === 'ticket_medio' && <span className="text-indigo-500">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                                    </button>
                                </th>
                                <th className="text-right px-4 py-3">
                                    <button onClick={() => toggleSort('ciclo_medio_dias')} className="inline-flex items-center gap-1 font-medium text-slate-500 hover:text-slate-800">
                                        Ciclo (dias) {sortKey === 'ciclo_medio_dias' && <span className="text-indigo-500">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                                    </button>
                                </th>
                                <th className="text-right px-6 py-3">
                                    <button onClick={() => toggleSort('active_cards')} className="inline-flex items-center gap-1 font-medium text-slate-500 hover:text-slate-800">
                                        Ativos {sortKey === 'active_cards' && <span className="text-indigo-500">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                                    </button>
                                </th>
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
                            ) : sortedMembers.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-8 text-center text-slate-400">
                                        Nenhum consultor com cards neste período
                                    </td>
                                </tr>
                            ) : (
                                sortedMembers.map((m) => (
                                    <TeamRow
                                        key={m.user_id}
                                        member={m}
                                        isSelected={ownerId === m.user_id}
                                        onClick={() => drillDown.open({
                                            label: `${m.user_nome} — ${TABS.find(t => t.key === activeTab)?.label ?? activeTab}`,
                                            drillOwnerId: m.user_id,
                                            drillPhase: activeTab,
                                            drillSource: 'stage_entries',
                                            excludeTerminal: true,
                                        })}
                                        onDoubleClick={() => toggleOwnerFilter(m.user_id)}
                                    />
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
                            data={members.map(m => ({ name: m.user_nome.split(' ')[0], ativos: m.active_cards, user_id: m.user_id }))}
                            layout="vertical"
                            margin={{ left: 10, right: 30 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                            <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                            <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12, fill: '#334155' }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            <Bar dataKey="ativos" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={20} name="Ativos" cursor="pointer" onClick={(data: any) => { const id = data?.payload?.user_id || data?.user_id; const name = data?.payload?.name || data?.name; if (id) drillDown.open({ label: `${name || 'Consultor'} — Ativos`, drillOwnerId: id, drillPhase: activeTab, drillStatus: 'aberto', drillSource: 'current_stage' }) }} />
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

function TeamRow({ member: m, isSelected, onClick, onDoubleClick }: { member: TeamMember; isSelected?: boolean; onClick?: () => void; onDoubleClick?: () => void }) {
    return (
        <tr className={cn('border-b border-slate-50 hover:bg-slate-50/50 transition-colors cursor-pointer', isSelected && 'bg-indigo-50/60 hover:bg-indigo-50/80')} onClick={onClick} onDoubleClick={onDoubleClick}>
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
