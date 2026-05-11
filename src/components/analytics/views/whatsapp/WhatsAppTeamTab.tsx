import { useMemo } from 'react'
import {
    Users, Bot, BarChart3, Zap,
} from 'lucide-react'
import {
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useWhatsAppAnalytics } from '@/hooks/analytics/useWhatsAppAnalytics'
import { useWhatsAppSpeed } from '@/hooks/analytics/useWhatsAppSpeed'
import { QueryErrorState } from '@/components/ui/QueryErrorState'
import { cn } from '@/lib/utils'
import { fmt, formatMinutes } from '@/utils/whatsappFormatters'

// ── Helpers ──

function frtBadgeColor(median: number): string {
    if (median <= 10) return 'bg-green-50 text-green-700 border-green-200'
    if (median <= 60) return 'bg-amber-50 text-amber-700 border-amber-200'
    return 'bg-rose-50 text-rose-700 border-rose-200'
}

const WORKLOAD_COLORS = ['#8b5cf6', '#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4']

// ── Props ──

interface TeamTabProps {
    onNavigateToConversations?: (status?: 'waiting' | 'responded' | 'inactive' | null) => void
}

// ── Main Tab ──

export default function WhatsAppTeamTab({ onNavigateToConversations }: TeamTabProps) {
    const { data: metrics, isLoading, error: mainError, refetch } = useWhatsAppAnalytics()
    const { data: speedMetrics } = useWhatsAppSpeed()

    const aiStats = metrics?.ai_stats
    const overview = metrics?.overview

    // Real AI FRT from speed RPC (not hardcoded)
    const aiFrt = speedMetrics?.frt_by_type?.ai

    // Workload pie data: Julia IA + each human agent
    const agents = metrics?.agent_performance
    const workloadData = useMemo(() => {
        const result: { name: string; value: number }[] = []
        if (aiStats && aiStats.total_ai_msgs > 0) {
            result.push({ name: 'Julia IA', value: aiStats.total_ai_msgs })
        }
        ;(agents || []).forEach(a => {
            result.push({ name: a.user_name, value: a.messages_sent })
        })
        return result
    }, [agents, aiStats])
    const agentsList = agents || []

    const totalOutbound = overview?.outbound ?? 0

    if (isLoading) {
        return (
            <div className="h-[400px] flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
        )
    }

    if (mainError) {
        return <QueryErrorState compact title="Erro ao carregar dados da equipe" onRetry={() => refetch()} />
    }

    if (!overview || overview.total_messages === 0) {
        return (
            <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-8 text-center">
                <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-slate-700 mb-1">Nenhum dado de equipe</h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                    Dados de performance aparecerão quando consultores enviarem mensagens pelo CRM.
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Julia IA Section */}
            {aiStats && overview && overview.total_messages > 0 && (
                <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
                            <Zap className="w-4 h-4 text-violet-600" />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-slate-800">Julia IA — Agente de Atendimento</h3>
                            <p className="text-xs text-slate-400">Automação de respostas via inteligência artificial</p>
                        </div>
                    </div>
                    <div className="p-6">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
                            <div className="text-center">
                                <p className="text-3xl font-bold tracking-tight text-violet-700">{aiStats.ai_ratio.toLocaleString('pt-BR')}%</p>
                                <p className="text-xs text-slate-500 mt-1">das respostas são da IA</p>
                            </div>
                            <div className="text-center">
                                <p className="text-3xl font-bold tracking-tight text-slate-800">{fmt(aiStats.total_ai_msgs)}</p>
                                <p className="text-xs text-slate-500 mt-1">mensagens enviadas pela IA</p>
                            </div>
                            <div className="text-center">
                                <p className="text-3xl font-bold tracking-tight text-slate-800">{fmt(aiStats.ai_conversations)}</p>
                                <p className="text-xs text-slate-500 mt-1">conversas atendidas pela IA</p>
                            </div>
                            <div className="text-center">
                                <p className="text-3xl font-bold tracking-tight text-slate-800">{fmt(aiStats.total_human_msgs)}</p>
                                <p className="text-xs text-slate-500 mt-1">mensagens enviadas por humanos</p>
                            </div>
                        </div>
                        {/* Proportion bar */}
                        <div>
                            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                                <span className="flex items-center gap-1.5 font-medium">
                                    <Bot className="w-3.5 h-3.5 text-violet-500" />
                                    Julia IA — {aiStats.ai_ratio.toLocaleString('pt-BR')}%
                                </span>
                                <span className="flex items-center gap-1.5 font-medium">
                                    Consultores — {(100 - aiStats.ai_ratio).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                                    <BarChart3 className="w-3.5 h-3.5 text-emerald-500" />
                                </span>
                            </div>
                            <div className="h-5 rounded-full bg-slate-100 overflow-hidden flex">
                                <div
                                    className="h-full bg-gradient-to-r from-violet-500 to-violet-400 transition-all duration-500"
                                    style={{ width: `${Math.max(aiStats.ai_ratio, 2)}%`, borderRadius: aiStats.ai_ratio >= 99 ? '9999px' : '9999px 0 0 9999px' }}
                                />
                                <div
                                    className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-500"
                                    style={{ width: `${Math.max(100 - aiStats.ai_ratio, 2)}%`, borderRadius: aiStats.ai_ratio <= 1 ? '9999px' : '0 9999px 9999px 0' }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Performance Table + Workload Pie */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Agent Table (2/3) */}
                <div className="lg:col-span-2 bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                            <Users className="w-4 h-4 text-indigo-600" />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-slate-800">Performance por Consultor</h3>
                            <p className="text-xs text-slate-400">Mensagens enviadas pelo CRM com atribuição ao consultor</p>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/50">
                                    <th className="text-left px-6 py-3 font-medium text-slate-500">Consultor</th>
                                    <th className="text-right px-4 py-3 font-medium text-slate-500">Msgs Enviadas</th>
                                    <th className="text-right px-4 py-3 font-medium text-slate-500">Conversas</th>
                                    <th className="text-right px-4 py-3 font-medium text-slate-500">1ª Resposta (média)</th>
                                    <th className="text-right px-6 py-3 font-medium text-slate-500">1ª Resposta (mediana)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* Julia IA row — using real FRT data */}
                                {aiStats && aiStats.total_ai_msgs > 0 && (
                                    <tr className="border-b border-violet-100 bg-violet-50/30">
                                        <td className="px-6 py-3">
                                            <div className="flex items-center gap-2">
                                                <Bot className="w-4 h-4 text-violet-500" />
                                                <span className="text-violet-700 font-semibold">Julia IA</span>
                                            </div>
                                        </td>
                                        <td className="text-right px-4 py-3 tabular-nums text-violet-600 font-semibold">{fmt(aiStats.total_ai_msgs)}</td>
                                        <td className="text-right px-4 py-3 tabular-nums text-violet-600">{fmt(aiStats.ai_conversations)}</td>
                                        <td className="text-right px-4 py-3 tabular-nums text-violet-500 text-xs">
                                            {aiFrt?.avg_minutes != null ? formatMinutes(aiFrt.avg_minutes) : '—'}
                                        </td>
                                        <td className="text-right px-6 py-3">
                                            <span className={cn(
                                                'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border',
                                                aiFrt?.median_minutes != null
                                                    ? frtBadgeColor(aiFrt.median_minutes)
                                                    : 'bg-green-50 text-green-700 border-green-200'
                                            )}>
                                                {aiFrt?.median_minutes != null ? formatMinutes(aiFrt.median_minutes) : '< 1 min'}
                                            </span>
                                        </td>
                                    </tr>
                                )}
                                {/* Human agents */}
                                {agentsList.map((agent) => (
                                    <tr key={agent.user_name} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => onNavigateToConversations?.()}>
                                        <td className="px-6 py-3 text-slate-700 font-medium">{agent.user_name}</td>
                                        <td className="text-right px-4 py-3 tabular-nums text-slate-600">{fmt(agent.messages_sent)}</td>
                                        <td className="text-right px-4 py-3 tabular-nums text-slate-600">{fmt(agent.conversations_handled)}</td>
                                        <td className="text-right px-4 py-3 text-slate-500 text-xs">
                                            {formatMinutes(agent.avg_response_minutes)}
                                        </td>
                                        <td className="text-right px-6 py-3">
                                            <span className={cn(
                                                'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border',
                                                frtBadgeColor(agent.median_response_minutes)
                                            )}>
                                                {formatMinutes(agent.median_response_minutes)}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {agentsList.length === 0 && !aiStats?.total_ai_msgs && (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-8 text-center text-sm text-slate-400">
                                            Nenhum consultor com mensagens atribuídas no período
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Workload Pie (1/3) */}
                <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100">
                        <h3 className="text-sm font-semibold text-slate-800">Distribuição de Trabalho</h3>
                        <p className="text-xs text-slate-400">
                            {totalOutbound > 0 ? `${fmt(totalOutbound)} msgs enviadas` : 'Mensagens enviadas por remetente'}
                        </p>
                    </div>
                    <div className="p-4">
                        {workloadData.length > 0 ? (
                            <>
                                <ResponsiveContainer width="100%" height={200}>
                                    <PieChart>
                                        <Pie
                                            data={workloadData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={40}
                                            outerRadius={75}
                                            paddingAngle={2}
                                            dataKey="value"
                                            cursor="pointer"
                                            onClick={() => onNavigateToConversations?.()}
                                        >
                                            {workloadData.map((_, i) => (
                                                <Cell key={i} fill={WORKLOAD_COLORS[i % WORKLOAD_COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                                            formatter={(value: number) => [fmt(value), 'mensagens']}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="space-y-2 mt-2">
                                    {workloadData.map((item, i) => {
                                        const pct = totalOutbound > 0 ? Math.round(item.value / totalOutbound * 100) : 0
                                        return (
                                            <div key={item.name} className="flex items-center gap-2.5 text-xs">
                                                <div
                                                    className="w-3 h-3 rounded-sm shrink-0"
                                                    style={{ backgroundColor: WORKLOAD_COLORS[i % WORKLOAD_COLORS.length] }}
                                                />
                                                <span className="text-slate-600 flex-1 truncate">{item.name}</span>
                                                <span className="text-slate-400 tabular-nums">{pct}%</span>
                                                <span className="text-slate-800 font-semibold tabular-nums">{fmt(item.value)}</span>
                                            </div>
                                        )
                                    })}
                                </div>
                            </>
                        ) : (
                            <div className="h-[200px] flex items-center justify-center text-sm text-slate-400">
                                Sem dados de distribuição
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
