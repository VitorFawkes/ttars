import { useState, useCallback, useMemo } from 'react'
import { AlertTriangle, Check, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { SectionCollapseToggle } from './DynamicSectionWidget'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../database.types'
import { cn } from '../../lib/utils'
import { usePipelinePhases } from '../../hooks/usePipelinePhases'
import { usePipelineStages } from '../../hooks/usePipelineStages'
import { useCurrentProductMeta } from '../../hooks/useCurrentProductMeta'
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
    /** Collapse support — passed by CollapsibleWidgetSection */
    isExpanded?: boolean
    onToggleCollapse?: () => void
}

const EMPTY_OBJECT = {}

export default function ObservacoesEstruturadas({ card, isExpanded: _isExpanded, onToggleCollapse }: ObservacoesEstruturadasProps) {
    const queryClient = useQueryClient()
    const { pipelineId } = useCurrentProductMeta()
    const { data: phases } = usePipelinePhases(pipelineId)
    const { data: stages } = usePipelineStages(pipelineId)

    // Data Sources
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const productData = useMemo(() => (card.produto_data as any) || EMPTY_OBJECT, [card.produto_data])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const briefingData = useMemo(() => (card.briefing_inicial as any) || EMPTY_OBJECT, [card.briefing_inicial])

    // Derive current phase from card's actual stage (no tabs — single view)
    const currentPhase = useMemo(() => {
        if (!phases || !stages) return SystemPhase.SDR
        const currentStage = stages.find(s => s.id === card.pipeline_stage_id)
        const phase = phases.find(p => p.id === currentStage?.phase_id)
        return phase?.slug || SystemPhase.SDR
    }, [card.pipeline_stage_id, phases, stages])

    // Determine active data source based on current phase
    const activeData = useMemo(() => {
        switch (currentPhase) {
            case SystemPhase.SDR: return briefingData.observacoes || {}
            case SystemPhase.PLANNER: return productData.observacoes_criticas || {}
            case SystemPhase.POS_VENDA: return productData.observacoes_pos_venda || {}
            default: return productData[currentPhase] || {}
        }
    }, [currentPhase, briefingData, productData])

    // State
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [editedObs, setEditedObs] = useState<any>({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [lastSavedObs, setLastSavedObs] = useState<any>({})
    const [isDirty, setIsDirty] = useState(false)

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

    // Fetch fields based on card's current stage
    const fields = useMemo(() => {
        const targetStageId = card.pipeline_stage_id
        if (!targetStageId) return []
        return getVisibleFields(targetStageId, 'observacoes_criticas')
    }, [card.pipeline_stage_id, getVisibleFields])

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

        if (currentPhase === SystemPhase.SDR) {
            updatePayload = {
                briefing_inicial: {
                    ...briefingData,
                    observacoes: editedObs
                }
            }
        } else if (currentPhase === SystemPhase.PLANNER) {
            updatePayload = {
                produto_data: {
                    ...productData,
                    observacoes_criticas: editedObs
                }
            }
        } else if (currentPhase === SystemPhase.POS_VENDA) {
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
                    [currentPhase]: editedObs
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

    // Split fields into primary and secondary
    const primaryFields = useMemo(() => fields.filter(f => !f.isSecondary), [fields])
    const secondaryFields = useMemo(() => fields.filter(f => f.isSecondary), [fields])
    const [showSecondary, setShowSecondary] = useState(false)

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const renderFieldGrid = (fieldList: any[], startIndex = 0) => (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-2 gap-y-1.5">
            {fieldList.map((field, i) => {
                const index = startIndex + i
                const isFullWidth = ['textarea', 'multiselect', 'checklist', 'json', 'destinos'].includes(field.type) || field.key === 'destinos'
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
    )

    return (
        <div className="rounded-xl border border-gray-300 bg-white shadow-sm overflow-hidden">
            {/* Header — no tabs */}
            <div className="border-b border-gray-200 bg-gray-50/50 px-3 py-2">
                <div
                    className={cn("flex items-center justify-between", onToggleCollapse && "cursor-pointer")}
                    onClick={onToggleCollapse}
                >
                    <div className="flex items-center gap-2">
                        <div className="p-1 bg-red-100 rounded-lg">
                            <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                        </div>
                        <h3 className="text-xs font-semibold text-gray-900">Informações Importantes</h3>
                    </div>

                    <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
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
                        {onToggleCollapse && (
                            <SectionCollapseToggle isExpanded={_isExpanded ?? true} onToggle={onToggleCollapse} />
                        )}
                    </div>
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
                    <>
                        {renderFieldGrid(primaryFields)}

                        {secondaryFields.length > 0 && (
                            <>
                                <button
                                    onClick={() => setShowSecondary(prev => !prev)}
                                    className="flex items-center gap-1.5 mt-2 px-2 py-1 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors w-full"
                                >
                                    {showSecondary ? (
                                        <ChevronUp className="h-3.5 w-3.5" />
                                    ) : (
                                        <ChevronDown className="h-3.5 w-3.5" />
                                    )}
                                    {showSecondary
                                        ? 'Ocultar detalhes'
                                        : `Ver mais ${secondaryFields.length} campo${secondaryFields.length > 1 ? 's' : ''}`
                                    }
                                </button>

                                {showSecondary && (
                                    <div className="mt-1.5 pt-1.5 border-t border-dashed border-gray-200">
                                        {renderFieldGrid(secondaryFields, primaryFields.length)}
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
