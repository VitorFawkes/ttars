import {
    MessageCircle, Clock, AlertTriangle, Send,
} from 'lucide-react'
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
} from 'recharts'
import KpiCard from '../KpiCard'
import ChartCard from '../ChartCard'
import { useWhatsAppAnalytics } from '@/hooks/analytics/useWhatsAppAnalytics'

const AGING_LABELS: Record<string, string> = {
    lt_1h: '< 1h',
    h1_4: '1-4h',
    h4_24: '4-24h',
    gt_24h: '> 24h',
}

const AGING_COLORS: Record<string, string> = {
    lt_1h: '#22c55e',
    h1_4: '#eab308',
    h4_24: '#f97316',
    gt_24h: '#ef4444',
}

export default function WhatsAppView() {
    const { data: metrics, isLoading, error: whatsappError } = useWhatsAppAnalytics()

    const volume = metrics?.volume
    const daily = metrics?.daily || []
    const aging = metrics?.aging
    const responseTime = metrics?.response_time
    const perUser = metrics?.per_user || []

    const agingData = aging ? Object.entries(AGING_LABELS).map(([key, label]) => ({
        label,
        value: aging[key as keyof typeof aging] as number || 0,
        fill: AGING_COLORS[key],
    })) : []

    const msgsPerLead = volume && volume.active_conversations > 0
        ? Math.round(volume.total_msgs / volume.active_conversations * 10) / 10
        : 0

    return (
        <div className="space-y-6">
            {whatsappError && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700">
                    Erro ao carregar dados do WhatsApp. Verifique sua conexão e tente novamente.
                </div>
            )}

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard
                    title="Conversas Ativas"
                    value={volume?.active_conversations ?? 0}
                    icon={MessageCircle}
                    color="text-green-600"
                    bgColor="bg-green-50"
                    isLoading={isLoading}
                />
                <KpiCard
                    title="Sem Resposta"
                    value={aging?.total_unanswered ?? 0}
                    icon={AlertTriangle}
                    color="text-rose-600"
                    bgColor="bg-rose-50"
                    isLoading={isLoading}
                />
                <KpiCard
                    title="Tempo Médio Resp."
                    value={responseTime ? `${responseTime.avg_response_minutes} min` : '—'}
                    subtitle={responseTime ? `Mediana: ${responseTime.median_response_minutes} min` : undefined}
                    icon={Clock}
                    color="text-amber-600"
                    bgColor="bg-amber-50"
                    isLoading={isLoading}
                />
                <KpiCard
                    title="Msgs / Lead"
                    value={msgsPerLead}
                    subtitle={volume ? `${volume.inbound} in / ${volume.outbound} out` : undefined}
                    icon={Send}
                    color="text-blue-600"
                    bgColor="bg-blue-50"
                    isLoading={isLoading}
                />
            </div>

            {/* Volume de Mensagens */}
            <ChartCard
                title="Volume de Mensagens"
                description="Tendência de comunicação por dia"
                isLoading={isLoading}
            >
                {daily.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={daily} margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis
                                dataKey="dia"
                                tick={{ fontSize: 11, fill: '#64748b' }}
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={(v: string) => v.slice(5)}
                            />
                            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                            <Legend wrapperStyle={{ fontSize: '12px' }} />
                            <Area type="monotone" dataKey="inbound" name="Recebidas" stackId="1" fill="#6366f1" fillOpacity={0.4} stroke="#6366f1" />
                            <Area type="monotone" dataKey="outbound" name="Enviadas" stackId="1" fill="#22c55e" fillOpacity={0.4} stroke="#22c55e" />
                        </AreaChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-[300px] flex items-center justify-center text-sm text-slate-400">
                        Nenhum dado de mensagens no período
                    </div>
                )}
            </ChartCard>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Aging de Conversas */}
                <ChartCard
                    title="Aging de Conversas Sem Resposta"
                    description="Distribuição do tempo de espera"
                    isLoading={isLoading}
                >
                    {agingData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={agingData} margin={{ left: 10, right: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#334155' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                                <Bar dataKey="value" name="Conversas" radius={[4, 4, 0, 0]} barSize={40}>
                                    {agingData.map((entry, i) => (
                                        <Cell key={i} fill={entry.fill} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-[220px] flex items-center justify-center text-sm text-slate-400">
                            Sem dados de aging
                        </div>
                    )}
                </ChartCard>

                {/* Tempo Medio por Pessoa */}
                <ChartCard
                    title="Tempo Médio de Resposta por Pessoa"
                    description="Quem responde mais rápido?"
                    isLoading={isLoading}
                >
                    {perUser.length > 0 ? (
                        <ResponsiveContainer width="100%" height={Math.max(220, perUser.length * 35 + 40)}>
                            <BarChart
                                data={perUser}
                                layout="vertical"
                                margin={{ left: 10, right: 40 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                                <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                <YAxis
                                    dataKey="user_nome"
                                    type="category"
                                    width={120}
                                    tick={{ fontSize: 11, fill: '#334155' }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <Tooltip
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                                    formatter={(value: number) => [`${value} min`, 'Tempo médio']}
                                />
                                <Bar dataKey="avg_minutes" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={18} name="Tempo (min)" />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-[220px] flex items-center justify-center text-sm text-slate-400">
                            Sem dados de response time
                        </div>
                    )}
                </ChartCard>
            </div>
        </div>
    )
}
