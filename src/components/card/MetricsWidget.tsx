import { Clock, Calendar, TrendingUp, Edit2 } from 'lucide-react'
import { useState } from 'react'
import { cn } from '../../lib/utils'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../database.types'

type Card = Database['public']['Views']['view_cards_acoes']['Row']

interface MetricsWidgetProps {
    card: Card
}

interface User {
    id: string
    nome: string
}

export default function MetricsWidget({ card }: MetricsWidgetProps) {
    const [isChangingOwner, setIsChangingOwner] = useState(false)
    const queryClient = useQueryClient()

    const getDaysInStage = () => {
        if (!card.updated_at) return 0
        const diff = new Date().getTime() - new Date(card.updated_at).getTime()
        return Math.floor(diff / (1000 * 60 * 60 * 24))
    }

    const getDaysToTrip = () => {
        if (!card.data_viagem_inicio) return null
        const diff = new Date(card.data_viagem_inicio).getTime() - new Date().getTime()
        return Math.floor(diff / (1000 * 60 * 60 * 24))
    }

    // Fetch all users for owner dropdown
    const { data: users } = useQuery({
        queryKey: ['active-profiles-list'],
        queryFn: async () => {
            const { data, error } = await (supabase.from('profiles') as any)
                .select('id, nome')
                .eq('active', true)
                .order('nome')

            if (error) throw error
            return data as User[]
        },
        enabled: isChangingOwner
    })

    // Mutation to change owner
    const changeOwnerMutation = useMutation({
        mutationFn: async (newOwnerId: string) => {
            const { error } = await (supabase.from('cards') as any)
                .update({ dono_atual_id: newOwnerId })
                .eq('id', card.id)

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['card', card.id] })
            setIsChangingOwner(false)
        }
    })

    return (
        <div className="rounded-lg border bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Métricas</h3>
            <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-gray-600">
                        <Clock className="h-4 w-4" />
                        <span>Tempo na etapa</span>
                    </div>
                    <span className="font-medium text-gray-900">{getDaysInStage()}d</span>
                </div>
                {getDaysToTrip() !== null && (
                    <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-gray-600">
                            <Calendar className="h-4 w-4" />
                            <span>Até a viagem</span>
                        </div>
                        <span className={cn(
                            "font-medium",
                            getDaysToTrip()! < 30 ? "text-orange-600" : "text-gray-900"
                        )}>
                            {getDaysToTrip()}d
                        </span>
                    </div>
                )}
                {card.tarefas_pendentes ? (
                    <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-gray-600">
                            <TrendingUp className="h-4 w-4" />
                            <span>Tarefas pendentes</span>
                        </div>
                        <span className="font-medium text-orange-600">{card.tarefas_pendentes}</span>
                    </div>
                ) : null}
            </div>

            {/* Owner/Responsible - For Management Accountability */}
            {card.dono_atual_nome && (
                <div className="pt-3 border-t mt-3">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-gray-500 uppercase">Responsável</p>
                        <button
                            onClick={() => setIsChangingOwner(!isChangingOwner)}
                            className="p-1 text-gray-400 hover:text-indigo-600 transition-colors"
                            title="Alterar responsável"
                        >
                            <Edit2 className="h-3 w-3" />
                        </button>
                    </div>

                    {isChangingOwner ? (
                        <select
                            className="w-full text-sm rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                            onChange={(e) => {
                                if (e.target.value) {
                                    changeOwnerMutation.mutate(e.target.value)
                                }
                            }}
                            defaultValue=""
                        >
                            <option value="">Selecione...</option>
                            {users?.map((user) => (
                                <option key={user.id} value={user.id}>
                                    {user.nome}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-bold">
                                {card.dono_atual_nome.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{card.dono_atual_nome}</p>
                                {card.created_at && (
                                    <p className="text-xs text-gray-500">
                                        Desde {new Date(card.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
