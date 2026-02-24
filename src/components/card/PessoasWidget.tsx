import { Plus, Eye } from 'lucide-react'
import { useState } from 'react'
import ContactSelector from './ContactSelector'
import CardTravelers from './CardTravelers'
import TravelHistorySection from './TravelHistorySection'
import ContactIntelligenceWidget from './ContactIntelligenceWidget'
import PersonDetailDrawer from '../people/PersonDetailDrawer'
import { useCardPeople } from '../../hooks/useCardPeople'
import { useQueryClient } from '@tanstack/react-query'
import type { Database } from '../../database.types'
import { formatContactName, getContactInitials } from '../../lib/contactUtils'

type Card = Database['public']['Tables']['cards']['Row']

interface PessoasWidgetProps {
    card: Card
}

export default function PessoasWidget({ card }: PessoasWidgetProps) {
    const queryClient = useQueryClient()
    const [selectorMode, setSelectorMode] = useState<'none' | 'add_traveler' | 'set_primary'>('none')
    const [selectedContact, setSelectedContact] = useState<Database['public']['Tables']['contatos']['Row'] | null>(null)

    // Use the Unified Hook
    const {
        people,
        primary,
        travelers,
        promoteToPrimary,
        removePerson,
        addPerson,
        isUpdating
    } = useCardPeople(card.id || undefined)

    // Calculate stats
    const adultos = travelers?.filter(t => t.tipo_pessoa === 'adulto' || !t.tipo_pessoa).length || 0
    const criancas = travelers?.filter(t => t.tipo_pessoa === 'crianca').length || 0

    const handleSetPrimaryContact = (contactId: string) => {
        promoteToPrimary(contactId, {
            onSuccess: () => setSelectorMode('none')
        })
    }

    const handleRemovePrimaryContact = () => {
        if (primary) {
            removePerson(primary, {
                onSuccess: () => setSelectorMode('none')
            })
        }
    }

    // Helper to invalidate queries when a traveler is added via Selector
    const handleContactAdded = (contactId: string, contact: { nome: string }) => {
        addPerson({ id: contactId, nome: contact.nome }, {
            onSuccess: () => setSelectorMode('none')
        })
    }

    const displayNome = primary ? formatContactName(primary) : ''

    return (
        <div className="rounded-lg border bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Pessoas</h3>

            <div className="space-y-4">
                {/* Primary Contact */}
                {primary ? (
                    <div className="group relative bg-gray-50 rounded-lg p-3 border border-gray-100 hover:border-indigo-100 hover:shadow-sm transition-all">
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-white border border-gray-300 flex items-center justify-center text-indigo-600 font-semibold shadow-sm">
                                    {getContactInitials(primary || {})}
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-gray-900">
                                        {displayNome}
                                    </p>
                                    <p className="text-xs text-gray-500">Contato Principal</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setSelectedContact(primary as unknown as Database['public']['Tables']['contatos']['Row'])}
                                    className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-md hover:bg-white transition-colors"
                                    title="Ver detalhes completos"
                                >
                                    <Eye className="h-4 w-4" />
                                </button>
                                <button
                                    onClick={() => setSelectorMode('set_primary')}
                                    disabled={isUpdating}
                                    className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-md hover:bg-white transition-colors disabled:opacity-50"
                                    title="Trocar contato principal"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-left-right"><path d="M8 3 4 7l4 4" /><path d="M4 7h16" /><path d="m16 21 4-4-4-4" /><path d="M20 17H4" /></svg>
                                </button>
                                <button
                                    onClick={handleRemovePrimaryContact}
                                    disabled={isUpdating}
                                    className="p-1.5 text-gray-400 hover:text-red-600 rounded-md hover:bg-white transition-colors disabled:opacity-50"
                                    title="Remover contato principal"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-trash-2"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></svg>
                                </button>
                            </div>
                        </div>

                        {/* Intelligence Widget */}
                        <ContactIntelligenceWidget contactId={primary.id} />
                    </div>
                ) : (
                    <button
                        onClick={() => setSelectorMode('set_primary')}
                        className="w-full flex flex-col items-center justify-center py-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-indigo-300 hover:bg-indigo-50/30 transition-all group"
                    >
                        <div className="h-10 w-10 rounded-full bg-gray-50 flex items-center justify-center mb-2 group-hover:bg-white group-hover:shadow-sm transition-all">
                            <Plus className="h-5 w-5 text-gray-400 group-hover:text-indigo-600" />
                        </div>
                        <p className="text-sm font-medium text-gray-600 group-hover:text-indigo-700">Definir Contato Principal</p>
                        <p className="text-xs text-gray-400 group-hover:text-indigo-500/70">Quem negocia/paga pela viagem</p>
                    </button>
                )}

                {/* Travelers - Only for TRIPS */}
                {card.produto === 'TRIPS' && (
                    <>
                        <div className="pt-3 border-t">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-semibold text-gray-500 uppercase">
                                    Acompanhantes ({adultos} {adultos === 1 ? 'adulto' : 'adultos'}, {criancas} {criancas === 1 ? 'criança' : 'crianças'})
                                </p>
                                <button
                                    onClick={() => setSelectorMode('add_traveler')}
                                    className="text-[10px] flex items-center gap-1 px-2 py-0.5 rounded-full border bg-gray-50 text-gray-600 border-gray-300 hover:bg-gray-100 transition-colors"
                                >
                                    <Plus className="h-3 w-3" />
                                    Adicionar
                                </button>
                            </div>

                            <div className="space-y-2 mb-4">
                                <CardTravelers
                                    card={{ id: card.id!, produto_data: card.produto_data as Record<string, unknown> | null }}
                                    embedded={true}
                                />
                            </div>
                        </div>

                        {/* Travel History Section */}
                        <div className="pt-3 border-t">
                            <TravelHistorySection
                                travelers={people || []}
                                currentCardId={card.id || undefined}
                            />
                        </div>
                    </>
                )}
            </div>

            {selectorMode !== 'none' && card.id && (
                <ContactSelector
                    cardId={card.id!}
                    onClose={() => setSelectorMode('none')}
                    addToCard={false} // Only add to card_contatos if explicitly adding a traveler
                    onContactAdded={(contactId, contact) => {
                        if (selectorMode === 'set_primary' && contactId) {
                            handleSetPrimaryContact(contactId)
                        } else {
                            if (contactId && contact) {
                                handleContactAdded(contactId, contact)
                            }
                        }
                    }}
                />
            )}

            {/* Person Detail Drawer */}
            <PersonDetailDrawer
                person={selectedContact}
                onClose={() => setSelectedContact(null)}
                onRefresh={() => {
                    queryClient.invalidateQueries({ queryKey: ['card-people', card.id] })
                }}
            />
        </div>
    )
}
