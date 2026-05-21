import { useState } from 'react'
import { type Database } from '../../../database.types'
import { Calendar, Users as UsersIcon, MapPin, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GroupDashboard } from './GroupDashboard'
import { GroupTravelersList } from './GroupTravelersList'
import { GroupRoomingList } from './GroupRoomingList'
import EditGroupModal from './EditGroupModal'

type Card = Database['public']['Tables']['cards']['Row']

interface GroupDetailLayoutProps {
    card: Card
    onUpdate: () => void
}

function formatDateBR(iso: string | null): string | null {
    if (!iso) return null
    const [y, m, d] = iso.split('-')
    if (!y || !m || !d) return iso
    return `${d}/${m}/${y}`
}

export default function GroupDetailLayout({ card, onUpdate }: GroupDetailLayoutProps) {
    const [isEditOpen, setIsEditOpen] = useState(false)

    const startBR = formatDateBR(card.data_viagem_inicio)
    const endBR = formatDateBR(card.data_viagem_fim)
    const dateLabel = startBR && endBR ? `${startBR} – ${endBR}` : startBR || endBR

    return (
        <div className="h-full flex flex-col bg-transparent">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-6">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
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
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-sm text-gray-500">
                            {dateLabel && (
                                <div className="flex items-center gap-1.5">
                                    <Calendar className="h-4 w-4 text-gray-400" />
                                    <span>{dateLabel}</span>
                                </div>
                            )}
                            {card.group_capacity != null && (
                                <div className="flex items-center gap-1.5">
                                    <UsersIcon className="h-4 w-4 text-gray-400" />
                                    <span>Capacidade: {card.group_capacity}</span>
                                </div>
                            )}
                            {card.origem && (
                                <div className="flex items-center gap-1.5">
                                    <MapPin className="h-4 w-4 text-gray-400" />
                                    <span>{card.origem}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                        <Button
                            variant="outline"
                            className="border-gray-200 hover:bg-gray-50 text-gray-700"
                            onClick={() => setIsEditOpen(true)}
                        >
                            <Pencil className="w-4 h-4 mr-2" />
                            Editar grupo
                        </Button>
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

            <EditGroupModal
                isOpen={isEditOpen}
                onClose={() => setIsEditOpen(false)}
                card={card}
                onSuccess={onUpdate}
            />
        </div>
    )
}
