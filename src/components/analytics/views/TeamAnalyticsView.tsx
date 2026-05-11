import { useEffect, useState, useMemo } from 'react'
import {
    Users, TrendingUp, AlertTriangle,
    ArrowUpDown, ArrowUp, ArrowDown,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import KpiCard from '../KpiCard'
import { useTeamPerformance } from '@/hooks/analytics/useTeamPerformance'
import { useAnalyticsFilters } from '@/hooks/analytics/useAnalyticsFilters'
import { useDrillDownStore } from '@/hooks/analytics/useAnalyticsDrillDown'
import { QueryErrorState } from '@/components/ui/QueryErrorState'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/utils/whatsappFormatters'
import { cn } from '@/lib/utils'
import TeamLeaderboardSection from '@/components/analytics/equipe/TeamLeaderboardSection'

type SortKey = 'user_nome' | 'active_cards' | 'won_cards' | 'conversion_rate' | 'total_receita' | 'ticket_medio' | 'ciclo_medio_dias'
type PhaseFilter = 'sdr' | 'planner' | 'pos_venda'

export default function TeamAnalyticsView() {
    const { setActiveView, dateRange } = useAnalyticsFilters()
    const drillDown = useDrillDownStore()
    const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>('sdr')
    const [sortKey, setSortKey] = useState<SortKey>('won_cards')
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

    // Set active view on mount
    useEffect(() => {
        setActiveView('team')
    }, [setActiveView])

    // Fetch team performance data
    const { data: teamData, isLoading: teamLoading, error: teamError, refetch: refetchTeam } = useTeamPerformance(phaseFilter)

    // Fetch task stats. Antes fazia `cards.select('id')` → `tarefas.in('card_id', [500+ uuids])`
    // o que gerava URL gigante e HTTP 400. A RLS de tarefas já isola por org_id, então
    // basta contar tarefas diretamente com os predicados de data — o isolamento por
    // produto não é crítico aqui (user só vê a própria org de qualquer forma).
    const taskStats = useQuery({
        queryKey: ['analytics', 'task-stats', phaseFilter],
        queryFn: async () => {
            const now = new Date()
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
            const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString()
            const weekEnd = new Date(now.getTime() + 7 * 86400000).toISOString()

            const [overdueRes, todayRes, weekRes, completedRes] = await Promise.all([
                supabase.from('tarefas').select('id', { count: 'exact', head: true })
                    .eq('concluida', false).is('deleted_at', null)
                    .lt('data_vencimento', todayStart),
                supabase.from('tarefas').select('id', { count: 'exact', head: true })
                    .eq('concluida', false).is('deleted_at', null)
                    .gte('data_vencimento', todayStart).lte('data_vencimento', todayEnd),
                supabase.from('tarefas').select('id', { count: 'exact', head: true })
                    .eq('concluida', false).is('deleted_at', null)
                    .gte('data_vencimento', todayStart).lte('data_vencimento', weekEnd),
                supabase.from('tarefas').select('id', { count: 'exact', head: true })
                    .eq('concluida', true).is('deleted_at', null)
                    .gte('concluida_em', dateRange.start).lte('concluida_em', dateRange.end),
            ])

            return {
                overdue: overdueRes.count ?? 0,
                today: todayRes.count ?? 0,
                thisWeek: weekRes.count ?? 0,
                completed: completedRes.count ?? 0,
            }
        },
        staleTime: 2 * 60 * 1000,
    })

    // Compute KPIs
    const members = useMemo(() => teamData || [], [teamData])
    const pessoasAtivas = members.length
    const conversaoMedia = members.length > 0
        ? Math.round(members.reduce((sum, m) => sum + m.conversion_rate, 0) / members.length * 10) / 10
        : 0

    const tarefasVencidas = taskStats.data?.overdue ?? 0
    const tarefasVencidasColor = tarefasVencidas === 0 ? 'text-emerald-600' : tarefasVencidas <= 5 ? 'text-amber-600' : 'text-rose-600'
    const tarefasVencidasBg = tarefasVencidas === 0 ? 'bg-emerald-50' : tarefasVencidas <= 5 ? 'bg-amber-50' : 'bg-rose-50'

    // Sort table
    const sortedMembers = useMemo(() => {
        const sorted = [...members].sort((a, b) => {
            const av = a[sortKey] as string | number
            const bv = b[sortKey] as string | number

            if (typeof av === 'string' && typeof bv === 'string') {
                return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
            }

            const numA = typeof av === 'number' ? av : 0
            const numB = typeof bv === 'number' ? bv : 0
            return sortDir === 'asc' ? numA - numB : numB - numA
        })
        return sorted
    }, [members, sortKey, sortDir])

    // Handle sort toggle
    const toggleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        } else {
            setSortKey(key)
            setSortDir('desc')
        }
    }

    // Render sort icon
    const renderSortIcon = (key: SortKey) => {
        if (sortKey !== key) return <ArrowUpDown className="w-4 h-4" />
        return sortDir === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
    }

    const hasError = !!(teamError || taskStats.error)
    const isLoading = teamLoading || taskStats.isLoading

    return (
        <div className="space-y-6">
            {hasError && (
                <QueryErrorState
                    compact
                    title="Erro ao carregar dados da equipe"
                    onRetry={() => { refetchTeam(); taskStats.refetch?.() }}
                />
            )}

            {/* Ranking consolidado (1 linha por pessoa, somando todas as fases) */}
            <TeamLeaderboardSection />

            {/* Detalhes por fase abaixo */}
            <div className="pt-2">
                <h2 className="text-sm font-semibold text-slate-700 mb-3">Detalhes por fase</h2>
            </div>

            {/* Zone 1: Phase Selector + KPI Cards */}
            <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-stretch">
                {/* Phase Selector */}
                <div className="rounded-lg border border-slate-200 bg-white overflow-hidden flex items-center shrink-0">
                    <button
                        onClick={() => setPhaseFilter('sdr')}
                        className={cn(
                            'px-4 py-2 text-sm font-medium transition-colors',
                            phaseFilter === 'sdr'
                                ? 'bg-indigo-600 text-white'
                                : 'text-slate-600 hover:bg-slate-50'
                        )}
                    >
                        SDR
                    </button>
                    <button
                        onClick={() => setPhaseFilter('planner')}
                        className={cn(
                            'px-4 py-2 text-sm font-medium transition-colors border-l border-slate-200',
                            phaseFilter === 'planner'
                                ? 'bg-indigo-600 text-white'
                                : 'text-slate-600 hover:bg-slate-50'
                        )}
                    >
                        Planner
                    </button>
                    <button
                        onClick={() => setPhaseFilter('pos_venda')}
                        className={cn(
                            'px-4 py-2 text-sm font-medium transition-colors border-l border-slate-200',
                            phaseFilter === 'pos_venda'
                                ? 'bg-indigo-600 text-white'
                                : 'text-slate-600 hover:bg-slate-50'
                        )}
                    >
                        Pós-Venda
                    </button>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
                    <KpiCard
                        title="Pessoas ativas"
                        value={pessoasAtivas}
                        icon={Users}
                        color="text-blue-600"
                        bgColor="bg-blue-50"
                        isLoading={isLoading}
                    />
                    <KpiCard
                        title="Conversão média"
                        value={`${conversaoMedia}%`}
                        icon={TrendingUp}
                        color="text-emerald-600"
                        bgColor="bg-emerald-50"
                        isLoading={isLoading}
                    />
                    <KpiCard
                        title="Tarefas vencidas"
                        value={tarefasVencidas}
                        icon={AlertTriangle}
                        color={tarefasVencidasColor}
                        bgColor={tarefasVencidasBg}
                        isLoading={isLoading}
                    />
                </div>
            </div>

            {/* Zone 2: Performance Table */}
            <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                    <h3 className="text-sm font-semibold text-slate-800">Performance da Equipe</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-100">
                                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                    <button
                                        onClick={() => toggleSort('user_nome')}
                                        className="inline-flex items-center gap-2 hover:text-slate-700 transition-colors"
                                    >
                                        Nome {renderSortIcon('user_nome')}
                                    </button>
                                </th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                    <button
                                        onClick={() => toggleSort('active_cards')}
                                        className="inline-flex items-center justify-end gap-2 hover:text-slate-700 transition-colors w-full"
                                    >
                                        Cards {renderSortIcon('active_cards')}
                                    </button>
                                </th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                    <button
                                        onClick={() => toggleSort('won_cards')}
                                        className="inline-flex items-center justify-end gap-2 hover:text-slate-700 transition-colors w-full"
                                    >
                                        Ganhos {renderSortIcon('won_cards')}
                                    </button>
                                </th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                    <button
                                        onClick={() => toggleSort('conversion_rate')}
                                        className="inline-flex items-center justify-end gap-2 hover:text-slate-700 transition-colors w-full"
                                    >
                                        Conversão {renderSortIcon('conversion_rate')}
                                    </button>
                                </th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                    <button
                                        onClick={() => toggleSort('total_receita')}
                                        className="inline-flex items-center justify-end gap-2 hover:text-slate-700 transition-colors w-full"
                                    >
                                        Receita {renderSortIcon('total_receita')}
                                    </button>
                                </th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                    <button
                                        onClick={() => toggleSort('ticket_medio')}
                                        className="inline-flex items-center justify-end gap-2 hover:text-slate-700 transition-colors w-full"
                                    >
                                        Ticket Médio {renderSortIcon('ticket_medio')}
                                    </button>
                                </th>
                                <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                    <button
                                        onClick={() => toggleSort('ciclo_medio_dias')}
                                        className="inline-flex items-center justify-end gap-2 hover:text-slate-700 transition-colors w-full"
                                    >
                                        Ciclo (dias) {renderSortIcon('ciclo_medio_dias')}
                                    </button>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {isLoading ? (
                                Array.from({ length: 3 }).map((_, i) => (
                                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                                        <td colSpan={7} className="px-6 py-4">
                                            <div className="h-4 bg-slate-100 rounded animate-pulse" />
                                        </td>
                                    </tr>
                                ))
                            ) : sortedMembers.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-8 text-center text-slate-400">
                                        Nenhum membro da equipe com dados neste período
                                    </td>
                                </tr>
                            ) : (
                                sortedMembers.map((member) => (
                                    <tr
                                        key={member.user_id}
                                        onClick={() => drillDown.open({
                                            label: member.user_nome,
                                            drillOwnerId: member.user_id,
                                            drillPhase: phaseFilter,
                                        })}
                                        className="hover:bg-slate-50 transition-colors cursor-pointer"
                                    >
                                        <td className="text-left px-6 py-3 font-medium text-slate-900">{member.user_nome}</td>
                                        <td className="text-right px-4 py-3 text-slate-600">{member.active_cards}</td>
                                        <td className="text-right px-4 py-3 text-emerald-600 font-medium">{member.won_cards}</td>
                                        <td className="text-right px-4 py-3 font-medium text-slate-900">
                                            {(member.conversion_rate ?? 0).toFixed(1)}%
                                        </td>
                                        <td className="text-right px-4 py-3 text-slate-900 font-medium">
                                            {formatCurrency(member.total_receita ?? 0)}
                                        </td>
                                        <td className="text-right px-4 py-3 text-slate-600">
                                            {formatCurrency(member.ticket_medio ?? 0)}
                                        </td>
                                        <td className="text-right px-6 py-3 text-slate-600">
                                            {Math.round(member.ciclo_medio_dias ?? 0)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Zone 3: Task Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-rose-700">{taskStats.data?.overdue ?? 0}</p>
                    <p className="text-xs font-medium text-rose-600 mt-1">Vencidas</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-amber-700">{taskStats.data?.today ?? 0}</p>
                    <p className="text-xs font-medium text-amber-600 mt-1">Hoje</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-blue-700">{taskStats.data?.thisWeek ?? 0}</p>
                    <p className="text-xs font-medium text-blue-600 mt-1">Esta semana</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-emerald-700">{taskStats.data?.completed ?? 0}</p>
                    <p className="text-xs font-medium text-emerald-600 mt-1">Concluídas</p>
                </div>
            </div>
        </div>
    )
}
