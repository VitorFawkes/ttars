import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
    Timer, Clock, AlertTriangle, TrendingUp, Info,
} from 'lucide-react'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts'
import KpiCard from '../KpiCard'
import ChartCard from '../ChartCard'
import { useSLAViolations, useSLASummary } from '@/hooks/analytics/useSLAData'
import { usePipelineStages } from '@/hooks/usePipelineStages'
import { useAnalyticsFilters } from '@/hooks/analytics/useAnalyticsFilters'
import { useProducts } from '@/hooks/useProducts'
import { useDrillDownStore } from '@/hooks/analytics/useAnalyticsDrillDown'
import { QueryErrorState } from '@/components/ui/QueryErrorState'
import { cn } from '@/lib/utils'

function formatHours(h: number): string {
    if (h < 24) return `${Math.round(h)}h`
    const days = Math.round(h / 24 * 10) / 10
    return `${days}d`
}

export default function SLAView() {
    const { data: violations, isLoading: violationsLoading, error: violationsError, refetch: refetchViolations } = useSLAViolations()
    const { data: summary, isLoading: summaryLoading, error: summaryError, refetch: refetchSummary } = useSLASummary()

    const { product } = useAnalyticsFilters()
    const { products } = useProducts()
    const pipelineId = products.find(p => p.slug === product)?.pipeline_id ?? undefined
    const { data: pipelineStagesData } = usePipelineStages(pipelineId)
    const drillDown = useDrillDownStore()

    const hasError = !!(violationsError || summaryError)
    const handleRetry = () => { refetchViolations(); refetchSummary() }

    const [showAllViolations, setShowAllViolations] = useState(false)

    // Map stage_nome → stage_id for drill-down (SLA RPCs don't return stage_id)
    const stageIdByName = useMemo(() => {
        const map = new Map<string, string>()
        for (const s of (pipelineStagesData || [])) {
            map.set(s.nome, s.id)
        }
        return map
    }, [pipelineStagesData])

    // ALL stages with active cards (for velocity chart)
    const allStagesWithCards = useMemo(() =>
        (summary || []).filter(s => s.total_cards > 0),
    [summary])

    // SLA-specific data
    const stagesWithSLA = useMemo(() =>
        (summary || []).filter(s => s.sla_hours > 0),
    [summary])
    const hasSLAConfig = stagesWithSLA.length > 0

    const totalCards = allStagesWithCards.reduce((sum, s) => sum + s.total_cards, 0)
    const totalViolating = (violations || []).length

    // Velocity KPIs (always useful)
    const avgHoursOverall = totalCards > 0
        ? Math.round(allStagesWithCards.reduce((sum, s) => sum + s.avg_hours_in_stage * s.total_cards, 0) / totalCards)
        : 0

    // Top 3 slowest stages
    const slowestStages = useMemo(() =>
        [...allStagesWithCards]
            .sort((a, b) => b.avg_hours_in_stage - a.avg_hours_in_stage)
            .slice(0, 3),
    [allStagesWithCards])

    // SLA compliance (if configured)
    const totalWithSLA = stagesWithSLA.reduce((sum, s) => sum + s.total_cards, 0)
    const totalCompliant = stagesWithSLA.reduce((sum, s) => sum + s.compliant_cards, 0)
    const overallCompliance = totalWithSLA > 0
        ? Math.round(totalCompliant / totalWithSLA * 100 * 10) / 10
        : 0

    return (
        <div className="space-y-6">
            {hasError && (
                <QueryErrorState compact title="Erro ao carregar dados de SLA" onRetry={handleRetry} />
            )}

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard
                    title="Cards Ativos"
                    value={totalCards}
                    icon={Timer}
                    color="text-blue-600"
                    bgColor="bg-blue-50"
                    isLoading={summaryLoading}
                    onClick={() => drillDown.open({ label: 'Cards Ativos no Pipeline', drillStatus: 'aberto', drillSource: 'current_stage' })}
                    clickHint="Ver cards"
                />
                <KpiCard
                    title="Tempo Médio na Etapa"
                    value={formatHours(avgHoursOverall)}
                    icon={Clock}
                    color="text-indigo-600"
                    bgColor="bg-indigo-50"
                    isLoading={summaryLoading}
                />
                {hasSLAConfig ? (
                    <>
                        <KpiCard
                            title="% Dentro do SLA"
                            value={`${overallCompliance}%`}
                            icon={TrendingUp}
                            color={overallCompliance >= 80 ? 'text-green-600' : 'text-amber-600'}
                            bgColor={overallCompliance >= 80 ? 'bg-green-50' : 'bg-amber-50'}
                            isLoading={summaryLoading}
                        />
                        <KpiCard
                            title="Em Violação"
                            value={totalViolating}
                            icon={AlertTriangle}
                            color="text-rose-600"
                            bgColor="bg-rose-50"
                            isLoading={violationsLoading}
                        />
                    </>
                ) : (
                    <>
                        <KpiCard
                            title="Etapa Mais Lenta"
                            value={slowestStages[0] ? formatHours(slowestStages[0].avg_hours_in_stage) : '—'}
                            subtitle={slowestStages[0]?.stage_nome}
                            icon={AlertTriangle}
                            color="text-amber-600"
                            bgColor="bg-amber-50"
                            isLoading={summaryLoading}
                        />
                        <KpiCard
                            title="Etapas Ativas"
                            value={allStagesWithCards.length}
                            icon={TrendingUp}
                            color="text-slate-700"
                            bgColor="bg-slate-100"
                            isLoading={summaryLoading}
                        />
                    </>
                )}
            </div>

            {/* SLA not configured notice */}
            {!summaryLoading && !hasSLAConfig && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <Info className="w-4 h-4 text-amber-500 shrink-0" />
                    <p className="text-xs text-amber-700">
                        Nenhuma etapa possui SLA configurado. Configure no <strong>Pipeline Studio</strong> para monitorar compliance.
                        Os dados abaixo mostram a velocidade atual do pipeline.
                    </p>
                </div>
            )}

            {/* Top 3 Slowest Stages */}
            {(summaryLoading || slowestStages.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {summaryLoading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 h-24 animate-pulse" />
                        ))
                    ) : (
                        slowestStages.map((stage, i) => {
                            const severity = i === 0 ? 'high' : i === 1 ? 'medium' : 'warning'
                            const colors = {
                                high: 'text-rose-600',
                                medium: 'text-amber-600',
                                warning: 'text-orange-600',
                            }[severity]
                            const iconColors = {
                                high: 'text-rose-500',
                                medium: 'text-amber-500',
                                warning: 'text-orange-500',
                            }[severity]

                            return (
                                <div key={stage.stage_nome} className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 text-left cursor-pointer hover:border-indigo-300 hover:shadow-md transition-all" onClick={() => { const sid = stageIdByName.get(stage.stage_nome); if (sid) drillDown.open({ label: `Etapa lenta: ${stage.stage_nome}`, drillStageId: sid, drillSource: 'current_stage' }) }}>
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <Clock className={cn('w-4 h-4', iconColors)} />
                                                <p className="text-sm font-medium text-slate-700">{stage.stage_nome}</p>
                                            </div>
                                            <p className="text-xs text-slate-400">
                                                {stage.total_cards} cards &middot; {stage.sla_hours > 0 ? `SLA: ${stage.sla_hours}h` : 'Sem SLA'}
                                            </p>
                                        </div>
                                        <p className={cn('text-2xl font-bold', colors)}>
                                            {formatHours(stage.avg_hours_in_stage)}
                                        </p>
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>
            )}

            {/* Velocity by Stage Chart — ALL stages with cards */}
            <ChartCard
                title="Tempo Médio por Etapa"
                description={hasSLAConfig ? 'Horas na etapa vs SLA configurado' : 'Horas médias que cards passam em cada etapa'}
                isLoading={summaryLoading}
            >
                {allStagesWithCards.length > 0 ? (
                    <>
                        <ResponsiveContainer width="100%" height={Math.max(280, allStagesWithCards.length * 48 + 60)}>
                            <BarChart
                                data={allStagesWithCards.map(s => ({
                                    name: s.stage_nome,
                                    horas: Math.round(s.avg_hours_in_stage),
                                    sla: s.sla_hours > 0 ? s.sla_hours : undefined,
                                    cards: s.total_cards,
                                    excede: s.sla_hours > 0 && Math.round(s.avg_hours_in_stage) > s.sla_hours,
                                }))}
                                layout="vertical"
                                margin={{ left: 10, right: 60 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                                <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} label={{ value: 'Horas', position: 'insideBottom', offset: -5, fontSize: 11, fill: '#94a3b8' }} />
                                <YAxis
                                    dataKey="name"
                                    type="category"
                                    width={180}
                                    tick={{ fontSize: 10, fill: '#334155' }}
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={(v: string) => v.length > 24 ? v.slice(0, 23) + '…' : v}
                                />
                                <Tooltip
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    formatter={(value: number, name: string, entry: any) => {
                                        if (name === 'Tempo médio') {
                                            const cards = entry?.payload?.cards
                                            return [`${value}h (${formatHours(value)}) — ${cards ?? 0} cards`, name]
                                        }
                                        return [`${value}h`, name]
                                    }}
                                />
                                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                <Bar dataKey="horas" name="Tempo médio" radius={[0, 4, 4, 0]} barSize={14} cursor="pointer" onClick={(data: any) => { const name = data?.payload?.name || data?.name; const sid = name ? stageIdByName.get(name) : undefined; if (sid) drillDown.open({ label: name, drillStageId: sid, drillSource: 'current_stage' }) }}>
                                    <LabelList
                                        dataKey="horas"
                                        position="right"
                                        fontSize={10}
                                        fill="#64748b"
                                        offset={6}
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        formatter={(v: any) => formatHours(Number(v))}
                                    />
                                    {allStagesWithCards.map((s, i) => (
                                        <Cell
                                            key={i}
                                            fill={s.sla_hours > 0 && Math.round(s.avg_hours_in_stage) > s.sla_hours ? '#f43f5e' : '#6366f1'}
                                        />
                                    ))}
                                </Bar>
                                {hasSLAConfig && (
                                    <Bar dataKey="sla" name="SLA target" fill="#94a3b8" radius={[0, 4, 4, 0]} barSize={14} fillOpacity={0.4} />
                                )}
                            </BarChart>
                        </ResponsiveContainer>
                        <div className="flex items-center gap-4 px-2 text-xs text-slate-500">
                            <span className="flex items-center gap-1.5">
                                <span className="w-3 h-3 rounded-sm bg-[#6366f1]" /> Tempo médio
                            </span>
                            {hasSLAConfig && (
                                <>
                                    <span className="flex items-center gap-1.5">
                                        <span className="w-3 h-3 rounded-sm bg-[#f43f5e]" /> Excede SLA
                                    </span>
                                    <span className="flex items-center gap-1.5">
                                        <span className="w-3 h-3 rounded-sm bg-[#94a3b8] opacity-40" /> Target SLA
                                    </span>
                                </>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="h-[250px] flex items-center justify-center text-sm text-slate-400">
                        Nenhum card ativo nas etapas
                    </div>
                )}
            </ChartCard>

            {/* Detailed Stage Table */}
            <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                    <Timer className="w-4 h-4 text-indigo-500" />
                    <h3 className="text-sm font-semibold text-slate-800">Detalhes por Etapa</h3>
                    {!summaryLoading && (
                        <span className="ml-auto text-xs text-slate-400">{allStagesWithCards.length} etapas com cards</span>
                    )}
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/50">
                                <th className="text-left px-6 py-3 font-medium text-slate-500">Etapa</th>
                                <th className="text-right px-4 py-3 font-medium text-slate-500">Cards</th>
                                <th className="text-right px-4 py-3 font-medium text-slate-500">Tempo Médio</th>
                                {hasSLAConfig && (
                                    <>
                                        <th className="text-right px-4 py-3 font-medium text-slate-500">SLA</th>
                                        <th className="text-right px-6 py-3 font-medium text-slate-500">Status</th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {summaryLoading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="border-b border-slate-50">
                                        <td colSpan={hasSLAConfig ? 5 : 3} className="px-6 py-4">
                                            <div className="h-4 bg-slate-100 rounded animate-pulse" />
                                        </td>
                                    </tr>
                                ))
                            ) : allStagesWithCards.length === 0 ? (
                                <tr>
                                    <td colSpan={hasSLAConfig ? 5 : 3} className="px-6 py-8 text-center text-slate-400">
                                        Nenhum card ativo nas etapas
                                    </td>
                                </tr>
                            ) : (
                                allStagesWithCards.map((s) => {
                                    const exceeds = s.sla_hours > 0 && Math.round(s.avg_hours_in_stage) > s.sla_hours
                                    return (
                                        <tr key={s.stage_nome} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => { const sid = stageIdByName.get(s.stage_nome); if (sid) drillDown.open({ label: s.stage_nome, drillStageId: sid, drillSource: 'current_stage' }) }}>
                                            <td className="px-6 py-3 font-medium text-slate-800">{s.stage_nome}</td>
                                            <td className="text-right px-4 py-3 text-slate-600">{s.total_cards}</td>
                                            <td className="text-right px-4 py-3">
                                                <span className={cn(
                                                    'font-medium',
                                                    s.avg_hours_in_stage > 336 ? 'text-rose-600' : s.avg_hours_in_stage > 168 ? 'text-amber-600' : 'text-slate-600'
                                                )}>
                                                    {formatHours(s.avg_hours_in_stage)}
                                                </span>
                                            </td>
                                            {hasSLAConfig && (
                                                <>
                                                    <td className="text-right px-4 py-3 text-slate-500">
                                                        {s.sla_hours > 0 ? `${s.sla_hours}h` : '—'}
                                                    </td>
                                                    <td className="text-right px-6 py-3">
                                                        {s.sla_hours > 0 ? (
                                                            exceeds
                                                                ? <span className="text-rose-600 font-medium text-xs bg-rose-50 px-2 py-1 rounded">Excede</span>
                                                                : <span className="text-green-600 font-medium text-xs bg-green-50 px-2 py-1 rounded">OK</span>
                                                        ) : (
                                                            <span className="text-slate-300">—</span>
                                                        )}
                                                    </td>
                                                </>
                                            )}
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* SLA Violations Table (only when SLA is configured and violations exist) */}
            {hasSLAConfig && (
                <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-500" />
                        <h3 className="text-sm font-semibold text-slate-800">Cards em Violação de SLA</h3>
                        {!violationsLoading && (
                            <span className="ml-auto text-xs text-slate-400">{(violations || []).length} cards</span>
                        )}
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/50">
                                    <th className="text-left px-6 py-3 font-medium text-slate-500">Card</th>
                                    <th className="text-left px-4 py-3 font-medium text-slate-500">Etapa</th>
                                    <th className="text-left px-4 py-3 font-medium text-slate-500">Responsável</th>
                                    <th className="text-right px-4 py-3 font-medium text-slate-500">Dias Parado</th>
                                    <th className="text-right px-4 py-3 font-medium text-slate-500">SLA (h)</th>
                                    <th className="text-right px-6 py-3 font-medium text-slate-500">Excedido (h)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {violationsLoading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <tr key={i} className="border-b border-slate-50">
                                            <td colSpan={6} className="px-6 py-4">
                                                <div className="h-4 bg-slate-100 rounded animate-pulse" />
                                            </td>
                                        </tr>
                                    ))
                                ) : (violations || []).length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                                            Nenhum card em violação de SLA
                                        </td>
                                    </tr>
                                ) : (
                                    (showAllViolations ? (violations || []) : (violations || []).slice(0, 20)).map((v) => (
                                        <tr key={v.card_id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                            <td className="px-6 py-3 font-medium max-w-[200px] truncate">
                                                <Link to={`/cards/${v.card_id}`} className="text-indigo-600 hover:text-indigo-800 hover:underline">{v.titulo}</Link>
                                            </td>
                                            <td className="px-4 py-3 text-slate-600">{v.stage_nome}</td>
                                            <td className="px-4 py-3 text-slate-600">{v.owner_nome || '—'}</td>
                                            <td className="text-right px-4 py-3">
                                                <span className={cn(
                                                    'font-medium',
                                                    v.dias_na_etapa > 7 ? 'text-rose-600' : v.dias_na_etapa > 3 ? 'text-amber-600' : 'text-slate-600'
                                                )}>
                                                    {v.dias_na_etapa}
                                                </span>
                                            </td>
                                            <td className="text-right px-4 py-3 text-slate-500">{v.sla_hours}</td>
                                            <td className="text-right px-6 py-3">
                                                <span className="text-rose-600 font-medium">+{Math.round(v.sla_exceeded_hours)}h</span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    {(violations || []).length > 20 && !showAllViolations && (
                        <div className="px-6 py-3 border-t border-slate-100 text-center">
                            <button onClick={() => setShowAllViolations(true)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                                Ver todos ({(violations || []).length} cards)
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
