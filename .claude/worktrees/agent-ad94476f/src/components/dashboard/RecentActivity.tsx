import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { formatDistanceToNow, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { QueryErrorState } from '../ui/QueryErrorState'

interface Activity {
    id: string
    tipo: string
    descricao: string
    created_at: string
    card?: {
        titulo: string
        produto: string | null
    }
    created_by_user?: {
        nome: string | null
        email: string | null
    }
}

interface RecentActivityProps {
    productFilter?: string
}

export default function RecentActivity({ productFilter }: RecentActivityProps) {
    const { data: activities, isLoading, isError, refetch } = useQuery({
        queryKey: ['recent-activity', productFilter],
        queryFn: async () => {
            // Server-side filter: inner join garante que só retorna atividades de cards do produto selecionado
            const query = supabase
                .from('activities')
                .select(`
                    id,
                    tipo,
                    descricao,
                    created_at,
                    card:cards!inner!card_id (
                        titulo,
                        produto
                    ),
                    created_by_user:profiles!created_by (
                        nome,
                        email
                    )
                `)
                .order('created_at', { ascending: false })
                .limit(10)

            if (productFilter) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                query.eq('cards.produto', productFilter as any)
            }

            const { data, error } = await query
            if (error) throw error

            return data as unknown as Activity[]
        }
    })

    if (isLoading) return <div className="h-64 animate-pulse bg-gray-100 rounded-lg"></div>

    if (isError) {
        return (
            <div className="rounded-lg bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-lg font-medium text-gray-900">Atividades Recentes</h3>
                <QueryErrorState compact onRetry={refetch} />
            </div>
        )
    }

    return (
        <div className="rounded-lg bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-medium text-gray-900">Atividades Recentes</h3>
            <div className="flow-root">
                <ul role="list" className="-mb-8">
                    {activities?.map((activity, activityIdx) => (
                        <li key={activity.id}>
                            <div className="relative pb-8">
                                {activityIdx !== activities.length - 1 ? (
                                    <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true" />
                                ) : null}
                                <div className="relative flex space-x-3">
                                    <div>
                                        <span className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center ring-8 ring-white text-indigo-600 font-bold text-xs">
                                            {(activity.created_by_user?.nome || activity.created_by_user?.email || '?').charAt(0).toUpperCase()}
                                        </span>
                                    </div>
                                    <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                                        <div>
                                            <p className="text-sm text-gray-500">
                                                <span className="font-medium text-gray-900">
                                                    {activity.created_by_user?.nome || activity.created_by_user?.email || 'Sistema'}
                                                </span>
                                                {' '}
                                                {activity.tipo.replace('_', ' ')}
                                                {' em '}
                                                <span className="font-medium text-gray-900">{activity.card?.titulo || 'Sem título'}</span>
                                            </p>
                                            <p className="text-sm text-gray-500">{activity.descricao}</p>
                                        </div>
                                        <div className="whitespace-nowrap text-right text-sm text-gray-500 flex flex-col items-end">
                                            <span>{activity.created_at && formatDistanceToNow(new Date(activity.created_at), { locale: ptBR, addSuffix: true })}</span>
                                            <span className="text-xs text-gray-400">
                                                {activity.created_at && format(new Date(activity.created_at), "HH:mm '•' dd/MM")}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </li>
                    ))}
                    {activities?.length === 0 && (
                        <p className="text-sm text-gray-500">Nenhuma atividade recente.</p>
                    )}
                </ul>
            </div>
        </div>
    )
}
