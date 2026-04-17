import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MapPin, Calendar, ArrowUpRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Link } from 'react-router-dom'

interface Traveler {
    id: string
    nome: string
}

interface TripHistoryRow {
    card_id: string
    titulo: string
    data_viagem: string | null
    status: string | null
    role: string
    valor: number | null
    moeda: string | null
    companions: string[]
    relevant_contacts: string[]
}

interface TravelHistorySectionProps {
    travelers: Traveler[]
    currentCardId?: string
}

export default function TravelHistorySection({ travelers, currentCardId }: TravelHistorySectionProps) {
    const contactIds = travelers.map(t => t.id).filter(Boolean).sort()

    const { data: rawHistory, isLoading } = useQuery({
        queryKey: ['travel-history', contactIds],
        queryFn: async () => {
            if (contactIds.length === 0) return []

            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC overload not in generated types
            const { data, error } = await (supabase.rpc as any)('get_travel_history', {
                contact_ids: contactIds
            })
            if (error) {
                console.error('Error fetching history:', error)
                throw error
            }
            return data
        },
        enabled: contactIds.length > 0
    })

    // Dedup by card_id + exclude current card
    const history = useMemo(() => {
        if (!rawHistory) return rawHistory
        const seen = new Map<string, TripHistoryRow>()
        for (const trip of rawHistory) {
            if (trip.card_id === currentCardId) continue
            if (!seen.has(trip.card_id)) seen.set(trip.card_id, trip)
        }
        return Array.from(seen.values())
    }, [rawHistory, currentCardId])

    const formatCurrency = (value: number, currency: string) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: currency || 'BRL'
        }).format(value)
    }

    if (contactIds.length === 0) {
        return (
            <div className="rounded-lg border bg-gray-50 p-4">
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Histórico de Viagens</h4>
                <p className="text-xs text-gray-400 italic">Nenhum viajante identificado</p>
            </div>
        )
    }

    if (isLoading) {
        return (
            <div className="rounded-lg border bg-gray-50 p-4">
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Histórico de Viagens</h4>
                <div className="animate-pulse space-y-2">
                    <div className="h-16 bg-gray-200 rounded"></div>
                </div>
            </div>
        )
    }

    if (!history || history.length === 0) {
        return (
            <div className="rounded-lg border bg-gray-50 p-4">
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Histórico de Viagens</h4>
                <div className="text-center py-4">
                    <p className="text-xs text-gray-400">Sem histórico de viagens anteriores</p>
                    <p className="text-[10px] text-gray-400 mt-1">Cliente novo</p>
                </div>
            </div>
        )
    }

    return (
        <div className="rounded-lg border bg-gradient-to-br from-indigo-50 to-purple-50 p-4">
            <h4 className="text-xs font-semibold text-gray-700 uppercase mb-3 flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-indigo-600" />
                Histórico de Viagens
                <span className="ml-auto text-[10px] font-normal text-gray-500">{history.length} viagem{history.length > 1 ? 'ns' : ''}</span>
            </h4>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {history.map((trip: TripHistoryRow) => (
                    <Link
                        to={`/cards/${trip.card_id}`}
                        key={trip.card_id}
                        className="block bg-white rounded-md p-3 shadow-sm border border-gray-100 hover:border-indigo-300 hover:shadow-md transition-all group relative"
                    >
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <ArrowUpRight className="h-3.5 w-3.5 text-indigo-400" />
                        </div>

                        <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex-1 min-w-0 pr-4">
                                <p className="text-sm font-medium text-gray-900 truncate group-hover:text-indigo-700 transition-colors">
                                    {trip.titulo}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                    <div className="flex items-center gap-1">
                                        <Calendar className="h-3 w-3 text-gray-400 flex-shrink-0" />
                                        <span className="text-[10px] text-gray-500">
                                            {trip.data_viagem ? format(new Date(trip.data_viagem), "MMM yyyy", { locale: ptBR }) : 'Data não definida'}
                                        </span>
                                    </div>
                                    <span className="text-[10px] text-gray-300">|</span>
                                    <span className={`text-[10px] font-medium ${trip.status === 'Ganho' ? 'text-green-600' :
                                        trip.status === 'Perdido' ? 'text-red-600' :
                                            'text-gray-500'
                                        }`}>
                                        {trip.status || 'Em andamento'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                            <div className="flex flex-wrap gap-1">
                                {/* Show badges for relevant contacts (who was on this trip) */}
                                {trip.relevant_contacts && trip.relevant_contacts.map((name: string, idx: number) => (
                                    <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-medium border border-indigo-100">
                                        {name.split(' ')[0]}
                                    </span>
                                ))}
                            </div>

                            {trip.valor && (
                                <p className="text-[10px] font-semibold text-gray-600 bg-gray-50 px-1.5 py-0.5 rounded">
                                    {formatCurrency(trip.valor, trip.moeda || 'BRL')}
                                </p>
                            )}
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    )
}
