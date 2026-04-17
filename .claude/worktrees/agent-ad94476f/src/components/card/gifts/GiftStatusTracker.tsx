import { Check, Clock, Truck, PackageCheck, XCircle, ChevronRight, Loader2, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GiftAssignment } from '@/hooks/useCardGifts'

const steps = [
    { key: 'pendente', label: 'Pendente', icon: Clock },
    { key: 'preparando', label: 'Preparando', icon: PackageCheck },
    { key: 'enviado', label: 'Enviado', icon: Truck },
    { key: 'entregue', label: 'Entregue', icon: Check },
] as const

interface GiftStatusTrackerProps {
    status: GiftAssignment['status']
    nextStatus: GiftAssignment['status'] | null
    onAdvance: () => void
    onCancel: () => void
    onDelete?: () => void
    isUpdating: boolean
    shippedAt?: string | null
    deliveredAt?: string | null
}

function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function GiftStatusTracker({ status, nextStatus, onAdvance, onCancel, onDelete, isUpdating, shippedAt, deliveredAt }: GiftStatusTrackerProps) {
    if (status === 'cancelado') {
        return (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="text-sm font-medium text-red-700 flex-1">Presente cancelado</span>
                {onDelete && (
                    <button
                        onClick={onDelete}
                        disabled={isUpdating}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50"
                    >
                        {isUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        Excluir
                    </button>
                )}
            </div>
        )
    }

    const currentIdx = steps.findIndex(s => s.key === status)

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-1">
                {steps.map((step, idx) => {
                    const isCompleted = idx < currentIdx
                    const isCurrent = idx === currentIdx
                    const Icon = step.icon

                    return (
                        <div key={step.key} className="flex items-center gap-1">
                            <div className={cn(
                                'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                                isCompleted && 'bg-emerald-100 text-emerald-700',
                                isCurrent && 'bg-indigo-100 text-indigo-700',
                                !isCompleted && !isCurrent && 'bg-slate-100 text-slate-400',
                            )}>
                                <Icon className="h-3 w-3" />
                                {step.label}
                            </div>
                            {idx < steps.length - 1 && (
                                <ChevronRight className={cn(
                                    'h-3 w-3',
                                    idx < currentIdx ? 'text-emerald-400' : 'text-slate-300'
                                )} />
                            )}
                        </div>
                    )
                })}
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500">
                {shippedAt && <span>Enviado: {formatDate(shippedAt)}</span>}
                {deliveredAt && <span>Entregue: {formatDate(deliveredAt)}</span>}
            </div>

            <div className="flex items-center gap-2">
                {nextStatus && (
                    <button
                        onClick={onAdvance}
                        disabled={isUpdating}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    >
                        {isUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronRight className="h-3 w-3" />}
                        Marcar como {steps.find(s => s.key === nextStatus)?.label}
                    </button>
                )}
                {status !== 'entregue' && (
                    <button
                        onClick={onCancel}
                        disabled={isUpdating}
                        className="text-xs text-red-600 hover:text-red-700 font-medium"
                    >
                        Cancelar
                    </button>
                )}
            </div>
        </div>
    )
}
