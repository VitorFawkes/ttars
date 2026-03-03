import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    Briefcase,
    DollarSign,
    Clock,
    AlertTriangle,
    ReceiptText,
} from 'lucide-react'
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    Cell,
} from 'recharts'
import KpiCard from '../KpiCard'
import ChartCard from '../ChartCard'
import { QueryErrorState } from '@/components/ui/QueryErrorState'
import { usePipelineCurrent, type PipelineCurrentAging } from '@/hooks/analytics/usePipelineCurrent'
import { useDrillDownStore } from '@/hooks/analytics/useAnalyticsDrillDown'
import { useAnalyticsFilters } from '@/hooks/analytics/useAnalyticsFilters'
import { formatCurrency } from '@/utils/whatsappFormatters'
import { cn } from '@/lib/utils'

const PHASE_COLORS: Record<string, string> = {
    sdr: '#3b82f6',
    planner: '#8b5cf6',
    'pos-venda': '#10b981',
}

const PHASE_LABELS: Record<string, string> = {
    sdr: 'SDR',
    planner: 'Planner',
    'pos-venda': 'Pós-venda',
}

function getPhaseColor(slug: string): string {
    return PHASE_COLORS[slug] || '#94a3b8'
}

const LABEL_MAX = 18
function truncateLabel(label: string): string {
    return label.length > LABEL_MAX ? label.slice(0, LABEL_MAX - 1) + '…' : label
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RotatedXTick(props: any) {
    const { x, y, payload } = props
    if (!payload?.value) return null
    const full: string = payload.value
    const label = truncateLabel(full)
    return (
        <g transform={`translate(${x},${y})`}>
            <title>{full}</title>
            <text x={0} y={0} dy={8} textAnchor="end" fill="#475569" fontSize={10} transform="rotate(-45)">
                {label}
            </text>
        </g>
    )
}

function agingCellColor(count: number): string {
    if (count === 0) return 'bg-slate-50 text-slate-300'
    if (count <= 2) return 'bg-green-50 text-green-700'
    if (count <= 5) return 'bg-amber-50 text-amber-700'
    return 'bg-rose-50 text-rose-700'
}

export default function PipelineCurrentView() {
    const navigate = useNavigate()
    const drillDown = useDrillDownStore()
    const { setActiveView, setDatePreset } = useAnalyticsFilters()

    const { data, isLoading, error, refetch } = usePipelineCurrent()

    // Hide date pickers for this snapshot view
    useEffect(() => {
        const prevPreset = useAnalyticsFilters.getState().datePreset
        setActiveView('pipeline')
        setDatePreset('all_time')
        return () => {
            setActiveView('overview')
            setDatePreset(prevPreset)
        }
    }, [setActiveView, setDatePreset])

    const kpis = data?.kpis || {
        total_open: 0, total_value: 0, avg_ticket: 0,
        avg_age_days: 0, sla_breach_count: 0, sla_breach_pct: 0,
    }
    const stages = data?.stages || []
    const aging = data?.aging || []
    const owners = data?.owners || []
    const topDeals = data?.top_deals || []

    // Build display labels: append " (W)" when same stage_nome exists in multiple products
    const stageDisplayNames = useMemo(() => {
        const nameCount = new Map<string, number>()
        for (const s of stages) {
            nameCount.set(s.stage_nome, (nameCount.get(s.stage_nome) || 0) + 1)
        }
        const map = new Map<string, string>()
        for (const s of stages) {
            const isDupe = (nameCount.get(s.stage_nome) || 0) > 1
            const suffix = isDupe && s.produto === 'WEDDING' ? ' (W)' : isDupe && s.produto ? ` (${s.produto[0]})` : ''
            map.set(s.stage_id, s.stage_nome + suffix)
        }
        return map
    }, [stages])

    // Chart data with display names for X axis
    const chartStages = useMemo(() => {
        return stages.map(s => ({
            ...s,
            display_nome: stageDisplayNames.get(s.stage_id) || s.stage_nome,
        }))
    }, [stages, stageDisplayNames])

    // Phase separator positions for funnel chart
    const phaseCounts = useMemo(() => {
        if (!stages.length) return { sdr: 0, planner: 0, pos: 0 }
        return {
            sdr: stages.filter(s => s.fase_slug === 'sdr').length,
            planner: stages.filter(s => s.fase_slug === 'planner').length,
            pos: stages.filter(s => !['sdr', 'planner', 'resolucao'].includes(s.fase_slug)).length,
        }
    }, [stages])

    // Owner chart data for horizontal stacked bars
    const ownerChartData = useMemo(() => {
        return owners.slice(0, 12).map(o => ({
            name: o.owner_nome,
            owner_id: o.owner_id,
            sdr: o.by_phase.sdr,
            planner: o.by_phase.planner,
            'pos-venda': o.by_phase['pos-venda'],
            total: o.total_cards,
        }))
    }, [owners])

    // Drill-down handlers
    const handleStageDrill = (stageId: string, stageName: string) => {
        drillDown.open({
            label: stageName,
            drillStageId: stageId,
            drillSource: 'current_stage',
            excludeTerminal: true,
        })
    }

    const handleOwnerDrill = (ownerId: string | null, ownerName: string) => {
        if (!ownerId) return
        drillDown.open({
            label: `${ownerName} — Pipeline Aberto`,
            drillOwnerId: ownerId,
            drillSource: 'current_stage',
            excludeTerminal: true,
        })
    }

    const handleAllCardsDrill = () => {
        drillDown.open({
            label: 'Pipeline Aberto',
            drillSource: 'current_stage',
            excludeTerminal: true,
        })
    }

    return (
        <div className="space-y-6">
            {error && (
                <QueryErrorState
                    compact
                    title="Erro ao carregar snapshot do pipeline"
                    onRetry={refetch}
                />
            )}

            {/* ── KPI Cards ── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <KpiCard
                    title="Cards Abertos"
                    value={kpis.total_open}
                    icon={Briefcase}
                    color="text-blue-600"
                    bgColor="bg-blue-50"
                    isLoading={isLoading}
                    onClick={handleAllCardsDrill}
                    clickHint="Ver todos os cards"
                />
                <KpiCard
                    title="Valor no Pipeline"
                    value={formatCurrency(kpis.total_value)}
                    icon={DollarSign}
                    color="text-emerald-600"
                    bgColor="bg-emerald-50"
                    isLoading={isLoading}
                />
                <KpiCard
                    title="Ticket Médio"
                    value={formatCurrency(kpis.avg_ticket)}
                    icon={ReceiptText}
                    color="text-indigo-600"
                    bgColor="bg-indigo-50"
                    isLoading={isLoading}
                />
                <KpiCard
                    title="Idade Média (dias)"
                    value={kpis.avg_age_days}
                    icon={Clock}
                    color="text-amber-600"
                    bgColor="bg-amber-50"
                    isLoading={isLoading}
                />
                <KpiCard
                    title="SLA Violado"
                    value={kpis.sla_breach_count > 0 ? `${kpis.sla_breach_count} (${kpis.sla_breach_pct}%)` : '0'}
                    icon={AlertTriangle}
                    color={kpis.sla_breach_count > 0 ? 'text-rose-600' : 'text-slate-400'}
                    bgColor={kpis.sla_breach_count > 0 ? 'bg-rose-50' : 'bg-slate-50'}
                    isLoading={isLoading}
                />
            </div>

            {/* ── Funil Operacional ── */}
            <ChartCard
                title="Distribuição por Etapa"
                description="Cards abertos no pipeline, agrupados por etapa"
                colSpan={2}
                isLoading={isLoading}
            >
                <div style={{ width: '100%', height: Math.max(280, stages.length * 6 + 100) }}>
                    <ResponsiveContainer>
                        <BarChart data={chartStages} margin={{ top: 10, right: 30, left: 10, bottom: 60 }}>
                            <XAxis
                                dataKey="display_nome"
                                tick={RotatedXTick}
                                interval={0}
                                height={70}
                            />
                            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} width={40} />
                            <Tooltip
                                formatter={(value: number, name: string) => {
                                    if (name === 'card_count') return [value, 'Cards']
                                    return [value, name]
                                }}
                                labelFormatter={(label) => {
                                    const stage = chartStages.find(s => s.display_nome === label)
                                    if (!stage) return label
                                    return `${label} (${stage.fase}) — ${formatCurrency(stage.valor_total)}`
                                }}
                                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                            />
                            <Bar
                                dataKey="card_count"
                                radius={[4, 4, 0, 0]}
                                cursor="pointer"
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                onClick={(_data: any, idx: number) => {
                                    const s = chartStages[idx]
                                    if (s) handleStageDrill(s.stage_id, s.display_nome)
                                }}
                            >
                                {chartStages.map((s, i) => (
                                    <Cell key={i} fill={getPhaseColor(s.fase_slug)} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                {/* Phase indicator bar */}
                <div className="flex items-center gap-0 mx-6 mt-1 mb-2">
                    {phaseCounts.sdr > 0 && (
                        <div className="flex items-center gap-1.5 pr-3 border-r border-slate-200">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ background: PHASE_COLORS.sdr }} />
                            <span className="text-[10px] font-medium text-slate-500">SDR</span>
                        </div>
                    )}
                    {phaseCounts.planner > 0 && (
                        <div className="flex items-center gap-1.5 px-3 border-r border-slate-200">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ background: PHASE_COLORS.planner }} />
                            <span className="text-[10px] font-medium text-slate-500">Planner</span>
                        </div>
                    )}
                    {phaseCounts.pos > 0 && (
                        <div className="flex items-center gap-1.5 pl-3">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ background: PHASE_COLORS['pos-venda'] }} />
                            <span className="text-[10px] font-medium text-slate-500">Pós-venda</span>
                        </div>
                    )}
                </div>
            </ChartCard>

            {/* ── Row: Aging + Owner Workload ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Aging Heatmap */}
                <ChartCard
                    title="Tempo na Etapa (Aging)"
                    description="Quantos cards por faixa de dias em cada etapa"
                    isLoading={isLoading}
                >
                    <div className="px-4 pb-2 overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-slate-100">
                                    <th className="text-left py-2 pr-3 text-slate-500 font-medium">Etapa</th>
                                    <th className="text-center px-2 py-2 text-slate-500 font-medium">0-3d</th>
                                    <th className="text-center px-2 py-2 text-slate-500 font-medium">3-7d</th>
                                    <th className="text-center px-2 py-2 text-slate-500 font-medium">7-14d</th>
                                    <th className="text-center px-2 py-2 text-slate-500 font-medium">14d+</th>
                                </tr>
                            </thead>
                            <tbody>
                                {aging.map((row: PipelineCurrentAging) => (
                                    <tr key={row.stage_id} className="border-b border-slate-50">
                                        <td className="py-1.5 pr-3 text-slate-700 font-medium truncate max-w-[160px]" title={stageDisplayNames.get(row.stage_id) || row.stage_nome}>
                                            {truncateLabel(stageDisplayNames.get(row.stage_id) || row.stage_nome)}
                                        </td>
                                        {(['bucket_0_3', 'bucket_3_7', 'bucket_7_14', 'bucket_14_plus'] as const).map((bucket) => (
                                            <td key={bucket} className="text-center px-1 py-1.5">
                                                <button
                                                    className={cn(
                                                        'inline-flex items-center justify-center w-8 h-6 rounded text-xs font-semibold transition-colors',
                                                        agingCellColor(row[bucket]),
                                                        row[bucket] > 0 && 'hover:ring-1 hover:ring-indigo-300 cursor-pointer'
                                                    )}
                                                    onClick={() => row[bucket] > 0 && handleStageDrill(row.stage_id, `${row.stage_nome} — ${bucket.replace('bucket_', '').replace('_plus', '+').replace('_', '-')}d`)}
                                                    disabled={row[bucket] === 0}
                                                >
                                                    {row[bucket]}
                                                </button>
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </ChartCard>

                {/* Owner Workload */}
                <ChartCard
                    title="Carga por Consultor"
                    description="Cards abertos por responsável, segmentados por fase"
                    isLoading={isLoading}
                >
                    <div style={{ width: '100%', height: Math.max(280, ownerChartData.length * 36 + 40) }}>
                        <ResponsiveContainer>
                            <BarChart
                                data={ownerChartData}
                                layout="vertical"
                                margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                            >
                                <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} />
                                <YAxis
                                    type="category"
                                    dataKey="name"
                                    tick={{ fontSize: 11, fill: '#475569' }}
                                    width={130}
                                />
                                <Tooltip
                                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                                    formatter={(value: number, name: string) => [value, PHASE_LABELS[name] || name]}
                                />
                                {Object.entries(PHASE_COLORS).map(([key, color]) => (
                                    <Bar
                                        key={key}
                                        dataKey={key}
                                        stackId="a"
                                        fill={color}
                                        cursor="pointer"
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        onClick={(_data: any, idx: number) => {
                                            const o = ownerChartData[idx]
                                            if (o?.owner_id) handleOwnerDrill(o.owner_id, o.name)
                                        }}
                                    />
                                ))}
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </ChartCard>
            </div>

            {/* ── Deals em Risco ── */}
            <ChartCard
                title="Deals em Risco"
                description="Top 15 cards com mais tempo na etapa atual"
                colSpan={2}
                isLoading={isLoading}
            >
                <div className="px-4 pb-2 overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b border-slate-200">
                                <th className="text-left py-2.5 pr-3 text-slate-500 font-medium">Título</th>
                                <th className="text-left py-2.5 px-2 text-slate-500 font-medium">Contato</th>
                                <th className="text-left py-2.5 px-2 text-slate-500 font-medium">Etapa</th>
                                <th className="text-left py-2.5 px-2 text-slate-500 font-medium">Responsável</th>
                                <th className="text-right py-2.5 px-2 text-slate-500 font-medium">Valor</th>
                                <th className="text-right py-2.5 px-2 text-slate-500 font-medium">Dias</th>
                                <th className="text-center py-2.5 pl-2 text-slate-500 font-medium">SLA</th>
                            </tr>
                        </thead>
                        <tbody>
                            {topDeals.map((deal) => (
                                <tr
                                    key={deal.card_id}
                                    className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors"
                                    onClick={() => navigate(`/cards/${deal.card_id}`)}
                                >
                                    <td className="py-2 pr-3 text-slate-800 font-medium truncate max-w-[200px]" title={deal.titulo}>
                                        {deal.titulo}
                                    </td>
                                    <td className="py-2 px-2 text-slate-500 truncate max-w-[120px]" title={deal.pessoa_nome || ''}>
                                        {deal.pessoa_nome || '—'}
                                    </td>
                                    <td className="py-2 px-2 text-slate-600 truncate max-w-[140px]" title={deal.stage_nome}>
                                        {deal.stage_nome}
                                    </td>
                                    <td className="py-2 px-2 text-slate-600 truncate max-w-[120px]" title={deal.owner_nome}>
                                        {deal.owner_nome}
                                    </td>
                                    <td className="py-2 px-2 text-right text-slate-700 tabular-nums">
                                        {deal.valor_total > 0 ? formatCurrency(deal.valor_total) : '—'}
                                    </td>
                                    <td className="py-2 px-2 text-right tabular-nums font-semibold text-slate-800">
                                        {deal.days_in_stage}
                                    </td>
                                    <td className="py-2 pl-2 text-center">
                                        {deal.sla_hours ? (
                                            deal.is_sla_breach ? (
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700">
                                                    Excedido
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700">
                                                    OK
                                                </span>
                                            )
                                        ) : (
                                            <span className="text-slate-300">—</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {topDeals.length === 0 && !isLoading && (
                                <tr>
                                    <td colSpan={7} className="py-8 text-center text-slate-400">
                                        Nenhum card em aberto
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </ChartCard>
        </div>
    )
}
