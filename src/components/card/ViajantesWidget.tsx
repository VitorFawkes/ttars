import { Plus } from 'lucide-react'
import { useState } from 'react'
import CardTravelers from './CardTravelers'
import ContactSelector from './ContactSelector'
import { useCardPeople } from '../../hooks/useCardPeople'
import { SectionCollapseToggle } from './DynamicSectionWidget'
import type { Database } from '../../database.types'

type Card = Database['public']['Tables']['cards']['Row']

interface ViajantesWidgetProps {
    cardId: string
    card: Card
    isExpanded: boolean
    onToggleCollapse: () => void
}

export default function ViajantesWidget({ card, isExpanded, onToggleCollapse }: ViajantesWidgetProps) {
    const [showSelector, setShowSelector] = useState(false)
    const { travelers, addPerson } = useCardPeople(card.id || undefined)

    const adultos = travelers?.filter(t => t.tipo_pessoa === 'adulto' || !t.tipo_pessoa).length || 0
    const criancas = travelers?.filter(t => t.tipo_pessoa === 'crianca').length || 0

    return (
        <div className="rounded-lg border bg-white shadow-sm">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                <div className="flex items-center gap-2">
                    <SectionCollapseToggle isExpanded={isExpanded} onToggle={onToggleCollapse} />
                    <h3 className="text-xs font-semibold text-gray-900">
                        Viajantes
                        <span className="ml-1.5 text-gray-400 font-normal">
                            ({adultos} {adultos === 1 ? 'adulto' : 'adultos'}, {criancas} {criancas === 1 ? 'criança' : 'crianças'})
                        </span>
                    </h3>
                </div>
                <button
                    onClick={() => setShowSelector(true)}
                    className="text-[10px] flex items-center gap-1 px-2 py-0.5 rounded-full border bg-gray-50 text-gray-600 border-gray-300 hover:bg-gray-100 transition-colors"
                >
                    <Plus className="h-3 w-3" />
                    Adicionar
                </button>
            </div>

            {isExpanded && (
                <div className="p-2.5">
                    <CardTravelers
                        card={{ id: card.id!, produto_data: card.produto_data as Record<string, unknown> | null }}
                        embedded={true}
                    />
                </div>
            )}

            {showSelector && card.id && (
                <ContactSelector
                    cardId={card.id!}
                    onClose={() => setShowSelector(false)}
                    addToCard={false}
                    onContactAdded={(contactId, contact) => {
                        if (contactId && contact) {
                            addPerson({ id: contactId, nome: contact.nome }, {
                                onSuccess: () => setShowSelector(false)
                            })
                        }
                    }}
                />
            )}
        </div>
    )
}
