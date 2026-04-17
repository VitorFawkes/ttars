import { useState, useCallback, useMemo } from 'react'
import { Tag, Check, Plane, FileCheck, Loader2, X, ChevronDown, ChevronUp } from 'lucide-react'
import { SectionCollapseToggle } from './DynamicSectionWidget'

import { supabase } from '../../lib/supabase'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '../../lib/utils'
import { useStageRequirements } from '../../hooks/useStageRequirements'
import { useFieldConfig } from '../../hooks/useFieldConfig'
import { usePipelinePhases } from '../../hooks/usePipelinePhases'
import { usePipelineStages } from '../../hooks/usePipelineStages'
import { useCurrentProductMeta } from '../../hooks/useCurrentProductMeta'
import { SystemPhase } from '../../types/pipeline'
import UniversalFieldRenderer from '../fields/UniversalFieldRenderer'
import { useFieldLock } from '../../hooks/useFieldLock'

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
    /** Collapse support — passed by CollapsibleWidgetSection */
    isExpanded?: boolean
    onToggleCollapse?: () => void
    /** When set, locks to this phase (no tabs, no header — parent handles title) */
    lockedPhaseSlug?: string
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
}

function EditModal({ isOpen, onClose, onSave, title, children, isSaving }: EditModalProps) {
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
                className="relative z-50 w-full max-w-md mx-4 rounded-xl shadow-2xl border overflow-hidden animate-in zoom-in-95 fade-in-0 duration-200 bg-white border-gray-200"
                onKeyDown={handleKeyDown}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50/50 border-gray-200">
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
                <div className="flex items-center justify-end gap-2 px-4 py-3 border-t bg-gray-50/30 border-gray-200">
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onSave}
                        disabled={isSaving}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-lg transition-colors bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400"
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

export default function TripInformation({ card, isExpanded: _isExpanded, onToggleCollapse, lockedPhaseSlug }: TripInformationProps) {
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
    const { setLocked } = useFieldLock(card.id)
    const { pipelineId } = useCurrentProductMeta()
    const { data: phases } = usePipelinePhases(pipelineId)
    const { data: stages } = usePipelineStages(pipelineId)

    // Derive current phase from card stage (used when no lockedPhaseSlug)
    const derivedViewMode = useMemo(() => {
        if (lockedPhaseSlug) return lockedPhaseSlug
        if (!phases || !stages) return SystemPhase.SDR
        const currentStage = stages.find(s => s.id === card.pipeline_stage_id)
        const currentPhase = phases.find(p => p.id === currentStage?.phase_id)
        if (currentPhase && currentPhase.slug && currentPhase.visible_in_card !== false) {
            return currentPhase.slug
        }
        const sdrPhase = phases.find(p => p.slug === SystemPhase.SDR)
        return (sdrPhase && sdrPhase.slug) ? sdrPhase.slug : SystemPhase.SDR
    }, [card.pipeline_stage_id, phases, stages, lockedPhaseSlug])

    const [viewMode, setViewMode] = useState<ViewMode>(derivedViewMode)

    // Edit modal state
    const [editingField, setEditingField] = useState<string | null>(null)
    const [editValue, setEditValue] = useState<unknown>(null)

    // Sync viewMode when card changes stage or lockedPhaseSlug changes
    const [prevDerivedMode, setPrevDerivedMode] = useState(derivedViewMode)
    if (prevDerivedMode !== derivedViewMode) {
        setPrevDerivedMode(derivedViewMode)
        setViewMode(derivedViewMode)
    }

    // Determine the relevant stage ID for the current viewMode (tab)
    const viewModeStageId = useMemo(() => {
        if (!phases || !stages) return card.pipeline_stage_id

        const currentPhase = phases.find(p => p.slug === viewMode)
        if (!currentPhase) return card.pipeline_stage_id

        const phaseStages = stages.filter(s =>
            s.phase_id === currentPhase.id ||
            (!s.phase_id && s.fase === currentPhase.name)
        )

        if (phaseStages.length > 0) {
            return phaseStages[phaseStages.length - 1].id
        }

        return card.pipeline_stage_id
    }, [viewMode, phases, stages, card.pipeline_stage_id])

    // --- Visible fields for trip_info section (per tab) ---
    const visibleFields = useMemo(() => {
        const targetStageId = viewModeStageId || card.pipeline_stage_id
        if (!targetStageId) return []
        return getVisibleFields(targetStageId, 'trip_info')
    }, [viewModeStageId, card.pipeline_stage_id, getVisibleFields])

    // Split fields into primary and secondary
    const primaryFields = useMemo(() => visibleFields.filter(f => !f.isSecondary), [visibleFields])
    const secondaryFields = useMemo(() => visibleFields.filter(f => f.isSecondary), [visibleFields])
    const [showSecondary, setShowSecondary] = useState(false)

    // Determine which data to display/edit based on ViewMode
    const activeData: TripsProdutoData = viewMode === SystemPhase.SDR ? briefingData : productData

    // --- Mutation ---
    const updateCardMutation = useMutation({
        mutationFn: async ({ fieldKey, fieldValue }: { fieldKey: string, fieldValue: unknown }) => {
            const target = viewMode === SystemPhase.SDR ? 'briefing_inicial' : 'produto_data'
            const baseData = target === 'briefing_inicial' ? briefingData : productData

            // Special handling: numero_venda_monde returns { primary, historico }
            let newData: Record<string, unknown>
            if (fieldKey === 'numero_venda_monde' && typeof fieldValue === 'object' && fieldValue !== null && 'primary' in fieldValue && 'historico' in fieldValue) {
                const mondeResult = fieldValue as { primary: string | null, historico: unknown[] }
                newData = {
                    ...baseData,
                    numero_venda_monde: mondeResult.primary,
                    numeros_venda_monde_historico: mondeResult.historico
                }
            } else {
                newData = { ...baseData, [fieldKey]: fieldValue }
            }

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

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const epoca = data.epoca_viagem as any
                if (epoca) {
                    if ('tipo' in epoca) {
                        // Legado flexible_date
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
                    } else if (epoca.start || epoca.end) {
                        // Novo formato date_range {start, end}
                        updates.epoca_tipo = 'data_exata'
                        updates.data_viagem_inicio = epoca.start || null
                        updates.data_viagem_fim = epoca.end || null
                        updates.epoca_mes_inicio = null
                        updates.epoca_mes_fim = null
                        updates.epoca_ano = null
                    } else if (epoca.inicio || epoca.fim) {
                        // Legado {inicio, fim}
                        updates.data_viagem_inicio = epoca.inicio || null
                        updates.data_viagem_fim = epoca.fim || null
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
                const isSdr = sdrPhase && currentStage?.phase_id === sdrPhase.id

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
            // Auto-lock data_exata_da_viagem quando editado manualmente
            if (editingField === 'data_exata_da_viagem') {
                setLocked('data_exata_da_viagem', true)
            }
        } catch (error) {
            console.error('Failed to save field:', error)
        }
    }, [editingField, editValue, updateCardMutation, setLocked])

    const switchViewMode = (slug: string) => {
        setViewMode(slug)
        setEditingField(null)
    }

    const getFieldStatus = (dataKey: string): 'ok' | 'blocking' | 'attention' => {
        const isBlocking = missingBlocking.some(req => {
            if ('field_key' in req) return req.field_key === dataKey
            return false
        })
        return isBlocking ? 'blocking' : 'ok'
    }

    // Get the field being edited
    const editingFieldConfig = editingField ? visibleFields.find(f => f.key === editingField) : null

    // --- Helper: render field grid with secondary support ---
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const renderFieldsGrid = (fieldList: any[]) => (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {fieldList.map(field => {
                const status = getFieldStatus(field.key)
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
                        onEdit={() => handleFieldEdit(field.key)}
                        cardId={card.id}
                        showLockButton
                        extraData={
                            field.key === 'numero_venda_monde' ? activeData :
                            (field.key === 'data_exata_da_viagem' || field.key === 'epoca_viagem')
                                ? { produto_data: activeData, onFieldSave: (key: string, val: unknown) => updateCardMutation.mutate({ fieldKey: key, fieldValue: val }) }
                                : undefined
                        }
                    />
                )
            })}
        </div>
    )

    const renderSecondaryToggle = () => {
        if (secondaryFields.length === 0) return null
        return (
            <>
                <button
                    onClick={() => setShowSecondary(prev => !prev)}
                    className="flex items-center gap-1.5 mt-2 px-1 py-1 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors w-full"
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
                        {renderFieldsGrid(secondaryFields)}
                    </div>
                )}
            </>
        )
    }

    // --- RENDER ---

    // When locked to a phase, render with header but no tabs
    if (lockedPhaseSlug) {
        const lockedPhase = phases?.find(p => p.slug === lockedPhaseSlug)
        const phaseLabel = lockedPhase?.label || lockedPhase?.name || lockedPhaseSlug

        // Map phase.color (e.g. "bg-blue-500") to header color variants
        // Using explicit classes so Tailwind doesn't purge them
        const PHASE_COLOR_MAP: Record<string, { bg: string, border: string, text: string, dot: string }> = {
            'bg-blue-500':   { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   dot: 'bg-blue-500' },
            'bg-purple-500': { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', dot: 'bg-purple-500' },
            'bg-green-500':  { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700',  dot: 'bg-green-500' },
            'bg-red-500':    { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700',    dot: 'bg-red-500' },
            'bg-indigo-500': { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', dot: 'bg-indigo-500' },
            'bg-teal-500':   { bg: 'bg-teal-50',   border: 'border-teal-200',   text: 'text-teal-700',   dot: 'bg-teal-500' },
            'bg-orange-500': { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', dot: 'bg-orange-500' },
            'bg-pink-500':   { bg: 'bg-pink-50',   border: 'border-pink-200',   text: 'text-pink-700',   dot: 'bg-pink-500' },
        }
        const phaseColor = lockedPhase?.color || 'bg-gray-500'
        const colors = PHASE_COLOR_MAP[phaseColor] || { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', dot: 'bg-gray-500' }
        const { bg: headerBg, border: headerBorder, text: titleColor, dot: dotColor } = colors

        return (
            <div className={cn("rounded-xl border bg-white shadow-sm overflow-hidden transition-all duration-500", headerBorder)}>
                {/* HEADER — colored by phase */}
                <div className={cn("border-b px-3 py-2", headerBorder, headerBg)}>
                    <div
                        className={cn("flex items-center justify-between", onToggleCollapse && "cursor-pointer")}
                        onClick={onToggleCollapse}
                    >
                        <h3 className={cn("text-xs font-semibold flex items-center gap-2", titleColor)}>
                            <div className={cn("w-2 h-2 rounded-full", dotColor)} />
                            Informações Viagem — {phaseLabel}
                        </h3>

                        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                            {onToggleCollapse && (
                                <SectionCollapseToggle isExpanded={_isExpanded ?? true} onToggle={onToggleCollapse} />
                            )}
                        </div>
                    </div>
                </div>

                {/* CONTENT */}
                <div className="p-3">
                    {visibleFields.length === 0 && (
                        <div className="text-center py-8 text-gray-500 italic">
                            Nenhum campo configurado para esta fase.
                            <br />
                            <span className="text-xs">Configure na Matriz de Governança (Seção: Informações da Viagem).</span>
                        </div>
                    )}

                    {renderFieldsGrid(primaryFields)}
                    {renderSecondaryToggle()}
                </div>

                <EditModal
                    isOpen={!!editingFieldConfig}
                    onClose={handleCloseModal}
                    onSave={handleFieldSave}
                    title={editingFieldConfig?.label || ''}
                    isSaving={updateCardMutation.isPending}
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
                            extraData={editingFieldConfig.key === 'numero_venda_monde'
                                ? (typeof editValue === 'object' && editValue !== null && 'historico' in (editValue as Record<string, unknown>)
                                    ? { ...activeData, numeros_venda_monde_historico: (editValue as { historico: unknown[] }).historico }
                                    : activeData)
                                : undefined
                            }
                        />
                    )}
                </EditModal>
            </div>
        )
    }

    // --- RENDER with tabs (legacy, when no lockedPhaseSlug) ---
    return (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden transition-all duration-500">

            {/* HEADER + TABS */}
            <div className="border-b border-gray-200 bg-gray-50/50 px-3 pt-2">
                {/* Title row — clickable to collapse/expand */}
                <div
                    className={cn("flex items-center justify-between mb-1", onToggleCollapse && "cursor-pointer")}
                    onClick={onToggleCollapse}
                >
                    <h3 className="text-xs font-semibold text-gray-900 flex items-center gap-2">
                        Informações da Viagem
                    </h3>

                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        {onToggleCollapse && (
                            <SectionCollapseToggle isExpanded={_isExpanded ?? true} onToggle={onToggleCollapse} />
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
            <div className="p-3">
                {visibleFields.length === 0 && (
                    <div className="text-center py-8 text-gray-500 italic">
                        Nenhum campo configurado para esta fase.
                        <br />
                        <span className="text-xs">Configure na Matriz de Governança (Seção: Informações da Viagem).</span>
                    </div>
                )}

                {renderFieldsGrid(primaryFields)}
                {renderSecondaryToggle()}
            </div>

            {/* EDIT MODAL */}
            <EditModal
                isOpen={!!editingFieldConfig}
                onClose={handleCloseModal}
                onSave={handleFieldSave}
                title={editingFieldConfig?.label || ''}
                isSaving={updateCardMutation.isPending}
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
                        extraData={editingFieldConfig.key === 'numero_venda_monde'
                            ? (typeof editValue === 'object' && editValue !== null && 'historico' in (editValue as Record<string, unknown>)
                                ? { ...activeData, numeros_venda_monde_historico: (editValue as { historico: unknown[] }).historico }
                                : activeData)
                            : undefined
                        }
                    />
                )}
            </EditModal>
        </div>
    )
}
