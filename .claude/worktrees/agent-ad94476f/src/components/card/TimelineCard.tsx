import { Calendar, Clock } from 'lucide-react'
import type { Database } from '../../database.types'

type Card = Database['public']['Views']['view_cards_acoes']['Row']

interface TimelineCardProps {
    card: Card
}

export default function TimelineCard({ card }: TimelineCardProps) {
    const getDaysInStage = () => {
        if (!card.updated_at) return 0
        const diff = new Date().getTime() - new Date(card.updated_at).getTime()
        return Math.floor(diff / (1000 * 60 * 60 * 24))
    }

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        })
    }

    return (
        <div className="rounded-lg border bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Timeline</h3>
            <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-gray-600">
                        <Calendar className="h-4 w-4" />
                        <span>Criado em</span>
                    </div>
                    <span className="font-medium text-gray-900">
                        {card.created_at ? formatDate(card.created_at) : '-'}
                    </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-gray-600">
                        <Clock className="h-4 w-4" />
                        <span>Tempo na etapa</span>
                    </div>
                    <span className="font-medium text-gray-900">{getDaysInStage()}d</span>
                </div>
                {card.updated_at && (
                    <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-gray-600">
                            <Clock className="h-4 w-4" />
                            <span>Última atualização</span>
                        </div>
                        <span className="font-medium text-gray-900">
                            {formatDate(card.updated_at)}
                        </span>
                    </div>
                )}
            </div>
        </div>
    )
}
