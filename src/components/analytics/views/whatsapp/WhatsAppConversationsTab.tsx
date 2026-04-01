import { useState, useEffect } from 'react'
import {
    MessageCircle, Clock, ArrowUpDown, ChevronLeft, ChevronRight,
    ExternalLink, Search, Filter, X, Phone, User,
} from 'lucide-react'
import KpiCard from '../../KpiCard'
import { QueryErrorState } from '@/components/ui/QueryErrorState'
import {
    useWhatsAppConversations,
    type ConversationStatus, type ConversationSortKey,
} from '@/hooks/analytics/useWhatsAppConversations'
import { usePipelineStages } from '@/hooks/usePipelineStages'
import { usePipelinePhases } from '@/hooks/usePipelinePhases'
import { useAnalyticsFilters } from '@/hooks/analytics/useAnalyticsFilters'
import { useProducts } from '@/hooks/useProducts'
import { cn } from '@/lib/utils'
import { fmt, formatMinutes, formatPhone, formatDate, formatTimeSince } from '@/utils/whatsappFormatters'
import { Link } from 'react-router-dom'
import ConversationDrawer from './ConversationDrawer'

// ── Status Helpers ──

function statusBadge(status: ConversationStatus) {
    switch (status) {
        case 'waiting':
            return { label: 'Aguardando', className: 'bg-amber-50 text-amber-700 border-amber-200' }
        case 'responded':
            return { label: 'Respondida', className: 'bg-green-50 text-green-700 border-green-200' }
        case 'inactive':
            return { label: 'Inativa', className: 'bg-slate-50 text-slate-500 border-slate-200' }
    }
}

function frtBadge(minutes: number): string {
    if (minutes < 0) return 'bg-slate-50 text-slate-400 border-slate-200'
    if (minutes <= 5) return 'bg-green-50 text-green-700 border-green-200'
    if (minutes <= 30) return 'bg-amber-50 text-amber-700 border-amber-200'
    return 'bg-rose-50 text-rose-700 border-rose-200'
}

const STATUS_FILTERS: { value: ConversationStatus | null; label: string }[] = [
    { value: null, label: 'Todas' },
    { value: 'waiting', label: 'Aguardando' },
    { value: 'responded', label: 'Respondidas' },
    { value: 'inactive', label: 'Inativas' },
]

const PHASE_OPTIONS = [
    { value: null, label: 'Todas as fases' },
    { value: 'sdr', label: 'SDR (Pré-Venda)' },
    { value: 'planner', label: 'Planner (Venda)' },
    { value: 'pos_venda', label: 'Pós-Venda' },
    { value: 'resolucao', label: 'Resolução' },
] as const

const PHASE_BADGE: Record<string, string> = {
    sdr: 'bg-blue-50 text-blue-700 border-blue-200',
    planner: 'bg-violet-50 text-violet-700 border-violet-200',
    pos_venda: 'bg-green-50 text-green-700 border-green-200',
    resolucao: 'bg-slate-50 text-slate-500 border-slate-200',
}

// ── Props ──

interface ConversationsTabProps {
    initialStatus?: ConversationStatus | null
}

// ── Main Tab ──

export default function WhatsAppConversationsTab({ initialStatus }: ConversationsTabProps) {
    const {
        data, isLoading, error, refetch,
        statusFilter, setStatusFilter,
        sortBy, sortDir, toggleSort,
        page, setPage, totalPages,
        search, setSearch,
        phaseSlug, setPhaseSlug,
        stageId, setStageId,
        instance, setInstance,
    } = useWhatsAppConversations()

    const { product } = useAnalyticsFilters()
    const { products } = useProducts()
    const pipelineId = products.find(p => p.slug === product)?.pipeline_id ?? undefined
    const { data: stages } = usePipelineStages(pipelineId)
    const { data: phases } = usePipelinePhases(pipelineId)

    // Conversation drawer state
    const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
    const [selectedContactName, setSelectedContactName] = useState<string | null>(null)

    // Apply initial status from cross-tab navigation
    useEffect(() => {
        if (initialStatus !== undefined && initialStatus !== null) {
            setStatusFilter(initialStatus)
        }
    }, [initialStatus, setStatusFilter])

    const summary = data?.summary
    const rows = data?.rows || []
    const totalCount = data?.total_count ?? 0
    const byPhase = summary?.by_phase || []

    // Filter stages by selected phase slug
    const filteredStages = (() => {
        if (!phaseSlug || !stages || !phases) return []
        const phase = phases.find(p => p.slug === phaseSlug)
        if (!phase) return []
        return stages.filter(s => s.phase_id === phase.id)
    })()

    const byInstance = summary?.by_instance || []
    const instanceLabels = summary?.instance_labels || []

    const hasActiveFilters = phaseSlug || stageId || search || instance

    return (
        <div className="space-y-6">
            {/* Error State */}
            {error && (
                <QueryErrorState compact title="Erro ao carregar conversas" onRetry={() => refetch()} />
            )}

            {/* KPIs — clicáveis para filtrar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard
                    title="Total de Conversas"
                    value={fmt(summary?.total_conversations ?? 0)}
                    subtitle={`${fmt(summary?.with_card_count ?? 0)} com card vinculado`}
                    icon={MessageCircle}
                    color="text-blue-600"
                    bgColor="bg-blue-50"
                    isLoading={isLoading}
                    onClick={() => setStatusFilter(null)}
                    clickHint="Mostrar todas"
                />
                <KpiCard
                    title="Conversas Ativas"
                    value={fmt(summary?.active_conversations ?? 0)}
                    subtitle="Com atividade nos últimos 7 dias"
                    icon={MessageCircle}
                    color="text-green-600"
                    bgColor="bg-green-50"
                    isLoading={isLoading}
                    onClick={() => setStatusFilter('responded')}
                    clickHint="Filtrar respondidas"
                />
                <KpiCard
                    title="Aguardando Resposta"
                    value={fmt(summary?.waiting_count ?? 0)}
                    subtitle="Clique para filtrar"
                    icon={Clock}
                    color={(summary?.waiting_count ?? 0) > 0 ? 'text-amber-600' : 'text-green-600'}
                    bgColor={(summary?.waiting_count ?? 0) > 0 ? 'bg-amber-50' : 'bg-green-50'}
                    isLoading={isLoading}
                    onClick={() => setStatusFilter('waiting')}
                    clickHint="Ver aguardando resposta"
                />
                <KpiCard
                    title="Duração Média"
                    value={summary ? formatMinutes(summary.avg_conversation_hours * 60) : '—'}
                    subtitle="Da 1ª à última mensagem"
                    icon={Clock}
                    color="text-indigo-600"
                    bgColor="bg-indigo-50"
                    isLoading={isLoading}
                />
            </div>

            {/* Breakdowns: Phase + Instance side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Phase Breakdown — clickable */}
                {byPhase.length > 1 && (
                    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5">
                        <h3 className="text-sm font-semibold text-slate-700 mb-3">Por Fase do Funil</h3>
                        <div className="space-y-2">
                            {byPhase.map(phase => {
                                const maxCount = Math.max(...byPhase.map(p => p.count), 1)
                                const pct = Math.round(phase.count / (summary?.total_conversations || 1) * 100)
                                const isActive = phaseSlug === phase.phase_slug
                                const isClickable = phase.phase_slug !== 'sem_card'
                                return (
                                    <button
                                        key={phase.phase_slug}
                                        onClick={() => isClickable && setPhaseSlug(isActive ? null : phase.phase_slug)}
                                        disabled={!isClickable}
                                        className={cn(
                                            'w-full flex items-center gap-3 py-1.5 px-2 rounded-lg transition-colors text-left',
                                            isActive ? 'bg-indigo-50 ring-1 ring-indigo-200' : isClickable ? 'hover:bg-slate-50' : 'opacity-60 cursor-default'
                                        )}
                                    >
                                        <span className="text-xs text-slate-600 w-32 shrink-0 truncate font-medium">{phase.phase_label}</span>
                                        <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                                className={cn(
                                                    'h-full rounded-full transition-all duration-500',
                                                    phase.phase_slug === 'sdr' ? 'bg-blue-400' :
                                                    phase.phase_slug === 'planner' ? 'bg-violet-400' :
                                                    phase.phase_slug === 'pos_venda' ? 'bg-green-400' :
                                                    phase.phase_slug === 'resolucao' ? 'bg-slate-400' :
                                                    'bg-amber-300'
                                                )}
                                                style={{ width: `${Math.max((phase.count / maxCount) * 100, 3)}%` }}
                                            />
                                        </div>
                                        <span className="text-xs text-slate-500 tabular-nums w-10 text-right">{pct}%</span>
                                        <span className="text-xs text-slate-800 font-semibold tabular-nums w-10 text-right">{fmt(phase.count)}</span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* Instance Breakdown — clickable */}
                {byInstance.length > 1 && (
                    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5">
                        <h3 className="text-sm font-semibold text-slate-700 mb-1">Por Instância WhatsApp</h3>
                        <p className="text-[11px] text-slate-400 mb-3">Clique para filtrar por linha</p>
                        <div className="space-y-2">
                            {byInstance.filter(inst => inst.label !== 'Não identificado' || inst.count > 10).map(inst => {
                                const maxCount = Math.max(...byInstance.map(i => i.count), 1)
                                const pct = Math.round(inst.count / (summary?.total_conversations || 1) * 100)
                                const isActive = instance === inst.label
                                const isClickable = inst.label !== 'Não identificado'
                                return (
                                    <button
                                        key={inst.label}
                                        onClick={() => isClickable && setInstance(isActive ? null : inst.label)}
                                        disabled={!isClickable}
                                        className={cn(
                                            'w-full flex items-center gap-3 py-1.5 px-2 rounded-lg transition-colors text-left',
                                            isActive ? 'bg-indigo-50 ring-1 ring-indigo-200' : isClickable ? 'hover:bg-slate-50' : 'opacity-60'
                                        )}
                                    >
                                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                        <span className="text-xs text-slate-600 w-28 shrink-0 truncate font-medium">{inst.label}</span>
                                        <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-indigo-400 transition-all duration-500"
                                                style={{ width: `${Math.max((inst.count / maxCount) * 100, 3)}%` }}
                                            />
                                        </div>
                                        <span className="text-xs text-slate-500 tabular-nums w-10 text-right">{pct}%</span>
                                        <span className="text-xs text-slate-800 font-semibold tabular-nums w-10 text-right">{fmt(inst.count)}</span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Filters + Table */}
            <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
                {/* Header with search + filters */}
                <div className="px-6 py-4 border-b border-slate-100 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <div>
                            <h3 className="text-sm font-semibold text-slate-800">Lista de Conversas</h3>
                            <p className="text-xs text-slate-400">
                                {fmt(totalCount)} conversas
                                {hasActiveFilters && ' (filtradas)'}
                                {' · Clique em uma linha para ver a conversa'}
                            </p>
                        </div>
                        <div className="flex items-center gap-1">
                            {STATUS_FILTERS.map((f) => {
                                const count = f.value === 'waiting' ? summary?.waiting_count
                                    : f.value === 'responded' ? summary?.responded_count
                                    : f.value === 'inactive' ? summary?.inactive_count
                                    : null
                                return (
                                    <button
                                        key={f.value ?? 'all'}
                                        onClick={() => setStatusFilter(f.value)}
                                        className={cn(
                                            'px-3 py-1.5 text-xs font-medium rounded-md transition-colors inline-flex items-center gap-1.5',
                                            statusFilter === f.value
                                                ? 'bg-indigo-100 text-indigo-700'
                                                : 'text-slate-500 hover:bg-slate-50'
                                        )}
                                    >
                                        {f.label}
                                        {count != null && count > 0 && (
                                            <span className={cn(
                                                'text-[10px] px-1.5 py-0.5 rounded-full font-bold',
                                                f.value === 'waiting' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                                            )}>
                                                {count}
                                            </span>
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* Search + Filters row */}
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className="relative flex-1 min-w-[200px] max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Buscar por nome ou telefone..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-slate-400"
                            />
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
                            {/* Phase filter */}
                            <select
                                value={phaseSlug ?? ''}
                                onChange={(e) => setPhaseSlug(e.target.value || null)}
                                className="text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                {PHASE_OPTIONS.map(opt => (
                                    <option key={opt.value ?? ''} value={opt.value ?? ''}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                            {/* Stage filter (when phase selected) */}
                            {phaseSlug && filteredStages.length > 0 && (
                                <select
                                    value={stageId ?? ''}
                                    onChange={(e) => setStageId(e.target.value || null)}
                                    className="text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="">Todas as etapas</option>
                                    {filteredStages.map(s => (
                                        <option key={s.id} value={s.id}>{s.nome}</option>
                                    ))}
                                </select>
                            )}
                            {/* Instance filter (WhatsApp line) */}
                            <select
                                value={instance ?? ''}
                                onChange={(e) => setInstance(e.target.value || null)}
                                className={cn(
                                    'text-xs border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500',
                                    instance ? 'border-indigo-300 text-indigo-700' : 'border-slate-200 text-slate-600'
                                )}
                            >
                                <option value="">Todas as instâncias</option>
                                {instanceLabels.filter(l => l && l.length > 3).map(label => (
                                    <option key={label} value={label}>{label}</option>
                                ))}
                            </select>
                        </div>
                        {hasActiveFilters && (
                            <button
                                onClick={() => { setSearch(''); setPhaseSlug(null); setStageId(null); setInstance(null) }}
                                className="text-xs text-rose-600 hover:text-rose-800 flex items-center gap-1"
                            >
                                <X className="w-3 h-3" />
                                Limpar filtros
                            </button>
                        )}
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    {isLoading ? (
                        <div className="h-[400px] flex items-center justify-center">
                            <div className="w-8 h-8 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
                        </div>
                    ) : rows.length === 0 ? (
                        <div className="h-[300px] flex flex-col items-center justify-center text-sm text-slate-400 gap-2">
                            <MessageCircle className="w-8 h-8 text-slate-300" />
                            <p>Nenhuma conversa encontrada</p>
                            {(search || phaseSlug || stageId || instance || statusFilter) && <p className="text-xs">Tente ajustar os filtros</p>}
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/50">
                                    <th className="text-left px-6 py-3 font-medium text-slate-500">Contato</th>
                                    <th className="text-left px-3 py-3 font-medium text-slate-500 hidden md:table-cell">Responsável</th>
                                    <th className="text-right px-3 py-3 font-medium text-slate-500">
                                        <SortHeader label="Msgs" sortKey="total_messages" currentSort={sortBy} currentDir={sortDir} onSort={toggleSort} />
                                    </th>
                                    <th className="text-right px-3 py-3 font-medium text-slate-500 hidden md:table-cell">
                                        <SortHeader label="1ª Resposta" sortKey="first_response_min" currentSort={sortBy} currentDir={sortDir} onSort={toggleSort} />
                                    </th>
                                    <th className="text-left px-3 py-3 font-medium text-slate-500 hidden xl:table-cell">Etapa</th>
                                    <th className="text-right px-3 py-3 font-medium text-slate-500">
                                        <SortHeader label="Última Msg" sortKey="last_message_at" currentSort={sortBy} currentDir={sortDir} onSort={toggleSort} />
                                    </th>
                                    <th className="text-center px-3 py-3 font-medium text-slate-500">Status</th>
                                    <th className="text-center px-3 py-3 font-medium text-slate-500 hidden lg:table-cell">Card</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => {
                                    const sb = statusBadge(row.status)
                                    const isWaiting = row.status === 'waiting'
                                    return (
                                        <tr
                                            key={row.contact_id}
                                            onClick={() => {
                                                setSelectedContactId(row.contact_id)
                                                setSelectedContactName(row.contact_name)
                                            }}
                                            className={cn(
                                                'border-b border-slate-50 hover:bg-indigo-50/30 transition-colors cursor-pointer',
                                                isWaiting && 'bg-amber-50/30'
                                            )}
                                        >
                                            {/* Contato — nome, telefone, instância */}
                                            <td className="px-6 py-3">
                                                <div>
                                                    <p className="text-slate-700 font-medium truncate max-w-[200px]">
                                                        {row.contact_name || 'Desconhecido'}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="text-[11px] text-slate-400 tabular-nums">
                                                            {formatPhone(row.contact_phone) || '—'}
                                                        </span>
                                                        {row.instance_label && (
                                                            <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                                                {row.instance_label}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            {/* Responsável (owner do card) */}
                                            <td className="px-3 py-3 hidden md:table-cell">
                                                {row.owner_name ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <User className="w-3 h-3 text-slate-400 shrink-0" />
                                                        <span className="text-xs text-slate-600 truncate max-w-[120px]">{row.owner_name}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-[11px] text-slate-300">Sem dono</span>
                                                )}
                                            </td>
                                            {/* Mensagens — total com tooltip de breakdown */}
                                            <td className="text-right px-3 py-3">
                                                <div className="tabular-nums">
                                                    <span className="text-slate-700 font-semibold">{fmt(row.total_messages)}</span>
                                                    <div className="text-[10px] text-slate-400 mt-0.5 hidden sm:block">
                                                        {fmt(row.inbound_count)}↓ {fmt(row.outbound_count)}↑
                                                        {row.ai_count > 0 && (
                                                            <span className="text-violet-500 ml-1">{fmt(row.ai_count)} IA</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            {/* 1ª Resposta */}
                                            <td className="text-right px-3 py-3 hidden md:table-cell">
                                                <span className={cn(
                                                    'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border',
                                                    frtBadge(row.first_response_min)
                                                )}>
                                                    {formatMinutes(row.first_response_min)}
                                                </span>
                                            </td>
                                            {/* Etapa do pipeline */}
                                            <td className="px-3 py-3 hidden xl:table-cell">
                                                {row.stage_name ? (
                                                    <span className={cn(
                                                        'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border truncate max-w-[140px]',
                                                        PHASE_BADGE[row.phase_slug || ''] || 'bg-slate-50 text-slate-500 border-slate-200'
                                                    )}>
                                                        {row.stage_name}
                                                    </span>
                                                ) : (
                                                    <span className="text-[11px] text-slate-300">—</span>
                                                )}
                                            </td>
                                            {/* Última mensagem + waiting since */}
                                            <td className="text-right px-3 py-3 text-xs text-slate-500">
                                                <div className="tabular-nums">{formatDate(row.last_message_at)}</div>
                                                {isWaiting && (
                                                    <div className="text-[10px] text-amber-600 font-medium mt-0.5">
                                                        {formatTimeSince(row.hours_since_last)}
                                                    </div>
                                                )}
                                            </td>
                                            {/* Status */}
                                            <td className="text-center px-3 py-3">
                                                <span className={cn(
                                                    'inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border',
                                                    sb.className
                                                )}>
                                                    {sb.label}
                                                </span>
                                            </td>
                                            {/* Card link */}
                                            <td className="text-center px-3 py-3 hidden lg:table-cell">
                                                {row.card_id ? (
                                                    <Link
                                                        to={`/cards/${row.card_id}`}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                                                        title={row.card_titulo || undefined}
                                                    >
                                                        <ExternalLink className="w-3 h-3" />
                                                        Ver
                                                    </Link>
                                                ) : (
                                                    <span className="text-xs text-slate-300">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between">
                        <p className="text-xs text-slate-400">
                            Página {page + 1} de {totalPages} · {fmt(totalCount)} conversas
                        </p>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setPage(Math.max(0, page - 1))}
                                disabled={page === 0}
                                className="p-1.5 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                                disabled={page >= totalPages - 1}
                                className="p-1.5 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Conversation Drawer */}
            <ConversationDrawer
                contactId={selectedContactId}
                contactName={selectedContactName}
                onClose={() => setSelectedContactId(null)}
            />
        </div>
    )
}

// ── Sort Header Helper ──

function SortHeader({
    label, sortKey, currentSort, currentDir, onSort,
}: {
    label: string
    sortKey: ConversationSortKey
    currentSort: ConversationSortKey
    currentDir: 'asc' | 'desc'
    onSort: (key: ConversationSortKey) => void
}) {
    const active = currentSort === sortKey
    return (
        <button
            onClick={() => onSort(sortKey)}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors whitespace-nowrap"
        >
            {label}
            <ArrowUpDown className={cn('w-3 h-3', active ? 'text-indigo-600' : 'text-slate-300')} />
            {active && (
                <span className="text-[10px] text-indigo-500">{currentDir === 'asc' ? '↑' : '↓'}</span>
            )}
        </button>
    )
}
