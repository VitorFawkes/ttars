import { Plus, Eye, ChevronDown, MessageCircle, ArrowLeftRight, Trash2 } from 'lucide-react'
import { useState, useMemo } from 'react'
import { cn } from '../../lib/utils'
import ContactSelector from './ContactSelector'
import CardTravelers from './CardTravelers'
import TravelHistorySection from './TravelHistorySection'
import ContactIntelligenceWidget from './ContactIntelligenceWidget'
import PersonDetailDrawer from '../people/PersonDetailDrawer'
import { useCardPeople, type CardPerson } from '../../hooks/useCardPeople'
import { useStageSectionConfig } from '../../hooks/useStageSectionConfig'
import { useCurrentProductMeta } from '../../hooks/useCurrentProductMeta'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../database.types'
import { formatContactName, getContactInitials } from '../../lib/contactUtils'

type Card = Database['public']['Tables']['cards']['Row']

interface PessoasWidgetProps {
    card: Card
}

interface OwnerCardProps {
    person: CardPerson
    roleLabel: string
    messageCount: number
    isUpdating: boolean
    onOpenConversations: () => void
    onOpenDetails: () => void
    onSwap: () => void
    swapTitle: string
    onRemove: () => void
}

// Cartão de "dono" do card: Contato Principal (TRIPS) ou Noivo 1 / Noivo 2 (WEDDING).
function OwnerCard({ person, roleLabel, messageCount, isUpdating, onOpenConversations, onOpenDetails, onSwap, swapTitle, onRemove }: OwnerCardProps) {
    return (
        <div className="group relative bg-gray-50 rounded-lg p-2 border border-gray-100 hover:border-indigo-100 hover:shadow-sm transition-all">
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-full bg-white border border-gray-300 flex items-center justify-center text-indigo-600 font-semibold text-xs shadow-sm">
                        {getContactInitials(person)}
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-gray-900">{formatContactName(person)}</p>
                        <p className="text-xs text-gray-500">{roleLabel}</p>
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    <button
                        onClick={onOpenConversations}
                        className="relative p-1.5 text-gray-400 hover:text-indigo-600 rounded-md hover:bg-white transition-colors"
                        title="Ver conversas"
                    >
                        <MessageCircle className="h-4 w-4" />
                        {messageCount > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 flex items-center justify-center rounded-full bg-indigo-600 text-white text-[9px] font-medium">
                                {messageCount > 99 ? '99+' : messageCount}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={onOpenDetails}
                        className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-md hover:bg-white transition-colors"
                        title="Ver detalhes completos"
                    >
                        <Eye className="h-4 w-4" />
                    </button>
                    <button
                        onClick={onSwap}
                        disabled={isUpdating}
                        className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-md hover:bg-white transition-colors disabled:opacity-50"
                        title={swapTitle}
                    >
                        <ArrowLeftRight className="h-4 w-4" />
                    </button>
                    <button
                        onClick={onRemove}
                        disabled={isUpdating}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded-md hover:bg-white transition-colors disabled:opacity-50"
                        title="Remover"
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Intelligence Widget */}
            <ContactIntelligenceWidget contactId={person.id} />
        </div>
    )
}

export default function PessoasWidget({ card }: PessoasWidgetProps) {
    const queryClient = useQueryClient()
    const [selectorMode, setSelectorMode] = useState<'none' | 'add_traveler' | 'set_primary'>('none')
    const [selectedContact, setSelectedContact] = useState<Database['public']['Tables']['contatos']['Row'] | null>(null)
    const [drawerInitialTab, setDrawerInitialTab] = useState<string>('info')
    // Collapse state from stage_section_config (composite keys: people:viajantes, people:travel_history)
    const { pipelineId } = useCurrentProductMeta()
    const { isSectionCollapsed, isSectionVisible, isLoading: sscLoading } = useStageSectionConfig(pipelineId)
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

    // WEDDING: o card tem 2 donos (Noivo 1 = principal, Noivo 2 = 1º contato adicional).
    // Demais contatos viram "Convidados". TRIPS segue com Principal + Acompanhantes.
    const isWedding = card.produto === 'WEDDING'
    const noivo2 = isWedding ? (travelers?.[0] ?? null) : null
    const extraGuests = isWedding ? (travelers?.slice(1) ?? []) : []

    // Count of WhatsApp messages of primary contact (for badge on conversation button)
    const { data: messageCount = 0 } = useQuery({
        queryKey: ['contact-whatsapp-count', primary?.id],
        queryFn: async () => {
            if (!primary?.id) return 0
            const { count, error } = await supabase
                .from('whatsapp_messages')
                .select('id', { count: 'exact', head: true })
                .eq('contact_id', primary.id)
            if (error) return 0
            return count || 0
        },
        enabled: !!primary?.id,
    })

    // Contagem de mensagens do Noivo 2 (badge no botão de conversa)
    const { data: noivo2MessageCount = 0 } = useQuery({
        queryKey: ['contact-whatsapp-count', noivo2?.id],
        queryFn: async () => {
            if (!noivo2?.id) return 0
            const { count, error } = await supabase
                .from('whatsapp_messages')
                .select('id', { count: 'exact', head: true })
                .eq('contact_id', noivo2.id)
            if (error) return 0
            return count || 0
        },
        enabled: !!noivo2?.id,
    })

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

    return (
        <div data-section="people" className="rounded-lg border bg-white p-2.5 shadow-sm">
            <h3 className="text-xs font-semibold text-gray-900 mb-1.5">Pessoas</h3>

            <div className="space-y-2">
                {/* Dono 1 — Contato Principal (TRIPS) / Noivo 1 (WEDDING) */}
                {primary ? (
                    <OwnerCard
                        person={primary}
                        roleLabel={isWedding ? 'Noivo 1' : 'Contato Principal'}
                        messageCount={messageCount}
                        isUpdating={isUpdating}
                        onOpenConversations={() => {
                            setDrawerInitialTab('conversations')
                            setSelectedContact(primary as unknown as Database['public']['Tables']['contatos']['Row'])
                        }}
                        onOpenDetails={() => {
                            setDrawerInitialTab('info')
                            setSelectedContact(primary as unknown as Database['public']['Tables']['contatos']['Row'])
                        }}
                        onSwap={() => setSelectorMode('set_primary')}
                        swapTitle={isWedding ? 'Trocar Noivo 1' : 'Trocar contato principal'}
                        onRemove={handleRemovePrimaryContact}
                    />
                ) : (
                    <button
                        onClick={() => setSelectorMode('set_primary')}
                        className="w-full flex flex-col items-center justify-center py-2.5 border-2 border-dashed border-gray-300 rounded-lg hover:border-indigo-300 hover:bg-indigo-50/30 transition-all group"
                    >
                        <div className="h-8 w-8 rounded-full bg-gray-50 flex items-center justify-center mb-1.5 group-hover:bg-white group-hover:shadow-sm transition-all">
                            <Plus className="h-4 w-4 text-gray-400 group-hover:text-indigo-600" />
                        </div>
                        <p className="text-xs font-medium text-gray-600 group-hover:text-indigo-700">{isWedding ? 'Definir Noivo 1' : 'Definir Contato Principal'}</p>
                        {!isWedding && <p className="text-xs text-gray-400 group-hover:text-indigo-500/70">Quem negocia/paga pela viagem</p>}
                    </button>
                )}

                {/* WEDDING — Noivo 2 (segundo dono do card) */}
                {isWedding && (
                    noivo2 ? (
                        <OwnerCard
                            person={noivo2}
                            roleLabel="Noivo 2"
                            messageCount={noivo2MessageCount}
                            isUpdating={isUpdating}
                            onOpenConversations={() => {
                                setDrawerInitialTab('conversations')
                                setSelectedContact(noivo2 as unknown as Database['public']['Tables']['contatos']['Row'])
                            }}
                            onOpenDetails={() => {
                                setDrawerInitialTab('info')
                                setSelectedContact(noivo2 as unknown as Database['public']['Tables']['contatos']['Row'])
                            }}
                            onSwap={() => promoteToPrimary(noivo2.id)}
                            swapTitle="Tornar Noivo 1"
                            onRemove={() => removePerson(noivo2)}
                        />
                    ) : (
                        <button
                            onClick={() => setSelectorMode('add_traveler')}
                            className="w-full flex flex-col items-center justify-center py-2.5 border-2 border-dashed border-gray-300 rounded-lg hover:border-indigo-300 hover:bg-indigo-50/30 transition-all group"
                        >
                            <div className="h-8 w-8 rounded-full bg-gray-50 flex items-center justify-center mb-1.5 group-hover:bg-white group-hover:shadow-sm transition-all">
                                <Plus className="h-4 w-4 text-gray-400 group-hover:text-indigo-600" />
                            </div>
                            <p className="text-xs font-medium text-gray-600 group-hover:text-indigo-700">Adicionar Noivo 2</p>
                        </button>
                    )
                )}

                {/* WEDDING — convidados/contatos extras (raro: além dos 2 noivos) */}
                {isWedding && extraGuests.length > 0 && (
                    <div className="pt-2 border-t">
                        <button
                            onClick={() => setTravelersExpanded(prev => !prev)}
                            className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase hover:text-gray-700 transition-colors mb-1.5"
                        >
                            <ChevronDown className={cn("w-3 h-3 transition-transform", !travelersExpanded && "-rotate-90")} />
                            Convidados ({extraGuests.length})
                        </button>
                        {travelersExpanded && (
                            <div className="space-y-1.5">
                                {extraGuests.map(g => (
                                    <div key={g.id} className="flex items-center justify-between bg-gray-50 rounded-md px-2 py-1 border border-gray-100">
                                        <span className="text-xs text-gray-800">{formatContactName(g)}</span>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => {
                                                    setDrawerInitialTab('info')
                                                    setSelectedContact(g as unknown as Database['public']['Tables']['contatos']['Row'])
                                                }}
                                                className="p-1 text-gray-400 hover:text-indigo-600 rounded-md hover:bg-white transition-colors"
                                                title="Ver detalhes"
                                            >
                                                <Eye className="h-3.5 w-3.5" />
                                            </button>
                                            <button
                                                onClick={() => removePerson(g)}
                                                disabled={isUpdating}
                                                className="p-1 text-gray-400 hover:text-red-600 rounded-md hover:bg-white transition-colors disabled:opacity-50"
                                                title="Remover"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Acompanhantes — só TRIPS (WEDDING usa os cards de Noivo 1/2 acima) */}
                {!isWedding && card.produto === 'TRIPS' && travelersVisible && (
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

                {/* Histórico de Viagem — só TRIPS */}
                {card.produto === 'TRIPS' && historyVisible && (
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
                defaultTab={drawerInitialTab}
                onClose={() => setSelectedContact(null)}
                onRefresh={() => {
                    queryClient.invalidateQueries({ queryKey: ['card-people', card.id] })
                }}
            />
        </div>
    )
}
