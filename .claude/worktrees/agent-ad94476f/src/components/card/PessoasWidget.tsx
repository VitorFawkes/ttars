import { Plus, Eye, ChevronDown } from 'lucide-react'
import { useState, useMemo } from 'react'
import { cn } from '../../lib/utils'
import ContactSelector from './ContactSelector'
import CardTravelers from './CardTravelers'
import TravelHistorySection from './TravelHistorySection'
import ContactIntelligenceWidget from './ContactIntelligenceWidget'
import PersonDetailDrawer from '../people/PersonDetailDrawer'
import { useCardPeople } from '../../hooks/useCardPeople'
import { useStageSectionConfig } from '../../hooks/useStageSectionConfig'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
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
    // Collapse state from stage_section_config (composite keys: people:viajantes, people:travel_history)
    const { isSectionCollapsed, isSectionVisible, isLoading: sscLoading } = useStageSectionConfig()
    const stageId = card.pipeline_stage_id as string
    const travelersVisible = isSectionVisible(stageId, 'people:viajantes')
    const historyVisible = isSectionVisible(stageId, 'people:travel_history')

    // Track whether we've applied the config defaults (only once after data loads)
    const [configApplied, setConfigApplied] = useState(false)
    const [travelersExpanded, setTravelersExpanded] = useState(true)
    const [historyExpanded, setHistoryExpanded] = useState(false)

    if (!sscLoading && !configApplied) {
        setConfigApplied(true)
        setTravelersExpanded(!isSectionCollapsed(stageId, 'people:viajantes'))
        setHistoryExpanded(!isSectionCollapsed(stageId, 'people:travel_history'))
    }

    const {
        people,
        primary,
        travelers,
        promoteToPrimary,
        removePerson,
        addPerson,
        isUpdating
    } = useCardPeople(card.id || undefined)

    const adultos = travelers?.filter(t => t.tipo_pessoa === 'adulto' || !t.tipo_pessoa).length || 0
    const criancas = travelers?.filter(t => t.tipo_pessoa === 'crianca').length || 0

    // Travel history count (shared cache with TravelHistorySection)
    const contactIds = (people || []).map(p => p.id).filter(Boolean).sort()

    const { data: rawHistory } = useQuery({
        queryKey: ['travel-history', contactIds],
        queryFn: async () => {
            if (contactIds.length === 0) return []
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.rpc as any)('get_travel_history', {
                contact_ids: contactIds
            })
            if (error) throw error
            return data
        },
        enabled: contactIds.length > 0 && historyVisible
    })

    const tripCount = useMemo(() => {
        if (!rawHistory) return 0
        const seen = new Set<string>()
        for (const trip of rawHistory as { card_id: string }[]) {
            if (trip.card_id === card.id) continue
            seen.add(trip.card_id)
        }
        return seen.size
    }, [rawHistory, card.id])

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

    const handleContactAdded = (contactId: string, contact: { nome: string }) => {
        addPerson({ id: contactId, nome: contact.nome })
    }

    const handleBatchContactsAdded = (contacts: { id: string; nome: string }[]) => {
        if (contacts.length === 0) return
        // If no primary exists, first selected becomes primary
        const startIdx = !primary ? 1 : 0
        if (!primary && contacts.length > 0) {
            handleSetPrimaryContact(contacts[0].id)
        }
        // Rest become travelers
        for (let i = startIdx; i < contacts.length; i++) {
            addPerson({ id: contacts[i].id, nome: contacts[i].nome })
        }
        setSelectorMode('none')
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

                {/* Travelers - Only for TRIPS */}
                {card.produto === 'TRIPS' && (
                    <>
                        {travelersVisible && (
                            <div className="pt-2 border-t">
                                <div className="flex items-center justify-between mb-1.5">
                                    <button
                                        onClick={() => setTravelersExpanded(prev => !prev)}
                                        className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase hover:text-gray-700 transition-colors"
                                    >
                                        <ChevronDown className={cn("w-3 h-3 transition-transform", !travelersExpanded && "-rotate-90")} />
                                        Acompanhantes ({adultos} {adultos === 1 ? 'adulto' : 'adultos'}, {criancas} {criancas === 1 ? 'criança' : 'crianças'})
                                    </button>
                                    {travelersExpanded && (
                                        <button
                                            onClick={() => setSelectorMode('add_traveler')}
                                            className="text-[10px] flex items-center gap-1 px-2 py-0.5 rounded-full border bg-gray-50 text-gray-600 border-gray-300 hover:bg-gray-100 transition-colors"
                                        >
                                            <Plus className="h-3 w-3" />
                                            Adicionar
                                        </button>
                                    )}
                                </div>

                                {travelersExpanded && (
                                    <div className="space-y-1.5 mb-2">
                                        <CardTravelers
                                            card={{ id: card.id!, produto_data: card.produto_data as Record<string, unknown> | null }}
                                            embedded={true}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Travel History Section */}
                        {historyVisible && (
                            <div className="pt-3 border-t">
                                <button
                                    onClick={() => setHistoryExpanded(prev => !prev)}
                                    className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase hover:text-gray-700 transition-colors mb-1.5"
                                >
                                    <ChevronDown className={cn("w-3 h-3 transition-transform", !historyExpanded && "-rotate-90")} />
                                    Histórico de Viagem{tripCount > 0 && ` (${tripCount} ${tripCount === 1 ? 'viagem' : 'viagens'})`}
                                </button>
                                {historyExpanded && (
                                    <TravelHistorySection
                                        travelers={people || []}
                                        currentCardId={card.id || undefined}
                                    />
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

            {selectorMode !== 'none' && card.id && (
                <ContactSelector
                    cardId={card.id!}
                    onClose={() => setSelectorMode('none')}
                    addToCard={false}
                    multiSelect={selectorMode === 'add_traveler'}
                    hasPrimary={!!primary}
                    onContactsAdded={handleBatchContactsAdded}
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
                card={card}
                onClose={() => setSelectedContact(null)}
                onRefresh={() => {
                    queryClient.invalidateQueries({ queryKey: ['card-people', card.id] })
                }}
            />
        </div>
    )
}
