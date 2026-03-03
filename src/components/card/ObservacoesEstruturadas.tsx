import { useState, useCallback, useMemo } from 'react'
import { AlertTriangle, Check, Loader2, Tag, Plane, FileCheck } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../database.types'
import { cn } from '../../lib/utils'
import { usePipelinePhases } from '../../hooks/usePipelinePhases'
import { usePipelineStages } from '../../hooks/usePipelineStages'
import { useFieldConfig } from '../../hooks/useFieldConfig'
import { SystemPhase } from '../../types/pipeline'
import UniversalFieldRenderer from '../fields/UniversalFieldRenderer'
import { FieldLockButton } from './FieldLockButton'

type Card = Database['public']['Tables']['cards']['Row'] & {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    briefing_inicial?: any | null
}


interface ObservacoesEstruturadasProps {
    card: Card
}

type ViewMode = string

const EMPTY_OBJECT = {}

export default function ObservacoesEstruturadas({ card }: ObservacoesEstruturadasProps) {
    const queryClient = useQueryClient()
    const { data: phases } = usePipelinePhases()
    const { data: stages } = usePipelineStages()

    // Data Sources
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const productData = useMemo(() => (card.produto_data as any) || EMPTY_OBJECT, [card.produto_data])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const briefingData = useMemo(() => (card.briefing_inicial as any) || EMPTY_OBJECT, [card.briefing_inicial])

    // State
    const [viewMode, setViewMode] = useState<ViewMode>(SystemPhase.SDR)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [editedObs, setEditedObs] = useState<any>({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [lastSavedObs, setLastSavedObs] = useState<any>({})
    const [isDirty, setIsDirty] = useState(false)

    // Determine the relevant stage ID for the current viewMode
    const viewModeStageId = useMemo(() => {
        if (!phases || !stages) return card.pipeline_stage_id

        // If viewMode is a specific phase slug, find the corresponding phase
        const currentPhase = phases.find(p => p.slug === viewMode)
        if (!currentPhase) return card.pipeline_stage_id

        // Find stages belonging to this phase (new phase_id linking OR legacy fase string linking)
        const phaseStages = stages.filter(s =>
            s.phase_id === currentPhase.id ||
            (!s.phase_id && s.fase === currentPhase.name)
        )

        if (phaseStages.length > 0) {
            // Return the last stage of the phase (most complete config)
            return phaseStages[phaseStages.length - 1].id
        }

        return card.pipeline_stage_id
    }, [viewMode, phases, stages, card.pipeline_stage_id])

    // Sync ViewMode with Card Stage (render-time pattern per React docs)
    const derivedViewMode = useMemo(() => {
        if (!phases) return SystemPhase.SDR

        const currentStage = stages?.find(s => s.id === card.pipeline_stage_id)
        const currentPhase = phases.find(p => p.name === currentStage?.fase)

        if (currentPhase && currentPhase.slug && currentPhase.visible_in_card !== false) {
            return currentPhase.slug
        }

        const sdrPhase = phases.find(p => p.slug === SystemPhase.SDR)
        return (sdrPhase && sdrPhase.slug) ? sdrPhase.slug : SystemPhase.SDR
    }, [card.pipeline_stage_id, phases, stages])

    const [prevDerivedMode, setPrevDerivedMode] = useState(derivedViewMode)
    if (prevDerivedMode !== derivedViewMode) {
        setPrevDerivedMode(derivedViewMode)
        setViewMode(derivedViewMode)
    }

    // Determine active section key based on viewMode
    const activeSectionKey = useMemo(() => {
        switch (viewMode) {
            case SystemPhase.SDR:
            case SystemPhase.PLANNER:
            case SystemPhase.POS_VENDA:
                return 'observacoes_criticas'
            default: return viewMode
        }
    }, [viewMode])

    // Determine active data source based on viewMode
    const activeData = useMemo(() => {
        switch (viewMode) {
            case SystemPhase.SDR: return briefingData.observacoes || {}
            case SystemPhase.PLANNER: return productData.observacoes_criticas || {}
            case SystemPhase.POS_VENDA: return productData.observacoes_pos_venda || {}
            default: return productData[viewMode] || {}
        }
    }, [viewMode, briefingData, productData])

    // Sync local state when activeData changes (render-time pattern)
    const [prevActiveDataStr, setPrevActiveDataStr] = useState('')
    const activeDataStr = JSON.stringify(activeData)
    if (prevActiveDataStr !== activeDataStr) {
        setPrevActiveDataStr(activeDataStr)
        setEditedObs(activeData)
        setLastSavedObs(activeData)
        setIsDirty(false)
    }

    // Fetch Field Configs
    const { getVisibleFields, isLoading: loadingConfig } = useFieldConfig()

    // Fetch fields based on active stage and section
    const fields = useMemo(() => {
        const targetStageId = viewModeStageId || card.pipeline_stage_id
        if (!targetStageId) return []

        // For legacy phases, we might still want to filter by section to keep backward compatibility
        // But for dynamic phases, we want ALL visible fields configured in the Matrix
        if (viewMode === SystemPhase.SDR || viewMode === SystemPhase.PLANNER || viewMode === SystemPhase.POS_VENDA) {
            return getVisibleFields(targetStageId, activeSectionKey)
        }

        // Dynamic Phases: Return ALL visible fields for this stage, regardless of section
        return getVisibleFields(targetStageId)
    }, [viewModeStageId, activeSectionKey, getVisibleFields, viewMode, card.pipeline_stage_id])

    // Mutation to save changes
    const updateCard = useMutation({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mutationFn: async (newData: any) => {
            const { error } = await supabase
                .from('cards')
                .update(newData)
                .eq('id', card.id!)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['card', card.id] })
            queryClient.invalidateQueries({ queryKey: ['card-detail', card.id] })
            setLastSavedObs(editedObs)
            setIsDirty(false)
        }
    })

    const handleSave = async () => {
        if (!isDirty) return

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let updatePayload: any = {}

        if (viewMode === SystemPhase.SDR) {
            updatePayload = {
                briefing_inicial: {
                    ...briefingData,
                    observacoes: editedObs
                }
            }
        } else if (viewMode === SystemPhase.PLANNER) {
            updatePayload = {
                produto_data: {
                    ...productData,
                    observacoes_criticas: editedObs
                }
            }
        } else if (viewMode === SystemPhase.POS_VENDA) {
            updatePayload = {
                produto_data: {
                    ...productData,
                    observacoes_pos_venda: editedObs
                }
            }
        } else {
            // Dynamic Phase
            updatePayload = {
                produto_data: {
                    ...productData,
                    [viewMode]: editedObs
                }
            }
        }

        try {
            await updateCard.mutateAsync(updatePayload)
        } catch (error) {
            console.error('Failed to save observations:', error)
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleChange = useCallback((key: string, value: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setEditedObs((prev: any) => {
            const next = { ...prev, [key]: value }
            setIsDirty(JSON.stringify(next) !== JSON.stringify(lastSavedObs))
            return next
        })
    }, [lastSavedObs])

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
            e.preventDefault()
            handleSave()
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const renderFieldInput = (field: any) => {
        const value = editedObs[field.key]

        return (
            <UniversalFieldRenderer
                field={field}
                value={value}
                mode="edit"
                onChange={(val) => handleChange(field.key, val)}
            />
        )
    }

    // Get visible phases for tabs (filter out hidden ones)
    const visibleLegacyPhases = useMemo(() => {
        if (!phases) return { sdr: true, planner: true, posVenda: true }
        const sdrPhase = phases.find(p => p.slug === SystemPhase.SDR)
        const plannerPhase = phases.find(p => p.slug === SystemPhase.PLANNER)
        const posVendaPhase = phases.find(p => p.slug === SystemPhase.POS_VENDA)
        return {
            sdr: sdrPhase?.visible_in_card !== false,
            planner: plannerPhase?.visible_in_card !== false,
            posVenda: posVendaPhase?.visible_in_card !== false
        }
    }, [phases])

    return (
        <div className="rounded-xl border border-gray-300 bg-white shadow-sm overflow-hidden">
            {/* Header & Tabs */}
            <div className="border-b border-gray-200 bg-gray-50/50 px-3 pt-2">
                <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                        <div className="p-1 bg-red-100 rounded-lg">
                            <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                        </div>
                        <h3 className="text-xs font-semibold text-gray-900">Informações Importantes</h3>
                    </div>

                    {updateCard.isPending ? (
                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Salvando...
                        </div>
                    ) : isDirty ? (
                        <button
                            onClick={handleSave}
                            className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition-colors"
                        >
                            <Check className="h-3 w-3" />
                            Salvar
                        </button>
                    ) : updateCard.isSuccess ? (
                        <div className="flex items-center gap-1 text-xs text-green-600">
                            <Check className="h-3 w-3" />
                            Salvo
                        </div>
                    ) : null}
                </div>

                <div className="flex gap-4 overflow-x-auto pb-1 scrollbar-hide">
                    {/* SDR Tab */}
                    {visibleLegacyPhases.sdr && (
                        <button
                            onClick={() => {
                                if (isDirty) {
                                    if (confirm('Você tem alterações não salvas. Deseja descartá-las?')) {
                                        setViewMode(SystemPhase.SDR)
                                    }
                                } else {
                                    setViewMode(SystemPhase.SDR)
                                }
                            }}
                            className={cn(
                                "pb-2 text-xs font-medium border-b-2 transition-colors px-1 flex items-center gap-1.5 whitespace-nowrap",
                                viewMode === SystemPhase.SDR
                                    ? "border-blue-500 text-blue-600"
                                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                            )}
                        >
                            <Tag className="h-3.5 w-3.5" />
                            SDR
                        </button>
                    )}

                    {/* Planner Tab */}
                    {visibleLegacyPhases.planner && (
                        <button
                            onClick={() => {
                                if (isDirty) {
                                    if (confirm('Você tem alterações não salvas. Deseja descartá-las?')) {
                                        setViewMode(SystemPhase.PLANNER)
                                    }
                                } else {
                                    setViewMode(SystemPhase.PLANNER)
                                }
                            }}
                            className={cn(
                                "pb-2 text-xs font-medium border-b-2 transition-colors px-1 flex items-center gap-1.5 whitespace-nowrap",
                                viewMode === SystemPhase.PLANNER
                                    ? "border-purple-500 text-purple-600"
                                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                            )}
                        >
                            <Plane className="h-3.5 w-3.5" />
                            Planner
                        </button>
                    )}

                    {/* Pós-Venda Tab */}
                    {visibleLegacyPhases.posVenda && (
                        <button
                            onClick={() => {
                                if (isDirty) {
                                    if (confirm('Você tem alterações não salvas. Deseja descartá-las?')) {
                                        setViewMode(SystemPhase.POS_VENDA)
                                    }
                                } else {
                                    setViewMode(SystemPhase.POS_VENDA)
                                }
                            }}
                            className={cn(
                                "pb-2 text-xs font-medium border-b-2 transition-colors px-1 flex items-center gap-1.5 whitespace-nowrap",
                                viewMode === SystemPhase.POS_VENDA
                                    ? "border-green-500 text-green-600"
                                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                            )}
                        >
                            <FileCheck className="h-3.5 w-3.5" />
                            Pós-Venda
                        </button>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="p-2" onKeyDown={handleKeyDown}>
                {loadingConfig ? (
                    <div className="flex justify-center py-6">
                        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    </div>
                ) : fields.length === 0 ? (
                    <div className="text-center py-4">
                        <p className="text-sm text-gray-500 italic">
                            Nenhum campo configurado para "Informações Importantes".
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                            Configure os campos no Painel Admin → Governança de Dados → Seção "Informações Importantes".
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-2 gap-y-1.5">
                        {fields.map((field, index) => {
                            // Determine if field should be full width
                            const isFullWidth = ['textarea', 'multiselect', 'checklist', 'json', 'destinos'].includes(field.type) || field.key === 'destinos'

                            // Cycle through colors by index for visual variety
                            const dotColors = ['bg-blue-500', 'bg-indigo-500', 'bg-purple-500', 'bg-teal-500', 'bg-emerald-500', 'bg-orange-500', 'bg-pink-500']
                            const dotColor = dotColors[index % dotColors.length]

                            return (
                                <div
                                    key={field.key}
                                    className={cn(
                                        "space-y-1",
                                        isFullWidth ? "col-span-1 md:col-span-2" : "col-span-1"
                                    )}
                                >
                                    <label className="flex items-center gap-1.5 mb-0.5 text-[11px] font-semibold text-gray-700 uppercase tracking-wide">
                                        <div className={cn("w-1 h-1 rounded-full flex-shrink-0", dotColor)} />
                                        {field.label}
                                        {/* Lock Button - Sempre visível ao lado do nome */}
                                        <FieldLockButton
                                            fieldKey={field.key}
                                            cardId={card.id}
                                            size="sm"
                                        />
                                    </label>
                                    {renderFieldInput(field)}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
