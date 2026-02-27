import { useMemo } from 'react'
import {
    MessageCircle, AlertTriangle, Timer, Send, TrendingUp,
} from 'lucide-react'
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Legend, Cell, PieChart, Pie,
} from 'recharts'
import KpiCard from '../../KpiCard'
import ChartCard from '../../ChartCard'
import { QueryErrorState } from '@/components/ui/QueryErrorState'
import { useWhatsAppAnalytics } from '@/hooks/analytics/useWhatsAppAnalytics'
import type { WaBucket } from '@/hooks/analytics/useWhatsAppAnalytics'
import { useAnalyticsFilters } from '@/hooks/analytics/useAnalyticsFilters'
import { fmt, formatMinutes, formatPeriodLabel } from '@/utils/whatsappFormatters'

// ── Constants ──

const DOW_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const HOURS = Array.from({ length: 24 }, (_, i) => i)

const AGING_COLORS: Record<string, string> = {
    '< 1h': '#22c55e',
    '1-4h': '#eab308',
    '4-24h': '#f97316',
    '> 24h': '#ef4444',
}

const MSG_TYPE_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f97316', '#eab308', '#22c55e', '#06b6d4']
const MSG_TYPE_LABELS: Record<string, string> = {
    text: 'Texto',
    template: 'Template',
    image: 'Imagem',
    audio: 'Áudio',
    document: 'Documento',
    button_reply: 'Resposta Rápida',
    sticker: 'Sticker',
}

// ── Heatmap Component ──

function HeatmapChart({ data, onCellClick }: { data: Array<{ dow: number; hour: number; count: number }>; onCellClick?: () => void }) {
    const maxCount = useMemo(() => Math.max(...data.map(d => d.count), 1), [data])

    const grid = useMemo(() => {
        const map = new Map<string, number>()
        data.forEach(d => map.set(`${d.dow}-${d.hour}`, d.count))
        return map
    }, [data])

    return (
        <div className="overflow-x-auto px-4">
            <div className="min-w-[640px]">
                <div className="flex">
                    <div className="w-10 shrink-0" />
                    {HOURS.map(h => (
                        <div key={h} className="flex-1 text-center text-[10px] text-slate-400 pb-1">
                            {h}
                        </div>
                    ))}
                </div>
                {[1, 2, 3, 4, 5, 6, 0].map(dow => (
                    <div key={dow} className="flex items-center gap-0.5 mb-0.5">
                        <div className="w-10 shrink-0 text-[11px] text-slate-500 text-right pr-2 font-medium">
                            {DOW_LABELS[dow]}
                        </div>
                        {HOURS.map(hour => {
                            const count = grid.get(`${dow}-${hour}`) || 0
                            const intensity = count / maxCount
                            return (
                                <div
                                    key={hour}
                                    className={`flex-1 aspect-square rounded-[3px] transition-colors ${count > 0 ? 'cursor-pointer hover:ring-2 hover:ring-indigo-400 hover:ring-offset-1' : 'cursor-default'}`}
                                    style={{
                                        backgroundColor: count === 0
                                            ? '#f1f5f9'
                                            : `rgba(99, 102, 241, ${0.15 + intensity * 0.85})`,
                                    }}
                                    title={`${DOW_LABELS[dow]} ${hour}h — ${count} msgs recebidas`}
                                    onClick={() => { if (count > 0) onCellClick?.() }}
                                />
                            )
                        })}
                    </div>
                ))}
                <div className="flex items-center justify-end gap-1.5 mt-3 text-[10px] text-slate-400">
                    <span>Menos</span>
                    {[0.15, 0.35, 0.55, 0.75, 1].map((v, i) => (
                        <div
                            key={i}
                            className="w-3.5 h-3.5 rounded-[3px]"
                            style={{ backgroundColor: `rgba(99, 102, 241, ${v})` }}
                        />
                    ))}
                    <span>Mais</span>
                </div>
            </div>
        </div>
    )
}

// ── Props ──

interface OverviewTabProps {
    onNavigateToConversations?: (status?: 'waiting' | 'responded' | 'inactive' | null) => void
    onNavigateToSpeed?: () => void
}

// ── Main Tab ──

export default function WhatsAppOverviewTab({ onNavigateToConversations, onNavigateToSpeed }: OverviewTabProps) {
    const { data: metrics, isLoading, error: whatsappError, refetch } = useWhatsAppAnalytics()
    const { granularity } = useAnalyticsFilters()

    const overview = metrics?.overview
    const daily = metrics?.daily_volume || []
    const heatmap = metrics?.hourly_heatmap || []
    const aging = metrics?.aging

    const hasNoData = !isLoading && (!overview || overview.total_messages === 0)

    const msgTypes = metrics?.message_types
    const pieData = useMemo(() => {
        const types = msgTypes || []
        if (types.length === 0) return []
        return types.slice(0, 6).map(t => ({
            name: MSG_TYPE_LABELS[t.type] || t.type,
            value: t.count,
            pct: Math.round(t.count / types.reduce((s, x) => s + x.count, 0) * 100),
        }))
    }, [msgTypes])

    const agingGt24 = aging?.buckets.find(b => b.bucket === '> 24h')?.count ?? 0

    return (
        <div className="space-y-6">
            {whatsappError && (
                <QueryErrorState compact title="Erro ao carregar dados do WhatsApp" onRetry={() => refetch()} />
            )}

            {hasNoData && !whatsappError && (
                <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-8 text-center">
                    <MessageCircle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <h3 className="text-base font-semibold text-slate-700 mb-1">Nenhuma conversa registrada</h3>
                    <p className="text-sm text-slate-500 max-w-md mx-auto">
                        As métricas de WhatsApp serão populadas quando mensagens forem registradas no CRM.
                    </p>
                </div>
            )}

            {/* KPIs — clicáveis para drill-down */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard
                    title="Total de Mensagens"
                    value={fmt(overview?.total_messages ?? 0)}
                    subtitle={overview
                        ? `${fmt(overview.inbound)} recebidas · ${fmt(overview.outbound)} enviadas`
                        : undefined}
                    icon={Send}
                    color="text-blue-600"
                    bgColor="bg-blue-50"
                    isLoading={isLoading}
                    onClick={() => onNavigateToConversations?.()}
                    clickHint="Ver todas as conversas"
                />
                <KpiCard
                    title="Contatos Atendidos"
                    value={fmt(overview?.unique_contacts ?? 0)}
                    subtitle={overview
                        ? `${overview.avg_msgs_per_conversation.toLocaleString('pt-BR')} msgs/contato`
                        : undefined}
                    icon={MessageCircle}
                    color="text-green-600"
                    bgColor="bg-green-50"
                    isLoading={isLoading}
                    onClick={() => onNavigateToConversations?.()}
                    clickHint="Ver lista de conversas"
                />
                <KpiCard
                    title="Aguardando Resposta"
                    value={fmt(aging?.total_unanswered ?? 0)}
                    subtitle={agingGt24 > 0
                        ? `${fmt(agingGt24)} há mais de 24h`
                        : 'Tudo em dia'}
                    icon={AlertTriangle}
                    color={agingGt24 > 0 ? 'text-rose-600' : 'text-green-600'}
                    bgColor={agingGt24 > 0 ? 'bg-rose-50' : 'bg-green-50'}
                    isLoading={isLoading}
                    onClick={() => onNavigateToConversations?.('waiting')}
                    clickHint="Ver conversas aguardando"
                />
                <KpiCard
                    title="Primeira Resposta"
                    value={metrics?.first_response ? formatMinutes(metrics.first_response.median_minutes) : '—'}
                    subtitle={metrics?.first_response
                        ? `90% respondem em até ${formatMinutes(metrics.first_response.p90_minutes)}`
                        : undefined}
                    icon={Timer}
                    color="text-amber-600"
                    bgColor="bg-amber-50"
                    isLoading={isLoading}
                    onClick={() => onNavigateToSpeed?.()}
                    clickHint="Ver análise de velocidade"
                />
            </div>

            {/* Volume de Mensagens */}
            <ChartCard
                title="Volume de Mensagens"
                description={overview
                    ? `${fmt(overview.total_messages)} mensagens no período selecionado`
                    : 'Evolução por período'}
                isLoading={isLoading}
            >
                {daily.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={daily} margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis
                                dataKey="period"
                                tick={{ fontSize: 11, fill: '#64748b' }}
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={(v: string) => formatPeriodLabel(v, granularity)}
                            />
                            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                            <Tooltip
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                                labelFormatter={(v: string) => formatPeriodLabel(v, granularity)}
                                formatter={(value: number, name: string) => [fmt(value), name]}
                            />
                            <Legend wrapperStyle={{ fontSize: '12px' }} />
                            <Area type="monotone" dataKey="inbound" name="Recebidas (clientes)" stackId="1" fill="#6366f1" fillOpacity={0.4} stroke="#6366f1" activeDot={{ r: 5, cursor: 'pointer', onClick: () => onNavigateToConversations?.() }} />
                            <Area type="monotone" dataKey="ai" name="Enviadas pela IA" stackId="2" fill="#8b5cf6" fillOpacity={0.3} stroke="#8b5cf6" activeDot={{ r: 5, cursor: 'pointer', onClick: () => onNavigateToConversations?.() }} />
                            <Area type="monotone" dataKey="human" name="Enviadas por humanos" stackId="2" fill="#22c55e" fillOpacity={0.3} stroke="#22c55e" activeDot={{ r: 5, cursor: 'pointer', onClick: () => onNavigateToConversations?.() }} />
                        </AreaChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-[300px] flex items-center justify-center text-sm text-slate-400">
                        Nenhum dado de mensagens no período
                    </div>
                )}
            </ChartCard>

            {/* Heatmap + Aging */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard
                    title="Horários de Pico"
                    description="Quando seus clientes mais enviam mensagens (hora × dia da semana)"
                    isLoading={isLoading}
                >
                    {heatmap.length > 0 ? (
                        <HeatmapChart data={heatmap} onCellClick={() => onNavigateToConversations?.()} />
                    ) : (
                        <div className="h-[220px] flex items-center justify-center text-sm text-slate-400">
                            Sem dados de horários
                        </div>
                    )}
                </ChartCard>

                <ChartCard
                    title="Tipos de Mensagem"
                    description="Distribuição por formato de conteúdo"
                    isLoading={isLoading}
                >
                    {pieData.length > 0 ? (
                        <div className="flex items-center gap-4">
                            <ResponsiveContainer width="45%" height={220}>
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={45}
                                        outerRadius={78}
                                        paddingAngle={2}
                                        dataKey="value"
                                        cursor="pointer"
                                        onClick={() => onNavigateToConversations?.()}
                                    >
                                        {pieData.map((_, i) => (
                                            <Cell key={i} fill={MSG_TYPE_COLORS[i % MSG_TYPE_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                                        formatter={(value: number) => [fmt(value), 'mensagens']}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="flex-1 space-y-2.5">
                                {pieData.map((item, i) => (
                                    <div key={i} className="flex items-center gap-2.5 text-xs">
                                        <div
                                            className="w-3 h-3 rounded-sm shrink-0"
                                            style={{ backgroundColor: MSG_TYPE_COLORS[i % MSG_TYPE_COLORS.length] }}
                                        />
                                        <span className="text-slate-600 flex-1 truncate">{item.name}</span>
                                        <span className="text-slate-400 tabular-nums">{item.pct}%</span>
                                        <span className="text-slate-800 font-semibold tabular-nums w-14 text-right">{fmt(item.value)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="h-[220px] flex items-center justify-center text-sm text-slate-400">
                            Sem dados de tipos
                        </div>
                    )}
                </ChartCard>
            </div>

            {/* Aging */}
            {aging && aging.total_unanswered > 0 && (
                <ChartCard
                    title="Conversas Aguardando Resposta"
                    description={`${fmt(aging.total_unanswered)} conversas sem resposta agora (estado atual)`}
                    isLoading={isLoading}
                >
                    <div className="px-4">
                        <ResponsiveContainer width="100%" height={180}>
                            <BarChart data={aging.buckets} margin={{ left: 10, right: 30 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                <XAxis dataKey="bucket" tick={{ fontSize: 12, fill: '#334155' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                                    formatter={(value: number) => [fmt(value), 'conversas']}
                                />
                                <Bar dataKey="count" name="Conversas" radius={[4, 4, 0, 0]} barSize={48} cursor="pointer" onClick={() => onNavigateToConversations?.('waiting')}>
                                    {aging.buckets.map((entry: WaBucket, i: number) => (
                                        <Cell key={i} fill={AGING_COLORS[entry.bucket] || '#94a3b8'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                        {agingGt24 > 0 && (
                            <p className="text-xs text-rose-500 font-medium mt-1">
                                {fmt(agingGt24)} conversas aguardando há mais de 24 horas
                            </p>
                        )}
                    </div>
                </ChartCard>
            )}

            {/* Resumo */}
            {overview && overview.unique_cards > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-6 py-4 flex items-center gap-3 text-sm text-slate-600">
                    <TrendingUp className="w-5 h-5 text-indigo-500 shrink-0" />
                    <p>
                        <span className="font-semibold text-slate-800">{fmt(overview.unique_cards)}</span> cards do CRM
                        vinculados a conversas · <span className="font-semibold text-slate-800">{fmt(overview.media_messages)}</span> mensagens com mídia
                    </p>
                </div>
            )}
        </div>
    )
}
