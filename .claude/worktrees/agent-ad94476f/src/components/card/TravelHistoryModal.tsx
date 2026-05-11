import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { X, Calendar, Plane } from 'lucide-react'

interface TravelHistoryModalProps {
    contactId: string | null
    contactName: string
    isOpen: boolean
    onClose: () => void
}

export default function TravelHistoryModal({ contactId, contactName, isOpen, onClose }: TravelHistoryModalProps) {
    const { data: history, isLoading } = useQuery({
        queryKey: ['travel-history', contactId],
        queryFn: async () => {
            if (!contactId) return []
            const { data, error } = await (supabase.rpc as any)('get_travel_history', {
                contact_id_param: contactId
            })
            if (error) throw error
            return data
        },
        enabled: !!contactId && isOpen
    })

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-lg bg-white rounded-lg shadow-xl overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b">
                    <h3 className="text-lg font-semibold text-gray-900">Histórico de Viagens: {contactName}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-6 max-h-[60vh] overflow-y-auto">
                    {isLoading ? (
                        <div className="text-center py-8 text-gray-500">Carregando...</div>
                    ) : history && history.length > 0 ? (
                        <div className="space-y-4">
                            {history.map((trip: any) => (
                                <div key={trip.card_id} className="flex items-start gap-3 p-3 rounded-lg border bg-gray-50">
                                    <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                                        <Plane className="h-5 w-5" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-sm font-medium text-gray-900">{trip.titulo}</h4>
                                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                                            <span className="flex items-center gap-1">
                                                <Calendar className="h-3 w-3" />
                                                {trip.data_viagem_inicio ? new Date(trip.data_viagem_inicio).toLocaleDateString('pt-BR') : 'Data não definida'}
                                            </span>
                                            <span>•</span>
                                            <span className="capitalize">{trip.status?.replace('_', ' ')}</span>
                                            <span>•</span>
                                            <span className="capitalize px-1.5 py-0.5 rounded bg-gray-200 text-gray-700 font-medium">
                                                {trip.role}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-gray-500">
                            Nenhuma viagem anterior encontrada.
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
