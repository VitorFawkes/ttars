import { ChevronLeft, ChevronRight, ExternalLink, ClipboardList, History } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
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

const MONTH_NAMES = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function formatPattern(pattern: ReactivationPattern): string {
    const freq = pattern.travel_frequency_per_year
    if (!freq) return '-'
    const freqStr = freq >= 2 ? `${freq.toFixed(1)}x/ano` : freq >= 1 ? `${freq.toFixed(1)}x/ano` : `~${freq.toFixed(1)}x/ano`
    const months = pattern.peak_months
    if (months && months.length > 0) {
        const monthNames = months.map(m => MONTH_NAMES[m] || m).join(', ')
        return `${freqStr}, sempre ${monthNames}`
    }
    return freqStr
}

function formatContactWindow(pattern: ReactivationPattern): { text: string; color: string } {
    const days = pattern.days_until_ideal_contact
    if (days === null || days === undefined) return { text: '-', color: 'text-slate-400' }
    if (days < 0) return { text: `Atrasado ${Math.abs(days)}d`, color: 'text-red-600' }
    if (days <= 30) return { text: `Em ${days}d`, color: 'text-amber-600' }
    return { text: `Em ${days}d`, color: 'text-emerald-600' }
}

function formatCurrency(value: number | null): string {
    if (!value) return '-'
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
}

function ScoreBadge({ score }: { score: number | null }) {
    if (score === null) return <span className="text-slate-400">-</span>
    const bg = score >= 80 ? 'bg-emerald-100 text-emerald-700' :
        score >= 60 ? 'bg-amber-100 text-amber-700' :
            score >= 40 ? 'bg-slate-100 text-slate-600' :
                'bg-slate-50 text-slate-400'
    return (
        <span className={cn('inline-flex items-center justify-center w-10 h-7 rounded-md text-sm font-bold', bg)}>
            {score}
        </span>
    )
}

type SortableColumn = ReactivationSort['column']

const COLUMNS: { key: SortableColumn | null; label: string; className?: string }[] = [
    { key: 'reactivation_score', label: 'Score', className: 'w-16' },
    { key: null, label: 'Cliente' },
    { key: null, label: 'Padrao' },
    { key: 'days_until_ideal_contact', label: 'Janela' },
    { key: 'avg_trip_value', label: 'Valor Med.' },
    { key: null, label: 'Acoes', className: 'w-28' },
]

export default function ReactivationTable({
    data, loading, totalCount, page, pageSize,
    sort, onPageChange, onSortChange, onSelect,
}: Props) {
    const navigate = useNavigate()
    const totalPages = Math.ceil(totalCount / pageSize)

    function handleSort(col: SortableColumn) {
        if (sort.column === col) {
            onSortChange({ column: col, direction: sort.direction === 'asc' ? 'desc' : 'asc' })
        } else {
            onSortChange({ column: col, direction: col === 'reactivation_score' ? 'desc' : 'asc' })
        }
    }

    if (loading && data.length === 0) {
        return (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
                <div className="p-12 text-center text-slate-400">
                    <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    Carregando padroes de viagem...
                </div>
            </div>
        )
    }

    if (!loading && data.length === 0) {
        return (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
                <div className="p-12 text-center text-slate-400">
                    <p className="text-lg font-medium text-slate-500 mb-1">Nenhum contato encontrado</p>
                    <p className="text-sm">Ajuste os filtros ou execute o calculo de padroes</p>
                </div>
            </div>
        )
    }

    return (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-slate-100">
                            {COLUMNS.map((col, i) => (
                                <th
                                    key={i}
                                    className={cn(
                                        'px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider',
                                        col.className,
                                        col.key && 'cursor-pointer hover:text-slate-700 select-none'
                                    )}
                                    onClick={() => col.key && handleSort(col.key)}
                                >
                                    <span className="flex items-center gap-1">
                                        {col.label}
                                        {col.key && sort.column === col.key && (
                                            <span className="text-indigo-500">{sort.direction === 'asc' ? '↑' : '↓'}</span>
                                        )}
                                    </span>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {data.map((row) => {
                            const contact = row.contato
                            const window = formatContactWindow(row)
                            return (
                                <tr
                                    key={row.contact_id}
                                    className="hover:bg-slate-25 cursor-pointer transition-colors"
                                    onClick={() => onSelect(row)}
                                >
                                    <td className="px-4 py-3">
                                        <ScoreBadge score={row.reactivation_score} />
                                    </td>
                                    <td className="px-4 py-3">
                                        <div>
                                            <div className="flex items-center gap-1.5">
                                                <p className="text-sm font-medium text-slate-900">
                                                    {contact?.nome} {contact?.sobrenome}
                                                </p>
                                                {row.days_until_birthday !== null && row.days_until_birthday <= 30 && (
                                                    <span title={`Aniversario em ${row.days_until_birthday}d`} className="text-pink-500 text-xs">🎂</span>
                                                )}
                                                {row.is_referrer && (
                                                    <span title={`Indicou ${row.referral_count} clientes`} className="text-emerald-500 text-xs">★</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <p className="text-xs text-slate-400">{contact?.email}</p>
                                                {row.companion_count > 0 && (
                                                    <span className="text-[10px] text-blue-500">+{row.companion_count}</span>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <p className="text-sm text-slate-600">{formatPattern(row)}</p>
                                        <p className="text-xs text-slate-400">{row.total_completed_trips} viagens</p>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={cn('text-sm font-medium', window.color)}>
                                            {window.text}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-slate-700">
                                        {formatCurrency(row.avg_trip_value)}
                                    </td>
                                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center gap-1">
                                            <button
                                                title="Ver perfil"
                                                className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                                                onClick={() => navigate(`/people?search=${encodeURIComponent(contact?.nome ?? '')}`)}
                                            >
                                                <ExternalLink className="w-4 h-4" />
                                            </button>
                                            <button
                                                title="Criar tarefa"
                                                className="p-1.5 rounded-md text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                                                onClick={() => onSelect(row)}
                                            >
                                                <ClipboardList className="w-4 h-4" />
                                            </button>
                                            <button
                                                title="Historico de viagens"
                                                className="p-1.5 rounded-md text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                                                onClick={() => onSelect(row)}
                                            >
                                                <History className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {/* Paginação */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                    <p className="text-sm text-slate-500">
                        {page * pageSize + 1}-{Math.min((page + 1) * pageSize, totalCount)} de {totalCount}
                    </p>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => onPageChange(page - 1)}
                            disabled={page === 0}
                            className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 disabled:opacity-30"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-sm text-slate-500 px-2">
                            {page + 1} / {totalPages}
                        </span>
                        <button
                            onClick={() => onPageChange(page + 1)}
                            disabled={page >= totalPages - 1}
                            className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 disabled:opacity-30"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
