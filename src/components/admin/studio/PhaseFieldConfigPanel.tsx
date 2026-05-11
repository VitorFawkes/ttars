import { useState, useMemo, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import { useFieldConfig, useSystemFieldsMutations } from '../../../hooks/useFieldConfig'
import { useToast } from '../../../contexts/ToastContext'
import { Eye, EyeOff, CheckSquare, Square, ToggleLeft, ToggleRight, Layers, ChevronsDown, LayoutTemplate, GripVertical } from 'lucide-react'
import { cn } from '../../../lib/utils'
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent
} from '@dnd-kit/core'
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface PhaseFieldConfigPanelProps {
    sectionKey: string
    stages: { id: string; nome: string; phase_id: string | null; fase: string }[]
    phases: { id: string; slug: string | null; name: string; visible_in_card?: boolean | null }[]
}

export default function PhaseFieldConfigPanel({ sectionKey, stages, phases }: PhaseFieldConfigPanelProps) {
    const { toast } = useToast()
    const queryClient = useQueryClient()
    const { systemFields, stageConfigs } = useFieldConfig()
    const { reorderSectionFields } = useSystemFieldsMutations()

    // Filter to phases that have stages (skip resolucao)
    const visiblePhases = useMemo(() => {
        return phases.filter(p => {
            if (p.slug === 'resolucao') return false
            return stages.some(s => s.phase_id === p.id)
        })
    }, [phases, stages])

    const [open, setOpen] = useState(false)
    const [activeTab, setActiveTab] = useState<string | null>(null)

    const currentTab = activeTab ?? visiblePhases[0]?.id ?? null
    const currentPhase = visiblePhases.find(p => p.id === currentTab)

    // Fields for this section — sorted by order_index for consistent drag-and-drop
    const sectionFields = useMemo(() => {
        if (!systemFields) return []
        return systemFields
            .filter(f => (f.section || 'details') === sectionKey)
            .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    }, [systemFields, sectionKey])

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event
        if (!over || active.id === over.id) return

        const oldIdx = sectionFields.findIndex(f => f.key === active.id)
        const newIdx = sectionFields.findIndex(f => f.key === over.id)
        if (oldIdx < 0 || newIdx < 0) return

        const reordered = arrayMove(sectionFields, oldIdx, newIdx)
        const updates = reordered.map((field, idx) => ({
            key: field.key,
            order_index: (idx + 1) * 10
        }))

        const updateMap = new Map(updates.map(u => [u.key, u.order_index]))
        queryClient.setQueriesData<{ key: string; order_index: number | null }[]>(
            { queryKey: ['system-fields-config'] },
            (old) => {
                if (!old) return old
                return old.map(f => updateMap.has(f.key) ? { ...f, order_index: updateMap.get(f.key)! } : f)
            }
        )

        reorderSectionFields.mutate(updates, {
            onError: () => {
                toast({ title: 'Erro ao reordenar campos', type: 'error' })
                queryClient.invalidateQueries({ queryKey: ['system-fields-config'] })
            }
        })
    }, [sectionFields, queryClient, reorderSectionFields, toast])

    // Stages for the current phase
    const phaseStages = useMemo(() => {
        if (!currentPhase) return []
        return stages.filter(s => s.phase_id === currentPhase.id)
    }, [stages, currentPhase])

    // Representative stage = last stage of the phase. Edits in this panel always
    // batch-write to all sibling stages, so this stage's config is canonical.
    const representativeStageId = useMemo(() => {
        if (phaseStages.length === 0) return null
        return phaseStages[phaseStages.length - 1].id
    }, [phaseStages])

    const getFieldState = useCallback((fieldKey: string) => {
        if (!stageConfigs || !representativeStageId) return { isVisible: true, isRequired: false, isSecondary: false, showInHeader: false }
        const cfg = stageConfigs.find(c => c.stage_id === representativeStageId && c.field_key === fieldKey)
        if (!cfg) return { isVisible: true, isRequired: false, isSecondary: false, showInHeader: false }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- coluna nova, types não regenerados
        return { isVisible: cfg.is_visible ?? true, isRequired: cfg.is_required ?? false, isSecondary: (cfg as any)?.is_secondary ?? false, showInHeader: cfg.show_in_header ?? false }
    }, [stageConfigs, representativeStageId])

    // Batch upsert mutation — applies to ALL stages of the phase, ensuring uniformity.
    const batchUpsertMutation = useMutation({
        mutationFn: async ({ fieldKey, isVisible, isRequired, isSecondary, showInHeader }: { fieldKey: string; isVisible: boolean; isRequired: boolean; isSecondary: boolean; showInHeader: boolean }) => {
            const rows = phaseStages.map(s => ({
                stage_id: s.id,
                field_key: fieldKey,
                is_visible: isVisible,
                is_required: isRequired,
                is_secondary: isSecondary,
                show_in_header: showInHeader
            }))

            const results = await Promise.all(
                rows.map(row =>
                    supabase
                        .from('stage_field_config')
                        .upsert(row, { onConflict: 'stage_id,field_key' })
                )
            )
            const failed = results.find(r => r.error)
            if (failed?.error) throw failed.error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['stage-field-configs-all'] })
            queryClient.invalidateQueries({ queryKey: ['stage-field-configs-unified'] })
        },
        onError: (error: Error) => {
            toast({ title: 'Erro ao salvar campo', description: error.message, type: 'error' })
        }
    })

    const toggleVisibleInCardMutation = useMutation({
        mutationFn: async ({ phaseId, visible }: { phaseId: string; visible: boolean }) => {
            const { error } = await supabase
                .from('pipeline_phases')
                .update({ visible_in_card: visible })
                .eq('id', phaseId)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['pipeline-phases'] })
            toast({ title: 'Visibilidade da aba atualizada', type: 'success' })
        },
        onError: (error: Error) => {
            toast({ title: 'Erro ao alterar visibilidade', description: error.message, type: 'error' })
        }
    })

    const handleToggleVisible = useCallback((fieldKey: string) => {
        const state = getFieldState(fieldKey)
        const newVisible = !state.isVisible
        batchUpsertMutation.mutate({
            fieldKey,
            isVisible: newVisible,
            isRequired: state.isRequired,
            isSecondary: newVisible ? state.isSecondary : false,
            showInHeader: newVisible ? state.showInHeader : false
        })
    }, [getFieldState, batchUpsertMutation])

    const handleToggleRequired = useCallback((fieldKey: string) => {
        const state = getFieldState(fieldKey)
        batchUpsertMutation.mutate({
            fieldKey,
            isVisible: state.isVisible,
            isRequired: !state.isRequired,
            isSecondary: state.isSecondary,
            showInHeader: state.showInHeader
        })
    }, [getFieldState, batchUpsertMutation])

    const handleToggleSecondary = useCallback((fieldKey: string) => {
        const state = getFieldState(fieldKey)
        batchUpsertMutation.mutate({
            fieldKey,
            isVisible: state.isVisible,
            isRequired: state.isRequired,
            isSecondary: !state.isSecondary,
            showInHeader: state.showInHeader
        })
    }, [getFieldState, batchUpsertMutation])

    const handleToggleHeader = useCallback((fieldKey: string) => {
        const state = getFieldState(fieldKey)
        batchUpsertMutation.mutate({
            fieldKey,
            isVisible: state.isVisible,
            isRequired: state.isRequired,
            isSecondary: state.isSecondary,
            showInHeader: !state.showInHeader
        })
    }, [getFieldState, batchUpsertMutation])

    if (visiblePhases.length === 0 || sectionFields.length === 0) return null

    const hiddenAbas = visiblePhases.filter(p => (p.visible_in_card ?? true) === false).length
    const hasRules = hiddenAbas > 0
    const summary = hiddenAbas > 0
        ? `${hiddenAbas} aba${hiddenAbas > 1 ? 's' : ''} escondida${hiddenAbas > 1 ? 's' : ''}`
        : `${visiblePhases.length} fases`

    return (
        <div>
            <button
                onClick={() => setOpen(prev => !prev)}
                className="flex items-center gap-2 w-full text-left"
            >
                <span className={cn("flex-shrink-0", hasRules ? "text-indigo-600" : "text-muted-foreground")}>
                    <Layers className="w-3.5 h-3.5" />
                </span>
                <span className={cn("text-xs font-medium", hasRules ? "text-indigo-700" : "text-muted-foreground")}>
                    Campos desta seção por fase
                </span>
                <span className="text-[10px] text-muted-foreground/60 truncate">
                    — {summary}
                </span>
                <span className={cn("ml-auto text-[10px] font-medium", hasRules ? "text-indigo-700" : "text-muted-foreground/40")}>
                    {open ? '▲' : '▼'}
                </span>
            </button>

            {open && (
                <div className="mt-2 ml-6 space-y-2">
                    <p className="text-[10px] text-muted-foreground/60 mb-2">
                        Marque quais campos aparecem em cada fase. A regra vale para todas as etapas dentro da fase.
                    </p>

                    {/* Phase tabs */}
                    <div className="flex items-center gap-1">
                        {visiblePhases.map(phase => (
                            <button
                                key={phase.id}
                                onClick={() => setActiveTab(phase.id)}
                                className={cn(
                                    "px-2.5 py-1 rounded-md text-xs font-medium border transition-all",
                                    currentTab === phase.id
                                        ? "bg-indigo-100 text-indigo-700 border-indigo-300 shadow-sm"
                                        : "bg-muted/50 text-muted-foreground border-border hover:border-slate-400"
                                )}
                            >
                                {phase.name}
                            </button>
                        ))}
                    </div>

                    {/* Visible in card toggle — only for sections that render per-phase tabs (trip_info) */}
                    {currentPhase && sectionKey === 'trip_info' && (
                        <button
                            onClick={() => toggleVisibleInCardMutation.mutate({
                                phaseId: currentPhase.id,
                                visible: (currentPhase.visible_in_card ?? true) === false
                            })}
                            className={cn(
                                "flex items-center gap-2 text-xs font-medium w-full text-left py-1",
                                currentPhase.visible_in_card !== false ? "text-green-700" : "text-slate-400"
                            )}
                        >
                            {currentPhase.visible_in_card !== false
                                ? <ToggleRight className="w-4 h-4" />
                                : <ToggleLeft className="w-4 h-4" />
                            }
                            Mostrar seção "{currentPhase.name}" no card
                        </button>
                    )}

                    {/* Field list */}
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={sectionFields.map(f => f.key)}
                            strategy={verticalListSortingStrategy}
                        >
                            <div className="space-y-0.5">
                                {sectionFields.map(field => {
                                    const state = getFieldState(field.key)

                                    return (
                                        <SortablePhaseFieldRow
                                            key={field.key}
                                            fieldKey={field.key}
                                            label={field.label}
                                            isVisible={state.isVisible}
                                            isRequired={state.isRequired}
                                            isSecondary={state.isSecondary}
                                            showInHeader={state.showInHeader}
                                            mutationPending={batchUpsertMutation.isPending}
                                            onToggleVisible={() => handleToggleVisible(field.key)}
                                            onToggleRequired={() => handleToggleRequired(field.key)}
                                            onToggleSecondary={() => handleToggleSecondary(field.key)}
                                            onToggleHeader={() => handleToggleHeader(field.key)}
                                        />
                                    )
                                })}
                            </div>
                        </SortableContext>
                    </DndContext>
                </div>
            )}
        </div>
    )
}

interface SortablePhaseFieldRowProps {
    fieldKey: string
    label: string
    isVisible: boolean
    isRequired: boolean
    isSecondary: boolean
    showInHeader: boolean
    mutationPending: boolean
    onToggleVisible: () => void
    onToggleRequired: () => void
    onToggleSecondary: () => void
    onToggleHeader: () => void
}

function SortablePhaseFieldRow({
    fieldKey,
    label,
    isVisible,
    isRequired,
    isSecondary,
    showInHeader,
    mutationPending,
    onToggleVisible,
    onToggleRequired,
    onToggleSecondary,
    onToggleHeader
}: SortablePhaseFieldRowProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: fieldKey })

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 100 : 'auto'
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "flex items-center gap-2 py-1 px-1 rounded",
                isDragging && "bg-slate-100 shadow-sm"
            )}
        >
            <button
                {...attributes}
                {...listeners}
                className="p-0.5 text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
                title="Arrastar para reordenar"
            >
                <GripVertical className="w-3 h-3" />
            </button>
            <button
                onClick={onToggleVisible}
                disabled={mutationPending}
                className={cn(
                    "p-1 rounded transition-colors",
                    isVisible
                        ? "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                        : "text-red-500 hover:text-red-700 hover:bg-red-50"
                )}
                title={isVisible ? "Visível (clique para ocultar)" : "Oculto (clique para mostrar)"}
            >
                {isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>
            <button
                onClick={onToggleRequired}
                disabled={mutationPending}
                className={cn(
                    "p-1 rounded transition-colors",
                    isRequired
                        ? "text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                        : "text-slate-300 hover:text-slate-500 hover:bg-slate-100"
                )}
                title={isRequired ? "Obrigatório (clique para remover)" : "Não obrigatório (clique para tornar)"}
            >
                {isRequired ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
            </button>
            {isVisible && (
                <>
                    <button
                        onClick={onToggleSecondary}
                        disabled={mutationPending}
                        className={cn(
                            "p-1 rounded transition-colors",
                            isSecondary
                                ? "text-amber-500 hover:text-amber-600 hover:bg-amber-50"
                                : "text-slate-300 hover:text-slate-500 hover:bg-slate-100"
                        )}
                        title={isSecondary ? 'Secundário — "Ver mais" (clique para primário)' : 'Primário (clique para mover ao "Ver mais")'}
                    >
                        <ChevronsDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={onToggleHeader}
                        disabled={mutationPending}
                        className={cn(
                            "p-1 rounded transition-colors",
                            showInHeader
                                ? "text-purple-500 hover:text-purple-600 hover:bg-purple-50"
                                : "text-slate-300 hover:text-slate-500 hover:bg-slate-100"
                        )}
                        title={showInHeader ? 'No cabeçalho (clique para remover)' : 'Fora do cabeçalho (clique para adicionar)'}
                    >
                        <LayoutTemplate className="w-3.5 h-3.5" />
                    </button>
                </>
            )}
            <span className={cn(
                "text-xs truncate flex-1",
                !isVisible ? "text-muted-foreground line-through" : "text-foreground"
            )}>
                {label}
            </span>
        </div>
    )
}
