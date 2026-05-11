import { type Database } from '../../../database.types'
import { Calendar } from 'lucide-react'
import { GroupDashboard } from './GroupDashboard'
import { GroupTravelersList } from './GroupTravelersList'
import { GroupRoomingList } from './GroupRoomingList'

type Card = Database['public']['Tables']['cards']['Row']

interface GroupDetailLayoutProps {
    card: Card
    onUpdate: () => void
}

export default function GroupDetailLayout({ card, onUpdate }: GroupDetailLayoutProps) {
    return (
        <div className="h-full flex flex-col bg-transparent">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-6">
                <div className="flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-medium border border-purple-200">
                                Viagem em Grupo
                            </span>
                            {card.status_comercial && (
                                <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs font-medium border border-gray-200">
                                    {card.status_comercial}
                                </span>
                            )}
                        </div>
                        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">{card.titulo}</h1>
                        <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                            {card.produto_data && typeof card.produto_data === 'object' && (card.produto_data as any).data_viagem && (
                                <div className="flex items-center gap-1.5">
                                    <Calendar className="h-4 w-4 text-gray-400" />
                                    <span>{(card.produto_data as any).data_viagem}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Actions will go here */}
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                <div className="max-w-7xl mx-auto space-y-6">

                    <GroupDashboard card={card} onRefresh={onUpdate} />
                    <GroupTravelersList parentId={card.id!} />
                    <GroupRoomingList parentId={card.id!} />

                </div>
            </div>
        </div>
    )
}
