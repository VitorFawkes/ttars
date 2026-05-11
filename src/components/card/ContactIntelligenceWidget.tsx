import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { DollarSign, Plane, Crown } from 'lucide-react'


interface ContactIntelligenceWidgetProps {
    contactId: string
}

export default function ContactIntelligenceWidget({ contactId }: ContactIntelligenceWidgetProps) {
    const { data: stats, isLoading } = useQuery({
        queryKey: ['contact-intelligence', contactId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('contact_stats')
                .select('*')
                .eq('contact_id', contactId)
                .maybeSingle()

            if (error) throw error
            return data
        },
        enabled: !!contactId
    })

    if (isLoading || !stats) return null

    return (
        <div className="mt-2 flex items-center gap-3 text-xs text-gray-500 bg-white/50 rounded-md p-2 border border-gray-100">
            <div className="flex items-center gap-1" title="LTV (Gasto Total)">
                <DollarSign className="h-3 w-3 text-emerald-600" />
                <span className="font-medium text-gray-700">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(stats.total_spend || 0)}
                </span>
            </div>
            <div className="w-px h-3 bg-gray-200"></div>
            <div className="flex items-center gap-1" title="Total de Viagens">
                <Plane className="h-3 w-3 text-blue-600" />
                <span className="font-medium text-gray-700">{stats.total_trips || 0} viagens</span>
            </div>
            {stats.is_group_leader && (
                <>
                    <div className="w-px h-3 bg-gray-200"></div>
                    <div className="flex items-center gap-1" title="Líder de Grupo">
                        <Crown className="h-3 w-3 text-amber-500" />
                        <span className="font-medium text-amber-700">Líder</span>
                    </div>
                </>
            )}
        </div>
    )
}
