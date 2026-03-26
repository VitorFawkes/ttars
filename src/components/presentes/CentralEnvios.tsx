import { useState } from 'react'
import { Clock, PackageCheck, Truck, DollarSign, Search, Filter, Loader2, CheckSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAllGiftAssignments, type GiftFilters } from '@/hooks/useAllGiftAssignments'
import { useBulkGiftStatus } from '@/hooks/useBulkGiftStatus'
import CentralEnviosRow from './CentralEnviosRow'

const formatBRL = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const statusOptions = [
    { value: 'pendente', label: 'Pendente', color: 'bg-slate-100 text-slate-600' },
    { value: 'preparando', label: 'Preparando', color: 'bg-amber-100 text-amber-700' },
    { value: 'enviado', label: 'Enviado', color: 'bg-blue-100 text-blue-700' },
    { value: 'entregue', label: 'Entregue', color: 'bg-emerald-100 text-emerald-700' },
    { value: 'cancelado', label: 'Cancelado', color: 'bg-red-100 text-red-600' },
]

export default function CentralEnvios() {
    const [filters, setFilters] = useState<GiftFilters>({
        status: ['pendente', 'preparando'],
    })
    const [search, setSearch] = useState('')
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

    const { assignments, isLoading, stats } = useAllGiftAssignments({
        ...filters,
        search: search || undefined,
    })

    const bulkStatus = useBulkGiftStatus()

    const toggleStatus = (status: string) => {
        setFilters(f => {
            const current = f.status || []
            const next = current.includes(status)
                ? current.filter(s => s !== status)
                : [...current, status]
            return { ...f, status: next }
        })
    }

    const toggleType = (type: 'trip' | 'premium' | null) => {
        setFilters(f => ({ ...f, giftType: f.giftType === type ? null : type }))
    }

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const selectAll = () => {
        if (selectedIds.size === assignments.length) {
            setSelectedIds(new Set())
        } else {
            setSelectedIds(new Set(assignments.map(a => a.id)))
        }
    }

    const handleBulkAction = async (newStatus: 'preparando' | 'enviado' | 'entregue' | 'cancelado') => {
        const ids = Array.from(selectedIds)
        const itemsMap: Record<string, typeof assignments[0]['items']> = {}
        if (newStatus === 'cancelado') {
            for (const id of ids) {
                const a = assignments.find(x => x.id === id)
                if (a) itemsMap[id] = a.items
            }
        }
        await bulkStatus.mutateAsync({
            assignmentIds: ids,
            newStatus,
            assignmentItems: newStatus === 'cancelado' ? itemsMap : undefined,
        })
        setSelectedIds(new Set())
    }

    const handleRefresh = () => {
        // Force re-fetch by toggling a dummy filter
        setFilters(f => ({ ...f }))
    }

    return (
        <div className="space-y-5">
            {/* KPI Cards */}
            <div className="grid grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
                        <Clock className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-slate-900">{stats.pendingCount}</p>
                        <p className="text-xs text-slate-500">Pendentes</p>
                    </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                        <PackageCheck className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-slate-900">{stats.preparingCount}</p>
                        <p className="text-xs text-slate-500">Preparando</p>
                    </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                        <Truck className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-slate-900">{stats.shippedThisMonth}</p>
                        <p className="text-xs text-slate-500">Enviados este mês</p>
                    </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                        <DollarSign className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-slate-900">{formatBRL(stats.totalCostThisMonth)}</p>
                        <p className="text-xs text-slate-500">Custo do mês</p>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar por contato ou card..."
                            className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    <div className="flex items-center gap-1">
                        <Filter className="h-4 w-4 text-slate-400" />
                        <span className="text-xs text-slate-500">Tipo:</span>
                        <button
                            onClick={() => toggleType('trip')}
                            className={cn(
                                'px-2.5 py-1 text-xs font-medium rounded-full transition-colors',
                                filters.giftType === 'trip' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            )}
                        >
                            Viagem
                        </button>
                        <button
                            onClick={() => toggleType('premium')}
                            className={cn(
                                'px-2.5 py-1 text-xs font-medium rounded-full transition-colors',
                                filters.giftType === 'premium' ? 'bg-pink-100 text-pink-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            )}
                        >
                            Premium
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Status:</span>
                    {statusOptions.map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => toggleStatus(opt.value)}
                            className={cn(
                                'px-2.5 py-1 text-xs font-medium rounded-full transition-colors',
                                filters.status?.includes(opt.value)
                                    ? opt.color
                                    : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                            )}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Bulk actions bar */}
            {selectedIds.size > 0 && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 flex items-center gap-3">
                    <CheckSquare className="h-4 w-4 text-indigo-600" />
                    <span className="text-sm font-medium text-indigo-700">{selectedIds.size} selecionado{selectedIds.size > 1 ? 's' : ''}</span>
                    <div className="flex items-center gap-2 ml-auto">
                        <button
                            onClick={() => handleBulkAction('preparando')}
                            disabled={bulkStatus.isPending}
                            className="px-3 py-1.5 text-xs font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
                        >
                            {bulkStatus.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Preparando'}
                        </button>
                        <button
                            onClick={() => handleBulkAction('enviado')}
                            disabled={bulkStatus.isPending}
                            className="px-3 py-1.5 text-xs font-medium bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                        >
                            {bulkStatus.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Enviado'}
                        </button>
                        <button
                            onClick={() => handleBulkAction('entregue')}
                            disabled={bulkStatus.isPending}
                            className="px-3 py-1.5 text-xs font-medium bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50"
                        >
                            {bulkStatus.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Entregue'}
                        </button>
                        <button
                            onClick={() => handleBulkAction('cancelado')}
                            disabled={bulkStatus.isPending}
                            className="px-3 py-1.5 text-xs font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* Table header */}
            <div className="flex items-center gap-3 px-4 py-2 text-xs font-medium text-slate-400 uppercase tracking-wider">
                <input
                    type="checkbox"
                    checked={selectedIds.size === assignments.length && assignments.length > 0}
                    onChange={selectAll}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                />
                <span className="w-8" />
                <span className="w-36">Contato</span>
                <span className="w-16">Tipo</span>
                <span className="w-40">Card / Ocasião</span>
                <span className="flex-1">Itens</span>
                <span className="w-24 text-right">Custo</span>
                <span className="w-24 text-right">Envio</span>
                <span className="w-20">Status</span>
                <span className="w-24" />
                <span className="w-6" />
            </div>

            {/* Rows */}
            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 text-slate-400 animate-spin" />
                </div>
            ) : assignments.length === 0 ? (
                <div className="text-center py-12 text-sm text-slate-500">
                    Nenhum presente encontrado com os filtros atuais
                </div>
            ) : (
                <div className="space-y-2">
                    {assignments.map(a => (
                        <CentralEnviosRow
                            key={a.id}
                            assignment={a}
                            isSelected={selectedIds.has(a.id)}
                            onToggleSelect={() => toggleSelect(a.id)}
                            onStatusChange={handleRefresh}
                        />
                    ))}
                </div>
            )}

            {/* Count */}
            {!isLoading && assignments.length > 0 && (
                <p className="text-xs text-slate-400 text-right">
                    {assignments.length} presente{assignments.length !== 1 ? 's' : ''}
                    {stats.overdueCount > 0 && (
                        <span className="text-red-500 ml-2">({stats.overdueCount} atrasado{stats.overdueCount !== 1 ? 's' : ''})</span>
                    )}
                </p>
            )}
        </div>
    )
}
