import { useState } from 'react'
import { Plus, Search, Loader2, Gift } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePremiumGifts } from '@/hooks/usePremiumGifts'
import PremiumGiftCard from './PremiumGiftCard'
import PremiumGiftModal from './PremiumGiftModal'

const formatBRL = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const statusOptions = [
    { value: 'pendente', label: 'Pendente', color: 'bg-slate-100 text-slate-600' },
    { value: 'preparando', label: 'Preparando', color: 'bg-amber-100 text-amber-700' },
    { value: 'enviado', label: 'Enviado', color: 'bg-blue-100 text-blue-700' },
    { value: 'entregue', label: 'Entregue', color: 'bg-emerald-100 text-emerald-700' },
    { value: 'cancelado', label: 'Cancelado', color: 'bg-red-100 text-red-600' },
]

export default function PresentesPremium() {
    const [showModal, setShowModal] = useState(false)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState<string[]>([])
    const [occasionFilter, setOccasionFilter] = useState('')

    const { gifts, isLoading, createPremiumGift, totalCost, statusCounts, occasionCounts } = usePremiumGifts({
        status: statusFilter.length > 0 ? statusFilter : undefined,
        occasion: occasionFilter || undefined,
        search: search || undefined,
    })

    const toggleStatus = (status: string) => {
        setStatusFilter(prev => prev.includes(status)
            ? prev.filter(s => s !== status)
            : [...prev, status]
        )
    }

    const handleCreate = async (input: Parameters<typeof createPremiumGift.mutateAsync>[0]) => {
        await createPremiumGift.mutateAsync(input)
        setShowModal(false)
    }

    const occasions = Object.keys(occasionCounts)

    return (
        <div className="space-y-5">
            {/* Header with stats */}
            <div className="flex items-center gap-4">
                <div className="flex-1">
                    <div className="flex items-center gap-4 text-sm text-slate-500">
                        <span><strong className="text-slate-900">{gifts.length}</strong> presentes premium</span>
                        <span>·</span>
                        <span>Total: <strong className="text-slate-900">{formatBRL(totalCost)}</strong></span>
                    </div>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-pink-600 text-white text-sm font-medium rounded-lg hover:bg-pink-700 transition-colors"
                >
                    <Plus className="h-4 w-4" />
                    Novo Presente Premium
                </button>
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
                            placeholder="Buscar por nome do contato..."
                            className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    {occasions.length > 0 && (
                        <select
                            value={occasionFilter}
                            onChange={e => setOccasionFilter(e.target.value)}
                            className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="">Todas ocasiões</option>
                            {occasions.map(o => <option key={o} value={o}>{o} ({occasionCounts[o]})</option>)}
                        </select>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Status:</span>
                    {statusOptions.map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => toggleStatus(opt.value)}
                            className={cn(
                                'px-2.5 py-1 text-xs font-medium rounded-full transition-colors',
                                statusFilter.includes(opt.value)
                                    ? opt.color
                                    : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                            )}
                        >
                            {opt.label}
                            {statusCounts[opt.value] ? ` (${statusCounts[opt.value]})` : ''}
                        </button>
                    ))}
                </div>
            </div>

            {/* List */}
            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 text-slate-400 animate-spin" />
                </div>
            ) : gifts.length === 0 ? (
                <div className="text-center py-16 space-y-3">
                    <div className="mx-auto h-12 w-12 rounded-full bg-pink-100 flex items-center justify-center">
                        <Gift className="h-6 w-6 text-pink-400" />
                    </div>
                    <p className="text-sm text-slate-500">Nenhum presente premium ainda</p>
                    <button
                        onClick={() => setShowModal(true)}
                        className="text-sm text-pink-600 hover:text-pink-700 font-medium"
                    >
                        Criar o primeiro presente
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {gifts.map(gift => (
                        <PremiumGiftCard
                            key={gift.id}
                            assignment={gift}
                            onStatusChange={() => {}}
                            onDuplicate={() => {/* TODO: open duplicate flow */}}
                        />
                    ))}
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <PremiumGiftModal
                    onClose={() => setShowModal(false)}
                    onSubmit={handleCreate}
                    isSubmitting={createPremiumGift.isPending}
                />
            )}
        </div>
    )
}
