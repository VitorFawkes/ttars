import { ChevronLeft, ChevronRight, Phone, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReactivationPattern, ReactivationSort } from '@/hooks/useReactivationPatterns'

interface Props {
    data: ReactivationPattern[]
    loading: boolean
    totalCount: number
    page: number
    pageSize: number
    sort: ReactivationSort
    onPageChange: (page: number) => void
    onSortChange: (sort: ReactivationSort) => void
    onSelect: (pattern: ReactivationPattern) => void
}

const MONTH_SHORT = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function formatPattern(p: ReactivationPattern): string {
    const freq = p.travel_frequency_per_year
    if (!freq) return 'Sem padrão'
    const fStr = freq >= 2 ? `${freq.toFixed(1)}x/ano` : `${freq.toFixed(1)}x/ano`
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

type SortCol = ReactivationSort['column']

const COLS: { key: SortCol | null; label: string; w?: string; hide?: string }[] = [
    { key: 'reactivation_score', label: 'Score', w: 'w-16' },
    { key: null, label: 'Cliente' },
    { key: null, label: 'Padrão', hide: 'hidden lg:table-cell' },
    { key: 'days_until_ideal_contact', label: 'Janela' },
    { key: 'avg_trip_value', label: 'Ticket', hide: 'hidden md:table-cell' },
    { key: null, label: '', w: 'w-24' },
]

export default function ReactivationTable({
    data, loading, totalCount, page, pageSize,
    sort, onPageChange, onSortChange, onSelect,
}: Props) {
    const totalPages = Math.ceil(totalCount / pageSize)

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
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                        {COLS.map((c, i) => (
                            <th
                                key={i}
                                className={cn(
                                    'px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider',
                                    c.w, c.hide,
                                    c.key && 'cursor-pointer hover:text-slate-600 select-none',
                                )}
                                onClick={() => c.key && handleSort(c.key)}
                            >
                                <span className="flex items-center gap-1">
                                    {c.label}
                                    {c.key && sort.column === c.key && (
                                        <span className="text-indigo-500">{sort.direction === 'asc' ? '↑' : '↓'}</span>
                                    )}
                                </span>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data.map((row, idx) => {
                        const ct = row.contato
                        const win = formatWindow(row)
                        const hasBday = row.days_until_birthday !== null && row.days_until_birthday >= 0 && row.days_until_birthday <= 30
                        return (
                            <tr
                                key={row.contact_id}
                                className={cn(
                                    'group cursor-pointer transition-colors',
                                    idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30',
                                    'hover:bg-indigo-50/40',
                                )}
                                onClick={() => onSelect(row)}
                            >
                                <td className="px-4 py-3">
                                    <ScoreBadge score={row.reactivation_score} />
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-slate-900 truncate">
                                                {ct?.nome} {ct?.sobrenome}
                                                {hasBday && <span className="ml-1.5 text-pink-500" title={`Aniversário em ${row.days_until_birthday}d`}>🎂</span>}
                                                {row.is_referrer && <span className="ml-1 text-amber-500 text-[10px]" title={`Indicou ${row.referral_count} clientes`}>★</span>}
                                            </p>
                                            <p className="text-xs text-slate-400 truncate">
                                                {row.total_completed_trips} viagens
                                                {row.companion_count > 0 && <span className="text-blue-500 ml-1">· {row.companion_count + 1} viajantes</span>}
                                                {row.gifts_sent_count === 0 && <span className="text-amber-500 ml-1">· Sem presente</span>}
                                            </p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-3 hidden lg:table-cell">
                                    <p className="text-sm text-slate-600">{formatPattern(row)}</p>
                                </td>
                                <td className="px-4 py-3">
                                    <p className={cn('text-sm font-semibold', win.cls)}>{win.label}</p>
                                    {win.sub && <p className="text-[10px] text-slate-400">{win.sub}</p>}
                                </td>
                                <td className="px-4 py-3 hidden md:table-cell">
                                    <p className="text-sm font-medium text-slate-700">{formatCurrency(row.avg_trip_value)}</p>
                                </td>
                                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            title="Ver detalhes"
                                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                                            onClick={() => onSelect(row)}
                                        >
                                            <Eye className="w-4 h-4" />
                                        </button>
                                        {ct?.telefone && (
                                            <a
                                                href={`https://wa.me/55${ct.telefone.replace(/\D/g, '')}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title="WhatsApp"
                                                className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                                                onClick={e => e.stopPropagation()}
                                            >
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
                        <button onClick={() => onPageChange(page - 1)} disabled={page === 0}
                            className="p-1 rounded text-slate-400 hover:text-slate-600 disabled:opacity-30">
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-xs text-slate-400 tabular-nums px-1">{page + 1}/{totalPages}</span>
                        <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages - 1}
                            className="p-1 rounded text-slate-400 hover:text-slate-600 disabled:opacity-30">
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
