import { useNavigate } from 'react-router-dom'
import { Calendar, Clock, ExternalLink } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { format, startOfDay, endOfDay } from 'date-fns'
import { QueryErrorState } from '@/components/ui/QueryErrorState'

import type { Database } from '@/database.types'

type Product = Database['public']['Enums']['app_product']

interface TodayMeetingsWidgetProps {
    productFilter?: Product
}

export function TodayMeetingsWidget({ productFilter }: TodayMeetingsWidgetProps) {
    const navigate = useNavigate()
    const { profile } = useAuth()

    const { data: meetings, isLoading, isError, refetch } = useQuery({
        queryKey: ['today-meetings-widget', profile?.id, productFilter],
        queryFn: async () => {
            const today = new Date()
            const { data, error } = await supabase
                .from('tarefas')
                .select(`
                    id, titulo, data_vencimento, status, metadata,
                    card:cards!tarefas_card_id_fkey(id, titulo, produto)
                `)
                .eq('tipo', 'reuniao')
                .eq('responsavel_id', profile!.id)
                .eq('concluida', false)
                .is('deleted_at', null)
                .gte('data_vencimento', startOfDay(today).toISOString())
                .lte('data_vencimento', endOfDay(today).toISOString())
                .order('data_vencimento', { ascending: true })

            if (error) throw error
            let result = data || []
            // Filtrar por produto do card associado
            if (productFilter) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                result = result.filter((m: any) => m.card?.produto === productFilter)
            }
            return result
        },
        staleTime: 1000 * 60,
        enabled: !!profile?.id,
    })

    const count = meetings?.length || 0

    return (
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                        <Calendar className="h-4 w-4 text-purple-600" />
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900">Reuniões de Hoje</h3>
                </div>
                {count > 0 && (
                    <span className="text-xs font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                        {count}
                    </span>
                )}
            </div>

            {isError ? (
                <QueryErrorState compact onRetry={refetch} />
            ) : isLoading ? (
                <div className="space-y-2">
                    {[1, 2].map(i => (
                        <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
                    ))}
                </div>
            ) : count === 0 ? (
                <div className="text-center py-4">
                    <Calendar className="h-6 w-6 text-gray-300 mx-auto mb-2" />
                    <p className="text-xs text-gray-500">Nenhuma reunião hoje</p>
                </div>
            ) : (
                <div className="space-y-1.5">
                    {meetings!.map((meeting) => {
                        const dateStr = meeting.data_vencimento
                            ? format(new Date(meeting.data_vencimento), 'yyyy-MM-dd')
                            : ''
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const card = meeting.card as any

                        return (
                            <button
                                key={meeting.id}
                                onClick={() => navigate(`/calendar?date=${dateStr}`)}
                                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-purple-50 transition-colors text-left group"
                            >
                                <div className="flex items-center gap-1.5 text-xs text-purple-600 font-medium flex-shrink-0">
                                    <Clock className="h-3 w-3" />
                                    {meeting.data_vencimento
                                        ? format(new Date(meeting.data_vencimento), 'HH:mm')
                                        : '--:--'}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-gray-900 truncate">
                                        {meeting.titulo}
                                    </p>
                                    {card?.titulo && (
                                        <p className="text-xs text-gray-500 truncate">{card.titulo}</p>
                                    )}
                                </div>
                                <ExternalLink className="h-3.5 w-3.5 text-gray-300 group-hover:text-purple-500 flex-shrink-0 transition-colors" />
                            </button>
                        )
                    })}
                </div>
            )}

            {count > 0 && (
                <button
                    onClick={() => navigate('/calendar')}
                    className="mt-3 w-full text-xs text-purple-600 font-medium hover:text-purple-800 hover:underline"
                >
                    Ver agenda completa
                </button>
            )}
        </div>
    )
}
