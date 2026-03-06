import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../database.types'
import { QueryErrorState } from '../ui/QueryErrorState'

type Product = Database['public']['Enums']['app_product']

interface FunnelChartProps {
    productFilter: Product
}

export default function FunnelChart({ productFilter }: FunnelChartProps) {
    const { data, isLoading, isError, refetch } = useQuery({
        queryKey: ['dashboard-funnel', productFilter],
        queryFn: async () => {
            let query = supabase
                .from('view_dashboard_funil')
                .select('*')
                .order('etapa_ordem')

            query = query.eq('produto', productFilter)

            const { data, error } = await query
            if (error) throw error
            return data
        }
    })

    const chartData = data || []

    if (isLoading) return <div className="h-64 animate-pulse bg-gray-100 rounded-lg"></div>

    if (isError) {
        return (
            <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-semibold mb-4">Funil de Vendas</h3>
                <QueryErrorState compact onRetry={refetch} />
            </div>
        )
    }

    return (
        <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold mb-4">Funil de Vendas</h3>
            <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis
                        dataKey="etapa_nome"
                        type="category"
                        width={150}
                        tick={{ fontSize: 12 }}
                    />
                    <Tooltip
                        formatter={(value: number) => [value, 'Cards']}
                        cursor={{ fill: 'transparent' }}
                    />
                    <Bar dataKey="total_cards" radius={[0, 4, 4, 0]} barSize={32}>
                        {chartData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill="#4f46e5" />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    )
}
