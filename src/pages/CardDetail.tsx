import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
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
import { ArrowLeft, Users } from 'lucide-react'

import type { Database } from '../database.types'

type Card = Database['public']['Tables']['cards']['Row']

// Section keys with dedicated hardcoded components (not rendered via DynamicSectionsList)
const HARDCODED_EXCLUDE_KEYS = ['agenda_tarefas', 'historico_conversas', 'people']

export default function CardDetail() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const [showLinkToGroup, setShowLinkToGroup] = useState(false)

    // Check if card is a sub-card and get parent info
    const { isSubCard, subCardMode, parentCard } = useSubCardParent(id)

    // Get sub-cards if this is a parent
    const { canCreateSubCard } = useSubCards(id)

    const { data: card, isLoading } = useQuery({
        queryKey: ['card-detail', id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('cards')
                .select('*')
                .eq('id', id!)
                .single()
            if (error) throw error
            return data as Card
        },
        enabled: !!id,
        staleTime: 1000 * 30, // 30 seconds to avoid immediate refetch flickers
    })

    // Get the card's current phase
    const { data: stageInfo } = useQuery({
        queryKey: ['card-stage-info', card?.pipeline_stage_id],
        queryFn: async () => {
            if (!card?.pipeline_stage_id) return null
            const { data, error } = await supabase
                .from('pipeline_stages')
                .select('fase, phase_id')
                .eq('id', card.pipeline_stage_id)
                .single()
            if (error) return null
            return data
        },
        enabled: !!card?.pipeline_stage_id,
    })

    // Compute missing task requirements for contextual indicators in CardTasks
    const { missingBlocking } = useStageRequirements((card || { id: '', pipeline_stage_id: null }) as Card)
    const requiredTasks = missingBlocking
        .filter((r): r is TaskRequirement => r.requirement_type === 'task')
        .map(r => ({ label: r.label, task_tipo: r.task_tipo, task_require_completed: r.task_require_completed }))

    // Determine if we can show sub-cards functionality
    const showSubCards = stageInfo?.fase === 'Pós-venda' &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
(card as any)?.card_type !== 'sub_card' &&
        !card?.is_group_parent

    if (isLoading) return <div className="p-8 text-center">Carregando...</div>
    if (!card) return <div className="p-8 text-center">Viagem não encontrada</div>

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
            {/* Breadcrumb */}
            <div className="flex-none bg-white border-b border-slate-200 px-6 py-2">
                <nav className="flex items-center gap-2 text-sm">
                    <button
                        onClick={() => navigate('/pipeline')}
                        className="text-slate-500 hover:text-slate-700 transition-colors"
                    >
                        Pipeline
                    </button>
                    <span className="text-slate-300">/</span>
                    <span className="text-slate-900 font-medium truncate max-w-[200px]">
                        {card.titulo || 'Viagem'}
                    </span>
                </nav>
            </div>

            {/* Sticky Header */}
            <div className="sticky top-0 z-10 bg-white shadow-md">
                <CardHeader card={card} />
            </div>

            {/* 2-Column Layout: Work Area + Context/Accountability */}
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6 p-6">
                {/* CENTER COLUMN - Work Area (What to do) */}
                <div className="min-h-0 overflow-y-auto space-y-4 pr-2 scroll-smooth" style={{ scrollbarGutter: 'stable', overscrollBehaviorY: 'contain' }}>
                    {/* Sub-Card Parent Banner (if this is a sub-card) */}
                    {isSubCard && parentCard && subCardMode && (
                        <SubCardParentBanner
                            parentId={parentCard.id}
                            parentTitle={parentCard.titulo}
                            mode={subCardMode}
                            onNavigate={() => navigate(`/cards/${parentCard.id}`)}
                        />
                    )}

                    {/* Group Child Banner (if this is a group child) */}
                    {card.parent_card_id && !isSubCard && (
                        <ParentLinkBanner parentId={card.parent_card_id} />
                    )}

                    {/* Link to Group (if card is not linked and not a group itself) */}
                    {!card.parent_card_id && !card.is_group_parent && !isSubCard && (
                        <button
                            onClick={() => setShowLinkToGroup(true)}
                            className="w-full flex items-center gap-3 p-3 border-2 border-dashed border-slate-200 rounded-lg text-slate-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all group"
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
                <div className="min-h-0 overflow-y-auto space-y-4 scroll-smooth" style={{ scrollbarGutter: 'stable', overscrollBehaviorY: 'contain' }}>
                    {/* Sub-Cards List (for cards in Pós-venda) */}
                    {showSubCards && (
                        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
                            <SubCardsList
                                parentCardId={card.id!}
                                parentTitle={card.titulo || 'Card'}
                                parentValor={card.valor_final || card.valor_estimado}
                                canCreate={canCreateSubCard({
                                    card_type: // eslint-disable-next-line @typescript-eslint/no-explicit-any
(card as any).card_type,
                                    fase: stageInfo?.fase,
                                    is_group_parent: card.is_group_parent
                                })}
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
