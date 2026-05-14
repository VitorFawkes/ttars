import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Gauge, Loader2, MessageSquare, Percent, Plane, Search, Send, Smile, X } from 'lucide-react'
import {
    CartesianGrid,
    Line,
    LineChart,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts'
import AdminPageHeader from '../components/admin/ui/AdminPageHeader'
import { useNPSKpis, type NPSKpis, type NPSPeriod } from '../hooks/useNPSKpis'
import { useNPSResponses, type NPSResponseRow } from '../hooks/useNPSResponses'
import { useNPSMonthlyTrend, type TrendGranularity } from '../hooks/useNPSMonthlyTrend'
import { cn } from '../lib/utils'

type StatColor = 'indigo' | 'green' | 'red' | 'amber' | 'blue' | 'purple' | 'slate' | 'emerald' | 'rose'

const COLOR_MAP: Record<StatColor, string> = {
    indigo: 'bg-indigo-50 text-indigo-600',
    green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-600',
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    slate: 'bg-slate-50 text-slate-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    rose: 'bg-rose-50 text-rose-600',
}

type PeriodPreset =
    | 'all'
    | 'this_month'
    | 'last_month'
    | 'last_3_months'
    | 'this_year'
    | 'last_year'
    | 'custom'

const PERIOD_LABELS: Record<PeriodPreset, string> = {
    all: 'Todo o período',
    this_month: 'Este mês',
    last_month: 'Mês passado',
    last_3_months: 'Últimos 3 meses',
    this_year: 'Este ano',
    last_year: 'Ano passado',
    custom: 'Período personalizado',
}

function presetToRange(
    preset: PeriodPreset,
    customStart: string,
    customEnd: string,
): NPSPeriod {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()

    switch (preset) {
        case 'all':
            return { start: null, end: null }
        case 'this_month':
            return {
                start: new Date(y, m, 1),
                end: new Date(y, m + 1, 1),
            }
        case 'last_month':
            return {
                start: new Date(y, m - 1, 1),
                end: new Date(y, m, 1),
            }
        case 'last_3_months':
            return {
                start: new Date(y, m - 2, 1),
                end: new Date(y, m + 1, 1),
            }
        case 'this_year':
            return {
                start: new Date(y, 0, 1),
                end: new Date(y + 1, 0, 1),
            }
        case 'last_year':
            return {
                start: new Date(y - 1, 0, 1),
                end: new Date(y, 0, 1),
            }
        case 'custom': {
            const start = customStart ? new Date(`${customStart}T00:00:00`) : null
            const end = customEnd ? new Date(`${customEnd}T23:59:59`) : null
            return { start, end }
        }
    }
}

function StatCard({
    icon: Icon,
    label,
    value,
    subtitle,
    color = 'slate',
}: {
    icon: React.ComponentType<{ className?: string }>
    label: string
    value: string | number
    subtitle?: string
    color?: StatColor
}) {
    return (
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4">
            <div className="flex items-start justify-between">
                <div className={cn('p-2 rounded-lg', COLOR_MAP[color])}>
                    <Icon className="w-4 h-4" />
                </div>
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-3">{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
    )
}

function npsScoreColor(score: number | null): StatColor {
    if (score === null) return 'slate'
    if (score >= 50) return 'emerald'
    if (score >= 0) return 'indigo'
    if (score >= -50) return 'amber'
    return 'rose'
}

function segmentOf(score: number): { label: string; container: string; badge: string } {
    if (score >= 9) {
        return {
            label: 'Promotor',
            container: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            badge: 'bg-emerald-100 text-emerald-700',
        }
    }
    if (score >= 7) {
        return {
            label: 'Passivo',
            container: 'bg-amber-50 text-amber-700 border-amber-200',
            badge: 'bg-amber-100 text-amber-700',
        }
    }
    return {
        label: 'Detrator',
        container: 'bg-rose-50 text-rose-700 border-rose-200',
        badge: 'bg-rose-100 text-rose-700',
    }
}

function formatDate(iso: string): string {
    try {
        const d = new Date(iso)
        return new Intl.DateTimeFormat('pt-BR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }).format(d)
    } catch {
        return iso
    }
}

function normalize(s: string): string {
    return s
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim()
}

function NPSEmptyState({ kpis, hasFilters }: { kpis: NPSKpis | undefined; hasFilters: boolean }) {
    const hasSurveysSent = (kpis?.sent ?? 0) > 0
    return (
        <div className="flex flex-col items-center justify-center py-16 bg-white border border-dashed border-slate-200 rounded-xl">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                <Smile className="h-8 w-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-2 tracking-tight">
                {hasFilters
                    ? 'Nenhum resultado com esses filtros'
                    : hasSurveysSent
                        ? 'Nenhuma resposta ainda'
                        : 'NPS ainda não configurado'}
            </h3>
            <p className="text-sm text-slate-500 text-center max-w-sm">
                {hasFilters
                    ? 'Ajuste o período ou a busca para ver mais respostas.'
                    : hasSurveysSent
                        ? 'As pesquisas já foram enviadas. Quando os clientes responderem, elas aparecem aqui.'
                        : 'O envio automático de pesquisas será ativado em breve. As respostas chegam por webhook e aparecem nesta página.'}
            </p>
        </div>
    )
}

function NPSResponseCard({ row }: { row: NPSResponseRow }) {
    const segment = segmentOf(row.score)
    const hasCard = row.card_id !== null
    const headerLabel = row.card_titulo || row.original_name || row.contato_nome || 'Resposta sem card vinculado'
    const subLabel = row.card_titulo
        ? row.contato_nome
        : row.contato_nome && row.contato_nome !== row.card_titulo
            ? row.contato_nome
            : null

    const containerClass = cn(
        'block bg-white rounded-xl border border-slate-200 shadow-sm transition-all duration-200',
        hasCard
            ? 'hover:shadow-md hover:border-indigo-200 cursor-pointer'
            : 'cursor-default',
    )

    const content = (
        <div className="p-4 flex items-start gap-4">
            <div className={cn('flex flex-col items-center justify-center w-14 h-14 rounded-xl border', segment.container)}>
                <span className="text-2xl font-bold leading-none tracking-tight">{row.score}</span>
                <span className="text-[10px] font-medium opacity-80 mt-0.5">/10</span>
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="min-w-0">
                        <h3 className="font-medium text-slate-900 truncate">
                            {headerLabel}
                        </h3>
                        {subLabel && (
                            <p className="text-xs text-slate-500 mt-0.5">{subLabel}</p>
                        )}
                        {!hasCard && (
                            <p className="text-xs text-slate-400 mt-0.5 italic">Sem card vinculado</p>
                        )}
                    </div>
                    <span className={cn('shrink-0 px-2 py-0.5 rounded-full text-xs font-medium', segment.badge)}>
                        {segment.label}
                    </span>
                </div>

                {row.comment && (
                    <p className="text-sm text-slate-600 whitespace-pre-wrap mt-2">
                        “{row.comment}”
                    </p>
                )}

                {row.proximo_destino && (
                    <div className="flex items-start gap-1.5 mt-2 text-xs text-slate-600">
                        <Plane className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                        <span className="text-slate-500 shrink-0">Próximo destino:</span>
                        <span className="font-medium text-slate-700 whitespace-pre-wrap break-words">{row.proximo_destino}</span>
                    </div>
                )}

                <div className="flex items-center gap-3 mt-3 text-xs text-slate-500">
                    <span>{formatDate(row.responded_at)}</span>
                    {row.channel && row.channel !== 'unknown' && (
                        <span className="capitalize">via {row.channel}</span>
                    )}
                </div>
            </div>
        </div>
    )

    if (hasCard) {
        return (
            <a
                href={`/cards/${row.card_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className={containerClass}
            >
                {content}
            </a>
        )
    }

    return <div className={containerClass}>{content}</div>
}

function TrendChart({ period }: { period: NPSPeriod }) {
    const { data, isLoading } = useNPSMonthlyTrend(period)
    const buckets = data?.buckets ?? []
    const granularity: TrendGranularity = data?.granularity ?? 'month'
    const subtitle = data?.subtitle ?? 'Últimos 12 meses'
    const hasAnyData = buckets.some((b) => b.npsScore !== null)

    if (isLoading) {
        return (
            <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4 h-48 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
            </div>
        )
    }

    if (!hasAnyData) {
        return null
    }

    // Com muitos pontos (filtro custom longo) o eixo X fica apertado — esconder uns labels
    const tickInterval = buckets.length > 16 ? Math.ceil(buckets.length / 12) : 0
    const title = granularity === 'week' ? 'NPS Score por semana' : 'NPS Score por mês'

    return (
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
                <div>
                    <h3 className="text-sm font-medium text-slate-900 tracking-tight">{title}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
                </div>
            </div>
            <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={buckets} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                        <XAxis
                            dataKey="label"
                            tick={{ fontSize: 11, fill: '#64748b' }}
                            axisLine={{ stroke: '#cbd5e1' }}
                            tickLine={false}
                            interval={tickInterval as never}
                        />
                        <YAxis
                            domain={[-100, 100]}
                            tick={{ fontSize: 11, fill: '#64748b' }}
                            axisLine={false}
                            tickLine={false}
                            width={40}
                        />
                        <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="3 3" />
                        <ReferenceLine y={50} stroke="#a7f3d0" strokeDasharray="3 3" />
                        <Tooltip
                            contentStyle={{
                                background: 'white',
                                border: '1px solid #e2e8f0',
                                borderRadius: 8,
                                fontSize: 12,
                            }}
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            formatter={(value: any, _name: string, props: any) => {
                                const total = props?.payload?.total ?? 0
                                return [`${value} (${total} resp.)`, 'NPS Score']
                            }}
                        />
                        <Line
                            type="monotone"
                            dataKey="npsScore"
                            stroke="#4f46e5"
                            strokeWidth={2}
                            dot={{ r: granularity === 'week' && buckets.length > 16 ? 2 : 3, fill: '#4f46e5' }}
                            activeDot={{ r: 5 }}
                            connectNulls={false}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}

const PAGE_SIZE_OPTIONS = [6, 12, 24, 50] as const
const DEFAULT_PAGE_SIZE = 6

export default function NPSPage() {
    const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('all')
    const [customStart, setCustomStart] = useState<string>('')
    const [customEnd, setCustomEnd] = useState<string>('')
    const [searchQuery, setSearchQuery] = useState<string>('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE)

    const period = useMemo(
        () => presetToRange(periodPreset, customStart, customEnd),
        [periodPreset, customStart, customEnd],
    )

    const { data: kpis, isLoading: loadingKpis } = useNPSKpis(period)
    const { data: allResponses = [], isLoading: loadingList } = useNPSResponses(period)

    const filteredResponses = useMemo(() => {
        const q = normalize(searchQuery)
        if (!q) return allResponses
        return allResponses.filter((row) => {
            const haystack = [
                row.card_titulo,
                row.contato_nome,
                row.original_name,
                row.comment,
                row.proximo_destino,
            ]
                .filter(Boolean)
                .map((s) => normalize(s as string))
                .join(' ')
            return haystack.includes(q)
        })
    }, [allResponses, searchQuery])

    const totalPages = Math.max(1, Math.ceil(filteredResponses.length / pageSize))
    const safePage = Math.min(page, totalPages)
    const pagedResponses = useMemo(() => {
        const start = (safePage - 1) * pageSize
        return filteredResponses.slice(start, start + pageSize)
    }, [filteredResponses, safePage, pageSize])

    useEffect(() => {
        setPage(1)
    }, [periodPreset, customStart, customEnd, searchQuery, pageSize])

    const npsScoreDisplay = kpis?.npsScore === null || kpis?.npsScore === undefined ? '—' : kpis.npsScore
    const subtitleSegments =
        kpis && kpis.responded > 0
            ? `${kpis.promoters} promotores · ${kpis.passives} passivos · ${kpis.detractors} detratores`
            : 'promotores − detratores'
    const hasFilters = periodPreset !== 'all' || searchQuery.length > 0

    return (
        <div className="flex-1 overflow-auto bg-slate-50">
            <div className="p-6 max-w-[1400px] mx-auto">
                <AdminPageHeader
                    title="NPS"
                    subtitle="Satisfação dos clientes — pesquisas enviadas, respostas recebidas e score consolidado"
                    icon={<Smile className="w-5 h-5" />}
                />

                {/* Toolbar — período + busca */}
                <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-3 mb-6">
                    <div className="flex flex-col md:flex-row gap-3 md:items-center">
                        <div className="flex items-center gap-2">
                            <label className="text-xs font-medium text-slate-500 shrink-0">Período</label>
                            <select
                                value={periodPreset}
                                onChange={(e) => setPeriodPreset(e.target.value as PeriodPreset)}
                                className="text-sm bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                            >
                                {(Object.keys(PERIOD_LABELS) as PeriodPreset[]).map((k) => (
                                    <option key={k} value={k}>
                                        {PERIOD_LABELS[k]}
                                    </option>
                                ))}
                            </select>

                            {periodPreset === 'custom' && (
                                <div className="flex items-center gap-1.5 ml-1">
                                    <input
                                        type="date"
                                        value={customStart}
                                        onChange={(e) => setCustomStart(e.target.value)}
                                        className="text-sm bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                                    />
                                    <span className="text-xs text-slate-400">até</span>
                                    <input
                                        type="date"
                                        value={customEnd}
                                        onChange={(e) => setCustomEnd(e.target.value)}
                                        className="text-sm bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="flex-1 relative">
                            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Buscar por nome, comentário ou destino..."
                                className="w-full text-sm bg-white border border-slate-200 rounded-lg pl-9 pr-9 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-slate-100"
                                    aria-label="Limpar busca"
                                >
                                    <X className="w-3.5 h-3.5 text-slate-400" />
                                </button>
                            )}
                        </div>

                        <div className="text-xs text-slate-500 shrink-0">
                            {filteredResponses.length} {filteredResponses.length === 1 ? 'resposta' : 'respostas'}
                        </div>
                    </div>
                </div>

                {/* KPIs (refletem o período) */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <StatCard
                        icon={Send}
                        label="Pesquisas enviadas"
                        value={loadingKpis ? '—' : kpis?.sent ?? 0}
                        color="slate"
                    />
                    <StatCard
                        icon={MessageSquare}
                        label="Respostas recebidas"
                        value={loadingKpis ? '—' : kpis?.responded ?? 0}
                        color="indigo"
                    />
                    <StatCard
                        icon={Percent}
                        label="Taxa de resposta"
                        value={loadingKpis ? '—' : `${kpis?.responseRate ?? 0}%`}
                        color="blue"
                    />
                    <StatCard
                        icon={Gauge}
                        label="NPS Score"
                        value={loadingKpis ? '—' : npsScoreDisplay}
                        subtitle={subtitleSegments}
                        color={npsScoreColor(kpis?.npsScore ?? null)}
                    />
                </div>

                {/* Gráfico — granularidade automática (dia vs mês) com base no período */}
                <div className="mb-6">
                    <TrendChart period={period} />
                </div>

                {/* Lista filtrada */}
                {loadingList ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                    </div>
                ) : filteredResponses.length === 0 ? (
                    <NPSEmptyState kpis={kpis} hasFilters={hasFilters} />
                ) : (
                    <>
                        <div className="space-y-3">
                            {pagedResponses.map((row) => (
                                <NPSResponseCard key={row.id} row={row} />
                            ))}
                        </div>

                        {/* Paginação */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mt-6">
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <span>Mostrando</span>
                                <select
                                    value={pageSize}
                                    onChange={(e) => setPageSize(Number(e.target.value))}
                                    className="bg-white border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                                >
                                    {PAGE_SIZE_OPTIONS.map((n) => (
                                        <option key={n} value={n}>
                                            {n}
                                        </option>
                                    ))}
                                </select>
                                <span>
                                    por página · {(safePage - 1) * pageSize + 1}–
                                    {Math.min(safePage * pageSize, filteredResponses.length)} de {filteredResponses.length}
                                </span>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={safePage <= 1}
                                    className={cn(
                                        'flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg transition-colors',
                                        safePage <= 1
                                            ? 'bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed'
                                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50',
                                    )}
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                    Anterior
                                </button>
                                <span className="text-sm text-slate-600 px-2 min-w-[80px] text-center">
                                    Página <span className="font-medium text-slate-900">{safePage}</span> de {totalPages}
                                </span>
                                <button
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    disabled={safePage >= totalPages}
                                    className={cn(
                                        'flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg transition-colors',
                                        safePage >= totalPages
                                            ? 'bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed'
                                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50',
                                    )}
                                >
                                    Próxima
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
