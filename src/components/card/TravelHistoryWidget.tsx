import TravelHistorySection from './TravelHistorySection'
import { useCardPeople } from '../../hooks/useCardPeople'
import { SectionCollapseToggle } from './DynamicSectionWidget'
import type { Database } from '../../database.types'

type Card = Database['public']['Tables']['cards']['Row']

interface TravelHistoryWidgetProps {
    cardId: string
    card: Card
    isExpanded: boolean
    onToggleCollapse: () => void
}

export default function TravelHistoryWidget({ card, isExpanded, onToggleCollapse }: TravelHistoryWidgetProps) {
    const { people } = useCardPeople(card.id || undefined)

    return (
        <div className="rounded-lg border bg-white shadow-sm">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
                <SectionCollapseToggle isExpanded={isExpanded} onToggle={onToggleCollapse} />
                <h3 className="text-xs font-semibold text-gray-900">Histórico de Viagem</h3>
            </div>

            {isExpanded && (
                <div className="p-2.5">
                    <TravelHistorySection
                        travelers={people || []}
                        currentCardId={card.id || undefined}
                    />
                </div>
            )}
        </div>
    )
}
