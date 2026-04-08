/**
 * PortalEditor — Editor do portal da viagem (tela cheia, 3 colunas).
 *
 * Rota: /portal-editor/:proposalId
 *
 * Layout:
 * - Esquerda (200px): Paleta de blocos (Dia, Voucher, Dica, etc)
 * - Centro (flex): Canvas com blocos organizados por dia
 * - Direita (300px): Preview mobile em tempo real
 *
 * Padrão: mesmo do ProposalBuilderV4 (DnD, Zustand, auto-save)
 */

import { useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
    DndContext,
    DragOverlay,
    closestCenter,
    PointerSensor,
    KeyboardSensor,
    useSensor,
    useSensors,
    type DragStartEvent,
    type DragEndEvent,
} from '@dnd-kit/core'
import { useProposal } from '@/hooks/useProposal'
import { useTripPlan } from '@/hooks/useTripPlan'
import { useTripPlanBlocks } from '@/hooks/useTripPlanBlocks'
import { useTripPlanEditor, type BlockType, BLOCK_TYPE_CONFIG } from '@/hooks/useTripPlanEditor'
import { useAutoSave } from '@/hooks/useAutoSave'
import { EditorLayout } from '@/components/trip-plan-editor/EditorLayout'
import { Loader2, ArrowLeft } from 'lucide-react'
import { useState } from 'react'

export default function PortalEditor() {
    const { proposalId, cardId } = useParams<{ proposalId?: string; cardId?: string }>()
    const navigate = useNavigate()

    // Data fetching — suporta acesso via proposalId OU cardId
    const { data: proposal, isLoading: loadingProposal } = useProposal(proposalId || '')
    const { data: tripPlan, isLoading: loadingTripPlan } = useTripPlan(proposalId, cardId)
    const { data: blocks = [], isLoading: loadingBlocks } = useTripPlanBlocks(tripPlan?.id)

    // Editor store
    const { initialize, reset, isDirty, isSaving } = useTripPlanEditor()

    // Auto-save (reutiliza o mesmo hook do ProposalBuilder)
    useAutoSave()

    // DnD state
    const [activeBlockType, setActiveBlockType] = useState<BlockType | null>(null)

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor)
    )

    // Initialize editor when data loads
    const initRef = useRef(false)
    if (!initRef.current && tripPlan?.id && proposalId && !loadingBlocks) {
        initRef.current = true
        initialize(tripPlan.id, proposalId, blocks)
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => () => { reset(); initRef.current = false }, [])

    // DnD handlers
    const handleDragStart = useCallback((event: DragStartEvent) => {
        const blockType = event.active.data.current?.blockType as BlockType
        if (blockType) setActiveBlockType(blockType)
    }, [])

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        setActiveBlockType(null)
        const { active, over } = event
        if (!over || active.id === over.id) return

        const activeId = String(active.id)

        // SE vem da palette (criar novo bloco)
        if (activeId.startsWith('palette-')) {
            const blockType = active.data.current?.blockType as BlockType
            if (!blockType) return

            const { addBlock } = useTripPlanEditor.getState()

            const overId = String(over.id)
            let parentDayId: string | null = null
            if (overId.startsWith('day-drop-')) {
                parentDayId = overId.replace('day-drop-', '')
            }

            if (blockType === 'day_header') {
                addBlock('day_header', null, { date: '', title: 'Novo Dia', city: '' })
            } else {
                addBlock(blockType, parentDayId, getDefaultData(blockType))
            }
            return
        }

        // SE é reordenação de bloco existente (sortable)
        const { blocks, reorderBlocks } = useTripPlanEditor.getState()
        const oldIndex = blocks.findIndex(b => b.id === activeId)
        const newIndex = blocks.findIndex(b => b.id === String(over.id))

        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
            // Array move
            const newOrder = [...blocks]
            const [moved] = newOrder.splice(oldIndex, 1)
            newOrder.splice(newIndex, 0, moved)
            reorderBlocks(newOrder.map(b => b.id))
        }
    }, [])

    // Loading
    const isLoading = loadingProposal || loadingTripPlan || loadingBlocks
    if (isLoading) {
        return (
            <div className="h-dvh flex items-center justify-center bg-slate-50">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mx-auto mb-4" />
                    <p className="text-slate-500">Carregando portal da viagem...</p>
                </div>
            </div>
        )
    }

    // Error: proposta não encontrada ou não aceita
    if (!proposal || !tripPlan) {
        return (
            <div className="h-dvh flex items-center justify-center bg-slate-50">
                <div className="text-center max-w-sm">
                    <p className="text-red-500 mb-4">
                        {!proposal ? 'Proposta não encontrada' : 'Portal da viagem não disponível. A proposta precisa ser aceita primeiro.'}
                    </p>
                    <button
                        onClick={() => navigate('/proposals')}
                        className="text-indigo-600 hover:underline flex items-center gap-2 mx-auto"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Voltar para propostas
                    </button>
                </div>
            </div>
        )
    }

    const title = proposal.active_version?.title || 'Portal da Viagem'

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <EditorLayout
                title={title}
                isDirty={isDirty}
                isSaving={isSaving}
                proposalId={proposalId!}
                tripPlanId={tripPlan.id}
            />

            <DragOverlay>
                {activeBlockType && (
                    <div className={`px-4 py-2 rounded-lg shadow-lg border ${BLOCK_TYPE_CONFIG[activeBlockType].color.bg} ${BLOCK_TYPE_CONFIG[activeBlockType].color.border}`}>
                        <span className={`text-sm font-medium ${BLOCK_TYPE_CONFIG[activeBlockType].color.text}`}>
                            {BLOCK_TYPE_CONFIG[activeBlockType].label}
                        </span>
                    </div>
                )}
            </DragOverlay>
        </DndContext>
    )
}

function getDefaultData(type: BlockType): Record<string, unknown> {
    switch (type) {
        case 'tip': return { title: '', content: '' }
        case 'photo': return { image_url: '', caption: '' }
        case 'video': return { url: '', caption: '' }
        case 'contact': return { name: '', role: '', phone: '', email: '', whatsapp: '' }
        case 'checklist': return { items: [{ label: '', checked: false }] }
        case 'voucher': return { file_url: '', file_name: '', voucher_type: 'generic' }
        case 'pre_trip_section': return { topics: ['passport', 'vaccines', 'currency', 'timezone', 'insurance'] }
        case 'travel_item': return { item_type: '', title: '' }
        default: return {}
    }
}
