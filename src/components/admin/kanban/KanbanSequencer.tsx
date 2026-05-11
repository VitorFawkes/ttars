import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import { Check, Loader2, GripVertical, Copy, ArrowRightLeft, DollarSign, Calendar, CheckSquare, AlertCircle, Type } from 'lucide-react'
import { cn } from '../../../lib/utils'
import type { Database } from '../../../database.types'
import { toast } from 'sonner'
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Select } from '../../ui/Select'

type SystemField = Database['public']['Tables']['system_fields']['Row']
type PipelinePhase = Database['public']['Tables']['pipeline_phases']['Row']
// Extend type locally until database types are regenerated
type CardSettings = Database['public']['Tables']['pipeline_card_settings']['Row'] & {
    phase_id?: string | null
}

interface KanbanSequencerProps {
    phases: PipelinePhase[]
    systemFields: SystemField[]
    settings: CardSettings[]
    isLoading: boolean
}

function SortableItem({ id, label, type }: { id: string, label: string, type: string }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "flex items-center gap-3 p-3 bg-white rounded-lg border transition-all duration-200",
                isDragging ? "opacity-50 border-dashed border-indigo-300 bg-indigo-50 z-50 shadow-lg" : "border-gray-200 hover:border-indigo-200"
            )}
        >
            <div
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 p-1"
            >
                <GripVertical className="w-5 h-5" />
            </div>
            <div className="text-gray-400">
                {type === 'currency' ? <DollarSign className="w-4 h-4 text-emerald-600" /> :
                    type === 'date' ? <Calendar className="w-4 h-4 text-blue-600" /> :
                        type === 'multiselect' ? <CheckSquare className="w-4 h-4 text-purple-600" /> :
                            type === 'number' ? <span className="font-bold text-[10px] w-4 h-4 flex items-center justify-center border border-gray-300 rounded text-gray-400">#</span> :
                                id === 'task_status' ? <AlertCircle className="w-4 h-4 text-amber-600" /> :
                                    <Type className="w-4 h-4 text-gray-400" />}
            </div>
            <span className="font-medium text-gray-700">{label}</span>
        </div>
    )
}

export function KanbanSequencer({ phases, systemFields, settings, isLoading }: KanbanSequencerProps) {
    const queryClient = useQueryClient()
    const [selectedPhaseId, setSelectedPhaseId] = useState<string>('')
    const [orderedFields, setOrderedFields] = useState<string[]>([])
    const [isDirty, setIsDirty] = useState(false)

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    )

    const [showSuccess, setShowSuccess] = useState(false)

    // Initialize selected phase
    useEffect(() => {
        if (phases.length > 0 && !selectedPhaseId) {
            setSelectedPhaseId(phases[0].id)
        }
        // eslint-disable-next-line react-hooks/set-state-in-effect
    }, [phases, selectedPhaseId])

    // Load order for selected phase
    useEffect(() => {
        if (selectedPhaseId && settings) {
            const phaseSettings = settings.find(s => s.phase_id === selectedPhaseId)
            const visibleFields = (phaseSettings?.campos_kanban as string[]) || []
            const savedOrder = (phaseSettings?.ordem_kanban as string[]) || []

            // Only show visible fields in sequencer
            // Merge saved order with any visible fields not in order (robustness)
            const mergedOrder = [
                ...savedOrder.filter(f => visibleFields.includes(f)),
                ...visibleFields.filter(f => !savedOrder.includes(f))
            ]

            setOrderedFields(mergedOrder)
            setIsDirty(false)
        }
    }, [selectedPhaseId, settings])

    const saveMutation = useMutation({
        mutationFn: async (newOrder: string[]) => {
            const phase = phases.find(p => p.id === selectedPhaseId)
            if (!phase) throw new Error('Fase não encontrada')

            const currentSettings = settings.find(s => s.phase_id === selectedPhaseId)

            const payload = {
                phase_id: selectedPhaseId,
                fase: phase.name,
                campos_kanban: currentSettings?.campos_kanban || [],
                ordem_kanban: newOrder,
                usuario_id: null
            }

            const { error } = await supabase
                .from('pipeline_card_settings')
                .upsert(payload, { onConflict: 'phase_id,usuario_id' })

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['pipeline-card-settings-admin'] })
            queryClient.invalidateQueries({ queryKey: ['pipeline-settings'] })
            toast.success('Ordem salva com sucesso!')
            setIsDirty(false)
            setShowSuccess(true)
            setTimeout(() => setShowSuccess(false), 3000)
        },
        onError: (err) => {
            toast.error('Erro ao salvar: ' + err.message)
        }
    })

    const replicateMutation = useMutation({
        mutationFn: async () => {
            if (!orderedFields.length) return

            // Prepare updates for ALL phases
            const updates = phases.map(phase => {
                const currentSettings = settings.find(s => s.phase_id === phase.id)
                const visibleFields = (currentSettings?.campos_kanban as string[]) || []

                // The target order is the current orderedFields, filtered by what is visible in that phase
                // This ensures we don't add hidden fields to the order list unnecessarily, 
                // although the UI only renders visible ones.
                // Actually, for "Replicate Order", we want to impose the MASTER order.
                // So if "Phone" is 1st in Master, it should be 1st in Target (if visible).

                const newOrder = orderedFields.filter(f => visibleFields.includes(f))

                // Append any visible fields that were not in the master order at the end
                visibleFields.forEach(f => {
                    if (!newOrder.includes(f)) {
                        newOrder.push(f)
                    }
                })

                return {
                    phase_id: phase.id,
                    fase: phase.name,
                    campos_kanban: visibleFields,
                    ordem_kanban: newOrder,
                    usuario_id: null
                }
            })

            const { error } = await supabase
                .from('pipeline_card_settings')
                .upsert(updates, { onConflict: 'phase_id,usuario_id' })

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['pipeline-card-settings-admin'] })
            queryClient.invalidateQueries({ queryKey: ['pipeline-settings'] })
            toast.success('Ordem replicada para todas as fases!')
        },
        onError: (err) => {
            toast.error('Erro ao replicar: ' + err.message)
        }
    })

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        if (active.id !== over?.id) {
            setOrderedFields((items) => {
                const oldIndex = items.indexOf(active.id as string)
                const newIndex = items.indexOf(over!.id as string)
                return arrayMove(items, oldIndex, newIndex)
            })
            setIsDirty(true)
        }
    }

    if (isLoading) {
        return (
            <div className="flex justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
        )
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column: Controls */}
            <div className="lg:col-span-1 space-y-6">
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">1. Selecione a Fase Modelo</h3>
                    <p className="text-sm text-gray-500 mb-4">Escolha uma fase para definir a ordem ideal dos campos.</p>

                    <Select
                        value={selectedPhaseId}
                        onChange={setSelectedPhaseId}
                        options={phases.map(phase => ({
                            value: phase.id,
                            label: phase.label
                        }))}
                        placeholder="Selecione uma fase"
                    />
                </div>

                <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-100">
                    <h3 className="text-lg font-semibold text-indigo-900 mb-4">2. Ações em Massa</h3>
                    <p className="text-sm text-indigo-700 mb-4">
                        Gostou da ordem ao lado? Replique para todas as fases do funil com um clique.
                    </p>

                    <button
                        onClick={() => replicateMutation.mutate()}
                        disabled={replicateMutation.isPending || isDirty} // Must save first
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-300 transition-all shadow-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {replicateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                        Replicar Ordem para Todas
                    </button>
                    {isDirty && (
                        <p className="text-xs text-amber-600 mt-2 text-center">
                            Salve as alterações antes de replicar.
                        </p>
                    )}
                </div>
            </div>

            {/* Right Column: Sortable List */}
            <div className="lg:col-span-2">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Ordem dos Campos</h3>
                    <button
                        onClick={() => saveMutation.mutate(orderedFields)}
                        disabled={saveMutation.isPending || (!isDirty && !showSuccess)}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 h-9 rounded-lg transition-all shadow-sm text-sm font-medium",
                            showSuccess
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : isDirty
                                    ? "bg-indigo-600 text-white hover:bg-indigo-700"
                                    : "bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"
                        )}
                    >
                        {saveMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : showSuccess ? (
                            <Check className="w-4 h-4" />
                        ) : (
                            <Check className="w-4 h-4" />
                        )}
                        {showSuccess ? 'Ordem Salva!' : 'Salvar Ordem'}
                    </button>
                </div>

                <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 min-h-[400px] max-h-[60vh] overflow-y-auto">
                    {orderedFields.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400">
                            <ArrowRightLeft className="w-8 h-8 mb-2 opacity-50" />
                            <p>Nenhum campo visível nesta fase.</p>
                            <p className="text-sm">Ative campos na aba "Visibilidade" primeiro.</p>
                        </div>
                    ) : (
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext
                                items={orderedFields}
                                strategy={verticalListSortingStrategy}
                            >
                                <div className="space-y-2">
                                    {orderedFields.map(fieldKey => {
                                        const field = systemFields.find(f => f.key === fieldKey)
                                        if (!field) return null
                                        return (
                                            <SortableItem
                                                key={fieldKey}
                                                id={fieldKey}
                                                label={field.label}
                                                type={field.type}
                                            />
                                        )
                                    })}
                                </div>
                            </SortableContext>
                        </DndContext>
                    )}
                </div>
            </div>
        </div>
    )
}
