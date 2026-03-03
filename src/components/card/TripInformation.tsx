import React, { useState, useEffect, useMemo } from 'react'
import { MapPin, Tag, X, Check, History, AlertTriangle, Eraser, Plane, FileCheck } from 'lucide-react'

import { supabase } from '../../lib/supabase'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '../../lib/utils'
import { useStageRequirements } from '../../hooks/useStageRequirements'
import { useFieldConfig } from '../../hooks/useFieldConfig'
// Marketing is now a regular section rendered via DynamicSectionWidget in CardDetail
import { usePipelinePhases } from '../../hooks/usePipelinePhases'
import { usePipelineStages } from '../../hooks/usePipelineStages'
import { SystemPhase } from '../../types/pipeline'
import UniversalFieldRenderer from '../fields/UniversalFieldRenderer'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { Checkbox } from '../ui/checkbox'

import type { EpocaViagem } from '../pipeline/fields/FlexibleDateField'
import type { DuracaoViagem } from '../pipeline/fields/FlexibleDurationField'
import SmartBudgetField, { type OrcamentoViagem } from '../pipeline/fields/SmartBudgetField'

interface TripsProdutoData {
    // New flexible types
    orcamento?: OrcamentoViagem | {
        // Legacy format support
        total?: number
        por_pessoa?: number
    }
    epoca_viagem?: EpocaViagem | {
        // Legacy format support
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
        // TODO: Define strict Json type matching Supabase
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

interface EditModalProps {
    isOpen: boolean
    onClose: () => void
    onSave: () => void
    title: string
    children: React.ReactNode
    isSaving?: boolean
    isCorrection?: boolean
}

function EditModal({ isOpen, onClose, onSave, title, children, isSaving, isCorrection }: EditModalProps) {
    if (!isOpen) return null

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            const target = e.target as HTMLElement
            if (target.tagName !== 'TEXTAREA' && target.tagName !== 'SELECT') {
                e.preventDefault()
                onSave()
            }
        }
        if (e.key === 'Escape') {
            onClose()
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onKeyDown={handleKeyDown}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className={cn(
                "relative rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden transition-all",
                isCorrection ? "bg-[#fffbf0] border-2 border-amber-200" : "bg-white"
            )}>
                <div className={cn(
                    "flex items-center justify-between px-5 py-4 border-b",
                    isCorrection ? "bg-amber-100/50" : "bg-gradient-to-r from-indigo-50 to-white"
                )}>
                    <div className="flex items-center gap-2">
                        {isCorrection && <AlertTriangle className="h-5 w-5 text-amber-600" />}
                        <h3 className={cn("text-lg font-semibold", isCorrection ? "text-amber-900" : "text-gray-900")}>
                            {title}
                        </h3>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-black/5 transition-colors">
                        <X className="h-5 w-5 text-gray-500" />
                    </button>
                </div>

                {isCorrection && (
                    <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 flex gap-3">
                        <div className="mt-0.5">
                            <History className="h-4 w-4 text-amber-600" />
                        </div>
                        <div className="text-xs text-amber-800">
                            <span className="font-bold block mb-0.5">Modo de Correção Histórica</span>
                            Você está alterando o registro original do SDR. Use isso para corrigir erros de digitação ou informações erradas.
                        </div>
                    </div>
                )}

                <div className="p-5">
                    {children}
                </div>

                <div className={cn("flex items-center justify-end gap-3 px-5 py-4 border-t", isCorrection ? "bg-amber-50/50" : "bg-gray-50")}>
                    <Button variant="outline" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={onSave}
                        disabled={isSaving}
                        className={cn(
                            "flex items-center gap-2",
                            isCorrection ? "bg-amber-600 hover:bg-amber-700" : ""
                        )}
                    >
                        {isSaving ? (
                            <>
                                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                                Salvando...
                            </>
                        ) : (
                            <>
                                {isCorrection ? <Eraser className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                                {isCorrection ? "Corrigir Registro" : "Salvar"}
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    )
}

interface FieldCardProps {
    icon: React.ElementType
    iconColor: string
    label: string
    value: string | number | null | undefined
    fieldName?: string
    dataKey?: string
}

function FieldCard({ icon: Icon, iconColor, label, value }: FieldCardProps) {
    return (
        <div className="p-2.5 bg-gray-50 rounded-lg border border-gray-100">
            <div className="flex items-center gap-1.5 mb-0.5">
                <div className={cn("p-0.5 rounded-md", iconColor)}>
                    <Icon className="h-3 w-3" />
                </div>
                <span className="text-[11px] font-medium text-gray-500 uppercase">{label}</span>
            </div>
            <div className="text-xs font-medium text-gray-900 pl-5">
                {value || '-'}
            </div>
        </div>
    )
}

const EMPTY_OBJECT = {}

export default function TripInformation({ card }: TripInformationProps) {
    // Fix: Use useMemo and a stable empty object to prevent infinite loops
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
    // Marketing data is now accessed via DynamicSectionWidget from produto_data

    const [viewMode, setViewMode] = useState<ViewMode>(SystemPhase.SDR)
    const [editingField, setEditingField] = useState<string | null>(null)
    const [editedData, setEditedData] = useState<TripsProdutoData>(productData)
    const [destinosInput, setDestinosInput] = useState('')
    const [correctionMode, setCorrectionMode] = useState(false)

    const queryClient = useQueryClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { missingBlocking } = useStageRequirements(card as any)
    const { getVisibleFields } = useFieldConfig()
    const { data: phases } = usePipelinePhases()
    const { data: stages } = usePipelineStages()

    // --- MODULARITY: Get all visible fields for 'trip_info' section ---
    const visibleFields = useMemo(() => {
        if (!card.pipeline_stage_id) return []
        // We specifically want 'trip_info' fields for the SDR/Planner view
        return getVisibleFields(card.pipeline_stage_id!, 'trip_info')
    }, [card.pipeline_stage_id, getVisibleFields])

    // Sync ViewMode with Card Stage - FIX: Use pipeline_stage_id to get fase
    // The card object from 'cards' table doesn't have 'fase' field,
    // only the view_cards_acoes has it via join with pipeline_stages
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        if (!phases || !stages) return

        // Find the current stage by pipeline_stage_id
        const currentStage = stages.find(s => s.id === card.pipeline_stage_id)

        // Get the phase name from the stage (this is the correct source)
        const phaseName = currentStage?.fase

        // Find the matching phase
        const currentPhase = phases.find(p => p.name === phaseName)

        // Only switch to current phase if it exists, has a slug, AND is visible
        if (currentPhase && currentPhase.slug && currentPhase.visible_in_card !== false) {
            setViewMode(currentPhase.slug)
        } else {
            // Default to SDR if phase not found or hidden
            const sdrPhase = phases.find(p => p.slug === SystemPhase.SDR)
            if (sdrPhase && sdrPhase.slug) setViewMode(sdrPhase.slug)
        }
    }, [card.pipeline_stage_id, phases, stages])
    /* eslint-enable react-hooks/set-state-in-effect */

    // Determine which data to display/edit based on ViewMode and CorrectionMode
    // SDR View: Shows briefingData (or productData if briefing is empty/synced)
    // Planner View: Shows productData (Proposal) AND briefingData (History)
    const activeData = (viewMode === SystemPhase.SDR || correctionMode) ? briefingData : productData

    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        setEditedData(activeData)
    }, [activeData, viewMode, correctionMode])
    /* eslint-enable react-hooks/set-state-in-effect */

    const updateCardMutation = useMutation({
        mutationFn: async ({ newData, target }: { newData: TripsProdutoData, target: 'produto_data' | 'briefing_inicial' }) => {
            const updates: Record<string, unknown> = { [target]: newData }

            // Helper to sync normalized columns from produto_data
            const syncNormalizedColumns = (data: TripsProdutoData) => {
                // Sync orcamento -> valor_estimado
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

                // Sync epoca_viagem -> normalized columns
                const epoca = data.epoca_viagem as EpocaViagem | undefined
                if (epoca) {
                    if ('tipo' in epoca) {
                        // New format
                        updates.epoca_tipo = epoca.tipo
                        updates.epoca_mes_inicio = epoca.mes_inicio || null
                        updates.epoca_mes_fim = epoca.mes_fim || null
                        updates.epoca_ano = epoca.ano || null

                        // Sync legacy columns for data_exata
                        if (epoca.tipo === 'data_exata') {
                            updates.data_viagem_inicio = epoca.data_inicio || null
                            updates.data_viagem_fim = epoca.data_fim || null
                        } else {
                            updates.data_viagem_inicio = null
                            updates.data_viagem_fim = null
                        }
                    } else {
                        // Legacy fallback
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const legacy = epoca as any
                        if (legacy.inicio || legacy.fim) {
                            updates.data_viagem_inicio = legacy.inicio || null
                            updates.data_viagem_fim = legacy.fim || null
                        }
                    }
                }

                // Sync duracao_viagem -> normalized columns
                const duracao = data.duracao_viagem as DuracaoViagem | undefined
                if (duracao) {
                    updates.duracao_dias_min = duracao.dias_min || null
                    updates.duracao_dias_max = duracao.dias_max || null
                }
            }

            // If updating 'produto_data' (Planner Proposal), sync normalized columns
            if (target === 'produto_data') {
                syncNormalizedColumns(newData)
            }
            // If updating 'briefing_inicial' (SDR Correction), ALSO sync 'produto_data' IF we are in SDR stage
            else if (target === 'briefing_inicial') {
                const sdrPhase = phases?.find(p => p.slug === SystemPhase.SDR)
                // FIX: Get fase from stages instead of card.fase (which doesn't exist in cards table)
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
        }
    })

    const handleFieldSave = () => {
        // Target depends on:
        // 1. Correction Mode -> Always 'briefing_inicial'
        // 2. View Mode -> SDR = 'briefing_inicial', Planner = 'produto_data'
        const target = (correctionMode || viewMode === SystemPhase.SDR) ? 'briefing_inicial' : 'produto_data'

        // Flush any pending destinosInput before saving
        let dataToSave = editedData
        if (editingField === 'destinos' && destinosInput.trim()) {
            const val = destinosInput.trim().replace(/,/g, '')
            if (val) {
                const current = dataToSave.destinos || []
                if (!current.includes(val)) {
                    dataToSave = { ...dataToSave, destinos: [...current, val] }
                }
            }
            setDestinosInput('')
        }

        updateCardMutation.mutate({
            newData: dataToSave,
            target
        })
    }

    const handleFieldEdit = (fieldName: string) => {
        setEditingField(fieldName)
    }

    const handleCloseModal = () => {
        setEditedData(activeData)
        setEditingField(null)
        setDestinosInput('')
    }

    const handleFieldChange = (fieldName: string, value: unknown) => {
        setEditedData(prev => ({ ...prev, [fieldName]: value }))
    }



    const getFieldStatus = (dataKey: string) => {
        if (correctionMode) return 'ok'

        // Only show visual indicator for BLOCKING requirements (current stage)
        // Future requirements should not create visual noise
        const isBlocking = missingBlocking.some(req => {
            // Handle both legacy and new typed requirements
            if ('field_key' in req) return req.field_key === dataKey
            return false
        })

        if (isBlocking) return 'blocking'

        // REMOVED: Future requirement visual indicator - creates UI noise
        // Users should only see "Obrigatório" for fields that block the CURRENT stage
        // if (missingFuture.some(req => req.field_key === dataKey)) return 'attention'

        return 'ok'
    }

    // --- RENDERERS ---

    // --- MAIN RENDER ---
    return (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden transition-all duration-500">

            {/* VIEW SWITCHER */}
            <div className="border-b border-gray-200 bg-gray-50/50 px-3 pt-2">
                <div className="flex items-center justify-between mb-1">
                    <h3 className="text-xs font-semibold text-gray-900 flex items-center gap-2">
                        Informações da Viagem
                    </h3>

                    {/* Correction Toggle (Only visible in Planner/SDR views) */}
                    {(viewMode === SystemPhase.SDR || viewMode === SystemPhase.PLANNER) && (
                        <button
                            onClick={() => setCorrectionMode(!correctionMode)}
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

                <div className="flex gap-4 overflow-x-auto pb-1 scrollbar-hide">
                    {phases?.filter(p => p.active)
                        .filter(p => p.visible_in_card !== false) // Respect visibility setting from StudioStructure
                        .slice(0, 6) // Limit to 6 phases
                        .map(phase => {
                            const isActive = viewMode === phase.slug
                            // Determine icon based on slug or default
                            const Icon = phase.slug === SystemPhase.SDR ? Tag :
                                phase.slug === SystemPhase.PLANNER ? Plane :
                                    phase.slug === SystemPhase.POS_VENDA ? FileCheck : Tag

                            // Determine color
                            const activeColorClass = phase.slug === SystemPhase.SDR ? 'border-blue-500 text-blue-600' :
                                phase.slug === SystemPhase.PLANNER ? 'border-purple-500 text-purple-600' :
                                    phase.slug === SystemPhase.POS_VENDA ? 'border-green-500 text-green-600' :
                                        'border-indigo-500 text-indigo-600'

                            return (
                                <button
                                    key={phase.id}
                                    onClick={() => {
                                        if (phase.slug) {
                                            setViewMode(phase.slug)
                                            setCorrectionMode(false)
                                        }
                                    }}
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

                    {/* Marketing is now a regular section rendered via DynamicSectionWidget */}
                </div>
            </div>

            {/* CONTENT AREA */}
            <div className={cn(
                "p-2",
                correctionMode && "bg-[#fffbf7]"
            )}>

                {/* DYNAMIC WATERFALL VIEW (SDR, PLANNER, POS_VENDA, etc) */}
                {(viewMode === SystemPhase.SDR || viewMode === SystemPhase.PLANNER || viewMode === SystemPhase.POS_VENDA || phases?.some(p => p.slug === viewMode)) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {visibleFields.length === 0 && (
                            <div className="col-span-full text-center py-8 text-gray-500 italic">
                                Nenhum campo configurado para esta fase.
                                <br />
                                <span className="text-xs">Configure na Matriz de Governança (Seção: Informações da Viagem).</span>
                            </div>
                        )}

                        {visibleFields.map(field => (
                            <UniversalFieldRenderer
                                key={field.key}
                                field={field}
                                value={activeData[field.key]}
                                sdrValue={briefingData[field.key]} // Keep SDR reference for comparison if needed
                                status={getFieldStatus(field.key)}
                                mode="display"
                                onEdit={() => handleFieldEdit(field.key)}
                                correctionMode={correctionMode}
                                isPlanner={viewMode === SystemPhase.PLANNER} // Controls "SDR Original" display
                                cardId={card.id}
                                showLockButton={!correctionMode} // Mostra lock quando não está em modo correção
                            />
                        ))}
                    </div>
                )}

                {/* NOTE: POS_VENDA now uses the same modular logic as SDR/PLANNER via visibleFields */}
                {/* The hardcoded POS_VENDA block has been removed to follow governance rules */}


                {/* DYNAMIC PHASES VIEW (Generic Render) */}
                {!['sdr', 'planner', 'pos_venda', 'marketing'].includes(viewMode) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {/* Render ALL visible fields for this dynamic phase */}
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {getVisibleFields(card.pipeline_stage_id!).map((field: any) => (
                            <FieldCard
                                key={field.key}
                                icon={Tag} // Default icon
                                iconColor="bg-gray-100 text-gray-600"
                                label={field.label}
                                value={activeData[field.key] as string | number | null | undefined}
                                fieldName={field.key}
                                dataKey={field.key}
                            // For dynamic fields, we don't have a specific "sdrValue" concept yet, 
                            // unless we map it. For now, we leave it undefined.
                            />
                        ))}
                        {getVisibleFields(card.pipeline_stage_id!).length === 0 && (
                            <div className="col-span-full text-center py-8 text-gray-500 italic">
                                Nenhum campo configurado para esta fase.
                                <br />
                                <span className="text-xs">Configure na Matriz de Governança.</span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* EDIT MODALS (Shared) */}
            <EditModal
                isOpen={editingField === 'motivo'}
                onClose={handleCloseModal}
                onSave={handleFieldSave}
                title="Motivo da Viagem"
                isSaving={updateCardMutation.isPending}
                isCorrection={correctionMode}
            >
                <div className="space-y-2">
                    <label className="block text-xs font-medium text-gray-700">Qual o motivo desta viagem?</label>
                    <Input
                        type="text"
                        value={editedData.motivo || ''}
                        onChange={(e) => setEditedData({ ...editedData, motivo: e.target.value })}
                        autoFocus
                    />
                </div>
            </EditModal>

            <EditModal
                isOpen={editingField === 'destinos'}
                onClose={handleCloseModal}
                onSave={handleFieldSave}
                title="Destino(s)"
                isSaving={updateCardMutation.isPending}
                isCorrection={correctionMode}
            >
                <div className="space-y-3">
                    <label className="block text-xs font-medium text-gray-700">Quais destinos estão sendo considerados?</label>
                    <div className="flex flex-wrap gap-2 p-3 border border-gray-300 rounded-lg shadow-sm bg-white min-h-[100px] content-start">
                        {editedData.destinos?.map((dest, i) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs">
                                <MapPin className="h-3 w-3" /> {dest}
                                <button
                                    type="button"
                                    onClick={() => {
                                        const newDestinos = [...(editedData.destinos || [])]
                                        newDestinos.splice(i, 1)
                                        setEditedData({ ...editedData, destinos: newDestinos })
                                    }}
                                    className="ml-1 p-0.5 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-200 rounded-full"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </span>
                        ))}
                        <Input
                            type="text"
                            value={destinosInput}
                            onChange={(e) => setDestinosInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ',') {
                                    const val = destinosInput.trim().replace(/,/g, '')
                                    if (val) {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        const current = editedData.destinos || []
                                        if (!current.includes(val)) setEditedData({ ...editedData, destinos: [...current, val] })
                                        setDestinosInput('')
                                    }
                                }
                            }}
                            className="flex-1 min-w-[120px] border-none shadow-none focus-visible:ring-0 p-1 text-sm bg-transparent h-auto"
                            placeholder={editedData.destinos?.length ? "" : "Digite um destino..."}
                            autoFocus
                        />
                    </div>
                </div>
            </EditModal>

            {/* Modal de Edição Genérico via UniversalFieldRenderer */}
            {/* Exclui campos que têm modais específicos: motivo, destinos, orcamento, taxa_planejamento */}
            <EditModal
                isOpen={!!editingField && !['motivo', 'destinos', 'orcamento', 'taxa_planejamento'].includes(editingField)}
                onClose={handleCloseModal}
                onSave={handleFieldSave}
                title={visibleFields.find(f => f.key === editingField)?.label || 'Editar Campo'}
                isSaving={updateCardMutation.isPending}
                isCorrection={correctionMode}
            >
                {editingField && (
                    <UniversalFieldRenderer
                        field={visibleFields.find(f => f.key === editingField) || { key: editingField, label: editingField, type: 'text' }}
                        value={editedData[editingField]}
                        onChange={(val) => handleFieldChange(editingField, val)}
                        mode="edit"
                    />
                )}
            </EditModal>

            <EditModal
                isOpen={editingField === 'orcamento'}
                onClose={handleCloseModal}
                onSave={handleFieldSave}
                title="Orçamento"
                isSaving={updateCardMutation.isPending}
                isCorrection={correctionMode}
            >
                <SmartBudgetField
                    label=""
                    value={editedData.orcamento}
                    onChange={(val: OrcamentoViagem) => setEditedData({ ...editedData, orcamento: val })}
                    quantidadeViajantes={editedData.quantidade_viajantes || 0}
                />
            </EditModal>

            <EditModal
                isOpen={editingField === 'taxa_planejamento'}
                onClose={handleCloseModal}
                onSave={handleFieldSave}
                title="Taxa de Planejamento"
                isSaving={updateCardMutation.isPending}
                isCorrection={correctionMode}
            >
                <div className="space-y-6">
                    <div className="flex items-center gap-3 p-4 bg-indigo-50 rounded-lg border border-indigo-100">
                        <Checkbox
                            checked={editedData.taxa_planejamento === 'Cortesia'}
                            onCheckedChange={(checked) => {
                                if (checked) {
                                    setEditedData({ ...editedData, taxa_planejamento: 'Cortesia' })
                                } else {
                                    setEditedData({ ...editedData, taxa_planejamento: 0 })
                                }
                            }}
                        />
                        <div className="flex-1">
                            <p className="text-xs font-bold text-indigo-900">É Cortesia?</p>
                            <p className="text-xs text-indigo-700">Marque se não haverá cobrança de taxa.</p>
                        </div>
                    </div>

                    {editedData.taxa_planejamento !== 'Cortesia' && (
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-2">Valor da Taxa (R$)</label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">R$</span>
                                <Input
                                    type="number"
                                    value={typeof editedData.taxa_planejamento === 'number' ? editedData.taxa_planejamento : ''}
                                    onChange={(e) => setEditedData({
                                        ...editedData,
                                        taxa_planejamento: parseFloat(e.target.value) || 0
                                    })}
                                    className="pl-12 text-sm font-semibold"
                                    placeholder="0,00"
                                    autoFocus
                                />
                            </div>
                        </div>
                    )}
                </div>
            </EditModal>

            {/* GENERIC EDIT MODAL */}
            {editingField && !['motivo', 'destinos', 'periodo', 'orcamento', 'taxa_planejamento'].includes(editingField) && (
                <EditModal
                    isOpen={true}
                    onClose={handleCloseModal}
                    onSave={handleFieldSave}
                    title={visibleFields.find(f => f.key === editingField)?.label || 'Editar Campo'}
                    isSaving={updateCardMutation.isPending}
                    isCorrection={correctionMode}
                >
                    <div className="space-y-2">
                        {(() => {
                            const field = visibleFields.find(f => f.key === editingField)
                            if (!field) return null
                            return (
                                <UniversalFieldRenderer
                                    field={field}
                                    value={editedData[field.key]}
                                    mode="edit"
                                    onChange={(val) => setEditedData({ ...editedData, [field.key]: val })}
                                />
                            )
                        })()}
                    </div>
                </EditModal>
            )}
        </div>
    )
}
