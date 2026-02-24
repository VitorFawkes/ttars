import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import { Loader2, Plus, Layout } from 'lucide-react'
import { cn } from '../../../lib/utils'
import {
    DndContext,
    closestCorners,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    defaultDropAnimationSideEffects,
    type DragStartEvent,
    type DragOverEvent,
    type DragEndEvent,
    type DropAnimation
} from '@dnd-kit/core'
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    horizontalListSortingStrategy
} from '@dnd-kit/sortable'
import { createPortal } from 'react-dom'

import PhaseColumn from './builder/PhaseColumn'
import StageCard from './builder/StageCard'
import StageInspectorDrawer from './StageInspectorDrawer'
import PhaseSettingsDrawer from './PhaseSettingsDrawer'
import PromptModal, { ConfirmModal } from './PromptModal'
import { usePipelinePhases } from '../../../hooks/usePipelinePhases'
import type { Database } from '../../../database.types'

type PipelineStage = Database['public']['Tables']['pipeline_stages']['Row']
type PipelinePhase = Database['public']['Tables']['pipeline_phases']['Row']

export default function StudioStructure() {
    const queryClient = useQueryClient()
    const [activeId, setActiveId] = useState<string | null>(null)
    const [activeType, setActiveType] = useState<'Phase' | 'Stage' | null>(null)

    // --- Data Fetching (before local state so initializers can use the data) ---
    const { data: phasesData, isLoading: loadingPhases } = usePipelinePhases()

    const { data: stagesData, isLoading: loadingStages } = useQuery({
        queryKey: ['pipeline-stages-studio'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('pipeline_stages')
                .select('*')
                .order('ordem')
            if (error) throw error
            return data as PipelineStage[]
        }
    })

    // Optimistic State — initialized from query data to handle cache hits
    const [localPhases, setLocalPhases] = useState<PipelinePhase[]>(phasesData ?? [])
    const [localStages, setLocalStages] = useState<PipelineStage[]>(stagesData ?? [])

    const [editingStage, setEditingStage] = useState<PipelineStage | null>(null)
    const [editingPhaseSettings, setEditingPhaseSettings] = useState<PipelinePhase | null>(null)

    // Modal States for premium prompt/confirm replacements
    const [promptModal, setPromptModal] = useState<{
        isOpen: boolean
        title: string
        description?: string
        placeholder?: string
        defaultValue?: string
        onConfirm: (value: string) => void
    } | null>(null)
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean
        title: string
        description: string
        variant?: 'default' | 'destructive'
        onConfirm: () => void
    } | null>(null)

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 10 // Prevent accidental drags
            }
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    )

    // Sync server data → local state
    useEffect(() => {
        if (phasesData) setLocalPhases(phasesData)
    }, [phasesData])

    useEffect(() => {
        if (stagesData) setLocalStages(stagesData)
    }, [stagesData])

    // --- Mutations ---
    const updatePhaseMutation = useMutation({
        mutationFn: async (phase: Partial<PipelinePhase>) => {
            const { error } = await supabase.from('pipeline_phases').update(phase).eq('id', phase.id!)
            if (error) throw error
        },
        onMutate: async (newPhase) => {
            await queryClient.cancelQueries({ queryKey: ['pipeline-phases'] })
            const previousPhases = queryClient.getQueryData(['pipeline-phases'])
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            queryClient.setQueryData(['pipeline-phases'], (old: any[] | undefined) => {
                if (!old) return []
                return old.map((p: { id: string }) => p.id === newPhase.id ? { ...p, ...newPhase } : p)
            })
            return { previousPhases }
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onError: (err, _newPhase, context: any) => {
            console.error('Error updating phase:', err)
            if (context?.previousPhases) {
                queryClient.setQueryData(['pipeline-phases'], context.previousPhases)
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['pipeline-phases'] })
        }
    })

    const createPhaseMutation = useMutation({
        mutationFn: async (name: string) => {
            const maxOrder = Math.max(...localPhases.map(p => p.order_index), 0)
            const { error } = await supabase.from('pipeline_phases').insert({
                name,
                label: name,
                color: 'bg-gray-500',
                order_index: maxOrder + 1,
                active: true
            })
            if (error) throw error
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pipeline_phases'] })
    })

    const deletePhaseMutation = useMutation({
        mutationFn: async (id: string) => {
            // Check if empty
            const hasStages = localStages.some(s => s.phase_id === id)
            if (hasStages) throw new Error('Não é possível excluir uma fase que contém etapas. Mova as etapas primeiro.')

            const { error } = await supabase.from('pipeline_phases').delete().eq('id', id)
            if (error) throw error
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pipeline_phases'] }),
        onError: (err) => alert(err.message)
    })

    const reorderPhasesMutation = useMutation({
        mutationFn: async (phases: PipelinePhase[]) => {
            const updates = phases.map((p, idx) => ({ id: p.id, order_index: idx + 1 }))
            for (const u of updates) {
                await supabase.from('pipeline_phases').update({ order_index: u.order_index }).eq('id', u.id)
            }
        }
    })

    const createStageMutation = useMutation({
        mutationFn: async ({ name, phaseId }: { name: string, phaseId: string }) => {
            const phase = localPhases.find(p => p.id === phaseId)
            const phaseStages = localStages.filter(s => s.phase_id === phaseId)
            const maxOrder = Math.max(...phaseStages.map(s => s.ordem || 0), 0)

            // Get valid pipeline_id from existing stages
            const pipelineId = localStages[0]?.pipeline_id
            if (!pipelineId) {
                throw new Error('Não foi possível determinar o pipeline. Recarregue a página.')
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.from('pipeline_stages') as any).insert({
                nome: name,
                fase: phase?.name || 'SDR',
                phase_id: phaseId,
                target_phase_id: phaseId, // Default: mesma fase do stage
                ordem: maxOrder + 1,
                pipeline_id: pipelineId,
                ativo: true,
                // tipo_responsavel nullable agora — campo deprecated
            }).select()
            if (error) {
                console.error('Stage creation error:', error)
                throw new Error(error.message || 'Erro ao criar etapa')
            }
            return data
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pipeline-stages-studio'] }),
        onError: (err: Error) => {
            setConfirmModal({
                isOpen: true,
                title: 'Erro ao Criar Etapa',
                description: err.message,
                variant: 'destructive',
                onConfirm: () => { }
            })
        }
    })

    const deleteStageMutation = useMutation({
        mutationFn: async (id: string) => {
            // 1. Bloqueia se existem cards usando esta etapa
            const { count, error: countError } = await supabase
                .from('cards')
                .select('*', { count: 'exact', head: true })
                .eq('pipeline_stage_id', id)
            if (countError) throw countError
            if (count && count > 0) throw new Error(`Não é possível excluir etapa com ${count} cards ativos.`)

            // 2. Limpa dependências sem ON DELETE CASCADE antes de excluir
            const cleanupResults = await Promise.all([
                // Regras de criação que apontam para esta etapa
                supabase.from('card_creation_rules').delete().eq('stage_id', id),
                supabase.from('card_auto_creation_rules').delete().eq('target_stage_id', id),
                // Config legada de campos
                supabase.from('stage_fields_settings').delete().eq('stage_id', id),
                // Mapeamentos de integração
                supabase.from('integration_stage_map').delete().eq('internal_stage_id', id),
                // Config WhatsApp
                supabase.from('whatsapp_linha_config').delete().eq('stage_id', id),
                // Auditoria: preserva registros mas limpa referência
                supabase.from('historico_fases').update({ etapa_anterior_id: null }).eq('etapa_anterior_id', id),
                supabase.from('historico_fases').update({ etapa_nova_id: null }).eq('etapa_nova_id', id),
                // Triggers de integração: limpa referências
                supabase.from('integration_inbound_triggers').update({ quarantine_stage_id: null }).eq('quarantine_stage_id', id),
                supabase.from('integration_inbound_triggers').update({ target_stage_id: null }).eq('target_stage_id', id),
            ])
            const cleanupError = cleanupResults.find(r => r.error)
            if (cleanupError?.error) throw new Error(`Erro ao limpar dependências: ${cleanupError.error.message}`)

            // 3. Exclui a etapa (CASCADE cuida de: stage_field_config, stage_transitions, pipeline_config, integration_outbound_stage_map)
            const { error } = await supabase.from('pipeline_stages').delete().eq('id', id)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['pipeline-stages-studio'] })
            queryClient.invalidateQueries({ queryKey: ['pipeline-stages'] })
        },
        onError: (err) => alert(err.message)
    })


    const reorderStagesMutation = useMutation({
        mutationFn: async (stages: Partial<PipelineStage>[]) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase.from('pipeline_stages') as any).upsert(stages)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['pipeline-stages-studio'] })
        },
        onError: (err) => {
            console.error('Reorder error:', err)
            queryClient.invalidateQueries({ queryKey: ['pipeline-stages-studio'] })
            setConfirmModal({
                isOpen: true,
                title: 'Erro ao Reordenar',
                description: 'Não foi possível salvar a nova ordem. A página será recarregada.',
                variant: 'destructive',
                onConfirm: () => window.location.reload()
            })
        }
    })

    // --- Dnd Handlers ---
    const onDragStart = (event: DragStartEvent) => {
        const { active } = event
        console.log('DEBUG: onDragStart', active.id)
        setActiveId(active.id as string)
        setActiveType(active.data.current?.type)
    }

    const onDragOver = (event: DragOverEvent) => {
        const { active, over } = event
        if (!over) return

        const activeId = active.id
        const overId = over.id

        if (activeId === overId) return

        const isActiveStage = active.data.current?.type === 'Stage'
        const isOverStage = over.data.current?.type === 'Stage'
        const isOverPhase = over.data.current?.type === 'Phase'

        if (!isActiveStage) return

        // CRITICAL: Do NOT reorder during drag - it breaks dnd-kit
        // Only update phase_id if moving to a different phase

        if (isActiveStage && isOverStage) {
            const activeStage = localStages.find(s => String(s.id) === String(activeId))
            const overStage = localStages.find(s => String(s.id) === String(overId))

            // Only update if changing phases
            if (activeStage && overStage && activeStage.phase_id !== overStage.phase_id) {
                setLocalStages((stages) => {
                    return stages.map(s => {
                        if (String(s.id) === String(activeId)) {
                            return {
                                ...s,
                                phase_id: overStage.phase_id,
                                fase: localPhases.find(p => p.id === overStage.phase_id)?.name || 'Outro'
                            }
                        }
                        return s
                    })
                })
            }
        }

        if (isActiveStage && isOverPhase) {
            const activeStage = localStages.find(s => String(s.id) === String(activeId))

            if (activeStage && activeStage.phase_id !== overId) {
                setLocalStages((stages) => {
                    return stages.map(s => {
                        if (String(s.id) === String(activeId)) {
                            return {
                                ...s,
                                phase_id: overId as string,
                                fase: localPhases.find(p => p.id === overId)?.name || 'Outro'
                            }
                        }
                        return s
                    })
                })
            }
        }
    }

    const onDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        setActiveId(null)
        setActiveType(null)

        if (!over) return

        const activeId = active.id
        const overId = over.id

        if (activeId === overId) return

        // Phase Reordering
        if (active.data.current?.type === 'Phase') {
            setLocalPhases((phases) => {
                const oldIndex = phases.findIndex((p) => p.id === activeId)
                const newIndex = phases.findIndex((p) => p.id === overId)
                const newPhases = arrayMove(phases, oldIndex, newIndex)
                reorderPhasesMutation.mutate(newPhases)
                return newPhases
            })
        }

        // Stage Reordering (Persistence)
        if (active.data.current?.type === 'Stage') {
            const activeId = active.id
            const overId = over.id

            if (activeId === overId) return

            console.log('DEBUG: DragEnd Stage', { activeId, overId })

            // ELITE: Explicitly calculate new order to ensure persistence works
            // Use String() to ensure ID matching works regardless of type
            const oldIndex = localStages.findIndex((s) => String(s.id) === String(activeId))
            const newIndex = localStages.findIndex((s) => String(s.id) === String(overId))

            if (oldIndex !== -1 && newIndex !== -1) {
                // Apply move locally first
                const newStages = arrayMove(localStages, oldIndex, newIndex)
                setLocalStages(newStages)

                // Calculate updates based on the NEW order
                const updates: Partial<PipelineStage>[] = []

                // We need to check if phase changed during drag (handled in onDragOver but we need to be sure)
                // If onDragOver ran, localStages already has the new phase_id for the active item?
                // Actually, arrayMove just moves the item. If phase_id was changed in onDragOver, it persists.
                // But to be safe, let's ensure we are using the phase_id from the newStages state

                localPhases.forEach(phase => {
                    // Get stages for this phase from our calculated newStages
                    const stagesInPhase = newStages.filter(s => s.phase_id === phase.id)

                    stagesInPhase.forEach((s, idx) => {
                        // Check if order changed OR if it's the moved item (to ensure phase_id is saved)
                        if (s.ordem !== idx + 1 || String(s.id) === String(activeId)) {
                            updates.push({
                                id: s.id,
                                nome: s.nome,
                                ordem: idx + 1,
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                tipo_responsavel: (s as any).tipo_responsavel || 'vendas', // DEPRECATED: constraint only
                                pipeline_id: s.pipeline_id,
                                ativo: s.ativo ?? true,
                                fase: phase.name,
                                phase_id: phase.id
                            })
                        }
                    })
                })

                console.log('DEBUG: Updates', updates)

                if (updates.length > 0) {
                    reorderStagesMutation.mutate(updates)
                }
            } else {
                console.error('DEBUG: Stage not found in local state', { activeId, overId })
            }
        }
    }

    const dropAnimation: DropAnimation = {
        sideEffects: defaultDropAnimationSideEffects({
            styles: {
                active: {
                    opacity: '0.5',
                },
            },
        }),
    }

    if (loadingPhases || loadingStages) return <div className="p-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600" /></div>

    return (
        <div className="h-full flex flex-col p-6 max-w-[1800px] mx-auto overflow-hidden">
            <div className="flex justify-between items-center mb-6 flex-shrink-0">
                <div>
                    <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Layout className="w-6 h-6 text-primary" />
                        Construtor de Pipeline
                    </h2>
                    <p className="text-muted-foreground mt-1">Gerencie macro-áreas e etapas visualmente.</p>
                </div>
                <button
                    onClick={() => {
                        const activePhasesCount = localPhases.filter(p => p.active && p.name !== 'Marketing').length
                        if (activePhasesCount >= 6) {
                            setConfirmModal({
                                isOpen: true,
                                title: 'Limite Atingido',
                                description: 'Limite de gestão atingido (Máx. 6 áreas).',
                                variant: 'default',
                                onConfirm: () => { }
                            })
                            return
                        }
                        setPromptModal({
                            isOpen: true,
                            title: 'Nova Macro-Área',
                            description: 'Insira o nome da nova macro-área do pipeline.',
                            placeholder: 'Ex: Pós-Venda',
                            onConfirm: (name) => createPhaseMutation.mutate(name)
                        })
                    }}
                    disabled={localPhases.filter(p => p.active && p.name !== 'Marketing').length >= 6}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg shadow-sm transition-all font-medium",
                        localPhases.filter(p => p.active && p.name !== 'Marketing').length >= 6
                            ? "bg-muted text-muted-foreground cursor-not-allowed"
                            : "bg-primary text-primary-foreground hover:bg-primary/90"
                    )}
                    title={localPhases.filter(p => p.active && p.name !== 'Marketing').length >= 4 ? "Limite de gestão atingido (Máx. 4 áreas)" : "Nova Macro-Área"}
                >
                    <Plus className="w-4 h-4" />
                    Nova Macro-Área
                </button>
            </div>

            <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDragEnd={onDragEnd}
                onDragCancel={(e) => {
                    console.error('DEBUG: onDragCancel', e)
                    setActiveId(null)
                    setActiveType(null)
                }}
            >
                <div className="flex-1 overflow-x-auto overflow-y-hidden pb-4">
                    <div className="flex gap-6 h-full min-w-max px-2">
                        <SortableContext items={localPhases.map(p => String(p.id))} strategy={horizontalListSortingStrategy}>
                            {localPhases.map(phase => (
                                <PhaseColumn
                                    key={phase.id}
                                    phase={phase}
                                    stages={localStages.filter(s => s.phase_id === phase.id)}
                                    allPhases={localPhases}
                                    onAddStage={() => {
                                        setPromptModal({
                                            isOpen: true,
                                            title: 'Nova Etapa',
                                            description: `Adicionar etapa na fase "${phase.name}".`,
                                            placeholder: 'Ex: Qualificação',
                                            onConfirm: (name) => createStageMutation.mutate({ name, phaseId: phase.id })
                                        })
                                    }}
                                    onEditPhase={() => {
                                        setPromptModal({
                                            isOpen: true,
                                            title: 'Renomear Fase',
                                            description: 'Altere o nome desta macro-área.',
                                            placeholder: 'Nome da fase',
                                            defaultValue: phase.name,
                                            onConfirm: (name) => updatePhaseMutation.mutate({ id: phase.id, name, label: name })
                                        })
                                    }}
                                    onDeletePhase={() => {
                                        setConfirmModal({
                                            isOpen: true,
                                            title: 'Excluir Fase',
                                            description: `Tem certeza que deseja excluir a fase "${phase.name}"? Esta ação não pode ser desfeita.`,
                                            variant: 'destructive',
                                            onConfirm: () => deletePhaseMutation.mutate(phase.id)
                                        })
                                    }}
                                    onChangeColor={(color) => updatePhaseMutation.mutate({ id: phase.id, color })}
                                    onToggleVisibility={() => updatePhaseMutation.mutate({ id: phase.id, visible_in_card: !phase.visible_in_card })}
                                    onEditPhaseSettings={() => setEditingPhaseSettings(phase)}
                                    onEditStage={(stage) => setEditingStage(stage)}
                                    onDeleteStage={(stage) => {
                                        setConfirmModal({
                                            isOpen: true,
                                            title: 'Excluir Etapa',
                                            description: `Tem certeza que deseja excluir a etapa "${stage.nome}"? Esta ação não pode ser desfeita.`,
                                            variant: 'destructive',
                                            onConfirm: () => deleteStageMutation.mutate(stage.id)
                                        })
                                    }}
                                />
                            ))}
                        </SortableContext>
                    </div>
                </div>

                {createPortal(
                    <DragOverlay dropAnimation={dropAnimation}>
                        {activeId && activeType === 'Phase' && (
                            <PhaseColumn
                                phase={localPhases.find(p => p.id === activeId)!}
                                stages={localStages.filter(s => s.phase_id === activeId)}
                                allPhases={localPhases}
                                onAddStage={() => { }}
                                onEditPhase={() => { }}
                                onDeletePhase={() => { }}
                                onEditStage={() => { }}
                                onDeleteStage={() => { }}
                                onChangeColor={() => { }}
                                onToggleVisibility={() => { }}
                                onEditPhaseSettings={() => { }}
                            />
                        )}
                        {activeId && activeType === 'Stage' && (() => {
                            const stage = localStages.find(s => String(s.id) === String(activeId))
                            if (!stage) {
                                console.error('DEBUG: DragOverlay stage not found!', activeId)
                                return null
                            }
                            return (
                                <StageCard
                                    stage={stage}
                                    onEdit={() => { }}
                                    onDelete={() => { }}
                                />
                            )
                        })()}
                    </DragOverlay>,
                    document.body
                )}
            </DndContext>

            <StageInspectorDrawer
                isOpen={!!editingStage}
                onClose={() => setEditingStage(null)}
                stage={editingStage}
            />

            <PhaseSettingsDrawer
                isOpen={!!editingPhaseSettings}
                onClose={() => setEditingPhaseSettings(null)}
                phase={editingPhaseSettings}
            />

            {/* Premium Modal replacements for native prompt/confirm */}
            <PromptModal
                isOpen={promptModal?.isOpen ?? false}
                onClose={() => setPromptModal(null)}
                onConfirm={promptModal?.onConfirm ?? (() => { })}
                title={promptModal?.title ?? ''}
                description={promptModal?.description}
                placeholder={promptModal?.placeholder}
                defaultValue={promptModal?.defaultValue}
            />

            <ConfirmModal
                isOpen={confirmModal?.isOpen ?? false}
                onClose={() => setConfirmModal(null)}
                onConfirm={confirmModal?.onConfirm ?? (() => { })}
                title={confirmModal?.title ?? ''}
                description={confirmModal?.description ?? ''}
                variant={confirmModal?.variant}
            />
        </div>
    )
}
