import { useMemo } from 'react'
import {
    Zap, Bot, User,
} from 'lucide-react'
import {
    LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'
import ChartCard from '../../ChartCard'
import { QueryErrorState } from '@/components/ui/QueryErrorState'
import { useWhatsAppSpeed, type WaSpeedBucket } from '@/hooks/analytics/useWhatsAppSpeed'
import { useAnalyticsFilters } from '@/hooks/analytics/useAnalyticsFilters'
import { cn } from '@/lib/utils'
import { fmt, formatMinutes, formatPeriodLabel } from '@/utils/whatsappFormatters'

// ── Constants ──

const DIST_COLORS: Record<string, string> = {
    '< 1min': '#22c55e',
    '1-5min': '#84cc16',
    '5-15min': '#eab308',
    '15-60min': '#f97316',
    '1-4h': '#ef4444',
    '> 4h': '#991b1b',
}

// ── Props ──

interface SpeedTabProps {
    onNavigateToConversations?: (status?: 'waiting' | 'responded' | 'inactive' | null) => void
}

// ── Main Tab ──

export default function WhatsAppSpeedTab({ onNavigateToConversations }: SpeedTabProps) {
    const { data: metrics, isLoading, error, refetch } = useWhatsAppSpeed()
    const { granularity } = useAnalyticsFilters()

    const sla = metrics?.sla_compliance
    const byType = metrics?.frt_by_type
    const distribution = metrics?.frt_distribution || []

    // Keep original values for tooltip, clamped for chart axis
    const trendData = useMemo(() => {
        const data = metrics?.frt_trend || []
        return data.map(t => ({
            ...t,
            median_clamped: Math.min(t.median_minutes, 480),
        }))
    }, [metrics?.frt_trend])

    const byHourData = useMemo(() => {
        const data = metrics?.frt_by_hour || []
        return data.map(h => ({
            ...h,
            median_clamped: Math.min(h.median_minutes, 120),
        }))
    }, [metrics?.frt_by_hour])

    const hasNoData = !isLoading && (!sla || sla.total_responses === 0)

    return (
        <div className="space-y-6">
            {/* Error State */}
            {error && (
                <QueryErrorState compact title="Erro ao carregar métricas de velocidade" onRetry={() => refetch()} />
            )}

            {/* Empty State */}
            {hasNoData && !error && (
                <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-8 text-center">
                    <Zap className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <h3 className="text-base font-semibold text-slate-700 mb-1">Nenhuma resposta analisada</h3>
                    <p className="text-sm text-slate-500 max-w-md mx-auto">
                        Métricas de velocidade serão exibidas quando houver respostas a mensagens de clientes no período.
                    </p>
                </div>
            )}

            {/* SLA Compliance KPIs */}
            {sla && sla.total_responses > 0 && (
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Zap className="w-4 h-4 text-amber-500" />
                        <h3 className="text-sm font-semibold text-slate-700">Cumprimento de SLA</h3>
                        <span className="text-xs text-slate-400">
                            ({fmt(sla.total_responses)} respostas analisadas)
                        </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mb-3 ml-6">
                        Valores cumulativos — "{'<'} 5 min" inclui todas as respostas em até 5 minutos
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <SlaCard label="< 1 min" pct={sla.pct_under_1min} count={sla.under_1min} total={sla.total_responses} isLoading={isLoading} />
                        <SlaCard label="< 5 min" pct={sla.pct_under_5min} count={sla.under_5min} total={sla.total_responses} isLoading={isLoading} />
                        <SlaCard label="< 15 min" pct={sla.pct_under_15min} count={sla.under_15min} total={sla.total_responses} isLoading={isLoading} />
                        <SlaCard label="< 30 min" pct={sla.pct_under_30min} count={sla.under_30min} total={sla.total_responses} isLoading={isLoading} />
                        <SlaCard label="< 1 hora" pct={sla.pct_under_1hour} count={sla.under_1hour} total={sla.total_responses} isLoading={isLoading} />
                    </div>
                </div>
            )}

            {/* FRT Trend */}
            <ChartCard
                title="Evolução da Velocidade de Resposta"
                description="Mediana do tempo de primeira resposta ao longo do tempo"
                isLoading={isLoading}
            >
                {trendData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                        <LineChart data={trendData} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis
                                dataKey="period"
                                tick={{ fontSize: 11, fill: '#64748b' }}
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={(v: string) => formatPeriodLabel(v, granularity)}
                            />
                            <YAxis
                                tick={{ fontSize: 11, fill: '#64748b' }}
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={(v: number) => v < 60 ? `${v}min` : `${Math.round(v / 60)}h`}
                            />
                            <Tooltip
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                                labelFormatter={(v: string) => formatPeriodLabel(v, granularity)}
                                formatter={(_value: number, _name: string, props: { payload?: { median_minutes?: number } }) => {
                                    const real = props.payload?.median_minutes ?? _value
                                    return [formatMinutes(real), 'Mediana']
                                }}
                            />
                            <ReferenceLine y={15} stroke="#f59e0b" strokeDasharray="5 5" label={{ value: 'Meta 15min', position: 'right', fontSize: 10, fill: '#f59e0b' }} />
                            <Line
                                type="monotone"
                                dataKey="median_clamped"
                                name="Mediana FRT"
                                stroke="#6366f1"
                                strokeWidth={2.5}
                                dot={{ r: 3, fill: '#6366f1' }}
                                activeDot={{ r: 5, cursor: 'pointer', onClick: () => onNavigateToConversations?.() }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-[280px] flex items-center justify-center text-sm text-slate-400">
                        Sem dados de tendência
                    </div>
                )}
            </ChartCard>

            {/* FRT by Hour + Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard
                    title="Velocidade por Hora do Dia"
                    description="Em quais horários demoramos mais para responder?"
                    isLoading={isLoading}
                >
                    {byHourData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={byHourData} margin={{ left: 10, right: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                <XAxis
                                    dataKey="hour"
                                    tick={{ fontSize: 10, fill: '#64748b' }}
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={(h: number) => `${h}h`}
                                />
                                <YAxis
                                    tick={{ fontSize: 10, fill: '#64748b' }}
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={(v: number) => v < 60 ? `${v}m` : `${Math.round(v / 60)}h`}
                                />
                                <Tooltip
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                                    formatter={(_value: number, _name: string, props: { payload?: { median_minutes?: number } }) => {
                                        const real = props.payload?.median_minutes ?? _value
                                        return [formatMinutes(real), 'Mediana FRT']
                                    }}
                                    labelFormatter={(h: number) => `${h}:00 — ${h}:59`}
                                />
                                <ReferenceLine y={15} stroke="#f59e0b" strokeDasharray="4 4" />
                                <Bar dataKey="median_clamped" name="Mediana" radius={[3, 3, 0, 0]} barSize={14} cursor="pointer" onClick={() => onNavigateToConversations?.()}>
                                    {byHourData.map((entry, i) => (
                                        <Cell
                                            key={i}
                                            fill={entry.median_minutes <= 15 ? '#22c55e' : entry.median_minutes <= 60 ? '#f59e0b' : '#ef4444'}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-[240px] flex items-center justify-center text-sm text-slate-400">
                            Sem dados por hora
                        </div>
                    )}
                </ChartCard>

                <ChartCard
                    title="Distribuição de Tempo de Resposta"
                    description="Quantas respostas em cada faixa de tempo"
                    isLoading={isLoading}
                >
                    {distribution.length > 0 ? (
                        <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={distribution} margin={{ left: 10, right: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: '#334155' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                                    formatter={(value: number) => [fmt(value), 'respostas']}
                                />
                                <Bar dataKey="count" name="Respostas" radius={[4, 4, 0, 0]} barSize={36} cursor="pointer" onClick={() => onNavigateToConversations?.()}>
                                    {distribution.map((entry: WaSpeedBucket, i: number) => (
                                        <Cell key={i} fill={DIST_COLORS[entry.bucket] || '#6366f1'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-[240px] flex items-center justify-center text-sm text-slate-400">
                            Sem dados de distribuição
                        </div>
                    )}
                </ChartCard>
            </div>

            {/* FRT by Type (AI vs Human) with Visual Comparison */}
            {byType && (
                <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100">
                        <h3 className="text-sm font-semibold text-slate-800">Velocidade: IA vs Consultores</h3>
                        <p className="text-xs text-slate-400">Comparação direta do tempo de primeira resposta</p>
                    </div>
                    <div className="p-6">
                        {/* Visual Comparison Bar */}
                        {(byType.ai.median_minutes != null || byType.human.median_minutes != null) && (
                            <div className="mb-8">
                                <ComparisonBar
                                    label="Mediana"
                                    aiValue={byType.ai.median_minutes}
                                    humanValue={byType.human.median_minutes}
                                />
                                <ComparisonBar
                                    label="Média"
                                    aiValue={byType.ai.avg_minutes}
                                    humanValue={byType.human.avg_minutes}
                                />
                                <ComparisonBar
                                    label="90% até"
                                    aiValue={byType.ai.p90_minutes}
                                    humanValue={byType.human.p90_minutes}
                                />
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-8">
                            {/* AI Column */}
                            <div>
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
                                        <Bot className="w-4 h-4 text-violet-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-slate-800">Julia IA</p>
                                        <p className="text-xs text-slate-400">{fmt(byType.ai.count ?? 0)} respostas</p>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <MetricRow label="Mediana" value={formatMinutes(byType.ai.median_minutes)} highlight />
                                    <MetricRow label="Média" value={formatMinutes(byType.ai.avg_minutes)} />
                                    <MetricRow label="90% até" value={formatMinutes(byType.ai.p90_minutes)} />
                                </div>
                            </div>
                            {/* Human Column */}
                            <div>
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                                        <User className="w-4 h-4 text-emerald-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-slate-800">Consultores</p>
                                        <p className="text-xs text-slate-400">{fmt(byType.human.count ?? 0)} respostas</p>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <MetricRow label="Mediana" value={formatMinutes(byType.human.median_minutes)} highlight />
                                    <MetricRow label="Média" value={formatMinutes(byType.human.avg_minutes)} />
                                    <MetricRow label="90% até" value={formatMinutes(byType.human.p90_minutes)} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ── SLA Card ──

function SlaCard({ label, pct, count, total, isLoading }: { label: string; pct: number; count: number; total: number; isLoading: boolean }) {
    const color = pct >= 80 ? 'text-green-700' : pct >= 60 ? 'text-amber-700' : 'text-rose-700'
    const bg = pct >= 80 ? 'bg-green-50 border-green-200' : pct >= 60 ? 'bg-amber-50 border-amber-200' : 'bg-rose-50 border-rose-200'

    if (isLoading) {
        return <div className="h-20 bg-white border border-slate-200 rounded-xl animate-pulse" />
    }

    return (
        <div className={cn('rounded-xl border p-4 text-center', bg)}>
            <p className={cn('text-2xl font-bold tracking-tight', color)}>{pct.toLocaleString('pt-BR')}%</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{label}</p>
            <p className="text-[10px] text-slate-400">{fmt(count)} de {fmt(total)}</p>
        </div>
    )
}

// ── Metric Row ──

function MetricRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">{label}</span>
            <span className={cn(
                'text-sm tabular-nums',
                highlight ? 'font-bold text-slate-900' : 'font-medium text-slate-600'
            )}>
                {value}
            </span>
        </div>
    )
}

// ── Comparison Bar ──

function ComparisonBar({ label, aiValue, humanValue }: { label: string; aiValue: number | null; humanValue: number | null }) {
    const ai = aiValue ?? 0
    const human = humanValue ?? 0
    const maxVal = Math.max(ai, human, 1)

    return (
        <div className="mb-4 last:mb-0">
            <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-slate-500 font-medium">{label}</span>
                <div className="flex items-center gap-4 text-xs">
                    <span className="text-violet-600 font-semibold tabular-nums">{formatMinutes(aiValue)}</span>
                    <span className="text-emerald-600 font-semibold tabular-nums">{formatMinutes(humanValue)}</span>
                </div>
            </div>
            <div className="space-y-1">
                <div className="flex items-center gap-2">
                    <Bot className="w-3 h-3 text-violet-500 shrink-0" />
                    <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-violet-500 to-violet-400 rounded-full transition-all duration-500"
                            style={{ width: `${Math.max((ai / maxVal) * 100, 2)}%` }}
                        />
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <User className="w-3 h-3 text-emerald-500 shrink-0" />
                    <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all duration-500"
                            style={{ width: `${Math.max((human / maxVal) * 100, 2)}%` }}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}
