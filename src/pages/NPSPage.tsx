import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Archive, ChevronDown, Gauge, Loader2, Plane, Search, Smile, Ticket, X } from 'lucide-react'
import {
    Area,
    AreaChart,
    CartesianGrid,
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
import { useContactAvailableCards } from '../hooks/useContactAvailableCards'
import { cn } from '../lib/utils'

/** Card resumido (id + título) de uma viagem do contato, pra renderizar como chip. */
interface ContactCardChip {
    id: string
    titulo: string
}

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
            return { start: new Date(y, m, 1), end: new Date(y, m + 1, 1) }
        case 'last_month':
            return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) }
        case 'last_3_months':
            return { start: new Date(y, m - 2, 1), end: new Date(y, m + 1, 1) }
        case 'this_year':
            return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1) }
        case 'last_year':
            return { start: new Date(y - 1, 0, 1), end: new Date(y, 0, 1) }
        case 'custom': {
            const start = customStart ? new Date(`${customStart}T00:00:00`) : null
            const end = customEnd ? new Date(`${customEnd}T23:59:59`) : null
            return { start, end }
        }
    }
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

/** Barra horizontal empilhada: promotores (emerald) / passivos (amber) / detratores (rose). */
function NPSDistributionBar({
    promoters,
    passives,
    detractors,
}: {
    promoters: number
    passives: number
    detractors: number
}) {
    const total = promoters + passives + detractors
    const pct = (n: number) => (total > 0 ? `${(n / total) * 100}%` : '0%')
    return (
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            {promoters > 0 && (
                <div className="bg-emerald-500" style={{ width: pct(promoters) }} title={`${promoters} promotores`} />
            )}
            {passives > 0 && (
                <div className="bg-amber-400" style={{ width: pct(passives) }} title={`${passives} passivos`} />
            )}
            {detractors > 0 && (
                <div className="bg-rose-500" style={{ width: pct(detractors) }} title={`${detractors} detratores`} />
            )}
        </div>
    )
}

/** Tile compacto de métrica pra trilha lateral. */
function MiniStat({ value, label }: { value: string | number; label: string }) {
    return (
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-3">
            <p className="text-lg font-bold text-slate-900 tracking-tight leading-none">{value}</p>
            <p className="text-[11px] text-slate-500 mt-1">{label}</p>
        </div>
    )
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

function NPSResponseCard({ row, cards }: { row: NPSResponseRow; cards: ContactCardChip[] }) {
    const navigate = useNavigate()
    const [expanded, setExpanded] = useState(false)
    const detailRef = useRef<HTMLDivElement>(null)
    const [detailHeight, setDetailHeight] = useState(0)
    useLayoutEffect(() => {
        if (detailRef.current) setDetailHeight(detailRef.current.scrollHeight + 8)
    }, [row.comment, row.proximo_destino])
    const hasMoreChips = cards.length > NPS_CHIPS_COLLAPSED
    const canExpand = detailHeight > NPS_DETAIL_COLLAPSED_H || hasMoreChips
    const visibleChips = expanded ? cards : cards.slice(0, NPS_CHIPS_COLLAPSED)
    const segment = segmentOf(row.score)
    const contactName = row.contato_nome || row.original_name || null
    const headerLabel = contactName || row.card_titulo || row.original_phone || 'Resposta sem contato vinculado'

    return (
        <div
            role={canExpand ? 'button' : undefined}
            tabIndex={canExpand ? 0 : undefined}
            onClick={canExpand ? () => setExpanded((v) => !v) : undefined}
            onKeyDown={canExpand ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setExpanded((v) => !v)
                }
            } : undefined}
            className={cn(
                'h-full bg-white rounded-xl border border-slate-200 shadow-sm transition-[box-shadow,border-color] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40',
                canExpand && 'cursor-pointer [@media(hover:hover)]:hover:border-indigo-200 [@media(hover:hover)]:hover:shadow-md',
            )}
        >
            <div className="p-4 flex items-start gap-3.5">
                <div className={cn('flex flex-col items-center justify-center w-12 h-12 shrink-0 rounded-xl border', segment.container)}>
                    <span className="text-xl font-bold leading-none tracking-tight">{row.score}</span>
                    <span className="text-[10px] font-medium opacity-80 mt-0.5">/10</span>
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="font-medium text-slate-900 truncate min-w-0" title={headerLabel}>
                            {headerLabel}
                        </h3>
                        <span className={cn('shrink-0 px-2 py-0.5 rounded-full text-xs font-medium', segment.badge)}>
                            {segment.label}
                        </span>
                    </div>

                    {(row.comment || row.proximo_destino) && (
                        <div
                            className="relative overflow-hidden transition-[max-height] duration-300 ease-out-strong"
                            style={{ maxHeight: expanded ? detailHeight : NPS_DETAIL_COLLAPSED_H }}
                        >
                            <div ref={detailRef}>
                                {row.comment && (
                                    <p className="text-sm text-slate-600 whitespace-pre-wrap mt-1.5">“{row.comment}”</p>
                                )}
                                {row.proximo_destino && (
                                    <div className="flex items-start gap-1.5 mt-2 text-xs text-slate-600">
                                        <Plane className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                                        <span className="text-slate-500 shrink-0">Próximo destino:</span>
                                        <span className="font-medium text-slate-700 whitespace-pre-wrap break-words">{row.proximo_destino}</span>
                                    </div>
                                )}
                            </div>
                            {/* Fade que sugere "tem mais" quando recolhido */}
                            <div
                                className={cn(
                                    'pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white to-transparent transition-opacity duration-200 ease-out',
                                    expanded || !canExpand ? 'opacity-0' : 'opacity-100',
                                )}
                            />
                        </div>
                    )}

                    {/* Cards do contato (um contato pode ter mais de uma viagem) */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-3">
                        {cards.length > 0 ? (
                            <>
                                {visibleChips.map((c) => (
                                    <button
                                        key={c.id}
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            navigate(`/cards/${c.id}`)
                                        }}
                                        title={c.titulo}
                                        className="inline-flex items-center gap-1 max-w-[200px] px-2 py-1 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100 active:scale-[0.97] transition-[transform,background-color] duration-150 ease-out-strong"
                                    >
                                        <Ticket className="w-3 h-3 shrink-0" />
                                        <span className="truncate">{c.titulo}</span>
                                    </button>
                                ))}
                                {!expanded && hasMoreChips && (
                                    <span
                                        title={`Mais ${cards.length - NPS_CHIPS_COLLAPSED} ${cards.length - NPS_CHIPS_COLLAPSED === 1 ? 'viagem' : 'viagens'}`}
                                        className="inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200"
                                    >
                                        +{cards.length - NPS_CHIPS_COLLAPSED}
                                    </span>
                                )}
                            </>
                        ) : (
                            <span className="text-xs text-slate-400 italic">
                                {contactName ? 'Contato sem card de viagem' : 'Sem contato vinculado'}
                            </span>
                        )}
                    </div>

                    <div className="flex items-center justify-between gap-3 mt-3 text-xs text-slate-500">
                        <div className="flex items-center gap-3 min-w-0">
                            <span>{formatDate(row.responded_at)}</span>
                            {row.channel === 'form' ? (
                                <span className="flex items-baseline gap-1">
                                    via
                                    <span className="font-coolvetica text-sm leading-none text-slate-700 lowercase">looq</span>
                                </span>
                            ) : (
                                row.channel && row.channel !== 'unknown' && (
                                    <span className="capitalize">via {row.channel}</span>
                                )
                            )}
                        </div>
                        {canExpand && (
                            <ChevronDown className={cn('w-4 h-4 shrink-0 text-slate-400 transition-transform duration-200 ease-out', expanded && 'rotate-180')} />
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

function TrendChart({ period }: { period: NPSPeriod }) {
    const { data, isLoading } = useNPSMonthlyTrend(period)
    const buckets = data?.buckets ?? []
    const granularity: TrendGranularity = data?.granularity ?? 'month'
    const subtitle = data?.subtitle ?? 'Últimos 12 meses'
    const hasAnyData = buckets.some((b) => b.npsScore !== null)

    if (isLoading) {
        return (
            <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4 h-56 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
            </div>
        )
    }

    if (!hasAnyData) {
        return null
    }

    // Com muitos pontos (filtro custom longo) o eixo X fica apertado — esconder uns labels
    const tickInterval = buckets.length > 12 ? Math.ceil(buckets.length / 8) : 0
    const title = granularity === 'week' ? 'NPS por semana' : 'NPS por mês'

    return (
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4">
            <div className="mb-3">
                <h3 className="text-sm font-medium text-slate-900 tracking-tight">{title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
            </div>
            <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={buckets} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="npsTrendFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.18} />
                                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" vertical={false} />
                        <XAxis
                            dataKey="label"
                            tick={{ fontSize: 11, fill: '#64748b' }}
                            axisLine={{ stroke: '#e2e8f0' }}
                            tickLine={false}
                            interval={tickInterval as never}
                        />
                        <YAxis
                            domain={[-100, 100]}
                            tick={{ fontSize: 11, fill: '#64748b' }}
                            axisLine={false}
                            tickLine={false}
                            width={36}
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
                                return [`${value} (${total} resp.)`, 'NPS']
                            }}
                        />
                        <Area
                            type="monotone"
                            dataKey="npsScore"
                            stroke="#4f46e5"
                            strokeWidth={2}
                            fill="url(#npsTrendFill)"
                            dot={{ r: 2.5, fill: '#4f46e5' }}
                            activeDot={{ r: 5 }}
                            connectNulls={false}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}

const PAGE_INCREMENT = 12
/** Altura (px) do trecho de comentário/destino visível quando o card está recolhido (~3 linhas). */
const NPS_DETAIL_COLLAPSED_H = 76
/** Quantos chips de viagem mostrar com o card recolhido (o resto aparece ao expandir). */
const NPS_CHIPS_COLLAPSED = 2
/** Respostas anteriores a esta data são o backfill histórico de formulário (legado).
    "Reais" = abril/2026 em diante (WhatsApp de abril + webhook Typeform novo). */
const LEGACY_CUTOFF = new Date('2026-04-01T00:00:00')

export default function NPSPage() {
    const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('all')
    const [customStart, setCustomStart] = useState<string>('')
    const [customEnd, setCustomEnd] = useState<string>('')
    const [searchQuery, setSearchQuery] = useState<string>('')
    const [visibleCount, setVisibleCount] = useState<number>(PAGE_INCREMENT)
    const [hideLegacy, setHideLegacy] = useState<boolean>(true)

    const period = useMemo(
        () => presetToRange(periodPreset, customStart, customEnd),
        [periodPreset, customStart, customEnd],
    )

    // "Ocultar antigas" = não considerar nada antes de abr/2026 (backfill histórico).
    // Clampa o início do período → KPIs, distribuição, tendência e lista ficam consistentes.
    const effectivePeriod = useMemo<NPSPeriod>(() => {
        if (!hideLegacy) return period
        const start = period.start && period.start > LEGACY_CUTOFF ? period.start : LEGACY_CUTOFF
        return { start, end: period.end }
    }, [period, hideLegacy])

    const { data: kpis, isLoading: loadingKpis } = useNPSKpis(effectivePeriod)
    const { data: allResponses = [], isLoading: loadingList } = useNPSResponses(effectivePeriod)

    // Cards de cada contato que respondeu (um contato pode ter várias viagens).
    const contactIds = useMemo(
        () => [...new Set(allResponses.map((r) => r.contact_id).filter((v): v is string => !!v))],
        [allResponses],
    )
    const { data: cardsByContact = {} } = useContactAvailableCards(contactIds)
    const cardsForRow = useMemo(() => {
        return (row: NPSResponseRow): ContactCardChip[] => {
            if (!row.contact_id) return []
            return (cardsByContact[row.contact_id] ?? [])
                .filter((c) => (c.produto ?? '').toUpperCase() === 'TRIPS')
                .map((c) => ({ id: c.id, titulo: c.titulo }))
        }
    }, [cardsByContact])

    const filteredResponses = useMemo(() => {
        const q = normalize(searchQuery)
        if (!q) return allResponses
        return allResponses.filter((row) => {
            const haystack = [
                row.card_titulo,
                row.contato_nome,
                row.original_name,
                row.original_phone,
                row.comment,
                row.proximo_destino,
            ]
                .filter(Boolean)
                .map((s) => normalize(s as string))
                .join(' ')
            return haystack.includes(q)
        })
    }, [allResponses, searchQuery])

    // Reset do load-more ao mudar período/busca — ajuste de estado durante o render
    // (padrão recomendado pelo React em vez de um efeito que dispara re-render em cascata).
    const filterKey = `${periodPreset}|${customStart}|${customEnd}|${searchQuery}|${hideLegacy}`
    const [prevFilterKey, setPrevFilterKey] = useState(filterKey)
    if (filterKey !== prevFilterKey) {
        setPrevFilterKey(filterKey)
        setVisibleCount(PAGE_INCREMENT)
    }

    const visibleResponses = useMemo(
        () => filteredResponses.slice(0, visibleCount),
        [filteredResponses, visibleCount],
    )
    const remaining = filteredResponses.length - visibleResponses.length

    const npsScoreDisplay = kpis?.npsScore === null || kpis?.npsScore === undefined ? '—' : kpis.npsScore
    const hasFilters = periodPreset !== 'all' || searchQuery.length > 0

    return (
        <div className="flex-1 overflow-auto bg-slate-50">
            {/* Cabeçalho (rola normalmente) */}
            <div className="max-w-[1400px] mx-auto px-6 pt-6">
                <AdminPageHeader
                    title="NPS"
                    subtitle="Satisfação dos clientes — pesquisas enviadas, respostas recebidas e score consolidado"
                    icon={<Smile className="w-5 h-5" />}
                />
                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 mb-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>Match entre respostas e cards ainda em refino — alguns vínculos podem faltar.</span>
                </div>
            </div>

            {/* Toolbar fixa (cola no topo ao rolar) */}
            <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-y border-slate-200">
                <div className="max-w-[1400px] mx-auto px-6 py-3 flex flex-col md:flex-row gap-3 md:items-center">
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

                    <button
                        type="button"
                        onClick={() => setHideLegacy((v) => !v)}
                        title="Antigas = respostas importadas antes de abril/2026 (formulário histórico). As reais começam em abril/2026."
                        className={cn(
                            'flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border shrink-0 active:scale-[0.97] transition-[transform,background-color,border-color] duration-150 ease-out-strong',
                            hideLegacy
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300',
                        )}
                    >
                        <Archive className="w-3.5 h-3.5" />
                        {hideLegacy ? 'Antigas ocultas' : 'Antigas visíveis'}
                    </button>

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
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-slate-100 active:scale-[0.97] transition-transform duration-150 ease-out-strong"
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

            {/* Conteúdo: respostas (2 colunas) + trilha de análise fixa */}
            <div className="max-w-[1400px] mx-auto px-6 py-6">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    {/* Respostas */}
                    <div className="lg:col-span-8 min-w-0">
                        {loadingList ? (
                            <div className="flex items-center justify-center py-16">
                                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                            </div>
                        ) : filteredResponses.length === 0 ? (
                            <NPSEmptyState kpis={kpis} hasFilters={hasFilters} />
                        ) : (
                            <>
                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                                    {visibleResponses.map((row, i) => (
                                        <div
                                            key={row.id}
                                            className="animate-nps-enter"
                                            style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
                                        >
                                            <NPSResponseCard row={row} cards={cardsForRow(row)} />
                                        </div>
                                    ))}
                                </div>

                                {remaining > 0 && (
                                    <div className="flex justify-center mt-5">
                                        <button
                                            onClick={() => setVisibleCount((c) => c + PAGE_INCREMENT)}
                                            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 hover:border-slate-300 active:scale-[0.97] transition-[transform,background-color,border-color] duration-150 ease-out-strong"
                                        >
                                            Ver mais {remaining > PAGE_INCREMENT ? PAGE_INCREMENT : remaining} ({remaining} restantes)
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Trilha de análise (fixa ao rolar) */}
                    <aside className="lg:col-span-4 lg:sticky lg:top-20 lg:self-start space-y-4">
                        {/* Hero NPS + distribuição */}
                        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5">
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-xs font-medium text-slate-500">NPS Score</p>
                                    <p className="text-4xl font-bold text-slate-900 tracking-tight mt-1 leading-none">
                                        {loadingKpis ? '—' : npsScoreDisplay}
                                    </p>
                                </div>
                                <div className={cn('p-2.5 rounded-xl', COLOR_MAP[npsScoreColor(kpis?.npsScore ?? null)])}>
                                    <Gauge className="w-5 h-5" />
                                </div>
                            </div>

                            <div className="mt-4">
                                <NPSDistributionBar
                                    promoters={kpis?.promoters ?? 0}
                                    passives={kpis?.passives ?? 0}
                                    detractors={kpis?.detractors ?? 0}
                                />
                                <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2">
                                    <span className="flex items-center gap-1">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                        {kpis?.promoters ?? 0} promotores
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <span className="w-2 h-2 rounded-full bg-amber-400" />
                                        {kpis?.passives ?? 0} passivos
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <span className="w-2 h-2 rounded-full bg-rose-500" />
                                        {kpis?.detractors ?? 0} detratores
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Tiles compactos */}
                        <div className="grid grid-cols-3 gap-3">
                            <MiniStat value={loadingKpis ? '—' : kpis?.sent ?? 0} label="Enviadas" />
                            <MiniStat value={loadingKpis ? '—' : kpis?.responded ?? 0} label="Respostas" />
                            <MiniStat value={loadingKpis ? '—' : `${kpis?.responseRate ?? 0}%`} label="Taxa" />
                        </div>

                        {/* Tendência */}
                        <TrendChart period={effectivePeriod} />
                    </aside>
                </div>
            </div>
        </div>
    )
}
