import { useState, useCallback, useMemo } from 'react'
import { Tag, Check, History, Plane, FileCheck, Loader2, X } from 'lucide-react'

import { supabase } from '../../lib/supabase'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '../../lib/utils'
import { useStageRequirements } from '../../hooks/useStageRequirements'
import { useFieldConfig } from '../../hooks/useFieldConfig'
import { usePipelinePhases } from '../../hooks/usePipelinePhases'
import { usePipelineStages } from '../../hooks/usePipelineStages'
import { SystemPhase } from '../../types/pipeline'
import UniversalFieldRenderer from '../fields/UniversalFieldRenderer'

import type { EpocaViagem } from '../pipeline/fields/FlexibleDateField'
import type { DuracaoViagem } from '../pipeline/fields/FlexibleDurationField'
import type { OrcamentoViagem } from '../pipeline/fields/SmartBudgetField'

interface TripsProdutoData {
    orcamento?: OrcamentoViagem | {
        total?: number
        por_pessoa?: number
    }
    epoca_viagem?: EpocaViagem | {
        inicio?: string
        fim?: string
        flexivel?: boolean
    }
    duracao_viagem?: DuracaoViagem
    destinos?: string[]
    origem?: string
    origem_lead?: string
    motivo?: string
    taxa_planejamento?: string | number
    quantidade_viajantes?: number
    [key: string]: unknown
}

interface TripInformationProps {
    card: {
        id: string
        fase?: string | null
        pipeline_stage_id?: string | null
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        briefing_inicial?: any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        marketing_data?: any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        produto_data?: any
        [key: string]: unknown
    }
}

type ViewMode = string

const EMPTY_OBJECT = {}

// ═══════════════════════════════════════════════════════════
// EditModal — popup de edição individual por campo
// ═══════════════════════════════════════════════════════════

interface EditModalProps {
    isOpen: boolean
    onClose: () => void
    onSave: () => void
    title: string
    children: React.ReactNode
    isSaving: boolean
    isCorrection: boolean
}

function EditModal({ isOpen, onClose, onSave, title, children, isSaving, isCorrection }: EditModalProps) {
    if (!isOpen) return null

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
            e.preventDefault()
            onSave()
        }
        if (e.key === 'Escape') {
            onClose()
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in-0">
            <div className="fixed inset-0" onClick={onClose} />
            <div
                className={cn(
                    "relative z-50 w-full max-w-md mx-4 rounded-xl shadow-2xl border overflow-hidden animate-in zoom-in-95 fade-in-0 duration-200",
                    isCorrection ? "bg-[#fffdf9] border-amber-200" : "bg-white border-gray-200"
                )}
                onKeyDown={handleKeyDown}
            >
                {/* Header */}
                <div className={cn(
                    "flex items-center justify-between px-4 py-3 border-b",
                    isCorrection ? "bg-amber-50/50 border-amber-200" : "bg-gray-50/50 border-gray-200"
                )}>
                    <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                        <X className="h-4 w-4 text-gray-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4">
                    {children}
                </div>

                {/* Footer */}
                <div className={cn(
                    "flex items-center justify-end gap-2 px-4 py-3 border-t",
                    isCorrection ? "bg-amber-50/30 border-amber-200" : "bg-gray-50/30 border-gray-200"
                )}>
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onSave}
                        disabled={isSaving}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-lg transition-colors",
                            isCorrection
                                ? "bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400"
                                : "bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400"
                        )}
                    >
                        {isSaving ? (
                            <>
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Salvando...
                            </>
                        ) : (
                            <>
                                <Check className="h-3 w-3" />
                                Salvar
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ═══════════════════════════════════════════════════════════
// TripInformation — display cards + popup edit
// ═══════════════════════════════════════════════════════════

export default function TripInformation({ card }: TripInformationProps) {
    const productData = useMemo(() => {
        if (typeof card.produto_data === 'string') {
            try {
                return JSON.parse(card.produto_data)
            } catch (e) {
                console.error('Failed to parse produto_data', e)
                return {}
            }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (card.produto_data as any) || EMPTY_OBJECT
    }, [card.produto_data])

    const briefingData = useMemo(() => {
        if (typeof card.briefing_inicial === 'string') {
            try {
                return JSON.parse(card.briefing_inicial)
            } catch (e) {
                console.error('Failed to parse briefing_inicial', e)
                return {}
            }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (card.briefing_inicial as any) || EMPTY_OBJECT
    }, [card.briefing_inicial])

    const queryClient = useQueryClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { missingBlocking } = useStageRequirements(card as any)
    const { getVisibleFields } = useFieldConfig()
    const { data: phases } = usePipelinePhases()
    const { data: stages } = usePipelineStages()

    // Derive current phase from card stage (must be before viewMode useState)
    const derivedViewMode = useMemo(() => {
        if (!phases || !stages) return SystemPhase.SDR
        const currentStage = stages.find(s => s.id === card.pipeline_stage_id)
        const phaseName = currentStage?.fase
        const currentPhase = phases.find(p => p.name === phaseName)
        if (currentPhase && currentPhase.slug && currentPhase.visible_in_card !== false) {
            return currentPhase.slug
        }
        const sdrPhase = phases.find(p => p.slug === SystemPhase.SDR)
        return (sdrPhase && sdrPhase.slug) ? sdrPhase.slug : SystemPhase.SDR
    }, [card.pipeline_stage_id, phases, stages])

    const [viewMode, setViewMode] = useState<ViewMode>(derivedViewMode)
    const [correctionMode, setCorrectionMode] = useState(false)

    // Edit modal state
    const [editingField, setEditingField] = useState<string | null>(null)
    const [editValue, setEditValue] = useState<unknown>(null)

    // Sync viewMode when card changes stage (render-time pattern)
    const [prevDerivedMode, setPrevDerivedMode] = useState(derivedViewMode)
    if (prevDerivedMode !== derivedViewMode) {
        setPrevDerivedMode(derivedViewMode)
        setViewMode(derivedViewMode)
    }

    // --- Visible fields for trip_info section ---
    const visibleFields = useMemo(() => {
        if (!card.pipeline_stage_id) return []
        return getVisibleFields(card.pipeline_stage_id!, 'trip_info')
    }, [card.pipeline_stage_id, getVisibleFields])

    // Determine which data to display/edit based on ViewMode and CorrectionMode
    const activeData: TripsProdutoData = (viewMode === SystemPhase.SDR || correctionMode) ? briefingData : productData

    // --- Mutation ---
    const updateCardMutation = useMutation({
        mutationFn: async ({ fieldKey, fieldValue }: { fieldKey: string, fieldValue: unknown }) => {
            const target = (correctionMode || viewMode === SystemPhase.SDR) ? 'briefing_inicial' : 'produto_data'
            const baseData = target === 'briefing_inicial' ? briefingData : productData
            const newData = { ...baseData, [fieldKey]: fieldValue }

            const updates: Record<string, unknown> = { [target]: newData }

            const syncNormalizedColumns = (data: TripsProdutoData) => {
                const orcamento = data.orcamento as OrcamentoViagem | undefined
                if (orcamento) {
                    if ('total_calculado' in orcamento && orcamento.total_calculado) {
                        updates.valor_estimado = orcamento.total_calculado
                    } else if ('total' in orcamento && orcamento.total) {
                        updates.valor_estimado = orcamento.total
                    } else if ('valor' in orcamento && orcamento.tipo === 'total' && orcamento.valor) {
                        updates.valor_estimado = orcamento.valor
                    }
                }

                const epoca = data.epoca_viagem as EpocaViagem | undefined
                if (epoca) {
                    if ('tipo' in epoca) {
                        updates.epoca_tipo = epoca.tipo
                        updates.epoca_mes_inicio = epoca.mes_inicio || null
                        updates.epoca_mes_fim = epoca.mes_fim || null
                        updates.epoca_ano = epoca.ano || null
                        if (epoca.tipo === 'data_exata') {
                            updates.data_viagem_inicio = epoca.data_inicio || null
                            updates.data_viagem_fim = epoca.data_fim || null
                        } else {
                            updates.data_viagem_inicio = null
                            updates.data_viagem_fim = null
                        }
                    } else {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const legacy = epoca as any
                        if (legacy.inicio || legacy.fim) {
                            updates.data_viagem_inicio = legacy.inicio || null
                            updates.data_viagem_fim = legacy.fim || null
                        }
                    }
                }

                const duracao = data.duracao_viagem as DuracaoViagem | undefined
                if (duracao) {
                    updates.duracao_dias_min = duracao.dias_min || null
                    updates.duracao_dias_max = duracao.dias_max || null
                }
            }

            if (target === 'produto_data') {
                syncNormalizedColumns(newData)
            } else if (target === 'briefing_inicial') {
                const sdrPhase = phases?.find(p => p.slug === SystemPhase.SDR)
                const currentStage = stages?.find(s => s.id === card.pipeline_stage_id)
                const isSdr = sdrPhase && currentStage?.fase === sdrPhase.name

                if (isSdr) {
                    updates.produto_data = newData
                    syncNormalizedColumns(newData)
                }
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase.from('cards') as any)
                .update(updates)
                .eq('id', card.id!)

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['card-detail', card.id] })
            queryClient.invalidateQueries({ queryKey: ['card', card.id] })
            setEditingField(null)
            setEditValue(null)
        }
    })

    // --- Handlers ---
    const handleFieldEdit = useCallback((fieldKey: string) => {
        setEditingField(fieldKey)
        setEditValue(activeData[fieldKey] ?? null)
    }, [activeData])

    const handleCloseModal = useCallback(() => {
        setEditingField(null)
        setEditValue(null)
    }, [])

    const handleFieldSave = useCallback(async () => {
        if (!editingField) return
        try {
            await updateCardMutation.mutateAsync({ fieldKey: editingField, fieldValue: editValue })
        } catch (error) {
            console.error('Failed to save field:', error)
        }
    }, [editingField, editValue, updateCardMutation])

    const switchViewMode = (slug: string) => {
        setViewMode(slug)
        setCorrectionMode(false)
        setEditingField(null)
    }

    const toggleCorrectionMode = () => {
        setCorrectionMode(!correctionMode)
        setEditingField(null)
    }

    const getFieldStatus = (dataKey: string): 'ok' | 'blocking' | 'attention' => {
        if (correctionMode) return 'ok'
        const isBlocking = missingBlocking.some(req => {
            if ('field_key' in req) return req.field_key === dataKey
            return false
        })
        return isBlocking ? 'blocking' : 'ok'
    }

    // Get the field being edited
    const editingFieldConfig = editingField ? visibleFields.find(f => f.key === editingField) : null

    // --- RENDER ---
    return (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden transition-all duration-500">

            {/* HEADER + TABS */}
            <div className="border-b border-gray-200 bg-gray-50/50 px-3 pt-2">
                <div className="flex items-center justify-between mb-1">
                    <h3 className="text-xs font-semibold text-gray-900 flex items-center gap-2">
                        Informações da Viagem
                    </h3>

                    <div className="flex items-center gap-2">
                        {/* Correction Toggle */}
                        {(viewMode === SystemPhase.SDR || viewMode === SystemPhase.PLANNER) && (
                            <button
                                onClick={toggleCorrectionMode}
                                className={cn(
                                    "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border shadow-sm",
                                    correctionMode
                                        ? "bg-amber-50 text-amber-900 border-amber-200 ring-2 ring-amber-100"
                                        : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                                )}
                            >
                                <History className="h-3.5 w-3.5" />
                                {correctionMode ? "Sair da Correção" : "Corrigir Histórico SDR"}
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex gap-4 overflow-x-auto pb-1 scrollbar-hide">
                    {phases?.filter(p => p.active)
                        .filter(p => p.visible_in_card !== false)
                        .slice(0, 6)
                        .map(phase => {
                            const isActive = viewMode === phase.slug
                            const Icon = phase.slug === SystemPhase.SDR ? Tag :
                                phase.slug === SystemPhase.PLANNER ? Plane :
                                    phase.slug === SystemPhase.POS_VENDA ? FileCheck : Tag

                            const activeColorClass = phase.slug === SystemPhase.SDR ? 'border-blue-500 text-blue-600' :
                                phase.slug === SystemPhase.PLANNER ? 'border-purple-500 text-purple-600' :
                                    phase.slug === SystemPhase.POS_VENDA ? 'border-green-500 text-green-600' :
                                        'border-indigo-500 text-indigo-600'

                            return (
                                <button
                                    key={phase.id}
                                    onClick={() => phase.slug && switchViewMode(phase.slug)}
                                    className={cn(
                                        "pb-2 text-xs font-medium border-b-2 transition-colors px-1 flex items-center gap-1.5 whitespace-nowrap",
                                        isActive
                                            ? activeColorClass
                                            : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                    )}
                                >
                                    <Icon className="h-4 w-4" />
                                    {phase.label || phase.name}
                                </button>
                            )
                        })}
                </div>
            </div>

            {/* CONTENT — DISPLAY CARDS */}
            <div className={cn("p-3", correctionMode && "bg-[#fffbf7]")}>
                {visibleFields.length === 0 && (
                    <div className="text-center py-8 text-gray-500 italic">
                        Nenhum campo configurado para esta fase.
                        <br />
                        <span className="text-xs">Configure na Matriz de Governança (Seção: Informações da Viagem).</span>
                    </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {visibleFields.map(field => {
                        const status = getFieldStatus(field.key)
                        const isPlanner = viewMode === SystemPhase.PLANNER && !correctionMode

                        return (
                            <UniversalFieldRenderer
                                key={field.key}
                                field={{
                                    key: field.key,
                                    label: field.label,
                                    type: field.type,
                                    options: field.options
                                }}
                                value={activeData[field.key]}
                                mode="display"
                                status={status}
                                sdrValue={isPlanner ? briefingData[field.key] : undefined}
                                onEdit={() => handleFieldEdit(field.key)}
                                correctionMode={correctionMode}
                                isPlanner={isPlanner}
                                cardId={card.id}
                                showLockButton={!correctionMode}
                            />
                        )
                    })}
                </div>
            </div>

            {/* EDIT MODAL */}
            <EditModal
                isOpen={!!editingFieldConfig}
                onClose={handleCloseModal}
                onSave={handleFieldSave}
                title={editingFieldConfig?.label || ''}
                isSaving={updateCardMutation.isPending}
                isCorrection={correctionMode}
            >
                {editingFieldConfig && (
                    <UniversalFieldRenderer
                        field={{
                            key: editingFieldConfig.key,
                            label: editingFieldConfig.label,
                            type: editingFieldConfig.type,
                            options: editingFieldConfig.options
                        }}
                        value={editValue}
                        mode="edit"
                        onChange={(val) => setEditValue(val)}
                    />
                )}
            </EditModal>
        </div>
    )
}
