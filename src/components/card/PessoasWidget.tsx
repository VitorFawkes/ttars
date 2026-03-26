import { Plus, Eye } from 'lucide-react'
import { useState } from 'react'
import ContactSelector from './ContactSelector'
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
    const [selectorMode, setSelectorMode] = useState<'none' | 'set_primary'>('none')
    const [selectedContact, setSelectedContact] = useState<Database['public']['Tables']['contatos']['Row'] | null>(null)

    const {
        primary,
        promoteToPrimary,
        removePerson,
        isUpdating
    } = useCardPeople(card.id || undefined)

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

    const displayNome = primary ? formatContactName(primary) : ''

    return (
        <div className="rounded-lg border bg-white p-2.5 shadow-sm">
            <h3 className="text-xs font-semibold text-gray-900 mb-1.5">Pessoas</h3>

            <div className="space-y-2">
                {/* Primary Contact */}
                {primary ? (
                    <div className="group relative bg-gray-50 rounded-lg p-2 border border-gray-100 hover:border-indigo-100 hover:shadow-sm transition-all">
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="h-8 w-8 rounded-full bg-white border border-gray-300 flex items-center justify-center text-indigo-600 font-semibold text-xs shadow-sm">
                                    {getContactInitials(primary || {})}
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-gray-900">
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
                        className="w-full flex flex-col items-center justify-center py-2.5 border-2 border-dashed border-gray-300 rounded-lg hover:border-indigo-300 hover:bg-indigo-50/30 transition-all group"
                    >
                        <div className="h-8 w-8 rounded-full bg-gray-50 flex items-center justify-center mb-1.5 group-hover:bg-white group-hover:shadow-sm transition-all">
                            <Plus className="h-4 w-4 text-gray-400 group-hover:text-indigo-600" />
                        </div>
                        <p className="text-xs font-medium text-gray-600 group-hover:text-indigo-700">Definir Contato Principal</p>
                        <p className="text-xs text-gray-400 group-hover:text-indigo-500/70">Quem negocia/paga pela viagem</p>
                    </button>
                )}
            </div>

            {selectorMode !== 'none' && card.id && (
                <ContactSelector
                    cardId={card.id!}
                    onClose={() => setSelectorMode('none')}
                    addToCard={false}
                    onContactAdded={(contactId) => {
                        if (selectorMode === 'set_primary' && contactId) {
                            handleSetPrimaryContact(contactId)
                        }
                    }}
                />
            )}

            {/* Person Detail Drawer */}
            <PersonDetailDrawer
                person={selectedContact}
                card={card}
                onClose={() => setSelectedContact(null)}
                onRefresh={() => {
                    queryClient.invalidateQueries({ queryKey: ['card-people', card.id] })
                }}
            />
        </div>
    )
}
