import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    Briefcase,
    DollarSign,
    Clock,
    AlertTriangle,
    ReceiptText,
    User as UserIcon,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
} from 'lucide-react'
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    Cell, LabelList,
} from 'recharts'
import KpiCard from '../KpiCard'
import ChartCard from '../ChartCard'
import PhaseSummaryCard from '../PhaseSummaryCard'
import { QueryErrorState } from '@/components/ui/QueryErrorState'
import { usePipelineCurrent, type PipelineCurrentAging, type DateRef } from '@/hooks/analytics/usePipelineCurrent'
import { useDrillDownStore } from '@/hooks/analytics/useAnalyticsDrillDown'
import { useAnalyticsFilters } from '@/hooks/analytics/useAnalyticsFilters'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency } from '@/utils/whatsappFormatters'
import { cn } from '@/lib/utils'

// ── Constants ──

type PhaseFilter = 'all' | 'sdr' | 'planner' | 'pos-venda'
type MetricMode = 'cards' | 'faturamento' | 'receita'
type DealSortField = 'days_in_stage' | 'valor_total' | 'receita' | 'owner_nome'
type OwnerSortField = 'total_cards' | 'total_value' | 'total_receita' | 'avg_age_days' | 'sla_breach'
type ChartGroupBy = 'stage' | 'consultant'

const PHASE_COLORS: Record<string, string> = {
    sdr: '#3b82f6',
    planner: '#8b5cf6',
    'pos-venda': '#10b981',
}

const PHASE_LABELS: Record<string, string> = {
    sdr: 'SDR (Pré-Venda)',
    planner: 'Planner (Venda)',
    'pos-venda': 'Pós-Venda',
}

const PHASE_FILTER_OPTIONS: { value: PhaseFilter; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'sdr', label: 'SDR' },
    { value: 'planner', label: 'Planner' },
    { value: 'pos-venda', label: 'Pós-Venda' },
]

const TASK_TYPE_LABELS: Record<string, string> = {
    tarefa: 'Tarefa',
    contato: 'Contato',
    ligacao: 'Ligação',
    whatsapp: 'WhatsApp',
    email: 'E-mail',
    reuniao: 'Reunião',
    solicitacao_mudanca: 'Mudança',
    enviar_proposta: 'Proposta',
    coleta_documentos: 'Documentos',
    followup: 'Follow-up',
    outro: 'Outro',
    cobranca: 'Cobrança',
}

function getPhaseColor(slug: string): string {
    return PHASE_COLORS[slug] || '#94a3b8'
}

function matchesPhase(slug: string | undefined | null, filter: PhaseFilter): boolean {
    if (filter === 'all') return true
    if (filter === 'pos-venda') return !!slug && !['sdr', 'planner', 'resolucao'].includes(slug)
    return slug === filter
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

function getDealRisk(deal: { is_sla_breach: boolean; days_in_stage: number }, refMode: DateRef): 'critical' | 'warning' | 'normal' {
    if (deal.is_sla_breach) return 'critical'
    // Thresholds de aging só fazem sentido para "na etapa" — deals com 30+ dias desde criação são normais
    if (refMode === 'stage') {
        if (deal.days_in_stage > 14) return 'critical'
        if (deal.days_in_stage > 7) return 'warning'
    } else {
        if (deal.days_in_stage > 90) return 'critical'
        if (deal.days_in_stage > 60) return 'warning'
    }
    return 'normal'
}

const RISK_STYLES = {
    critical: 'border-l-2 border-l-rose-500 bg-rose-50/50',
    warning: 'border-l-2 border-l-amber-400 bg-amber-50/30',
    normal: '',
}

// ── Component ──

export default function PipelineCurrentView() {
    const navigate = useNavigate()
    const drillDown = useDrillDownStore()
    const { profile } = useAuth()
    const { setActiveView, setDatePreset, ownerIds, setOwnerIds } = useAnalyticsFilters()

    // ── View-specific filter state ──
    const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>('all')
    const [metric, setMetric] = useState<MetricMode>('cards')
    const [dateRef, setDateRef] = useState<DateRef>('stage')
    const [valueMinInput, setValueMinInput] = useState('')
    const [valueMaxInput, setValueMaxInput] = useState('')
    const [debouncedMin, setDebouncedMin] = useState<number | null>(null)
    const [debouncedMax, setDebouncedMax] = useState<number | null>(null)
    const [dealSort, setDealSort] = useState<{ field: DealSortField; dir: 'asc' | 'desc' }>({
        field: 'days_in_stage', dir: 'desc',
    })
    const [ownerSort, setOwnerSort] = useState<{ field: OwnerSortField; dir: 'asc' | 'desc' }>({
        field: 'total_cards', dir: 'desc',
    })
    const [chartGroupBy, setChartGroupBy] = useState<ChartGroupBy>('stage')

    // ── Debounce value inputs ──
    useEffect(() => {
        const timer = setTimeout(() => {
            if (valueMinInput === '') { setDebouncedMin(null); return }
            const val = parseFloat(valueMinInput)
            setDebouncedMin(!isNaN(val) ? val : null)
        }, 500)
        return () => clearTimeout(timer)
    }, [valueMinInput])

    useEffect(() => {
        const timer = setTimeout(() => {
            if (valueMaxInput === '') { setDebouncedMax(null); return }
            const val = parseFloat(valueMaxInput)
            setDebouncedMax(!isNaN(val) ? val : null)
        }, 500)
        return () => clearTimeout(timer)
    }, [valueMaxInput])

    // ── Fetch data ──
    const { data, isLoading, error, refetch } = usePipelineCurrent({
        dateRef,
        valueMin: debouncedMin,
        valueMax: debouncedMax,
    })

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

    // ── "Meu Pipeline" ──
    const profileId = profile?.id
    const isMyPipeline = !!(profileId && ownerIds.length === 1 && ownerIds[0] === profileId)
    const toggleMyPipeline = useCallback(() => {
        if (!profileId) return
        if (isMyPipeline) { setOwnerIds([]) } else { setOwnerIds([profileId]) }
    }, [profileId, isMyPipeline, setOwnerIds])

    // ── Data decomposition (stable refs) ──
    const EMPTY_KPI = useMemo(() => ({
        total_open: 0, total_value: 0, total_receita: 0, avg_ticket: 0,
        avg_receita_ticket: 0, avg_age_days: 0, sla_breach_count: 0, sla_breach_pct: 0,
    }), [])
    const allStages = useMemo(() => data?.stages ?? [], [data?.stages])
    const allAging = useMemo(() => data?.aging ?? [], [data?.aging])
    const allOwners = useMemo(() => data?.owners ?? [], [data?.owners])
    const allDeals = useMemo(() => data?.top_deals ?? [], [data?.top_deals])
    const taskMetrics = useMemo(() => data?.tasks ?? null, [data?.tasks])
    const globalKpis = useMemo(() => data?.kpis ?? EMPTY_KPI, [data?.kpis, EMPTY_KPI])

    const isMonetary = metric !== 'cards'

    // ── Phase summaries (always from ALL data) ──
    const phaseSummaries = useMemo(() => {
        const slugs: PhaseFilter[] = ['sdr', 'planner', 'pos-venda']
        return slugs.map(slug => {
            const filtered = allStages.filter(s => matchesPhase(s.fase_slug, slug))
            const count = filtered.reduce((sum, s) => sum + s.card_count, 0)
            const value = filtered.reduce((sum, s) => sum + s.valor_total, 0)
            const receita = filtered.reduce((sum, s) => sum + (s.receita_total || 0), 0)
            const avgDays = count > 0
                ? +(filtered.reduce((sum, s) => sum + s.avg_days * s.card_count, 0) / count).toFixed(1)
                : 0
            return { slug, label: PHASE_LABELS[slug], color: PHASE_COLORS[slug], count, value, receita, avgDays }
        })
    }, [allStages])

    // ── Unassigned count ──
    const unassignedCount = useMemo(() =>
        allOwners.find(o => o.owner_id === null)?.total_cards ?? 0
    , [allOwners])

    // ── Selected owner label (for toolbar indicator) ──
    const selectedOwnerLabel = useMemo(() => {
        if (ownerIds.length === 0 || isMyPipeline) return null
        if (ownerIds.length === 1) {
            const found = allOwners.find(o => o.owner_id === ownerIds[0])
            return found?.owner_nome ?? null
        }
        return `${ownerIds.length} consultores`
    }, [ownerIds, isMyPipeline, allOwners])

    // ── Filtered data (by phaseFilter) ──
    const stages = useMemo(() =>
        allStages.filter(s => matchesPhase(s.fase_slug, phaseFilter))
    , [allStages, phaseFilter])

    const aging = useMemo(() =>
        allAging.filter(a => matchesPhase(a.fase_slug, phaseFilter))
    , [allAging, phaseFilter])

    // ── Derived KPIs (recalc when phase filter active) ──
    const kpis = useMemo(() => {
        if (phaseFilter === 'all') return globalKpis
        const count = stages.reduce((sum, s) => sum + s.card_count, 0)
        const value = stages.reduce((sum, s) => sum + s.valor_total, 0)
        const receita = stages.reduce((sum, s) => sum + (s.receita_total || 0), 0)
        const slaBreach = stages.reduce((sum, s) => sum + s.sla_breach_count, 0)
        return {
            total_open: count,
            total_value: value,
            total_receita: receita,
            avg_ticket: count > 0 ? Math.round(value / count) : 0,
            avg_receita_ticket: count > 0 ? Math.round(receita / count) : 0,
            avg_age_days: count > 0
                ? +(stages.reduce((sum, s) => sum + s.avg_days * s.card_count, 0) / count).toFixed(1)
                : 0,
            sla_breach_count: slaBreach,
            sla_breach_pct: 0,
        }
    }, [phaseFilter, stages, globalKpis])

    // ── Display name disambiguation ──
    const stageDisplayNames = useMemo(() => {
        const nameCount = new Map<string, number>()
        for (const s of stages) nameCount.set(s.stage_nome, (nameCount.get(s.stage_nome) || 0) + 1)
        const map = new Map<string, string>()
        for (const s of stages) {
            const isDupe = (nameCount.get(s.stage_nome) || 0) > 1
            const suffix = isDupe && s.produto === 'WEDDING' ? ' (W)' : isDupe && s.produto ? ` (${s.produto[0]})` : ''
            map.set(s.stage_id, s.stage_nome + suffix)
        }
        return map
    }, [stages])

    const chartStages = useMemo(() =>
        stages.map(s => ({ ...s, display_nome: stageDisplayNames.get(s.stage_id) || s.stage_nome }))
    , [stages, stageDisplayNames])

    // ── Stage chart data key ──
    const stageDataKey = metric === 'cards' ? 'card_count'
        : metric === 'faturamento' ? 'valor_total'
        : 'receita_total'

    // ── Owner chart data ──
    const ownerChartData = useMemo(() => {
        let filtered = allOwners
        if (phaseFilter !== 'all') {
            filtered = allOwners
                .map(o => {
                    const phKey = phaseFilter as keyof typeof o.by_phase
                    const cards = o.by_phase[phKey] || 0
                    const value = o.by_phase_value[phKey] || 0
                    const rec = o.by_phase_receita?.[phKey] || 0
                    return { ...o, total_cards: cards, total_value: value, total_receita: rec }
                })
                .filter(o => o.total_cards > 0)
                .sort((a, b) => b.total_cards - a.total_cards)
        }

        const getVal = (o: typeof filtered[0], phase: string) => {
            const phKey = phase as keyof typeof o.by_phase
            if (metric === 'cards') return o.by_phase[phKey] || 0
            if (metric === 'faturamento') return o.by_phase_value[phKey] || 0
            return o.by_phase_receita?.[phKey] || 0
        }

        return filtered.slice(0, 12).map(o => {
            if (phaseFilter !== 'all') {
                return {
                    name: o.owner_nome,
                    owner_id: o.owner_id,
                    [phaseFilter]: getVal(o, phaseFilter),
                    total: metric === 'cards' ? o.total_cards : metric === 'faturamento' ? o.total_value : o.total_receita,
                }
            }
            return {
                name: o.owner_nome,
                owner_id: o.owner_id,
                sdr: getVal(o, 'sdr'),
                planner: getVal(o, 'planner'),
                'pos-venda': getVal(o, 'pos-venda'),
                total: metric === 'cards' ? o.total_cards : metric === 'faturamento' ? o.total_value : o.total_receita,
            }
        })
    }, [allOwners, phaseFilter, metric])

    const ownerBarKeys = useMemo(() => {
        if (phaseFilter !== 'all') return [phaseFilter]
        return Object.keys(PHASE_COLORS)
    }, [phaseFilter])

    // ── Sorted owners for consultant table ──
    const sortedOwners = useMemo(() => {
        let filtered = allOwners
        if (phaseFilter !== 'all') {
            filtered = allOwners
                .map(o => {
                    const phKey = phaseFilter as keyof typeof o.by_phase
                    return {
                        ...o,
                        total_cards: o.by_phase[phKey] || 0,
                        total_value: o.by_phase_value[phKey] || 0,
                        total_receita: o.by_phase_receita?.[phKey] || 0,
                    }
                })
                .filter(o => o.total_cards > 0)
        }
        return [...filtered].sort((a, b) => {
            const { field, dir } = ownerSort
            const va = a[field] as number
            const vb = b[field] as number
            return dir === 'asc' ? va - vb : vb - va
        })
    }, [allOwners, phaseFilter, ownerSort])

    // ── Phase indicator counts for chart ──
    const phaseCounts = useMemo(() => ({
        sdr: stages.filter(s => s.fase_slug === 'sdr').length,
        planner: stages.filter(s => s.fase_slug === 'planner').length,
        pos: stages.filter(s => matchesPhase(s.fase_slug, 'pos-venda')).length,
    }), [stages])

    // ── Aging totals row ──
    const agingTotals = useMemo(() => ({
        bucket_0_3: aging.reduce((s, a) => s + a.bucket_0_3, 0),
        bucket_3_7: aging.reduce((s, a) => s + a.bucket_3_7, 0),
        bucket_7_14: aging.reduce((s, a) => s + a.bucket_7_14, 0),
        bucket_14_plus: aging.reduce((s, a) => s + a.bucket_14_plus, 0),
    }), [aging])

    // ── Sorted deals ──
    const sortedDeals = useMemo(() => {
        const filtered = phaseFilter === 'all' ? allDeals : allDeals.filter(d => matchesPhase(d.fase_slug, phaseFilter))
        return [...filtered].sort((a, b) => {
            const { field, dir } = dealSort
            let va: number | string, vb: number | string
            switch (field) {
                case 'valor_total': va = a.valor_total; vb = b.valor_total; break
                case 'receita': va = a.receita || 0; vb = b.receita || 0; break
                case 'days_in_stage': va = a.days_in_stage; vb = b.days_in_stage; break
                case 'owner_nome': va = a.owner_nome; vb = b.owner_nome; break
                default: va = a.days_in_stage; vb = b.days_in_stage
            }
            if (typeof va === 'string') return dir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va)
            return dir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number)
        })
    }, [allDeals, phaseFilter, dealSort])

    // ── Drill-down handlers ──
    const handleStageDrill = (stageId: string, stageName: string) => {
        drillDown.open({ label: stageName, drillStageId: stageId, drillSource: 'current_stage', excludeTerminal: true })
    }
    const handleAllCardsDrill = () => {
        drillDown.open({ label: 'Pipeline Aberto', drillSource: 'current_stage', excludeTerminal: true })
    }
    const handleOwnerFilter = useCallback((ownerId: string | null) => {
        if (!ownerId) return
        if (ownerIds.length === 1 && ownerIds[0] === ownerId) {
            setOwnerIds([])
        } else {
            setOwnerIds([ownerId])
        }
    }, [ownerIds, setOwnerIds])

    // ── Sort toggle handler ──
    const toggleDealSort = (field: DealSortField) => {
        setDealSort(prev =>
            prev.field === field
                ? { field, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
                : { field, dir: 'desc' }
        )
    }

    const sortIcon = (field: DealSortField) => {
        if (dealSort.field !== field) return <ArrowUpDown className="w-3 h-3 text-slate-300 ml-1" />
        return dealSort.dir === 'desc'
            ? <ArrowDown className="w-3 h-3 text-indigo-500 ml-1" />
            : <ArrowUp className="w-3 h-3 text-indigo-500 ml-1" />
    }

    const toggleOwnerSort = (field: OwnerSortField) => {
        setOwnerSort(prev =>
            prev.field === field
                ? { field, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
                : { field, dir: 'desc' }
        )
    }
    const ownerSortIcon = (field: OwnerSortField) => {
        if (ownerSort.field !== field) return <ArrowUpDown className="w-3 h-3 text-slate-300 ml-1" />
        return ownerSort.dir === 'desc'
            ? <ArrowDown className="w-3 h-3 text-indigo-500 ml-1" />
            : <ArrowUp className="w-3 h-3 text-indigo-500 ml-1" />
    }

    // ── Formatting helpers ──
    const formatMetricValue = (v: number) =>
        isMonetary ? `${(v / 1000).toFixed(0)}k` : String(v)

    const tooltipFormatter = (value: number, name: string) =>
        isMonetary ? [formatCurrency(value), PHASE_LABELS[name] || name] : [value, PHASE_LABELS[name] || name]

    return (
        <div className="space-y-5">
            {error && <QueryErrorState compact title="Erro ao carregar snapshot do pipeline" onRetry={refetch} />}

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
                    subtitle={unassignedCount > 0 ? `${unassignedCount} sem responsável` : undefined}
                />
                <KpiCard
                    title={metric === 'receita' ? 'Receita no Pipeline' : 'Faturamento no Pipeline'}
                    value={formatCurrency(metric === 'receita' ? kpis.total_receita : kpis.total_value)}
                    icon={DollarSign}
                    color="text-emerald-600"
                    bgColor="bg-emerald-50"
                    isLoading={isLoading}
                />
                <KpiCard
                    title={metric === 'receita' ? 'Receita Média' : 'Ticket Médio'}
                    value={formatCurrency(metric === 'receita' ? kpis.avg_receita_ticket : kpis.avg_ticket)}
                    icon={ReceiptText}
                    color="text-indigo-600"
                    bgColor="bg-indigo-50"
                    isLoading={isLoading}
                />
                <KpiCard
                    title={dateRef === 'stage' ? 'Idade Média (etapa)' : 'Idade Média (criação)'}
                    value={kpis.avg_age_days}
                    icon={Clock}
                    color="text-amber-600"
                    bgColor="bg-amber-50"
                    isLoading={isLoading}
                />
                <KpiCard
                    title="SLA Violado"
                    value={kpis.sla_breach_count > 0 ? `${kpis.sla_breach_count}` : '0'}
                    icon={AlertTriangle}
                    color={kpis.sla_breach_count > 0 ? 'text-rose-600' : 'text-slate-400'}
                    bgColor={kpis.sla_breach_count > 0 ? 'bg-rose-50' : 'bg-slate-50'}
                    isLoading={isLoading}
                />
            </div>

            {/* ── Filter Toolbar ── */}
            <div className="flex items-center gap-3 flex-wrap bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm">
                {/* Date reference toggle */}
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Referência</span>
                    <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                        {([['stage', 'Na Etapa'], ['created', 'Criação']] as const).map(([val, label]) => (
                            <button
                                key={val}
                                onClick={() => setDateRef(val)}
                                className={cn(
                                    'px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                                    dateRef === val
                                        ? 'bg-indigo-600 text-white'
                                        : 'text-slate-600 hover:bg-slate-50'
                                )}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="w-px h-6 bg-slate-200" />

                {/* Unified metric toggle */}
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Métrica</span>
                    <div className="flex bg-slate-100 rounded-lg p-0.5">
                        {([['cards', 'Qtd'], ['faturamento', 'Fat.'], ['receita', 'Receita']] as const).map(([v, label]) => (
                            <button
                                key={v}
                                onClick={() => setMetric(v)}
                                className={cn(
                                    'px-2.5 py-1 text-[10px] font-semibold rounded-md transition-colors',
                                    metric === v
                                        ? 'bg-white text-slate-800 shadow-sm'
                                        : 'text-slate-400 hover:text-slate-600'
                                )}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="w-px h-6 bg-slate-200" />

                {/* Value range */}
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Valor</span>
                    <span className="text-[10px] text-slate-400">R$</span>
                    <input
                        type="number"
                        placeholder="Min"
                        value={valueMinInput}
                        onChange={e => setValueMinInput(e.target.value)}
                        className="w-20 px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300 outline-none"
                    />
                    <span className="text-[10px] text-slate-400">a</span>
                    <input
                        type="number"
                        placeholder="Max"
                        value={valueMaxInput}
                        onChange={e => setValueMaxInput(e.target.value)}
                        className="w-20 px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300 outline-none"
                    />
                    {(valueMinInput || valueMaxInput) && (
                        <button
                            onClick={() => { setValueMinInput(''); setValueMaxInput('') }}
                            className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                            Limpar
                        </button>
                    )}
                </div>

                <div className="flex-1" />

                {/* Selected consultant indicator */}
                {selectedOwnerLabel && !isMyPipeline && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 border border-violet-200 rounded-lg">
                        <UserIcon className="w-3.5 h-3.5 text-violet-600" />
                        <span className="text-xs font-medium text-violet-700 max-w-[120px] truncate">{selectedOwnerLabel}</span>
                        <button
                            onClick={() => setOwnerIds([])}
                            className="text-[10px] text-violet-500 hover:text-violet-700 font-bold ml-0.5"
                        >
                            &times;
                        </button>
                    </div>
                )}

                {/* Meu Pipeline */}
                {profile?.id && (
                    <button
                        onClick={toggleMyPipeline}
                        className={cn(
                            'inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg border transition-colors',
                            isMyPipeline
                                ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        )}
                    >
                        <UserIcon className="w-3.5 h-3.5" />
                        Meu Pipeline
                    </button>
                )}
            </div>

            {/* ── Phase Summary Cards ── */}
            <div className="grid grid-cols-3 gap-4">
                {phaseSummaries.map(ps => (
                    <PhaseSummaryCard
                        key={ps.slug}
                        label={ps.label}
                        color={ps.color}
                        cardCount={ps.count}
                        totalValue={metric === 'receita' ? ps.receita : ps.value}
                        avgDays={ps.avgDays}
                        isActive={phaseFilter === ps.slug}
                        onClick={() => setPhaseFilter(phaseFilter === ps.slug ? 'all' : ps.slug as PhaseFilter)}
                    />
                ))}
            </div>

            {/* ── Phase Filter Toggle ── */}
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit">
                {PHASE_FILTER_OPTIONS.map(opt => (
                    <button
                        key={opt.value}
                        onClick={() => setPhaseFilter(opt.value)}
                        className={cn(
                            'px-3 py-1.5 text-xs font-semibold rounded-md transition-colors',
                            phaseFilter === opt.value
                                ? 'bg-white text-slate-800 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                        )}
                    >
                        {opt.value !== 'all' && (
                            <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: PHASE_COLORS[opt.value] }} />
                        )}
                        {opt.label}
                    </button>
                ))}
            </div>

            {/* ── Distribuição Principal ── */}
            <ChartCard
                title={chartGroupBy === 'stage' ? 'Distribuição por Etapa' : 'Distribuição por Consultor'}
                description={chartGroupBy === 'stage'
                    ? (phaseFilter === 'all'
                        ? `Cards abertos por etapa — ${metric === 'cards' ? 'quantidade' : metric === 'faturamento' ? 'faturamento' : 'receita'}`
                        : `Etapas de ${PHASE_LABELS[phaseFilter]}`)
                    : `${metric === 'cards' ? 'Quantidade' : metric === 'faturamento' ? 'Faturamento' : 'Receita'} por consultor${phaseFilter !== 'all' ? ` em ${PHASE_LABELS[phaseFilter]}` : ''} — clique para filtrar`}
                colSpan={2}
                isLoading={isLoading}
                actions={
                    <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden">
                        {([['stage', 'Etapa'], ['consultant', 'Consultor']] as const).map(([val, label]) => (
                            <button
                                key={val}
                                onClick={() => setChartGroupBy(val)}
                                className={cn(
                                    'px-2.5 py-1 text-[10px] font-semibold transition-colors',
                                    chartGroupBy === val
                                        ? 'bg-indigo-600 text-white'
                                        : 'text-slate-500 hover:bg-slate-50'
                                )}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                }
            >
                {chartGroupBy === 'stage' ? (
                    <>
                        <div style={{ width: '100%', height: Math.max(280, chartStages.length * 8 + 100) }}>
                            <ResponsiveContainer>
                                <BarChart data={chartStages} margin={{ top: 20, right: 30, left: 10, bottom: 60 }}>
                                    <XAxis dataKey="display_nome" tick={RotatedXTick} interval={0} height={70} />
                                    <YAxis
                                        tick={{ fontSize: 11, fill: '#64748b' }}
                                        width={isMonetary ? 70 : 40}
                                        tickFormatter={isMonetary ? (v: number) => `${(v / 1000).toFixed(0)}k` : undefined}
                                    />
                                    <Tooltip
                                        formatter={(value: number, name: string) => {
                                            if (name === 'valor_total' || name === 'receita_total') return [formatCurrency(value), name === 'valor_total' ? 'Faturamento' : 'Receita']
                                            return [value, 'Cards']
                                        }}
                                        labelFormatter={(label) => {
                                            const stage = chartStages.find(s => s.display_nome === label)
                                            if (!stage) return label
                                            return `${label} (${stage.fase}) — ${stage.card_count} cards — ${formatCurrency(stage.valor_total)}`
                                        }}
                                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                                    />
                                    <Bar dataKey={stageDataKey} radius={[4, 4, 0, 0]} cursor="pointer"
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        onClick={(_data: any, idx: number) => {
                                            const s = chartStages[idx]
                                            if (s) handleStageDrill(s.stage_id, s.display_nome)
                                        }}
                                    >
                                        {chartStages.map((s, i) => (
                                            <Cell key={i} fill={getPhaseColor(s.fase_slug)} />
                                        ))}
                                        <LabelList
                                            dataKey={stageDataKey}
                                            position="top"
                                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                            formatter={(v: any) => formatMetricValue(Number(v))}
                                            style={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }}
                                        />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        {phaseFilter === 'all' && (
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
                        )}
                    </>
                ) : (
                    <>
                        <div style={{ width: '100%', height: Math.max(280, ownerChartData.length * 40 + 40) }}>
                            <ResponsiveContainer>
                                <BarChart data={ownerChartData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                                    <XAxis
                                        type="number"
                                        tick={{ fontSize: 11, fill: '#64748b' }}
                                        tickFormatter={isMonetary ? (v: number) => `${(v / 1000).toFixed(0)}k` : undefined}
                                    />
                                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} width={140} />
                                    <Tooltip
                                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                                        formatter={tooltipFormatter}
                                        labelFormatter={(label) => {
                                            const o = ownerChartData.find(d => d.name === label)
                                            if (!o) return label
                                            return `${label} — Total: ${isMonetary ? formatCurrency(o.total as number) : o.total}`
                                        }}
                                    />
                                    {ownerBarKeys.map(key => (
                                        <Bar
                                            key={key}
                                            dataKey={key}
                                            stackId="a"
                                            fill={getPhaseColor(key)}
                                            cursor="pointer"
                                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                            onClick={(_data: any, idx: number) => {
                                                const o = ownerChartData[idx]
                                                if (o?.owner_id) handleOwnerFilter(o.owner_id as string)
                                            }}
                                        />
                                    ))}
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        {phaseFilter === 'all' && (
                            <div className="flex items-center gap-0 mx-6 mt-1 mb-2">
                                <div className="flex items-center gap-1.5 pr-3 border-r border-slate-200">
                                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: PHASE_COLORS.sdr }} />
                                    <span className="text-[10px] font-medium text-slate-500">SDR</span>
                                </div>
                                <div className="flex items-center gap-1.5 px-3 border-r border-slate-200">
                                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: PHASE_COLORS.planner }} />
                                    <span className="text-[10px] font-medium text-slate-500">Planner</span>
                                </div>
                                <div className="flex items-center gap-1.5 pl-3">
                                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: PHASE_COLORS['pos-venda'] }} />
                                    <span className="text-[10px] font-medium text-slate-500">Pós-venda</span>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </ChartCard>

            {/* ── Row: Aging + Owner Workload ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Aging Heatmap */}
                <ChartCard
                    title={dateRef === 'stage' ? 'Tempo na Etapa (Aging)' : 'Tempo desde Criação (Aging)'}
                    description={dateRef === 'stage'
                        ? 'Cards por faixa de dias na etapa atual'
                        : 'Cards por faixa de dias desde a criação'}
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
                                    <th className="text-center px-2 py-2 text-slate-500 font-medium">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {aging.map((row: PipelineCurrentAging) => {
                                    const rowTotal = row.bucket_0_3 + row.bucket_3_7 + row.bucket_7_14 + row.bucket_14_plus
                                    return (
                                        <tr key={row.stage_id} className="border-b border-slate-50">
                                            <td className="py-1.5 pr-3 text-slate-700 font-medium truncate max-w-[160px]" title={stageDisplayNames.get(row.stage_id) || row.stage_nome}>
                                                {truncateLabel(stageDisplayNames.get(row.stage_id) || row.stage_nome)}
                                            </td>
                                            {(['bucket_0_3', 'bucket_3_7', 'bucket_7_14', 'bucket_14_plus'] as const).map((bucket) => {
                                                const pct = rowTotal > 0 ? Math.round(row[bucket] / rowTotal * 100) : 0
                                                return (
                                                    <td key={bucket} className="text-center px-1 py-1.5">
                                                        <button
                                                            className={cn(
                                                                'inline-flex items-center justify-center min-w-[2.5rem] h-6 px-1 rounded text-[10px] font-semibold transition-colors',
                                                                agingCellColor(row[bucket]),
                                                                row[bucket] > 0 && 'hover:ring-1 hover:ring-indigo-300 cursor-pointer'
                                                            )}
                                                            onClick={() => row[bucket] > 0 && handleStageDrill(row.stage_id, `${row.stage_nome} — ${bucket.replace('bucket_', '').replace('_plus', '+').replace('_', '-')}d`)}
                                                            disabled={row[bucket] === 0}
                                                        >
                                                            {row[bucket]}{rowTotal > 0 && row[bucket] > 0 && <span className="ml-0.5 text-[8px] opacity-70">({pct}%)</span>}
                                                        </button>
                                                    </td>
                                                )
                                            })}
                                            <td className="text-center px-2 py-1.5 text-slate-600 font-semibold tabular-nums">{rowTotal}</td>
                                        </tr>
                                    )
                                })}
                                {/* Totals row */}
                                {aging.length > 0 && (
                                    <tr className="border-t border-slate-200 bg-slate-50/50">
                                        <td className="py-1.5 pr-3 text-slate-500 font-semibold">Total</td>
                                        {(['bucket_0_3', 'bucket_3_7', 'bucket_7_14', 'bucket_14_plus'] as const).map(bucket => (
                                            <td key={bucket} className="text-center px-2 py-1.5 text-slate-600 font-semibold tabular-nums">
                                                {agingTotals[bucket]}
                                            </td>
                                        ))}
                                        <td className="text-center px-2 py-1.5 text-slate-800 font-bold tabular-nums">
                                            {agingTotals.bucket_0_3 + agingTotals.bucket_3_7 + agingTotals.bucket_7_14 + agingTotals.bucket_14_plus}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </ChartCard>

                {/* Owner Workload */}
                <ChartCard
                    title="Carga por Consultor"
                    description={
                        phaseFilter === 'all'
                            ? `Por responsável — ${metric === 'cards' ? 'quantidade' : metric === 'faturamento' ? 'faturamento' : 'receita'}`
                            : `${PHASE_LABELS[phaseFilter]} por responsável`
                    }
                    isLoading={isLoading}
                >
                    <div style={{ width: '100%', height: Math.max(280, ownerChartData.length * 36 + 40) }}>
                        <ResponsiveContainer>
                            <BarChart data={ownerChartData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                                <XAxis
                                    type="number"
                                    tick={{ fontSize: 11, fill: '#64748b' }}
                                    tickFormatter={isMonetary ? (v: number) => `${(v / 1000).toFixed(0)}k` : undefined}
                                />
                                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} width={130} />
                                <Tooltip
                                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                                    formatter={tooltipFormatter}
                                />
                                {ownerBarKeys.map(key => (
                                    <Bar
                                        key={key}
                                        dataKey={key}
                                        stackId="a"
                                        fill={getPhaseColor(key)}
                                        cursor="pointer"
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        onClick={(_data: any, idx: number) => {
                                            const o = ownerChartData[idx]
                                            if (o?.owner_id) handleOwnerFilter(o.owner_id as string)
                                        }}
                                    />
                                ))}
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </ChartCard>
            </div>

            {/* ── Performance por Consultor ── */}
            <ChartCard
                title="Performance por Consultor"
                description={`${sortedOwners.length} consultores${phaseFilter !== 'all' ? ` em ${PHASE_LABELS[phaseFilter]}` : ''} — clique para filtrar`}
                colSpan={2}
                isLoading={isLoading}
            >
                <div className="px-4 pb-2 overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b border-slate-200">
                                <th className="text-left py-2.5 pr-3 text-slate-500 font-medium">Consultor</th>
                                <th className="text-left py-2.5 px-2 text-slate-500 font-medium">Fase</th>
                                <th
                                    className="text-right py-2.5 px-2 text-slate-500 font-medium cursor-pointer hover:text-slate-700 select-none"
                                    onClick={() => toggleOwnerSort('total_cards')}
                                >
                                    <span className="inline-flex items-center justify-end">Cards {ownerSortIcon('total_cards')}</span>
                                </th>
                                <th
                                    className="text-right py-2.5 px-2 text-slate-500 font-medium cursor-pointer hover:text-slate-700 select-none"
                                    onClick={() => toggleOwnerSort('total_value')}
                                >
                                    <span className="inline-flex items-center justify-end">Fat. {ownerSortIcon('total_value')}</span>
                                </th>
                                <th
                                    className="text-right py-2.5 px-2 text-slate-500 font-medium cursor-pointer hover:text-slate-700 select-none"
                                    onClick={() => toggleOwnerSort('total_receita')}
                                >
                                    <span className="inline-flex items-center justify-end">Rec. {ownerSortIcon('total_receita')}</span>
                                </th>
                                <th
                                    className="text-right py-2.5 px-2 text-slate-500 font-medium cursor-pointer hover:text-slate-700 select-none"
                                    onClick={() => toggleOwnerSort('avg_age_days')}
                                >
                                    <span className="inline-flex items-center justify-end">Idade {ownerSortIcon('avg_age_days')}</span>
                                </th>
                                <th
                                    className="text-right py-2.5 px-2 text-slate-500 font-medium cursor-pointer hover:text-slate-700 select-none"
                                    onClick={() => toggleOwnerSort('sla_breach')}
                                >
                                    <span className="inline-flex items-center justify-end">SLA {ownerSortIcon('sla_breach')}</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedOwners.map((owner) => {
                                const isOwnerSelected = ownerIds.length === 1 && ownerIds[0] === owner.owner_id
                                return (
                                    <tr
                                        key={owner.owner_id ?? 'unassigned'}
                                        className={cn(
                                            'border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors',
                                            isOwnerSelected && 'bg-indigo-50/50 border-l-2 border-l-indigo-400'
                                        )}
                                        onClick={() => handleOwnerFilter(owner.owner_id)}
                                    >
                                        <td className="py-2 pr-3 text-slate-800 font-medium">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600 shrink-0">
                                                    {owner.owner_nome.charAt(0)}
                                                </div>
                                                {owner.owner_nome}
                                            </div>
                                        </td>
                                        <td className="py-2 px-2">
                                            <div className="flex items-center gap-1">
                                                {owner.by_phase.sdr > 0 && (
                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold text-white" style={{ background: PHASE_COLORS.sdr }}>
                                                        {owner.by_phase.sdr}
                                                    </span>
                                                )}
                                                {owner.by_phase.planner > 0 && (
                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold text-white" style={{ background: PHASE_COLORS.planner }}>
                                                        {owner.by_phase.planner}
                                                    </span>
                                                )}
                                                {owner.by_phase['pos-venda'] > 0 && (
                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold text-white" style={{ background: PHASE_COLORS['pos-venda'] }}>
                                                        {owner.by_phase['pos-venda']}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-2 px-2 text-right text-slate-700 tabular-nums font-semibold">
                                            {owner.total_cards}
                                        </td>
                                        <td className="py-2 px-2 text-right text-slate-700 tabular-nums">
                                            {formatCurrency(owner.total_value)}
                                        </td>
                                        <td className="py-2 px-2 text-right text-slate-700 tabular-nums">
                                            {formatCurrency(owner.total_receita)}
                                        </td>
                                        <td className="py-2 px-2 text-right tabular-nums">
                                            <span className={cn(
                                                'text-slate-700',
                                                owner.avg_age_days > (dateRef === 'stage' ? 14 : 90) && 'text-rose-600 font-semibold',
                                                owner.avg_age_days > (dateRef === 'stage' ? 7 : 60) && owner.avg_age_days <= (dateRef === 'stage' ? 14 : 90) && 'text-amber-600 font-semibold',
                                            )}>
                                                {owner.avg_age_days}d
                                            </span>
                                        </td>
                                        <td className="py-2 px-2 text-right tabular-nums">
                                            {owner.sla_breach > 0 ? (
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700">
                                                    {owner.sla_breach}
                                                </span>
                                            ) : (
                                                <span className="text-green-600 font-medium">0</span>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                            {sortedOwners.length === 0 && !isLoading && (
                                <tr>
                                    <td colSpan={7} className="py-8 text-center text-slate-400">
                                        Nenhum consultor com cards{phaseFilter !== 'all' ? ` em ${PHASE_LABELS[phaseFilter]}` : ''}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </ChartCard>

            {/* ── Atividade de Tarefas — KPIs + Por Tipo ── */}
            <ChartCard
                title="Atividade de Tarefas"
                description={`${taskMetrics?.total_created ?? 0} tarefas nos ${kpis.total_open} cards em aberto`}
                colSpan={2}
                isLoading={isLoading}
            >
                {taskMetrics && taskMetrics.total_created > 0 ? (
                    <div className="px-4 pb-4 space-y-4">
                        <div className="grid grid-cols-4 gap-4">
                            <div className="bg-slate-50 rounded-lg p-3 text-center">
                                <p className="text-2xl font-bold text-slate-900 tabular-nums">
                                    {taskMetrics.total_created}
                                </p>
                                <p className="text-xs text-slate-500 mt-0.5">Total</p>
                            </div>
                            <div className="bg-green-50 rounded-lg p-3 text-center">
                                <p className="text-2xl font-bold text-green-700 tabular-nums">
                                    {taskMetrics.total_completed}
                                </p>
                                <p className="text-xs text-slate-500 mt-0.5">Concluídas</p>
                            </div>
                            <div className="bg-amber-50 rounded-lg p-3 text-center">
                                <p className="text-2xl font-bold text-amber-700 tabular-nums">
                                    {taskMetrics.total_pending}
                                </p>
                                <p className="text-xs text-slate-500 mt-0.5">Pendentes</p>
                            </div>
                            <div className={cn(
                                'rounded-lg p-3 text-center',
                                taskMetrics.total_overdue > 0 ? 'bg-rose-50' : 'bg-slate-50'
                            )}>
                                <p className={cn(
                                    'text-2xl font-bold tabular-nums',
                                    taskMetrics.total_overdue > 0 ? 'text-rose-700' : 'text-slate-400'
                                )}>
                                    {taskMetrics.total_overdue}
                                </p>
                                <p className="text-xs text-slate-500 mt-0.5">Atrasadas</p>
                            </div>
                        </div>

                        {taskMetrics.by_type.length > 0 && (
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b border-slate-200">
                                            <th className="text-left py-2 text-slate-500 font-medium">Tipo</th>
                                            <th className="text-right py-2 px-2 text-slate-500 font-medium">Total</th>
                                            <th className="text-right py-2 px-2 text-slate-500 font-medium">Concluídas</th>
                                            <th className="text-right py-2 px-2 text-slate-500 font-medium">Pendentes</th>
                                            <th className="text-right py-2 px-2 text-slate-500 font-medium">Atrasadas</th>
                                            <th className="text-right py-2 text-slate-500 font-medium">Taxa</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {taskMetrics.by_type.map(row => {
                                            const rate = row.total > 0
                                                ? Math.round((row.completed / row.total) * 100) : 0
                                            return (
                                                <tr key={row.tipo} className="border-b border-slate-50 hover:bg-slate-50">
                                                    <td className="py-2 text-slate-700 font-medium">
                                                        {TASK_TYPE_LABELS[row.tipo] ?? row.tipo}
                                                    </td>
                                                    <td className="py-2 px-2 text-right tabular-nums text-slate-700">
                                                        {row.total}
                                                    </td>
                                                    <td className="py-2 px-2 text-right tabular-nums text-green-700 font-semibold">
                                                        {row.completed}
                                                    </td>
                                                    <td className="py-2 px-2 text-right tabular-nums text-amber-700">
                                                        {row.pending}
                                                    </td>
                                                    <td className="py-2 px-2 text-right tabular-nums">
                                                        {row.overdue > 0 ? (
                                                            <span className="text-rose-700 font-semibold">{row.overdue}</span>
                                                        ) : (
                                                            <span className="text-slate-300">0</span>
                                                        )}
                                                    </td>
                                                    <td className="py-2 text-right">
                                                        <span className={cn(
                                                            'inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold',
                                                            rate >= 70 ? 'bg-green-100 text-green-700' :
                                                            rate >= 40 ? 'bg-amber-100 text-amber-700' :
                                                                         'bg-rose-100 text-rose-700'
                                                        )}>
                                                            {rate}%
                                                        </span>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                ) : (
                    !isLoading && (
                        <div className="px-4 pb-4 text-center text-slate-400 text-sm py-8">
                            Nenhuma tarefa nos cards em aberto
                        </div>
                    )
                )}
            </ChartCard>

            {/* ── Tarefas por Etapa ── */}
            <ChartCard
                title="Tarefas por Etapa"
                description="Atividade de tarefas em cada etapa do pipeline"
                colSpan={2}
                isLoading={isLoading}
            >
                {taskMetrics && taskMetrics.by_stage.length > 0 ? (
                    <div className="px-4 pb-2 overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-slate-200">
                                    <th className="text-left py-2.5 text-slate-500 font-medium">Etapa</th>
                                    <th className="text-right py-2.5 px-2 text-slate-500 font-medium">Cards</th>
                                    <th className="text-right py-2.5 px-2 text-slate-500 font-medium">Tarefas</th>
                                    <th className="text-right py-2.5 px-2 text-slate-500 font-medium">Concluídas</th>
                                    <th className="text-right py-2.5 px-2 text-slate-500 font-medium">Pendentes</th>
                                    <th className="text-right py-2.5 px-2 text-slate-500 font-medium">Atrasadas</th>
                                    <th className="text-right py-2.5 text-slate-500 font-medium">Taxa</th>
                                </tr>
                            </thead>
                            <tbody>
                                {taskMetrics.by_stage.map(row => {
                                    const rate = row.total > 0
                                        ? Math.round((row.completed / row.total) * 100) : 0
                                    const phaseColor = getPhaseColor(row.fase_slug)
                                    return (
                                        <tr key={row.stage_id} className="border-b border-slate-50 hover:bg-slate-50">
                                            <td className="py-2 pr-3">
                                                <div className="flex items-center gap-2">
                                                    <span
                                                        className="w-2 h-2 rounded-full shrink-0"
                                                        style={{ backgroundColor: phaseColor }}
                                                    />
                                                    <span className="text-slate-700 font-medium truncate max-w-[200px]">
                                                        {row.stage_nome}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="py-2 px-2 text-right tabular-nums text-slate-500">
                                                {row.card_count}
                                            </td>
                                            <td className="py-2 px-2 text-right tabular-nums text-slate-700 font-medium">
                                                {row.total}
                                            </td>
                                            <td className="py-2 px-2 text-right tabular-nums text-green-700 font-semibold">
                                                {row.completed}
                                            </td>
                                            <td className="py-2 px-2 text-right tabular-nums text-amber-700">
                                                {row.pending}
                                            </td>
                                            <td className="py-2 px-2 text-right tabular-nums">
                                                {row.overdue > 0 ? (
                                                    <span className="text-rose-700 font-semibold">{row.overdue}</span>
                                                ) : (
                                                    <span className="text-slate-300">0</span>
                                                )}
                                            </td>
                                            <td className="py-2 text-right">
                                                {row.total > 0 ? (
                                                    <span className={cn(
                                                        'inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold',
                                                        rate >= 70 ? 'bg-green-100 text-green-700' :
                                                        rate >= 40 ? 'bg-amber-100 text-amber-700' :
                                                                     'bg-rose-100 text-rose-700'
                                                    )}>
                                                        {rate}%
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-300 text-[10px]">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    !isLoading && (
                        <div className="px-4 pb-4 text-center text-slate-400 text-sm py-8">
                            Nenhuma tarefa por etapa
                        </div>
                    )
                )}
            </ChartCard>

            {/* ── Tarefas por Consultor ── */}
            <ChartCard
                title="Tarefas por Consultor"
                description="Execução de tarefas por responsável do card"
                colSpan={2}
                isLoading={isLoading}
            >
                {taskMetrics && taskMetrics.by_owner.length > 0 ? (
                    <div className="px-4 pb-2 overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-slate-200">
                                    <th className="text-left py-2.5 text-slate-500 font-medium">Consultor</th>
                                    <th className="text-right py-2.5 px-2 text-slate-500 font-medium">Cards</th>
                                    <th className="text-right py-2.5 px-2 text-slate-500 font-medium">Tarefas</th>
                                    <th className="text-right py-2.5 px-2 text-slate-500 font-medium">Concluídas</th>
                                    <th className="text-right py-2.5 px-2 text-slate-500 font-medium">Pendentes</th>
                                    <th className="text-right py-2.5 px-2 text-slate-500 font-medium">Atrasadas</th>
                                    <th className="text-right py-2.5 text-slate-500 font-medium">Taxa</th>
                                </tr>
                            </thead>
                            <tbody>
                                {taskMetrics.by_owner.map(row => {
                                    const rate = row.total > 0
                                        ? Math.round((row.completed / row.total) * 100) : 0
                                    const isSelected = row.owner_id && ownerIds.includes(row.owner_id)
                                    return (
                                        <tr
                                            key={row.owner_id ?? 'unassigned'}
                                            className={cn(
                                                'border-b border-slate-50 hover:bg-slate-50 cursor-pointer',
                                                isSelected && 'bg-indigo-50/50 border-l-2 border-l-indigo-400'
                                            )}
                                            onClick={() => {
                                                if (row.owner_id) {
                                                    setOwnerIds(
                                                        ownerIds.includes(row.owner_id)
                                                            ? ownerIds.filter(id => id !== row.owner_id)
                                                            : [row.owner_id]
                                                    )
                                                }
                                            }}
                                        >
                                            <td className="py-2 pr-3 text-slate-700 font-medium">
                                                {row.owner_nome}
                                            </td>
                                            <td className="py-2 px-2 text-right tabular-nums text-slate-500">
                                                {row.card_count}
                                            </td>
                                            <td className="py-2 px-2 text-right tabular-nums text-slate-700 font-medium">
                                                {row.total}
                                            </td>
                                            <td className="py-2 px-2 text-right tabular-nums text-green-700 font-semibold">
                                                {row.completed}
                                            </td>
                                            <td className="py-2 px-2 text-right tabular-nums text-amber-700">
                                                {row.pending}
                                            </td>
                                            <td className="py-2 px-2 text-right tabular-nums">
                                                {row.overdue > 0 ? (
                                                    <span className="text-rose-700 font-semibold">{row.overdue}</span>
                                                ) : (
                                                    <span className="text-slate-300">0</span>
                                                )}
                                            </td>
                                            <td className="py-2 text-right">
                                                {row.total > 0 ? (
                                                    <span className={cn(
                                                        'inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold',
                                                        rate >= 70 ? 'bg-green-100 text-green-700' :
                                                        rate >= 40 ? 'bg-amber-100 text-amber-700' :
                                                                     'bg-rose-100 text-rose-700'
                                                    )}>
                                                        {rate}%
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-300 text-[10px]">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    !isLoading && (
                        <div className="px-4 pb-4 text-center text-slate-400 text-sm py-8">
                            Nenhuma tarefa por consultor
                        </div>
                    )
                )}
            </ChartCard>

            {/* ── Deals em Risco ── */}
            <ChartCard
                title="Deals em Risco"
                description={`Top ${sortedDeals.length} cards — ordenado por ${
                    dealSort.field === 'days_in_stage' ? (dateRef === 'stage' ? 'tempo na etapa' : 'tempo desde criação')
                    : dealSort.field === 'valor_total' ? 'faturamento'
                    : dealSort.field === 'receita' ? 'receita'
                    : 'responsável'
                } ${dealSort.dir === 'desc' ? '(maior)' : '(menor)'}`}
                colSpan={2}
                isLoading={isLoading}
            >
                <div className="px-4 pb-2 overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b border-slate-200">
                                <th className="text-left py-2.5 pr-3 text-slate-500 font-medium">Titulo</th>
                                <th className="text-left py-2.5 px-2 text-slate-500 font-medium">Contato</th>
                                <th className="text-left py-2.5 px-2 text-slate-500 font-medium">Fase / Etapa</th>
                                <th
                                    className="text-left py-2.5 px-2 text-slate-500 font-medium cursor-pointer hover:text-slate-700 select-none"
                                    onClick={() => toggleDealSort('owner_nome')}
                                >
                                    <span className="inline-flex items-center">Responsável {sortIcon('owner_nome')}</span>
                                </th>
                                <th
                                    className="text-right py-2.5 px-2 text-slate-500 font-medium cursor-pointer hover:text-slate-700 select-none"
                                    onClick={() => toggleDealSort('valor_total')}
                                >
                                    <span className="inline-flex items-center justify-end">Fat. {sortIcon('valor_total')}</span>
                                </th>
                                <th
                                    className="text-right py-2.5 px-2 text-slate-500 font-medium cursor-pointer hover:text-slate-700 select-none"
                                    onClick={() => toggleDealSort('receita')}
                                >
                                    <span className="inline-flex items-center justify-end">Rec. {sortIcon('receita')}</span>
                                </th>
                                <th
                                    className="text-right py-2.5 px-2 text-slate-500 font-medium cursor-pointer hover:text-slate-700 select-none"
                                    onClick={() => toggleDealSort('days_in_stage')}
                                >
                                    <span className="inline-flex items-center justify-end">Dias {sortIcon('days_in_stage')}</span>
                                </th>
                                <th className="text-center py-2.5 pl-2 text-slate-500 font-medium">SLA</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedDeals.map((deal) => {
                                const risk = getDealRisk(deal, dateRef)
                                return (
                                    <tr
                                        key={deal.card_id}
                                        className={cn('border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors', RISK_STYLES[risk])}
                                        onClick={() => navigate(`/cards/${deal.card_id}`)}
                                    >
                                        <td className="py-2 pr-3 text-slate-800 font-medium truncate max-w-[200px]" title={deal.titulo}>
                                            {deal.titulo}
                                        </td>
                                        <td className="py-2 px-2 text-slate-500 truncate max-w-[120px]" title={deal.pessoa_nome || ''}>
                                            {deal.pessoa_nome || '—'}
                                        </td>
                                        <td className="py-2 px-2">
                                            <div className="flex items-center gap-1.5">
                                                <span
                                                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold text-white shrink-0"
                                                    style={{ background: getPhaseColor(deal.fase_slug) }}
                                                >
                                                    {deal.fase_slug === 'sdr' ? 'SDR' : deal.fase_slug === 'planner' ? 'PLAN' : 'POS'}
                                                </span>
                                                <span className="text-slate-600 truncate max-w-[100px]" title={deal.stage_nome}>{deal.stage_nome}</span>
                                            </div>
                                        </td>
                                        <td className="py-2 px-2 truncate max-w-[120px]" title={deal.owner_nome}>
                                            <button
                                                className={cn(
                                                    'text-slate-600 hover:text-indigo-600 hover:underline transition-colors',
                                                    ownerIds.length === 1 && ownerIds[0] === deal.owner_id && 'text-indigo-600 font-semibold'
                                                )}
                                                onClick={(e) => { e.stopPropagation(); handleOwnerFilter(deal.owner_id) }}
                                            >
                                                {deal.owner_nome}
                                            </button>
                                        </td>
                                        <td className="py-2 px-2 text-right text-slate-700 tabular-nums">
                                            {deal.valor_total > 0 ? formatCurrency(deal.valor_total) : '—'}
                                        </td>
                                        <td className="py-2 px-2 text-right text-slate-700 tabular-nums">
                                            {(deal.receita || 0) > 0 ? formatCurrency(deal.receita) : '—'}
                                        </td>
                                        <td className="py-2 px-2 text-right tabular-nums font-semibold text-slate-800">
                                            {deal.days_in_stage}
                                        </td>
                                        <td className="py-2 pl-2 text-center">
                                            {deal.sla_hours ? (
                                                deal.is_sla_breach ? (
                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700">Excedido</span>
                                                ) : (
                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700">OK</span>
                                                )
                                            ) : (
                                                <span className="text-slate-300">—</span>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                            {sortedDeals.length === 0 && !isLoading && (
                                <tr>
                                    <td colSpan={8} className="py-8 text-center text-slate-400">
                                        Nenhum card em aberto{phaseFilter !== 'all' ? ` em ${PHASE_LABELS[phaseFilter]}` : ''}
                                        {(debouncedMin || debouncedMax) ? ' nesta faixa de valor' : ''}
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
