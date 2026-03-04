import { useState, useCallback, useMemo } from 'react'
import { Tag, Check, History, Plane, FileCheck, Loader2 } from 'lucide-react'

import { supabase } from '../../lib/supabase'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '../../lib/utils'
import { useStageRequirements } from '../../hooks/useStageRequirements'
import { useFieldConfig } from '../../hooks/useFieldConfig'
import { usePipelinePhases } from '../../hooks/usePipelinePhases'
import { usePipelineStages } from '../../hooks/usePipelineStages'
import { SystemPhase } from '../../types/pipeline'
import UniversalFieldRenderer from '../fields/UniversalFieldRenderer'
import { FieldLockButton } from './FieldLockButton'

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

// Full-width field types that should span both columns
const FULL_WIDTH_TYPES = ['textarea', 'multiselect', 'checklist', 'json']
const FULL_WIDTH_KEYS = ['destinos']

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
    const [editedData, setEditedData] = useState<TripsProdutoData>({})
    const [lastSavedData, setLastSavedData] = useState<TripsProdutoData>({})
    const [isDirty, setIsDirty] = useState(false)
    const [correctionMode, setCorrectionMode] = useState(false)

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
    const activeData = (viewMode === SystemPhase.SDR || correctionMode) ? briefingData : productData

    // Sync local state when activeData changes (render-time pattern)
    const [prevActiveDataStr, setPrevActiveDataStr] = useState('')
    const activeDataStr = JSON.stringify(activeData)
    if (prevActiveDataStr !== activeDataStr) {
        setPrevActiveDataStr(activeDataStr)
        setEditedData(activeData)
        setLastSavedData(activeData)
        setIsDirty(false)
    }

    // --- Mutation ---
    const updateCardMutation = useMutation({
        mutationFn: async ({ newData, target }: { newData: TripsProdutoData, target: 'produto_data' | 'briefing_inicial' }) => {
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
            setLastSavedData(editedData)
            setIsDirty(false)
        }
    })

    // --- Handlers ---
    const handleSave = async () => {
        if (!isDirty) return
        const target = (correctionMode || viewMode === SystemPhase.SDR) ? 'briefing_inicial' : 'produto_data'
        try {
            await updateCardMutation.mutateAsync({ newData: editedData, target })
        } catch (error) {
            console.error('Failed to save trip info:', error)
        }
    }

    const handleChange = useCallback((key: string, value: unknown) => {
        setEditedData(prev => {
            const next = { ...prev, [key]: value }
            setIsDirty(JSON.stringify(next) !== JSON.stringify(lastSavedData))
            return next
        })
    }, [lastSavedData])

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
            e.preventDefault()
            handleSave()
        }
    }

    const switchViewMode = (slug: string) => {
        if (isDirty) {
            if (!confirm('Você tem alterações não salvas. Deseja descartá-las?')) return
        }
        setViewMode(slug)
        setCorrectionMode(false)
    }

    const toggleCorrectionMode = () => {
        if (isDirty && correctionMode) {
            if (!confirm('Você tem alterações não salvas. Deseja descartá-las?')) return
        }
        setCorrectionMode(!correctionMode)
    }

    const getFieldStatus = (dataKey: string) => {
        if (correctionMode) return 'ok'
        const isBlocking = missingBlocking.some(req => {
            if ('field_key' in req) return req.field_key === dataKey
            return false
        })
        return isBlocking ? 'blocking' : 'ok'
    }

    const formatFieldDisplayValue = (value: unknown): string => {
        if (value === null || value === undefined || value === '') return 'Não informado'
        if (Array.isArray(value)) return value.join(', ')
        if (typeof value === 'object') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((value as any).display) return (value as any).display
            return JSON.stringify(value)
        }
        return String(value)
    }

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

                        {/* Save Button */}
                        {updateCardMutation.isPending ? (
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
                        ) : updateCardMutation.isSuccess ? (
                            <div className="flex items-center gap-1 text-xs text-green-600">
                                <Check className="h-3 w-3" />
                                Salvo
                            </div>
                        ) : null}
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

            {/* CONTENT — INLINE EDIT */}
            <div
                className={cn("p-2", correctionMode && "bg-[#fffbf7]")}
                onKeyDown={handleKeyDown}
            >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {visibleFields.length === 0 && (
                        <div className="col-span-full text-center py-8 text-gray-500 italic">
                            Nenhum campo configurado para esta fase.
                            <br />
                            <span className="text-xs">Configure na Matriz de Governança (Seção: Informações da Viagem).</span>
                        </div>
                    )}

                    {visibleFields.map(field => {
                        const status = getFieldStatus(field.key)
                        const blocking = status === 'blocking'
                        const isFullWidth = FULL_WIDTH_TYPES.includes(field.type) || FULL_WIDTH_KEYS.includes(field.key)

                        return (
                            <div
                                key={field.key}
                                className={cn(
                                    "space-y-1",
                                    isFullWidth && "col-span-1 sm:col-span-2"
                                )}
                            >
                                {/* Label + status + lock */}
                                <label className={cn(
                                    "flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide",
                                    blocking ? "text-red-700" : "text-gray-700"
                                )}>
                                    <div className={cn(
                                        "w-1 h-1 rounded-full flex-shrink-0",
                                        blocking ? "bg-red-500" : "bg-gray-400"
                                    )} />
                                    {field.label}
                                    {blocking && (
                                        <span className="text-[10px] text-red-600 font-bold bg-red-50 px-1.5 py-0.5 rounded-full">
                                            Obrigatório
                                        </span>
                                    )}
                                    {!correctionMode && (
                                        <FieldLockButton
                                            fieldKey={field.key}
                                            cardId={card.id}
                                            size="sm"
                                        />
                                    )}
                                </label>

                                {/* SDR Original Reference (Planner mode only) */}
                                {viewMode === SystemPhase.PLANNER && !correctionMode && briefingData[field.key] != null && (
                                    <div className="text-[10px] text-gray-500 bg-gray-50 px-2 py-1 rounded border border-gray-100">
                                        <span className="font-bold uppercase tracking-wider text-gray-400">Original SDR: </span>
                                        {formatFieldDisplayValue(briefingData[field.key])}
                                    </div>
                                )}

                                {/* Inline Edit Field */}
                                <UniversalFieldRenderer
                                    field={{
                                        key: field.key,
                                        label: field.label,
                                        type: field.type,
                                        options: field.options
                                    }}
                                    value={editedData[field.key]}
                                    mode="edit"
                                    onChange={(val) => handleChange(field.key, val)}
                                />
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
