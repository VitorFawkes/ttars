import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useReceitaPermission } from '../../hooks/useReceitaPermission'
import { DollarSign, Layers, TrendingUp } from 'lucide-react'
import { QueryErrorState } from '../ui/QueryErrorState'

interface StatsCardsProps {
    productFilter: string
}

export default function StatsCards({ productFilter }: StatsCardsProps) {
    const { data, isLoading, isError, refetch } = useQuery({
        queryKey: ['dashboard-stats', productFilter],
        queryFn: async () => {
            let query = supabase
                .from('view_dashboard_funil')
                .select('*')

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            query = query.eq('produto', productFilter as any)

            const { data, error } = await query
            if (error) throw error
            return data
        }
    })

    const receitaPerm = useReceitaPermission()
    const stats = (data as Record<string, number | null>[])?.reduce((acc, curr) => ({
        totalCards: (acc.totalCards ?? 0) + (curr.total_cards || 0),
        totalValue: (acc.totalValue ?? 0) + (curr.valor_total ?? curr.total_valor_estimado ?? 0),
        totalReceita: (acc.totalReceita ?? 0) + (curr.receita_total ?? 0)
    }), { totalCards: 0 as number | null, totalValue: 0 as number | null, totalReceita: 0 as number | null }) || { totalCards: 0, totalValue: 0, totalReceita: 0 }

    if (isLoading) {
        return (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[1, 2].map((i) => (
                    <div key={i} className="h-32 animate-pulse rounded-lg bg-gray-100"></div>
                ))}
            </div>
        )
    }

    if (isError) {
        return (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="col-span-full rounded-lg bg-white p-6 shadow-sm">
                    <QueryErrorState compact onRetry={refetch} />
                </div>
            </div>
        )
    }

    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg bg-white p-6 shadow-sm">
                <div className="flex items-center">
                    <div className="rounded-md bg-indigo-50 p-3">
                        <Layers className="h-6 w-6 text-indigo-600" />
                    </div>
                    <div className="ml-4">
                        <p className="text-sm font-medium text-gray-500">Total de Cards</p>
                        <p className="text-2xl font-semibold text-gray-900">{stats.totalCards}</p>
                    </div>
                </div>
            </div>

            <div className="rounded-lg bg-white p-6 shadow-sm">
                <div className="flex items-center">
                    <div className="rounded-md bg-green-50 p-3">
                        <DollarSign className="h-6 w-6 text-green-600" />
                    </div>
                    <div className="ml-4">
                        <p className="text-sm font-medium text-gray-500">Valor em Pipeline</p>
                        <p className="text-2xl font-semibold text-gray-900">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.totalValue ?? 0)}
                        </p>
                    </div>
                </div>
            </div>

            {receitaPerm.canView && (stats.totalReceita ?? 0) > 0 && (
                <div className="rounded-lg bg-white p-6 shadow-sm">
                    <div className="flex items-center">
                        <div className="rounded-md bg-amber-50 p-3">
                            <TrendingUp className="h-6 w-6 text-amber-600" />
                        </div>
                        <div className="ml-4">
                            <p className="text-sm font-medium text-gray-500">Receita Total</p>
                            <p className="text-2xl font-semibold text-amber-700">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.totalReceita ?? 0)}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
