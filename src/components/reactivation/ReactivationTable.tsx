import { ChevronLeft, ChevronRight, Phone, Eye, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReactivationPattern, ReactivationSort } from '@/hooks/useReactivationPatterns'

interface Props {
    data: ReactivationPattern[]
    loading: boolean
    totalCount: number
    page: number
    pageSize: number
    sort: ReactivationSort
    selectedIds: Set<string>
    onPageChange: (page: number) => void
    onSortChange: (sort: ReactivationSort) => void
    onSelect: (pattern: ReactivationPattern) => void
    onToggleSelect: (contactId: string) => void
    onToggleSelectAllVisible: () => void
}

const MONTH_SHORT = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function formatPattern(p: ReactivationPattern): string {
    const freq = p.travel_frequency_per_year
    if (!freq) return 'Sem padrão'
    const fStr = `${freq.toFixed(1)}x/ano`
    const months = p.peak_months
    if (months && months.length > 0 && months.length <= 4) {
        return `${fStr} em ${months.map(m => MONTH_SHORT[m]).join(', ')}`
    }
    return fStr
}

function formatWindow(p: ReactivationPattern): { label: string; sub: string; cls: string } {
    const d = p.days_until_ideal_contact
    if (d === null || d === undefined) return { label: 'Sem previsão', sub: '', cls: 'text-slate-400' }
    if (d < -90) return { label: `Atrasado ${Math.abs(d)}d`, sub: 'Prioridade baixa', cls: 'text-slate-400' }
    if (d < 0) return { label: `Atrasado ${Math.abs(d)}d`, sub: 'Agir agora', cls: 'text-red-600' }
    if (d <= 30) return { label: `Em ${d} dias`, sub: 'Janela aberta', cls: 'text-amber-600' }
    return { label: `Em ${d} dias`, sub: 'Planejado', cls: 'text-emerald-600' }
}

function formatCurrency(v: number | null): string {
    if (!v) return '-'
    if (v >= 1000) return `R$ ${(v / 1000).toFixed(0)}k`
    return `R$ ${v.toFixed(0)}`
}

function formatLastTrip(daysSince: number | null): string {
    if (daysSince === null) return '-'
    if (daysSince < 90) return `${daysSince}d atrás`
    if (daysSince < 365) return `${Math.round(daysSince / 30)}m atrás`
    return `${(daysSince / 365).toFixed(1)}a atrás`
}

function ScoreBadge({ score }: { score: number | null }) {
    if (score === null) return <span className="text-slate-300">-</span>
    const cls = score >= 75 ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' :
        score >= 50 ? 'bg-amber-50 text-amber-700 ring-amber-200' :
            score >= 30 ? 'bg-slate-50 text-slate-600 ring-slate-200' :
                'bg-slate-50 text-slate-400 ring-slate-100'
    return (
        <span className={cn('inline-flex items-center justify-center w-10 h-7 rounded-lg text-xs font-bold ring-1', cls)}>
            {score}
        </span>
    )
}

function initialsOf(name?: string | null): string {
    if (!name) return '?'
    const parts = name.trim().split(/\s+/)
    return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')
}

type SortCol = ReactivationSort['column']

export default function ReactivationTable({
    data, loading, totalCount, page, pageSize,
    sort, selectedIds, onPageChange, onSortChange, onSelect,
    onToggleSelect, onToggleSelectAllVisible,
}: Props) {
    const totalPages = Math.ceil(totalCount / pageSize)
    const allVisibleSelected = data.length > 0 && data.every(r => selectedIds.has(r.contact_id))
    const someVisibleSelected = data.some(r => selectedIds.has(r.contact_id))

    function handleSort(col: SortCol) {
        onSortChange({
            column: col,
            direction: sort.column === col && sort.direction === 'desc' ? 'asc' : 'desc',
        })
    }

    if (loading && data.length === 0) {
        return (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-16 text-center">
                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-slate-400">Carregando...</p>
            </div>
        )
    }

    if (!loading && data.length === 0) {
        return (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-16 text-center">
                <p className="text-sm font-medium text-slate-500 mb-1">Nenhum contato encontrado</p>
                <p className="text-xs text-slate-400">Ajuste os filtros ou recalcule os padrões.</p>
            </div>
        )
    }

    return (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full">
                <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        <th className="px-3 py-2.5 w-10">
                            <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                checked={allVisibleSelected}
                                ref={el => { if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected }}
                                onChange={onToggleSelectAllVisible}
                                aria-label="Selecionar todos visíveis"
                            />
                        </th>
                        <th className="px-3 py-2.5 w-16 text-left cursor-pointer hover:text-slate-600" onClick={() => handleSort('reactivation_score')}>
                            <span className="flex items-center gap-1">Score {sort.column === 'reactivation_score' && <span className="text-indigo-500">{sort.direction === 'asc' ? '↑' : '↓'}</span>}</span>
                        </th>
                        <th className="px-3 py-2.5 text-left">Cliente</th>
                        <th className="px-3 py-2.5 text-left hidden xl:table-cell">Sinais</th>
                        <th className="px-3 py-2.5 text-left hidden lg:table-cell">Destinos</th>
                        <th className="px-3 py-2.5 text-left cursor-pointer hover:text-slate-600" onClick={() => handleSort('days_until_ideal_contact')}>
                            <span className="flex items-center gap-1">Janela {sort.column === 'days_until_ideal_contact' && <span className="text-indigo-500">{sort.direction === 'asc' ? '↑' : '↓'}</span>}</span>
                        </th>
                        <th className="px-3 py-2.5 text-left hidden md:table-cell cursor-pointer hover:text-slate-600" onClick={() => handleSort('avg_trip_value')}>
                            <span className="flex items-center gap-1">Ticket {sort.column === 'avg_trip_value' && <span className="text-indigo-500">{sort.direction === 'asc' ? '↑' : '↓'}</span>}</span>
                        </th>
                        <th className="px-3 py-2.5 text-left hidden md:table-cell cursor-pointer hover:text-slate-600" onClick={() => handleSort('days_since_last_trip')}>
                            <span className="flex items-center gap-1">Última viagem {sort.column === 'days_since_last_trip' && <span className="text-indigo-500">{sort.direction === 'asc' ? '↑' : '↓'}</span>}</span>
                        </th>
                        <th className="px-3 py-2.5 text-left hidden lg:table-cell">Resp.</th>
                        <th className="px-3 py-2.5 w-20"></th>
                    </tr>
                </thead>
                <tbody>
                    {data.map((row, idx) => {
                        const ct = row.contato
                        const resp = row.responsavel
                        const win = formatWindow(row)
                        const isSelected = selectedIds.has(row.contact_id)
                        const hasBday = row.days_until_birthday !== null && row.days_until_birthday >= 0 && row.days_until_birthday <= 30
                        return (
                            <tr
                                key={row.contact_id}
                                className={cn(
                                    'group cursor-pointer transition-colors border-b border-slate-50 last:border-0',
                                    isSelected ? 'bg-indigo-50/60' : (idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'),
                                    'hover:bg-indigo-50/40',
                                )}
                                onClick={() => onSelect(row)}
                            >
                                <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                        checked={isSelected}
                                        onChange={() => onToggleSelect(row.contact_id)}
                                        aria-label={`Selecionar ${ct?.nome ?? ''}`}
                                    />
                                </td>
                                <td className="px-3 py-3">
                                    <ScoreBadge score={row.reactivation_score} />
                                </td>
                                <td className="px-3 py-3 max-w-[240px]">
                                    <p className="text-sm font-medium text-slate-900 truncate">
                                        {ct?.nome} {ct?.sobrenome}
                                        {hasBday && <span className="ml-1.5 text-pink-500" title={`Aniversário em ${row.days_until_birthday}d`}>🎂</span>}
                                        {row.is_referrer && <span className="ml-1 text-amber-500 text-[10px]" title={`Indicou ${row.referral_count} clientes`}>★{row.referral_count}</span>}
                                    </p>
                                    <p className="text-xs text-slate-400 truncate">
                                        {formatPattern(row)} · {row.total_completed_trips} viagens
                                    </p>
                                </td>
                                <td className="px-3 py-3 hidden xl:table-cell">
                                    <div className="flex flex-wrap gap-1">
                                        {row.recent_interaction_warning && (
                                            <span title={row.days_since_interaction !== null ? `Última interação há ${row.days_since_interaction}d` : 'Em contato recente'} className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 text-[10px] px-2 py-0.5">
                                                <AlertCircle className="w-3 h-3" />
                                                Em contato
                                            </span>
                                        )}
                                        {row.last_lost_reason_name && (
                                            <span title={`Última perda: ${row.last_lost_reason_name}`} className="inline-flex items-center rounded-full bg-rose-50 text-rose-700 ring-1 ring-rose-200 text-[10px] px-2 py-0.5">
                                                {row.last_lost_reason_name}
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-3 py-3 hidden lg:table-cell max-w-[180px]">
                                    <div className="flex flex-wrap gap-1">
                                        {(row.last_destinations ?? []).slice(0, 2).map(d => (
                                            <span key={d} className="inline-flex items-center rounded-full bg-slate-100 text-slate-600 text-[10px] px-2 py-0.5 truncate max-w-[80px]" title={d}>{d}</span>
                                        ))}
                                        {(row.last_destinations?.length ?? 0) > 2 && (
                                            <span className="text-[10px] text-slate-400">+{(row.last_destinations?.length ?? 0) - 2}</span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-3 py-3">
                                    <p className={cn('text-sm font-semibold', win.cls)}>{win.label}</p>
                                    {win.sub && <p className="text-[10px] text-slate-400">{win.sub}</p>}
                                </td>
                                <td className="px-3 py-3 hidden md:table-cell">
                                    <p className="text-sm font-medium text-slate-700">{formatCurrency(row.avg_trip_value)}</p>
                                </td>
                                <td className="px-3 py-3 hidden md:table-cell">
                                    <p className="text-sm text-slate-600">{formatLastTrip(row.days_since_last_trip)}</p>
                                </td>
                                <td className="px-3 py-3 hidden lg:table-cell">
                                    {resp ? (
                                        resp.avatar_url ? (
                                            <img src={resp.avatar_url} alt={resp.nome ?? ''} title={resp.nome ?? ''} className="h-7 w-7 rounded-full object-cover" />
                                        ) : (
                                            <span title={resp.nome ?? ''} className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-semibold">
                                                {initialsOf(resp.nome)}
                                            </span>
                                        )
                                    ) : (
                                        <span className="text-[10px] text-slate-300">sem resp.</span>
                                    )}
                                </td>
                                <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button title="Ver detalhes" className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50" onClick={() => onSelect(row)}>
                                            <Eye className="w-4 h-4" />
                                        </button>
                                        {ct?.telefone && (
                                            <a href={`https://wa.me/55${ct.telefone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" title="WhatsApp" className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50" onClick={e => e.stopPropagation()}>
                                                <Phone className="w-4 h-4" />
                                            </a>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>

            {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 bg-slate-50/30">
                    <p className="text-xs text-slate-400">
                        {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} de {totalCount}
                    </p>
                    <div className="flex items-center gap-1">
                        <button onClick={() => onPageChange(page - 1)} disabled={page === 0} className="p-1 rounded text-slate-400 hover:text-slate-600 disabled:opacity-30">
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-xs text-slate-400 tabular-nums px-1">{page + 1}/{totalPages}</span>
                        <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages - 1} className="p-1 rounded text-slate-400 hover:text-slate-600 disabled:opacity-30">
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
