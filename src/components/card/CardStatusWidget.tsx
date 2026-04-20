import { DollarSign, History } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../database.types'
import { getPhaseBadgeClass, legacyFaseToSlug } from '../../lib/pipeline/phaseLabels'

type Card = Database['public']['Views']['view_cards_acoes']['Row']

interface CardStatusWidgetProps {
    card: Card
}

export default function CardStatusWidget({ card }: CardStatusWidgetProps) {
    // Fetch client history count
    const { data: clientHistory } = useQuery({
        queryKey: ['client-history', card.pessoa_principal_id],
        queryFn: async () => {
            if (!card.pessoa_principal_id) return { count: 0, trips: [] }

            const { data, error } = await supabase
                .from('cards')
                .select('id, titulo, created_at, status_comercial')
                .eq('pessoa_principal_id', card.pessoa_principal_id)
                .neq('id', card.id!) // Exclude current card
                .eq('produto', 'TRIPS')
                .order('created_at', { ascending: false })
                .limit(5)

            if (error) throw error
            return { count: data?.length || 0, trips: data || [] }
        },
        enabled: !!card.pessoa_principal_id
    })

    const phaseSlug = card.phase_slug ?? legacyFaseToSlug(card.fase)

    return (
        <div className="rounded-lg border bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Status do Card</h3>

            <div className="space-y-3">
                {/* Deal Value - Added here as per instruction */}
                <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-green-600" />
                    <span className="text-lg font-bold text-gray-900">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(card.valor_estimado || 0)}
                    </span>
                </div>

                {/* Phase Badge */}
                <div className="flex items-center justify-between">
                    <span className={cn(
                        "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border",
                        getPhaseBadgeClass(phaseSlug)
                    )}>
                        {card.fase}
                    </span>
                    <span className="text-xs text-gray-500">{card.etapa_nome}</span>
                </div>

                {/* Recurring Client */}
                {card.cliente_recorrente && clientHistory && clientHistory.count > 0 && (
                    <div className="pt-3 border-t">
                        <div className="flex items-center gap-2 text-xs text-indigo-600">
                            <History className="h-3.5 w-3.5" />
                            <span className="font-medium">
                                Cliente recorrente - {clientHistory.count} viagem(ns) anterior(es)
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
