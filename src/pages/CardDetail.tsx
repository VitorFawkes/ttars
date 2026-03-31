import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import CardHeader from '../components/card/CardHeader'
import { useStageRequirements, type TaskRequirement } from '../hooks/useStageRequirements'
import CardTasks from '../components/card/CardTasks'
import { DynamicSectionsList } from '../components/card/DynamicSectionWidget'

import ConversationHistory from '../components/card/ConversationHistory'
import PessoasWidget from '../components/card/PessoasWidget'

import ActivityFeed from '../components/card/ActivityFeed'
import { ParentLinkBanner } from '../components/cards/group/ParentLinkBanner'
import GroupDetailLayout from '../components/cards/group/GroupDetailLayout'
import LinkToGroupModal from '../components/cards/group/LinkToGroupModal'
import SubCardsList from '../components/card/SubCardsList'
import CardTeamSection from '../components/card/CardTeamSection'
import { SubCardParentBanner } from '../components/pipeline/SubCardBadge'
import { useSubCards, useSubCardParent } from '../hooks/useSubCards'
import { TagSelector } from '../components/card/TagSelector'
import { ArrowLeft, Users, CalendarClock } from 'lucide-react'

import type { Database } from '../database.types'
import { getProductLabels } from '../lib/productLabels'
import { useSeenCards } from '../hooks/useSeenCards'

type Card = Database['public']['Tables']['cards']['Row']

// Section keys with dedicated hardcoded components (not rendered via DynamicSectionsList)
const HARDCODED_EXCLUDE_KEYS = ['agenda_tarefas', 'historico_conversas', 'people']

export default function CardDetail() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const [showLinkToGroup, setShowLinkToGroup] = useState(false)
    const sidebarRef = useRef<HTMLDivElement>(null)

    const scrollToAlerts = useCallback(() => {
        const el = sidebarRef.current?.querySelector('[data-section="alertas"]')
        if (!el) return
        // If collapsed (single button child = CollapsedSectionBar), expand first
        const isCollapsed = el.children.length === 1 && el.children[0].tagName === 'BUTTON'
        if (isCollapsed) {
            ;(el.children[0] as HTMLElement).click()
        }
        // Scroll after a brief delay to allow expansion
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), isCollapsed ? 100 : 0)
    }, [])

    // Mark card as seen for "new card" highlight (only owner can dismiss)
    const { markSeen } = useSeenCards()

    // Check if card is a sub-card and get parent info
    const { isSubCard, parentCard } = useSubCardParent(id)

    // Get sub-cards if this is a parent
    const { canCreateSubCard } = useSubCards(id)

    const { data: card, isLoading } = useQuery({
        queryKey: ['card-detail', id],
        queryFn: async () => {
            const [cardRes, tarefaRes] = await Promise.all([
                supabase
                    .from('cards')
                    .select('*')
                    .eq('id', id!)
                    .single(),
                supabase
                    .from('tarefas')
                    .select('id, titulo, data_vencimento, prioridade, tipo')
                    .eq('card_id', id!)
                    .or('concluida.is.null,concluida.eq.false')
                    .not('status', 'eq', 'reagendada')
                    .order('data_vencimento', { ascending: true, nullsFirst: false })
                    .order('created_at', { ascending: false })
                    .limit(1)
            ])
            if (cardRes.error) throw cardRes.error
            const card = cardRes.data as Card & { proxima_tarefa?: Record<string, unknown> | null }
            card.proxima_tarefa = tarefaRes.data?.[0] ?? null
            return card
        },
        enabled: !!id,
        staleTime: 1000 * 30, // 30 seconds to avoid immediate refetch flickers
    })

    // Mark as seen only when the owner opens the card
    useEffect(() => {
        if (id && card) markSeen(id, card.dono_atual_id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, card?.dono_atual_id, markSeen])

    // Compute missing task requirements for contextual indicators in CardTasks
    const { missingBlocking } = useStageRequirements((card || { id: '', pipeline_stage_id: null }) as Card)
    const requiredTasks = missingBlocking
        .filter((r): r is TaskRequirement => r.requirement_type === 'task')
        .map(r => ({ label: r.label, task_tipo: r.task_tipo, task_require_completed: r.task_require_completed }))

    // Get stage phase for sub-card section (Notificar Alteração only in Pós-venda)
    const { data: stageInfo } = useQuery({
        queryKey: ['stage-fase', card?.pipeline_stage_id],
        enabled: !!card?.pipeline_stage_id,
        queryFn: async () => {
            const { data } = await supabase
                .from('pipeline_stages')
                .select('fase')
                .eq('id', card!.pipeline_stage_id!)
                .single()
            return data as { fase: string } | null
        },
        staleTime: 1000 * 60 * 5,
    })

    // Check if this card is a future opportunity
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isFutureOpportunity = (card as any)?.card_type === 'future_opportunity'

    // Get parent card title for future opportunity banner
    const { data: futureOriginCard } = useQuery({
        queryKey: ['future-origin-card', card?.parent_card_id],
        enabled: isFutureOpportunity && !!card?.parent_card_id,
        queryFn: async () => {
            const { data, error } = await supabase
                .from('cards')
                .select('id, titulo')
                .eq('id', card!.parent_card_id!)
                .single()
            if (error) return null
            return data
        }
    })

    // Determine if we can show sub-cards section — any phase, not sub-cards or groups
    const showSubCards =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (card as any)?.card_type !== 'sub_card' &&
        !card?.is_group_parent

    const labels = getProductLabels(card?.produto)

    if (isLoading) return <div className="p-8 text-center">Carregando...</div>
    if (!card) return <div className="p-8 text-center">{labels.notFound}</div>

    // If it is a Group Parent (Mother Trip), render the specialized layout
    if (card.is_group_parent) {
        return (
            <div className="h-dvh flex flex-col bg-gray-50 relative overflow-hidden">
                <div className="flex-none border-b border-gray-200 bg-white z-10 relative">
                    <div className="flex items-center h-14 px-4 gap-4">
                        <button
                            onClick={() => navigate('/pipeline')}
                            className="p-2 hover:bg-gray-100 rounded-full text-gray-500 hover:text-gray-900 transition-colors"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </button>
                        <div className="h-6 w-px bg-gray-200" />
                        <span className="font-medium text-gray-900">Detalhes do Grupo</span>
                    </div>
                </div>
                <div className="flex-1 overflow-hidden relative z-0">
                    <GroupDetailLayout card={card} onUpdate={() => { }} />
                </div>
            </div>
        )
    }

    return (
        <div className="h-full bg-gray-50 flex flex-col overflow-hidden">
            {/* Sticky Header */}
            <div className="sticky top-0 z-10 bg-white shadow-sm">
                <CardHeader card={card} onScrollToAlerts={scrollToAlerts} />
            </div>

            {/* Tags Row */}
            <div className="px-4 py-1">
                <TagSelector cardId={card.id!} produto={card.produto} />
            </div>

            {/* 2-Column Layout: Work Area + Context/Accountability */}
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-3 p-3 pt-2">
                {/* CENTER COLUMN - Work Area (What to do) */}
                <div className="min-h-0 overflow-y-auto space-y-1.5 pr-2 scroll-smooth" style={{ scrollbarGutter: 'stable', overscrollBehaviorY: 'contain' }}>
                    {/* Future Opportunity Origin Banner */}
                    {isFutureOpportunity && card.parent_card_id && (
                        <div className="rounded-lg border-2 border-blue-300 bg-blue-50 p-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full flex items-center justify-center bg-blue-100">
                                        <CalendarClock className="w-4 h-4 text-blue-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-blue-800">
                                            Oportunidade Futura
                                        </p>
                                        <p className="text-xs text-blue-600">
                                            Originado de: <span className="font-medium">{futureOriginCard?.titulo || 'Card anterior'}</span>
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => navigate(`/cards/${card.parent_card_id}`)}
                                    className="text-xs px-3 py-1.5 rounded-md font-medium text-blue-700 bg-white border border-blue-200 hover:bg-blue-100 transition-colors"
                                >
                                    Ver card original
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Sub-Card Parent Banner (if this is a sub-card) */}
                    {isSubCard && parentCard && (
                        <SubCardParentBanner
                            parentId={parentCard.id}
                            parentTitle={parentCard.titulo}
                            onNavigate={() => navigate(`/cards/${parentCard.id}`)}
                        />
                    )}

                    {/* Group Child Banner (if this is a group child) */}
                    {card.parent_card_id && !isSubCard && (
                        <ParentLinkBanner
                            parentId={card.parent_card_id}
                            cardId={card.id!}
                            onUnlinked={() => {
                                queryClient.invalidateQueries({ queryKey: ['card-detail', id] })
                                queryClient.invalidateQueries({ queryKey: ['groups-gallery'] })
                            }}
                        />
                    )}

                    {/* Link to Group (if card is not linked and not a group itself) */}
                    {!card.parent_card_id && !card.is_group_parent && !isSubCard && (
                        <button
                            onClick={() => setShowLinkToGroup(true)}
                            className="w-full flex items-center gap-2 p-2 border-2 border-dashed border-slate-200 rounded-lg text-slate-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all group"
                        >
                            <div className="p-1.5 bg-slate-100 rounded-full group-hover:bg-indigo-100 transition-colors">
                                <Users className="w-4 h-4" />
                            </div>
                            <span className="text-sm font-medium">Vincular a um Grupo</span>
                        </button>
                    )}

                    {/* Tasks & Meetings (Unified) — hardcoded */}
                    <CardTasks cardId={card.id!} requiredTasks={requiredTasks} />

                    {/* Dynamic Sections (left_column) — includes Informações Importantes via widget */}
                    <DynamicSectionsList
                        card={card}
                        position="left_column"
                        excludeKeys={HARDCODED_EXCLUDE_KEYS}
                                            />

                    {/* Conversation History — hardcoded, always last */}
                    <ConversationHistory cardId={card.id!} contactId={card.pessoa_principal_id} />
                </div>

                {/* SIDEBAR - Context & Accountability */}
                <div ref={sidebarRef} className="min-h-0 overflow-y-auto space-y-1.5 scroll-smooth" style={{ scrollbarGutter: 'stable', overscrollBehaviorY: 'contain' }}>
                    {/* Sub-Cards List (for cards in Pós-venda) */}
                    {showSubCards && (
                        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-2.5">
                            <SubCardsList
                                parentCardId={card.id!}
                                parentTitle={card.titulo || 'Card'}
                                parentValor={card.valor_final || card.valor_estimado}
                                canCreate={canCreateSubCard({
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    card_type: (card as any).card_type,
                                    is_group_parent: card.is_group_parent
                                })}
                                fase={stageInfo?.fase}
                                posOwnerId={card.pos_owner_id}
                            />
                        </div>
                    )}

                    {/* Pessoas — hardcoded */}
                    <PessoasWidget card={card} />

                    {/* Equipe do Card — assistentes e apoio */}
                    <CardTeamSection card={card} />

                    {/* Dynamic Sections (right_column) — includes Monde, Financeiro, Trip Info, Propostas, Marketing */}
                    <DynamicSectionsList
                        card={card}
                        position="right_column"
                        excludeKeys={HARDCODED_EXCLUDE_KEYS}
                                            />

                    {/* Activity Feed (History) */}
                    <ActivityFeed cardId={card.id!} />
                </div>
            </div>

            {/* Link to Group Modal */}
            <LinkToGroupModal
                isOpen={showLinkToGroup}
                onClose={() => setShowLinkToGroup(false)}
                cardId={card.id!}
                cardTitle={card.titulo || 'Viagem'}
            />

        </div>
    )
}
