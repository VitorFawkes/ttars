import { useState, useRef, useEffect, useMemo } from 'react'
import { cn } from '../../lib/utils'
import {
    DndContext,
    DragOverlay,
    useSensor,
    useSensors,
    MouseSensor,
    TouchSensor,
    PointerSensor,
    type DragEndEvent,
    type DragStartEvent
} from '@dnd-kit/core'
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import KanbanColumn from './KanbanColumn'
import KanbanCard from './KanbanCard'
import KanbanPhaseGroup from './KanbanPhaseGroup'
import { Users } from 'lucide-react'
import StageChangeModal from '../card/StageChangeModal'
import QualityGateModal from '../card/QualityGateModal'
import LossReasonModal, { type FutureOpportunityData } from '../card/LossReasonModal'
import { useQualityGate } from '../../hooks/useQualityGate'
import type { Database } from '../../database.types'
import { usePipelineFilters, type ViewMode, type SubView, type FilterState } from '../../hooks/usePipelineFilters'
import { AlertTriangle } from 'lucide-react'
import { Button } from '../ui/Button'
import { usePipelinePhases } from '../../hooks/usePipelinePhases'
import { PRODUCT_PIPELINE_MAP } from '../../lib/constants'
import { useHorizontalScroll } from '../../hooks/useHorizontalScroll'
import { useReceitaPermission } from '../../hooks/useReceitaPermission'
import { ScrollArrows } from '../ui/ScrollArrows'
import { usePipelineCards } from '../../hooks/usePipelineCards'
import TerminalStageDrawer from './TerminalStageDrawer'
import { useAuth } from '../../contexts/AuthContext'
import { prepareSearchTerms } from '../../lib/utils'

type Product = Database['public']['Enums']['app_product']
type Card = Database['public']['Views']['view_cards_acoes']['Row']
type Stage = Database['public']['Tables']['pipeline_stages']['Row']

interface KanbanBoardProps {
    productFilter: Product
    viewMode: ViewMode
    subView: SubView
    filters: FilterState
    className?: string // Allow parent to control layout/padding
}

export default function KanbanBoard({ productFilter, viewMode, subView, filters: propFilters, className }: KanbanBoardProps) {
    const filters = propFilters || {}
    const queryClient = useQueryClient()
    const [activeCard, setActiveCard] = useState<Card | null>(null)
    const { collapsedPhases, setCollapsedPhases, groupFilters } = usePipelineFilters()
    const { validateMove, validateMoveSync, hasAsyncRules } = useQualityGate()
    const { session } = useAuth()
    const [terminalDrawer, setTerminalDrawer] = useState<{ stage: Stage, totalCards: number, totalValue: number } | null>(null)

    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const { data: phasesData } = usePipelinePhases(PRODUCT_PIPELINE_MAP[productFilter])
    const receitaPerm = useReceitaPermission()

    // Elite horizontal scroll with Shift+Wheel, Drag-to-Pan, and arrow indicators
    // Must be called before any conditional returns to respect React hooks rules
    const {
        isDragging,
        showLeftArrow,
        showRightArrow,
        scrollLeft: scrollLeftFn,
        scrollRight: scrollRightFn,
    } = useHorizontalScroll(scrollContainerRef)

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(MouseSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: 200,
                tolerance: 6,
            },
        })
    )



    // Actually, just [] is fine as ref persists, but we need to make sure container exists.
    // The previous logic had a check `if (!container) return`. If container mounts LATER (after loading), this effect won't run again with [].
    // We should probably rely on a callback ref or just ensure it runs when loading finishes.
    // However, for now, let's just move it up. The early return `if (!stages)` prevents the component from rendering the DIV with the ref. 
    // Wait. If we return early, the DIV with `ref={scrollContainerRef}` is NOT rendered.
    // So `scrollContainerRef.current` will be null.
    // If we run this effect at the top, `scrollContainerRef.current` will be null on first run if loading.
    // And since it has [] deps, it WON'T run again when loading finishes and the div renders.
    // This is TRICKY. 
    // We need to trigger this effect when the ref becomes available OR when loading finishes.
    // Let's add `cards` or `stages` to dependency array so it retries attaching listeners when data loads.

    // Revised replacement content with dependencies:

    const { data: stages } = useQuery({
        queryKey: ['stages', productFilter],
        queryFn: async () => {
            let query = supabase.from('pipeline_stages')
                .select('*, pipeline_phases!pipeline_stages_phase_id_fkey(order_index)')
                .eq('ativo', true)
                .order('ordem')

            // Filtrar stages pelo pipeline do produto
            const { data: pipeline } = await supabase.from('pipelines')
                .select('id')
                .eq('produto', productFilter)
                .single()

            if (pipeline) {
                query = query.eq('pipeline_id', pipeline.id)
            }

            const { data, error } = await query
            if (error) throw error

            // Sort by phase order_index first, then by stage ordem within phase
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sorted = (data || []).sort((a: any, b: any) => {
                const phaseA = a.pipeline_phases?.order_index ?? 999
                const phaseB = b.pipeline_phases?.order_index ?? 999
                if (phaseA !== phaseB) return phaseA - phaseB
                return a.ordem - b.ordem
            })

            return sorted as Stage[]
        }
    })

    // Computar IDs de stages terminais (Viagem Concluída, Fechado - Perdido) para excluir do Kanban
    const terminalStageIds = useMemo(() =>
        (stages || []).filter(s => s.is_won || s.is_lost).map(s => s.id),
        [stages]
    )

    // Fetch Cards de stages ativos — exclui stages terminais
    const { data: cards, isError, refetch, myTeamMembers } = usePipelineCards({
        productFilter,
        viewMode,
        subView,
        filters,
        groupFilters,
        excludeTerminalStages: true,
        terminalStageIds
    })

    // Guards de auth (mesma logica de usePipelineCards para evitar query sem filtro de dono)
    const needsAuth = (viewMode === 'AGENT' && subView === 'MY_QUEUE') ||
        (viewMode === 'MANAGER' && subView === 'TEAM_VIEW')
    const isAuthReady = !!session?.user?.id
    const isTeamReady = subView !== 'TEAM_VIEW' || (myTeamMembers && myTeamMembers.length > 0)

    // Fetch cards de stages terminais — per-stage com count: 'exact' (LIMIT 50 cada)
    type TerminalStageResult = { stageId: string, cards: Card[], totalCount: number }
    const terminalStageQueries = useQueries({
        queries: terminalStageIds.map(stageId => ({
            queryKey: ['terminal-cards', stageId, productFilter, viewMode, subView, filters, groupFilters, myTeamMembers],
            enabled: !needsAuth || (isAuthReady && isTeamReady),
            staleTime: 1000 * 60 * 2,
            queryFn: async (): Promise<TerminalStageResult> => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                let query = (supabase.from('view_cards_acoes') as any)
                    .select('*', { count: 'exact' })
                    .eq('pipeline_stage_id', stageId)

                query = query.eq('produto', productFilter)

                // Smart View Filters (mesmos do usePipelineCards)
                if (viewMode === 'AGENT' && subView === 'MY_QUEUE' && session?.user?.id) {
                    query = query.eq('dono_atual_id', session.user.id)
                } else if (viewMode === 'MANAGER') {
                    if (subView === 'TEAM_VIEW' && myTeamMembers && myTeamMembers.length > 0) {
                        query = query.in('dono_atual_id', myTeamMembers)
                    }
                    if (subView === 'FORECAST') {
                        const startOfMonth = new Date(); startOfMonth.setDate(1);
                        const endOfMonth = new Date(startOfMonth); endOfMonth.setMonth(endOfMonth.getMonth() + 1);
                        query = query.gte('data_fechamento', startOfMonth.toISOString()).lt('data_fechamento', endOfMonth.toISOString())
                    }
                }

                // Search (paridade completa com usePipelineCards)
                if (filters.search) {
                    const { original, normalized, digitsOnly } = prepareSearchTerms(filters.search)
                    if (original) {
                        const textFields = [
                            `titulo.ilike.%${original}%`,
                            `pessoa_nome.ilike.%${original}%`,
                            `origem.ilike.%${original}%`,
                            `dono_atual_nome.ilike.%${original}%`,
                            `sdr_owner_nome.ilike.%${original}%`,
                            `vendas_nome.ilike.%${original}%`,
                            `pessoa_email.ilike.%${original}%`,
                            `external_id.ilike.%${original}%`
                        ]
                        if (normalized) {
                            textFields.push(`pessoa_telefone_normalizado.ilike.%${normalized}%`)
                            textFields.push(`pessoa_telefone.ilike.%${original}%`)
                        } else if (digitsOnly) {
                            textFields.push(`pessoa_telefone_normalizado.ilike.%${digitsOnly}%`)
                            textFields.push(`pessoa_telefone.ilike.%${original}%`)
                        } else {
                            textFields.push(`pessoa_telefone.ilike.%${original}%`)
                        }
                        query = query.or(textFields.join(','))
                    }
                }

                // Owner Filters (paridade completa com usePipelineCards)
                if ((filters.ownerIds?.length ?? 0) > 0) query = query.in('dono_atual_id', filters.ownerIds)
                if ((filters.sdrIds?.length ?? 0) > 0) query = query.in('sdr_owner_id', filters.sdrIds)
                if ((filters.plannerIds?.length ?? 0) > 0) query = query.in('vendas_owner_id', filters.plannerIds)
                if ((filters.posIds?.length ?? 0) > 0) query = query.in('pos_owner_id', filters.posIds)

                // Date Filters
                if (filters.startDate) query = query.gte('data_viagem_inicio', filters.startDate)
                if (filters.endDate) query = query.lte('data_viagem_inicio', filters.endDate)
                if (filters.creationStartDate) query = query.gte('created_at', `${filters.creationStartDate}T00:00:00`)
                if (filters.creationEndDate) query = query.lte('created_at', `${filters.creationEndDate}T23:59:59`)

                // Status & Origem & Tags
                if ((filters.statusComercial?.length ?? 0) > 0) query = query.in('status_comercial', filters.statusComercial)
                if ((filters.origem?.length ?? 0) > 0) query = query.in('origem', filters.origem)
                if (filters.noTag) query = query.or('tag_ids.is.null,tag_ids.eq.{}')
                else if ((filters.tagIds?.length ?? 0) > 0) query = query.overlaps('tag_ids', filters.tagIds)

                query = query.is('archived_at', null).eq('is_group_parent', false)

                const { showLinked, showSolo } = groupFilters
                if (showLinked && !showSolo) query = query.not('parent_card_id', 'is', null)
                else if (showSolo && !showLinked) query = query.is('parent_card_id', null)

                query = query.order('created_at', { ascending: false }).limit(50)

                const { data, count, error } = await query
                if (error) throw error
                return { stageId, cards: data as Card[], totalCount: count ?? 0 }
            }
        }))
    })

    // Derivar terminal cards e counts per-stage
    const terminalCards = useMemo(() =>
        terminalStageQueries.flatMap(q => q.data?.cards || []),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [terminalStageQueries.map(q => q.dataUpdatedAt).join()]
    )
    const terminalCountByStage = useMemo(() => {
        const map: Record<string, number> = {}
        for (const q of terminalStageQueries) {
            if (q.data) map[q.data.stageId] = q.data.totalCount
        }
        return map
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [terminalStageQueries.map(q => q.dataUpdatedAt).join()])

    // Merge: cards ativos + cards terminais (limitados a 50 por stage)
    const allCards = useMemo(() => {
        const active = cards || []
        return [...active, ...terminalCards]
    }, [cards, terminalCards])

    // Helper: apply optimistic cache update and return rollback function
    const applyOptimisticMove = (cardId: string, stageId: string): (() => void) => {
        const newStage = stages?.find(s => s.id === stageId)
        const isTargetTerminal = terminalStageIds.includes(stageId)

        queryClient.cancelQueries({ queryKey: ['cards'] })
        queryClient.cancelQueries({ queryKey: ['terminal-cards'] })

        // Snapshot all card queries for rollback
        const cardSnapshots: [readonly unknown[], Card[] | undefined][] = []
        for (const [key, data] of queryClient.getQueriesData<Card[]>({ queryKey: ['cards'] })) {
            cardSnapshots.push([key, data ? [...data] : undefined])
        }
        const termSnapshots: [readonly unknown[], TerminalStageResult | undefined][] = []
        for (const [key, data] of queryClient.getQueriesData<TerminalStageResult>({ queryKey: ['terminal-cards'] })) {
            termSnapshots.push([key, data ? { ...data, cards: [...data.cards] } : undefined])
        }

        // Move card in all matching card queries
        queryClient.setQueriesData<Card[]>({ queryKey: ['cards'] }, (old) => {
            if (!old) return old
            if (isTargetTerminal) return old.filter(c => c.id !== cardId)
            return old.map(c => c.id !== cardId ? c : {
                ...c,
                pipeline_stage_id: stageId,
                fase: newStage?.fase || c.fase,
                etapa_nome: newStage?.nome || c.etapa_nome
            })
        })

        // Handle move TO terminal
        if (isTargetTerminal) {
            const movedCard = allCards.find(c => c.id === cardId)
            if (movedCard) {
                queryClient.setQueriesData<TerminalStageResult>(
                    { queryKey: ['terminal-cards', stageId] },
                    (old) => {
                        if (!old) return old
                        const updated = { ...movedCard, pipeline_stage_id: stageId, etapa_nome: newStage?.nome || movedCard.etapa_nome }
                        return { ...old, cards: [updated, ...old.cards].slice(0, 50), totalCount: old.totalCount + 1 }
                    }
                )
            }
        }

        // Handle move FROM terminal to active
        if (!isTargetTerminal) {
            const currentCard = allCards.find(c => c.id === cardId)
            const isFromTerminal = currentCard && terminalStageIds.includes(currentCard.pipeline_stage_id as string)
            if (isFromTerminal && currentCard) {
                queryClient.setQueriesData<TerminalStageResult>(
                    { queryKey: ['terminal-cards'] },
                    (old) => {
                        if (!old) return old
                        if (!old.cards.some(c => c.id === cardId)) return old
                        return { ...old, cards: old.cards.filter(c => c.id !== cardId), totalCount: Math.max(0, old.totalCount - 1) }
                    }
                )
                queryClient.setQueriesData<Card[]>({ queryKey: ['cards'] }, (old) => {
                    const updated = { ...currentCard, pipeline_stage_id: stageId, fase: newStage?.fase || currentCard.fase, etapa_nome: newStage?.nome || currentCard.etapa_nome }
                    if (!old) return [updated]
                    if (old.some(c => c.id === cardId)) return old
                    return [...old, updated]
                })
            }
        }

        return () => {
            for (const [key, data] of cardSnapshots) {
                queryClient.setQueryData(key, data)
            }
            for (const [key, data] of termSnapshots) {
                queryClient.setQueryData(key, data)
            }
        }
    }

    const moveCardMutation = useMutation({
        mutationFn: async ({ cardId, stageId, motivoId, comentario }: { cardId: string, stageId: string, motivoId?: string, comentario?: string }) => {
            const { error } = await supabase.rpc('mover_card', {
                p_card_id: cardId,
                p_nova_etapa_id: stageId,
                p_motivo_perda_id: motivoId,
                p_motivo_perda_comentario: comentario
            })
            if (error) throw error
        },
        onMutate: ({ cardId, stageId }) => {
            const rollback = applyOptimisticMove(cardId, stageId)
            return { rollback }
        },
        onError: (_err, _variables, context) => {
            context?.rollback?.()
        },
        onSuccess: () => {
            // Only refetch after successful mutation
            queryClient.invalidateQueries({ queryKey: ['cards'] })
            queryClient.invalidateQueries({ queryKey: ['terminal-cards'] })
            queryClient.invalidateQueries({ queryKey: ['dashboard-funnel'] })
            queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
        }
    })

    const [stageChangeModalOpen, setStageChangeModalOpen] = useState(false)
    const [qualityGateModalOpen, setQualityGateModalOpen] = useState(false)
    const [lossReasonModalOpen, setLossReasonModalOpen] = useState(false)
    const [pendingMove, setPendingMove] = useState<{
        cardId: string,
        stageId: string,
        currentOwnerId?: string,
        sdrName?: string,
        targetStageName: string,
        missingFields?: { key: string, label: string }[],
        missingProposals?: { label: string, min_status: string }[],
        missingTasks?: { label: string, task_tipo: string, task_require_completed: boolean }[],
        missingDocuments?: { label: string, total: number, completed: number }[],
        targetPhaseId?: string,
        targetPhaseName?: string
    } | null>(null)

    // Edge Scrolling Logic
    useEffect(() => {
        const container = scrollContainerRef.current
        if (!container) return

        let animationFrameId: number
        let scrollSpeed = 0

        const handleMouseMove = (e: MouseEvent) => {
            const { left, right } = container.getBoundingClientRect()
            const x = e.clientX

            const threshold = 150
            const maxSpeed = 20

            if (x < left + threshold) {
                const intensity = Math.max(0, 1 - (x - left) / threshold)
                scrollSpeed = -maxSpeed * intensity
            } else if (x > right - threshold) {
                const intensity = Math.max(0, 1 - (right - x) / threshold)
                scrollSpeed = maxSpeed * intensity
            } else {
                scrollSpeed = 0
            }
        }

        const scroll = () => {
            if (scrollSpeed !== 0 && container) {
                container.scrollLeft += scrollSpeed
            }
            animationFrameId = requestAnimationFrame(scroll)
        }

        const handleMouseLeave = () => {
            scrollSpeed = 0
        }

        container.addEventListener('mousemove', handleMouseMove)
        container.addEventListener('mouseleave', handleMouseLeave)

        scroll()

        return () => {
            container.removeEventListener('mousemove', handleMouseMove)
            container.removeEventListener('mouseleave', handleMouseLeave)
            cancelAnimationFrame(animationFrameId)
        }
    }, [cards, stages]) // Added deps so it runs after loading finishes and valid ref exists

    const handleDragStart = (event: DragStartEvent) => {
        if (event.active.data.current) {
            setActiveCard(event.active.data.current as Card)
        }
    }

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event

        // Clear drag overlay immediately — no delay
        setActiveCard(null)

        if (!over || active.id === over.id) return

        const cardId = active.id as string
        const stageId = over.id as string
        const currentStageId = active.data.current?.pipeline_stage_id
        const targetStage = stages?.find((s) => s.id === stageId)
        const card = active.data.current as Card

        if (stageId === currentStageId) return

        // --- SYNC GATE 1: Loss Stage ---
        const isLostStage = targetStage?.is_lost === true ||
            targetStage?.nome?.toLowerCase().includes('perdido') ||
            targetStage?.nome?.toLowerCase().includes('lost')

        if (isLostStage) {
            setPendingMove({ cardId, stageId, targetStageName: targetStage?.nome || 'Perdido' })
            setLossReasonModalOpen(true)
            return
        }

        // --- SYNC GATE 2: Field & rule validation (no network calls) ---
        const syncResult = validateMoveSync(card as unknown as Record<string, unknown>, stageId)

        if (syncResult.missingRules?.some(r => r.key === 'lost_reason_required')) {
            setPendingMove({ cardId, stageId, targetStageName: targetStage?.nome || 'Perdido' })
            setLossReasonModalOpen(true)
            return
        }

        if (!syncResult.valid) {
            setPendingMove({
                cardId, stageId,
                targetStageName: targetStage?.nome || 'Nova Etapa',
                missingFields: syncResult.missingFields,
            })
            setQualityGateModalOpen(true)
            return
        }

        // --- SYNC GATE 3: Governance — cross-phase handoff ---
        // Detecta mudança de fase (SDR→Planner, Planner→Pós-venda, etc.)
        // e força troca de responsável via StageChangeModal
        const sourceStage = stages?.find((s) => s.id === currentStageId)
        const sourcePhaseId = sourceStage?.phase_id
        const destPhaseId = targetStage?.phase_id
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- target_phase_id pendente de regeneracao de types
        const explicitTargetPhaseId = (targetStage as any)?.target_phase_id as string | null
        const isCrossPhaseMove = sourcePhaseId && destPhaseId && sourcePhaseId !== destPhaseId
        const handoffPhaseId = explicitTargetPhaseId || (isCrossPhaseMove ? destPhaseId : null)

        if (handoffPhaseId) {
            const targetPhase = phasesData?.find(p => p.id === handoffPhaseId)
            setPendingMove({
                cardId, stageId,
                currentOwnerId: active.data.current?.dono_atual_id,
                sdrName: active.data.current?.sdr_owner_id ? 'SDR Atual' : undefined,
                targetStageName: targetStage?.nome || 'Nova Etapa',
                targetPhaseId: handoffPhaseId,
                targetPhaseName: targetPhase?.name || 'Nova Fase'
            })
            setStageChangeModalOpen(true)
            return
        }

        // UUID validation
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        if (!uuidRegex.test(cardId) || !uuidRegex.test(stageId)) {
            console.error('Invalid UUIDs for move:', { cardId, stageId })
            return
        }

        // ===== ALL SYNC GATES PASSED — optimistic update NOW =====
        const rollback = applyOptimisticMove(cardId, stageId)

        // --- ASYNC GATE: Proposal/task validation (only if rules exist) ---
        if (hasAsyncRules(stageId)) {
            try {
                const asyncResult = await validateMove(card as unknown as Record<string, unknown>, stageId)
                if (!asyncResult.valid) {
                    rollback()
                    setPendingMove({
                        cardId, stageId,
                        targetStageName: targetStage?.nome || 'Nova Etapa',
                        missingFields: asyncResult.missingFields,
                        missingProposals: asyncResult.missingProposals,
                        missingTasks: asyncResult.missingTasks,
                        missingDocuments: asyncResult.missingDocuments,
                    })
                    setQualityGateModalOpen(true)
                    return
                }
            } catch (err) {
                console.error('[QualityGate] Async validation failed — move allowed (fail-open):', err)
            }
        }

        // --- EXECUTE: Persist to database ---
        try {
            const { error } = await supabase.rpc('mover_card', {
                p_card_id: cardId,
                p_nova_etapa_id: stageId,
            })
            if (error) throw error
            queryClient.invalidateQueries({ queryKey: ['cards'] })
            queryClient.invalidateQueries({ queryKey: ['terminal-cards'] })
            queryClient.invalidateQueries({ queryKey: ['dashboard-funnel'] })
            queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
        } catch (err) {
            console.error('Error moving card:', err)
            rollback()
        }
    }

    const handleDragCancel = () => {
        setActiveCard(null)
    }

    const handleConfirmStageChange = (newOwnerId: string) => {
        if (pendingMove) {
            const updateOwner = async () => {
                const { error } = await supabase.from('cards')
                    .update({ dono_atual_id: newOwnerId })
                    .eq('id', pendingMove.cardId)

                if (error) {
                    console.error('Error updating owner:', error)
                    alert('Erro ao atualizar responsável.')
                    return
                }

                moveCardMutation.mutate({ cardId: pendingMove.cardId, stageId: pendingMove.stageId })
                setStageChangeModalOpen(false)
                setPendingMove(null)
                setActiveCard(null)
            }

            updateOwner()
        }
    }

    const handleConfirmQualityGate = () => {
        if (pendingMove) {
            // After filling fields, we still need to check if we need to change owner
            const targetStage = stages?.find((s) => s.id === pendingMove.stageId)

            setQualityGateModalOpen(false)

            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- target_phase_id pendente de regeneracao de types
            const phaseId = (targetStage as any)?.target_phase_id as string | null
            if (phaseId) {
                // Open Owner Change Modal
                const targetPhase = phasesData?.find(p => p.id === phaseId)
                setPendingMove(prev => prev ? { ...prev, targetPhaseId: phaseId, targetPhaseName: targetPhase?.name || 'Nova Fase' } : null)
                setStageChangeModalOpen(true)
            } else {
                // Just move
                moveCardMutation.mutate({ cardId: pendingMove.cardId, stageId: pendingMove.stageId })
                setPendingMove(null)
            }
        }
    }

    const handleConfirmLossReason = async (motivoId: string, comentario: string, futureOpportunity?: FutureOpportunityData) => {
        if (pendingMove) {
            moveCardMutation.mutate({
                cardId: pendingMove.cardId,
                stageId: pendingMove.stageId,
                motivoId,
                comentario
            })

            // Create future opportunity if scheduled
            if (futureOpportunity) {
                const card = allCards?.find(c => c.id === pendingMove.cardId)
                if (card) {
                    try {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        await (supabase as any).from('future_opportunities').insert({
                            source_card_id: pendingMove.cardId,
                            source_type: 'lost_future',
                            titulo: futureOpportunity.titulo,
                            scheduled_date: futureOpportunity.scheduledDate,
                            descricao: comentario || null,
                            produto: card.produto,
                            pipeline_id: card.pipeline_id,
                            responsavel_id: card.dono_atual_id,
                            pessoa_principal_id: card.pessoa_principal_id,
                            created_by: session?.user?.id || null,
                        } as Record<string, unknown>)
                        await queryClient.refetchQueries({ queryKey: ['future-opportunities', pendingMove.cardId] })
                    } catch (err) {
                        console.error('Erro ao agendar oportunidade futura:', err)
                    }
                }
            }

            setLossReasonModalOpen(false)
            setPendingMove(null)
        }
    }

    if (isError) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-8 text-center">
                <div className="rounded-full bg-red-100 p-4">
                    <AlertTriangle className="h-8 w-8 text-red-600" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-gray-900">Erro ao carregar o pipeline</h3>
                    <p className="text-sm text-gray-500">Não foi possível buscar os cards. Tente novamente.</p>
                </div>
                <Button onClick={() => refetch()} variant="outline">
                    Tentar Novamente
                </Button>
            </div>
        )
    }

    if (!stages || !cards) return <div className="h-full w-full animate-pulse bg-gray-100 rounded-lg"></div>

    const togglePhase = (phaseName: string) => {
        const isCollapsing = !collapsedPhases.includes(phaseName)
        const newPhases = isCollapsing
            ? [...collapsedPhases, phaseName]
            : collapsedPhases.filter(p => p !== phaseName)

        setCollapsedPhases(newPhases)

        if (isCollapsing && scrollContainerRef.current) {
            // Wait for state update and layout shift
            setTimeout(() => {
                scrollContainerRef.current?.scrollTo({ left: 0, behavior: 'smooth' })
            }, 100)
        }
    }

    // Group stages by phase using dynamic phases
    // If phasesData is not loaded yet, we might want to show a loader or fallback
    // We map over the phasesData to ensure order and color
    const phases = phasesData || []
    const displayPhases = filters.phaseFilters?.length
        ? phases.filter(p => filters.phaseFilters!.includes(p.id))
        : [...phases]

    // Calculate Totals for Sticky Footer (usar allCards para incluir terminal)
    const totalPipelineValue = allCards.reduce((acc, c) => acc + (c.valor_display || c.valor_estimado || 0), 0)
    const totalPipelineReceita = allCards.reduce((acc, c) => acc + (c.receita || 0), 0)
    const totalCards = allCards.length

    return (
        <div className={cn("flex flex-col h-full", className)}>
            {/* Scroll Area with Arrows */}
            <div className="flex-1 relative min-h-0">
                {/* Scroll Arrows - Elite UX */}
                <ScrollArrows
                    showLeft={showLeftArrow}
                    showRight={showRightArrow}
                    onScrollLeft={scrollLeftFn}
                    onScrollRight={scrollRightFn}
                />

                {/* Kanban Columns */}
                <div
                    ref={scrollContainerRef}
                    className={cn(
                        "h-full overflow-x-auto overflow-y-hidden",
                        "[&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']",
                        isDragging && "cursor-grabbing"
                    )}
                >
                    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
                        <div className="flex gap-4 w-max min-w-full px-4 items-stretch pt-2 h-full">
                            <div className="flex gap-6 items-stretch h-full">
                                {allCards.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center w-[calc(100vw-20rem)] py-20 bg-white/5 rounded-xl border border-dashed border-gray-300">
                                        <div className="p-4 bg-gray-100 rounded-full mb-4">
                                            <Users className="h-8 w-8 text-gray-400" />
                                        </div>
                                        <h3 className="text-lg font-semibold text-gray-900">Nenhum card encontrado</h3>
                                        <p className="text-gray-500 max-w-xs text-center mt-2">
                                            Tente ajustar os filtros de Grupos, Vinculadas ou Avulsas para ver mais resultados.
                                        </p>
                                    </div>
                                ) : displayPhases.map((phase) => {
                                    // Filter ALL stages (incluindo terminais) por phase
                                    const phaseStages = (stages || []).filter((s) =>
                                        s.phase_id === phase.id ||
                                        (!s.phase_id && s.fase === phase.name)
                                    )

                                    if (phaseStages.length === 0) return null

                                    const phaseCards = allCards.filter(c => phaseStages.some((s) => s.id === c.pipeline_stage_id))
                                    const totalCount = phaseCards.length
                                    const totalValue = phaseCards.reduce((acc, c) => acc + (c.valor_estimado || 0), 0)

                                    return (
                                        <KanbanPhaseGroup
                                            key={phase.id}
                                            phaseName={phase.name}
                                            isCollapsed={collapsedPhases.includes(phase.name)}
                                            onToggle={() => togglePhase(phase.name)}
                                            totalCount={totalCount}
                                            totalValue={totalValue}
                                            phaseColor={phase.color}
                                            stages={phaseStages}
                                            cards={phaseCards}
                                        >
                                            {phaseStages.map((stage) => {
                                                const isTerminal = terminalStageIds.includes(stage.id)
                                                const stageCards = allCards.filter(c => c.pipeline_stage_id === stage.id)
                                                const stageTotalCount = isTerminal ? terminalCountByStage[stage.id] : undefined

                                                return (
                                                    <KanbanColumn
                                                        key={stage.id}
                                                        stage={stage}
                                                        cards={stageCards}
                                                        phaseColor={phase.color}
                                                        totalCount={stageTotalCount}
                                                        onShowMore={isTerminal && stageTotalCount != null && stageTotalCount > stageCards.length ? () => {
                                                            const stageValue = stageCards.reduce((acc, c) => acc + (c.valor_display || c.valor_estimado || 0), 0)
                                                            setTerminalDrawer({ stage, totalCards: stageTotalCount, totalValue: stageValue })
                                                        } : undefined}
                                                    />
                                                )
                                            })}
                                        </KanbanPhaseGroup>
                                    )
                                })}
                            </div>
                            <DragOverlay dropAnimation={null}>
                                {activeCard ? (
                                    <div className="rotate-3 scale-105 cursor-grabbing opacity-80">
                                        <KanbanCard card={activeCard} />
                                    </div>
                                ) : null}
                            </DragOverlay>

                            {pendingMove && (
                                <>
                                    <StageChangeModal
                                        isOpen={stageChangeModalOpen}
                                        onClose={() => {
                                            setStageChangeModalOpen(false)
                                            setPendingMove(null)
                                            setActiveCard(null)
                                        }}
                                        onConfirm={handleConfirmStageChange}
                                        currentOwnerId={pendingMove.currentOwnerId || ''}
                                        sdrName={pendingMove.sdrName}
                                        targetStageName={pendingMove.targetStageName}
                                        targetPhaseId={pendingMove.targetPhaseId}
                                        targetPhaseName={pendingMove.targetPhaseName}
                                    />

                                    <QualityGateModal
                                        isOpen={qualityGateModalOpen}
                                        onClose={() => {
                                            setQualityGateModalOpen(false)
                                            setPendingMove(null)
                                            setActiveCard(null)
                                        }}
                                        onConfirm={handleConfirmQualityGate}
                                        cardId={pendingMove.cardId}
                                        targetStageName={pendingMove.targetStageName}
                                        missingFields={pendingMove.missingFields || []}
                                        missingProposals={pendingMove.missingProposals || []}
                                        missingTasks={pendingMove.missingTasks || []}
                                        missingDocuments={pendingMove.missingDocuments || []}
                                        initialData={allCards?.find(c => c.id === pendingMove.cardId) as Record<string, unknown> | undefined}
                                    />

                                    <LossReasonModal
                                        isOpen={lossReasonModalOpen}
                                        onClose={() => {
                                            setLossReasonModalOpen(false)
                                            setPendingMove(null)
                                            setActiveCard(null)
                                        }}
                                        onConfirm={handleConfirmLossReason}
                                        targetStageId={pendingMove.stageId}
                                        targetStageName={pendingMove.targetStageName}
                                        cardTitle={allCards?.find(c => c.id === pendingMove.cardId)?.titulo || undefined}
                                    />
                                </>
                            )}

                        </div>
                    </DndContext>
                </div>
            </div>

            {/* Terminal Stage Drawer */}
            {terminalDrawer && (
                <TerminalStageDrawer
                    isOpen={!!terminalDrawer}
                    onClose={() => setTerminalDrawer(null)}
                    stage={terminalDrawer.stage}
                    totalCards={terminalDrawer.totalCards}
                    totalValue={terminalDrawer.totalValue}
                    productFilter={productFilter}
                    viewMode={viewMode}
                    subView={subView}
                    filters={filters}
                    groupFilters={groupFilters}
                    myTeamMembers={myTeamMembers}
                />
            )}

            {/* Footer - Part of flex layout, not fixed */}
            <div className="flex-shrink-0 h-16 bg-white/95 backdrop-blur-2xl border-t border-primary/10 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] flex items-center justify-between px-6 z-50">
                <div className="flex items-center gap-8">
                    <div className="flex flex-col">
                        <span className="text-xs uppercase tracking-widest text-gray-400 font-semibold mb-1">Total Pipeline</span>
                        <div className="flex items-baseline gap-3">
                            <span className="text-2xl font-bold text-primary-dark">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalPipelineValue)}
                            </span>
                            <span className="text-sm font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                {totalCards} cards
                            </span>
                        </div>
                    </div>

                    {receitaPerm.canView && totalPipelineReceita > 0 && (
                        <>
                            <div className="h-10 w-px bg-gray-200" />
                            <div className="flex flex-col">
                                <span className="text-xs uppercase tracking-widest text-amber-500 font-semibold mb-1">Receita Total</span>
                                <span className="text-lg font-bold text-amber-700">
                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalPipelineReceita)}
                                </span>
                            </div>
                        </>
                    )}

                    {/* Vertical Divider */}
                    <div className="h-10 w-px bg-gray-200" />

                    {/* Quick Stats / Mini Forecast (Placeholder for now) */}
                    <div className="flex flex-col">
                        <span className="text-xs uppercase tracking-widest text-gray-400 font-semibold mb-1">Forecast Mês</span>
                        <span className="text-lg font-semibold text-gray-700">
                            R$ --
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    {/* Phase Summaries (Mini) */}
                    {displayPhases.map(phase => {
                        const phaseStages = (stages || []).filter((s) =>
                            s.phase_id === phase.id ||
                            (!s.phase_id && s.fase === phase.name)
                        )
                        if (phaseStages.length === 0) return null

                        const phaseCards = allCards.filter(c => phaseStages.some((s) => s.id === c.pipeline_stage_id))
                        const val = phaseCards.reduce((acc, c) => acc + (c.valor_estimado || 0), 0)
                        const count = phaseCards.length

                        return (
                            <div key={phase.id} className="flex flex-col items-end group cursor-default">
                                <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5 group-hover:text-primary transition-colors">{phase.name}</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-400 font-medium bg-gray-50 px-1.5 rounded">{count}</span>
                                    <span className="text-sm font-bold text-gray-700 group-hover:text-primary-dark transition-colors">
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact' }).format(val)}
                                    </span>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

