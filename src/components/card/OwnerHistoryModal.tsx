import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { X, Clock, ArrowRight } from 'lucide-react'
import { cn } from '../../lib/utils'
import { getPhaseColor, legacyFaseToSlug } from '../../lib/pipeline/phaseLabels'

interface OwnerHistoryModalProps {
    cardId: string
    isOpen: boolean
    onClose: () => void
}

interface OwnerProfileRef {
    nome: string | null
    email?: string | null
}

interface OwnerHistoryEntry {
    id: string
    started_at: string
    ended_at: string | null
    fase: string | null
    transfer_reason: string | null
    owner: OwnerProfileRef | null
    transferred_by_user: OwnerProfileRef | null
}

export default function OwnerHistoryModal({ cardId, isOpen, onClose }: OwnerHistoryModalProps) {
    const { data: history, isLoading } = useQuery<OwnerHistoryEntry[]>({
        queryKey: ['owner-history', cardId],
        queryFn: async () => {
            // card_owner_history pode não estar nos types gerados ainda — cast explícito e controlado
            const { data, error } = await (supabase
                .from('card_owner_history') as unknown as {
                    select: (q: string) => {
                        eq: (c: string, v: string) => {
                            order: (c: string, o: { ascending: boolean }) => Promise<{ data: OwnerHistoryEntry[] | null; error: Error | null }>
                        }
                    }
                })
                .select(`
                    *,
                    owner:profiles!owner_id(nome, email),
                    transferred_by_user:profiles!transferred_by(nome)
                `)
                .eq('card_id', cardId)
                .order('started_at', { ascending: false })

            if (error) throw error
            return data ?? []
        },
        enabled: isOpen
    })

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b">
                    <h2 className="text-lg font-semibold text-gray-900">Histórico de Responsáveis</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-4 overflow-y-auto max-h-[calc(80vh-4rem)]">
                    {isLoading ? (
                        <div className="text-center py-8 text-gray-500">Carregando...</div>
                    ) : history && history.length > 0 ? (
                        <div className="space-y-4">
                            {history.map((entry, idx) => {
                                const owner = entry.owner
                                const transferredBy = entry.transferred_by_user
                                const isActive = !entry.ended_at
                                const duration = entry.ended_at
                                    ? Math.floor((new Date(entry.ended_at).getTime() - new Date(entry.started_at).getTime()) / (1000 * 60 * 60 * 24))
                                    : Math.floor((new Date().getTime() - new Date(entry.started_at).getTime()) / (1000 * 60 * 60 * 24))

                                return (
                                    <div key={entry.id} className="relative">
                                        {idx < history.length - 1 && (
                                            <div className="absolute left-4 top-12 bottom-0 w-0.5 bg-gray-200" />
                                        )}
                                        <div className={cn(
                                            "p-4 rounded-lg border-2",
                                            isActive ? "border-indigo-500 bg-indigo-50" : "border-gray-200 bg-white"
                                        )}>
                                            <div className="flex items-start gap-3">
                                                <div className={cn(
                                                    "h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0",
                                                    isActive ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-600"
                                                )}>
                                                    {owner?.nome?.charAt(0) || 'U'}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-semibold text-gray-900">{owner?.nome || 'Usuário desconhecido'}</span>
                                                        {(() => {
                                                            const slug = legacyFaseToSlug(entry.fase)
                                                            const c = getPhaseColor(slug)
                                                            return (
                                                                <span className={cn(
                                                                    "px-2 py-0.5 rounded-full text-xs font-medium",
                                                                    c.activeBg, c.text,
                                                                )}>
                                                                    {entry.fase}
                                                                </span>
                                                            )
                                                        })()}
                                                        {isActive && (
                                                            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                                                Atual
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="mt-1 flex items-center gap-4 text-xs text-gray-600">
                                                        <div className="flex items-center gap-1">
                                                            <Clock className="h-3 w-3" />
                                                            <span>
                                                                {new Date(entry.started_at).toLocaleDateString('pt-BR', {
                                                                    day: '2-digit',
                                                                    month: 'short',
                                                                    year: 'numeric'
                                                                })}
                                                            </span>
                                                        </div>
                                                        {entry.ended_at && (
                                                            <>
                                                                <ArrowRight className="h-3 w-3" />
                                                                <span>
                                                                    {new Date(entry.ended_at).toLocaleDateString('pt-BR', {
                                                                        day: '2-digit',
                                                                        month: 'short',
                                                                        year: 'numeric'
                                                                    })}
                                                                </span>
                                                            </>
                                                        )}
                                                        <span className="text-gray-500">({duration} dia{duration !== 1 ? 's' : ''})</span>
                                                    </div>
                                                    {entry.transfer_reason && (
                                                        <p className="mt-2 text-sm text-gray-700 italic">
                                                            Motivo: {entry.transfer_reason}
                                                        </p>
                                                    )}
                                                    {transferredBy && (
                                                        <p className="mt-1 text-xs text-gray-500">
                                                            Transferido por: {transferredBy.nome}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-gray-500">Nenhum histórico encontrado</div>
                    )}
                </div>
            </div>
        </div>
    )
}
