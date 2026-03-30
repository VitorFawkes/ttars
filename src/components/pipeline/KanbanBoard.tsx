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
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import KanbanColumn from './KanbanColumn'
import KanbanCard from './KanbanCard'
import KanbanPhaseGroup from './KanbanPhaseGroup'
import { Users } from 'lucide-react'
import StageChangeModal from '../card/StageChangeModal'
import QualityGateModal from '../card/QualityGateModal'
import LossReasonModal, { type FutureOpportunityData } from '../card/LossReasonModal'
import WinOptionsModal from '../card/WinOptionsModal'
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
import { useMyAssistCardIds } from '../../hooks/useMyAssistCardIds'
import { useAuth } from '../../contexts/AuthContext'
import { useStageSort } from '../../hooks/usePhaseSort'
import { sortCards } from '../../lib/sortCards'

type Product = Database['public']['Enums']['app_product']
type Card = Database['public']['Views']['view_cards_acoes']['Row']
type Stage = Database['public']['Tables']['pipeline_stages']['Row']

interface KanbanBoardProps {
    productFilter: Product
    viewMode: ViewMode
    subView: SubView
    filters: FilterState
    showClosedCards?: boolean
    showWonDirect?: boolean
    className?: string // Allow parent to control layout/padding
}

export default function KanbanBoard({ productFilter, viewMode, subView, filters: propFilters, showClosedCards, showWonDirect, className }: KanbanBoardProps) {
    const filters = propFilters || {}
    const queryClient = useQueryClient()
    const [activeCard, setActiveCard] = useState<Card | null>(null)
    const { collapsedPhases, setCollapsedPhases, groupFilters } = usePipelineFilters()
    const { validateMove, validateMoveSync, hasAsyncRules } = useQualityGate()
    const { session } = useAuth()
    // Pre-fetch para expansão de fases — valor usado indiretamente via cache do React Query
    useMyAssistCardIds(viewMode === 'AGENT' && subView === 'MY_QUEUE')

    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const pipelineId = PRODUCT_PIPELINE_MAP[productFilter]
    const { data: phasesData } = usePipelinePhases(pipelineId)
    const receitaPerm = useReceitaPermission()
    const { getStageSortConfig, setStageSortConfig, clearStageSortConfig, hasStageSortOverride } = useStageSort(pipelineId)

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

    // Fetch Cards — filtra por status (oculta ganhos/perdidos por padrão)
    const { data: cards, isError, refetch } = usePipelineCards({
        productFilter,
        viewMode,
        subView,
        filters,
        groupFilters,
        showClosedCards,
        showWonDirect
    })

    const allCards = useMemo(() => cards || [], [cards])

    // Helper: apply optimistic cache update and return rollback function
    const applyOptimisticMove = (cardId: string, stageId: string): (() => void) => {
        const newStage = stages?.find(s => s.id === stageId)

        queryClient.cancelQueries({ queryKey: ['cards'] })

        // Snapshot all card queries for rollback
        const cardSnapshots: [readonly unknown[], Card[] | undefined][] = []
        for (const [key, data] of queryClient.getQueriesData<Card[]>({ queryKey: ['cards'] })) {
            cardSnapshots.push([key, data ? [...data] : undefined])
        }

        // Move card in all matching card queries
        queryClient.setQueriesData<Card[]>({ queryKey: ['cards'] }, (old) => {
            if (!old) return old
            return old.map(c => c.id !== cardId ? c : {
                ...c,
                pipeline_stage_id: stageId,
                fase: newStage?.fase || c.fase,
                etapa_nome: newStage?.nome || c.etapa_nome
            })
        })

        return () => {
            for (const [key, data] of cardSnapshots) {
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
            queryClient.invalidateQueries({ queryKey: ['cards'] })
            queryClient.invalidateQueries({ queryKey: ['dashboard-funnel'] })
            queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
        }
    })

    const [stageChangeModalOpen, setStageChangeModalOpen] = useState(false)
    const [qualityGateModalOpen, setQualityGateModalOpen] = useState(false)
    const [lossReasonModalOpen, setLossReasonModalOpen] = useState(false)
    const [winOptionsModalOpen, setWinOptionsModalOpen] = useState(false)
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

        // Card ganho/perdido não pode ser arrastado
        if (card.status_comercial === 'ganho' || card.status_comercial === 'perdido') return

        // --- SYNC GATE 1: Field & rule validation (no network calls) ---
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
            const isWinHandoff = pendingMove.targetStageName.startsWith('Ganho ')

            const execute = async () => {
                if (isWinHandoff) {
                    // Win handoff — chama marcar_ganho com novo dono
                    try {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC pendente de regeneração de types
                        const { error } = await (supabase as any).rpc('marcar_ganho', {
                            p_card_id: pendingMove.cardId,
                            p_novo_dono_id: newOwnerId
                        })
                        if (error) throw error
                        queryClient.invalidateQueries({ queryKey: ['cards'] })
                        queryClient.invalidateQueries({ queryKey: ['dashboard-funnel'] })
                        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
                    } catch (err) {
                        console.error('Erro ao marcar como ganho:', err)
                    }
                } else {
                    // Normal cross-phase move — update owner then move
                    const { error } = await supabase.from('cards')
                        .update({ dono_atual_id: newOwnerId })
                        .eq('id', pendingMove.cardId)

                    if (error) {
                        console.error('Error updating owner:', error)
                        alert('Erro ao atualizar responsável.')
                        return
                    }

                    moveCardMutation.mutate({ cardId: pendingMove.cardId, stageId: pendingMove.stageId })
                }

                setStageChangeModalOpen(false)
                setPendingMove(null)
                setActiveCard(null)
            }

            execute()
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
            try {
                // Marcar como perdido via RPC (card permanece na etapa atual)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC pendente de regeneração de types
                const { error } = await (supabase as any).rpc('marcar_perdido', {
                    p_card_id: pendingMove.cardId,
                    p_motivo_perda_id: motivoId || null,
                    p_motivo_perda_comentario: comentario || null
                })
                if (error) throw error

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

                queryClient.invalidateQueries({ queryKey: ['cards'] })
                queryClient.invalidateQueries({ queryKey: ['dashboard-funnel'] })
                queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
            } catch (err) {
                console.error('Erro ao marcar como perdido:', err)
            }

            setLossReasonModalOpen(false)
            setPendingMove(null)
        }
    }

    // Win handler — chamado pelo KanbanCard via onWin callback
    // Nota: onWin NÃO é passado para colunas Pós-Venda (sem ganho/perdido nessa fase)
    const handleWin = async (cardId: string) => {
        const card = allCards?.find(c => c.id === cardId)
        if (!card) return

        const currentStage = stages?.find(s => s.id === card.pipeline_stage_id)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const phaseSlug = (currentStage as any)?.pipeline_phases?.slug || currentStage?.fase

        // Para SDR ou Planner → precisa de handoff (escolher novo dono)
        const nextPhaseSlug = phaseSlug === 'sdr' ? 'planner' : 'pos_venda'
        const nextPhase = phasesData?.find(p => p.slug === nextPhaseSlug)

        // Planner → mostrar WinOptionsModal para escolher entre pós-venda ou ganho direto
        if (phaseSlug === 'planner') {
            setPendingMove({
                cardId,
                stageId: '',
                targetStageName: 'Ganho Planner',
                currentOwnerId: card.dono_atual_id || undefined,
                targetPhaseId: nextPhase?.id,
                targetPhaseName: nextPhase?.name || 'Pós-Venda'
            })
            setWinOptionsModalOpen(true)
            return
        }

        // SDR → quality gate + StageChangeModal (fluxo existente)
        const nextPhaseStages = stages
            ?.filter(s => s.phase_id === nextPhase?.id)
            .sort((a, b) => a.ordem - b.ordem)
        const targetStage = nextPhaseStages?.[0]

        if (targetStage) {
            try {
                const validation = await validateMove(card as unknown as Record<string, unknown>, targetStage.id)
                if (!validation.valid) {
                    setPendingMove({
                        cardId,
                        stageId: '',
                        targetStageName: `Ganho SDR`,
                        missingFields: validation.missingFields,
                        missingProposals: validation.missingProposals,
                        missingTasks: validation.missingTasks,
                        missingDocuments: validation.missingDocuments,
                    })
                    setQualityGateModalOpen(true)
                    return
                }
            } catch (err) {
                console.error('[QualityGate] Win validation failed — move allowed (fail-open):', err)
            }
        }

        setPendingMove({
            cardId,
            stageId: '',
            targetStageName: `Ganho SDR`,
            currentOwnerId: card.dono_atual_id || undefined,
            targetPhaseId: nextPhase?.id,
            targetPhaseName: nextPhase?.name || nextPhaseSlug
        })
        setStageChangeModalOpen(true)
    }

    // WinOptions: usuário escolheu "Sim, enviar para Pós-Venda"
    const handleWinOptionPosVenda = async () => {
        setWinOptionsModalOpen(false)
        if (!pendingMove) return

        const card = allCards?.find(c => c.id === pendingMove.cardId)
        const nextPhase = phasesData?.find(p => p.slug === 'pos_venda')
        const targetStage = stages
            ?.filter(s => s.phase_id === nextPhase?.id)
            .sort((a, b) => a.ordem - b.ordem)?.[0]

        // Quality gate contra 1ª etapa de Pós-Venda
        if (targetStage && card) {
            try {
                const validation = await validateMove(card as unknown as Record<string, unknown>, targetStage.id)
                if (!validation.valid) {
                    setPendingMove({
                        ...pendingMove,
                        stageId: targetStage.id,
                        missingFields: validation.missingFields,
                        missingProposals: validation.missingProposals,
                        missingTasks: validation.missingTasks,
                        missingDocuments: validation.missingDocuments,
                    })
                    setQualityGateModalOpen(true)
                    return
                }
            } catch (err) {
                console.error('[QualityGate] Win validation failed — move allowed (fail-open):', err)
            }
        }

        setStageChangeModalOpen(true)
    }

    // WinOptions: usuário escolheu "Não, fechar direto"
    const handleWinOptionDirect = async () => {
        setWinOptionsModalOpen(false)
        if (!pendingMove) return

        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC pendente de regeneração de types
            const { error } = await (supabase as any).rpc('marcar_ganho', {
                p_card_id: pendingMove.cardId,
                p_skip_pos_venda: true
            })
            if (error) throw error
            queryClient.invalidateQueries({ queryKey: ['cards'] })
            queryClient.invalidateQueries({ queryKey: ['dashboard-funnel'] })
            queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
        } catch (err: unknown) {
            console.error('Erro ao marcar ganho direto:', err)
            const msg = err instanceof Error ? err.message : 'Erro desconhecido'
            toast.error(`Erro ao marcar ganho direto: ${msg}`)
        }

        setPendingMove(null)
        setActiveCard(null)
    }

    // Loss handler — chamado pelo KanbanCard via onLoss callback
    const handleLoss = (cardId: string) => {
        const card = allCards?.find(c => c.id === cardId)
        if (!card) return

        setPendingMove({
            cardId,
            stageId: card.pipeline_stage_id as string,
            targetStageName: 'Perdido'
        })
        setLossReasonModalOpen(true)
    }

    // Group stages by phase using dynamic phases
    const displayPhases = useMemo(() => {
        const phases = phasesData || []
        if (!filters.phaseFilters?.length) return [...phases]
        const visiblePhaseIds = new Set(filters.phaseFilters)

        // Incluir fases de TODOS os cards retornados na query (mesmo fora da visibilidade padrão)
        // Isso garante que cards onde sou SDR, Planner, Pós-Venda ou assistente apareçam
        const isOwnershipScoped = (viewMode === 'AGENT' && subView === 'MY_QUEUE') ||
            (viewMode === 'MANAGER' && subView === 'TEAM_VIEW')
        if (isOwnershipScoped) {
            for (const card of allCards) {
                const stage = stages?.find(s => s.id === card.pipeline_stage_id)
                if (stage?.phase_id) visiblePhaseIds.add(stage.phase_id)
            }
        }

        return phases.filter(p => visiblePhaseIds.has(p.id))
    }, [phasesData, filters.phaseFilters, viewMode, subView, allCards, stages])

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
                                {displayPhases.length === 0 ? (
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
                                            {(() => {
                                                // Pós-Venda é execução — sem ganho/perdido
                                                const isPosVenda = phase.slug === 'pos_venda' || phase.slug === 'resolucao'
                                                return phaseStages.map((stage) => {
                                                    const stageCards = allCards.filter(c => c.pipeline_stage_id === stage.id)
                                                    const stageSortConfig = getStageSortConfig(stage.id)
                                                    const sortedStageCards = sortCards(stageCards, stageSortConfig.sortBy, stageSortConfig.sortDirection)

                                                    return (
                                                        <KanbanColumn
                                                            key={stage.id}
                                                            stage={stage}
                                                            cards={sortedStageCards}
                                                            phaseColor={phase.color}
                                                            onWin={isPosVenda ? undefined : handleWin}
                                                            onLoss={isPosVenda ? undefined : handleLoss}
                                                            currentSort={stageSortConfig}
                                                            hasSortOverride={hasStageSortOverride(stage.id)}
                                                            onSortChange={(config) => setStageSortConfig(stage.id, config)}
                                                            onClearSort={() => clearStageSortConfig(stage.id)}
                                                        />
                                                    )
                                                })
                                            })()}
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
                                    <WinOptionsModal
                                        isOpen={winOptionsModalOpen}
                                        onClose={() => {
                                            setWinOptionsModalOpen(false)
                                            setPendingMove(null)
                                            setActiveCard(null)
                                        }}
                                        onChoosePosVenda={handleWinOptionPosVenda}
                                        onChooseDirectWin={handleWinOptionDirect}
                                    />

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

