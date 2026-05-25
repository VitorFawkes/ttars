import { useState } from 'react'
import { Clock, PackageCheck, Truck, DollarSign, Search, Filter, Loader2, Check, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAllGiftAssignments, type GiftFilters } from '@/hooks/useAllGiftAssignments'
import GiftKanbanBoard from './GiftKanbanBoard'
import PremiumGiftModal from './PremiumGiftModal'
import { usePremiumGifts } from '@/hooks/usePremiumGifts'

const formatBRL = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

export default function CentralEnvios() {
    const [filters, setFilters] = useState<GiftFilters>({})
    const [search, setSearch] = useState('')
    const [showModal, setShowModal] = useState(false)

    const { assignments, isLoading, stats } = useAllGiftAssignments({
        ...filters,
        search: search || undefined,
    })

    const { createPremiumGift } = usePremiumGifts()

    const toggleType = (type: 'trip' | 'premium' | null) => {
        setFilters(f => ({ ...f, giftType: f.giftType === type ? null : type }))
    }

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-end">
                <button
                    onClick={() => setShowModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                >
                    <Plus className="h-4 w-4" />
                    Novo Envio
                </button>
            </div>

            <div className="grid grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
                        <Clock className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-slate-900">{stats.pendingCount}</p>
                        <p className="text-xs text-slate-500">Em andamento</p>
                    </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                        <PackageCheck className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-slate-900">{stats.preparingCount}</p>
                        <p className="text-xs text-slate-500">Preparando / A enviar</p>
                    </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Truck className="h-5 w-5 text-blue-600" />
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

            <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="relative flex-1 min-w-[240px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar por contato ou viagem..."
                            className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4 text-slate-400" />
                        <span className="text-xs text-slate-500">Tipo:</span>
                        <button
                            onClick={() => toggleType('trip')}
                            aria-pressed={filters.giftType === 'trip'}
                            className={cn(
                                'inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full border transition-colors',
                                filters.giftType === 'trip'
                                    ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
                                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:text-slate-700',
                            )}
                        >
                            {filters.giftType === 'trip' && <Check className="h-3 w-3" strokeWidth={3} />}
                            Viagem
                        </button>
                        <button
                            onClick={() => toggleType('premium')}
                            aria-pressed={filters.giftType === 'premium'}
                            className={cn(
                                'inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full border transition-colors',
                                filters.giftType === 'premium'
                                    ? 'bg-pink-600 text-white border-pink-600 hover:bg-pink-700'
                                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:text-slate-700',
                            )}
                        >
                            {filters.giftType === 'premium' && <Check className="h-3 w-3" strokeWidth={3} />}
                            Premium
                        </button>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-slate-600 select-none">
                        <input
                            type="checkbox"
                            checked={filters.hidePastTrips === false}
                            onChange={e => setFilters(f => ({ ...f, hidePastTrips: e.target.checked ? false : undefined }))}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600"
                        />
                        Incluir viagens encerradas
                    </label>
                </div>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 text-slate-400 animate-spin" />
                </div>
            ) : (
                <GiftKanbanBoard assignments={assignments} />
            )}

            {!isLoading && (
                <p className="text-xs text-slate-400 text-right">
                    {assignments.length} presente{assignments.length !== 1 ? 's' : ''}
                    {stats.overdueCount > 0 && (
                        <span className="text-red-500 ml-2">({stats.overdueCount} atrasado{stats.overdueCount !== 1 ? 's' : ''})</span>
                    )}
                </p>
            )}

            {showModal && (
                <PremiumGiftModal
                    onClose={() => setShowModal(false)}
                    onSubmit={async input => {
                        await createPremiumGift.mutateAsync(input)
                        setShowModal(false)
                    }}
                    isSubmitting={createPremiumGift.isPending}
                />
            )}
        </div>
    )
}
