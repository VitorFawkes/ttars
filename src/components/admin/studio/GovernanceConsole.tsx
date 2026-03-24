import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import {
    Loader2,
    FileText,
    CheckCircle2,
    AlertCircle,
    Trash2,
    LayoutList,
    Copy,
    X,
    ShieldAlert
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { usePipelinePhases } from '../../../hooks/usePipelinePhases'
import { useProductContext } from '../../../hooks/useProductContext'
import { PRODUCT_PIPELINE_MAP } from '../../../lib/constants'
import { Button } from '../../ui/Button'
import { Checkbox } from '@/components/ui/checkbox'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { RuleSelector } from './RuleSelector'

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface ActionRequirement {
    id?: string
    stage_id: string
    requirement_type: 'proposal' | 'task' | 'field' | 'rule'
    requirement_label: string
    is_required: boolean
    is_blocking: boolean
    proposal_min_status?: string
    task_tipo?: string
    task_require_completed?: boolean
    field_key?: string
    // Fontes que podem ignorar este requisito específico
    bypass_sources?: string[]
}

// Opções de fontes de bypass (para uso futuro em edição de regras)
// TODO: Implementar UI de edição de bypass_sources por regra
// const BYPASS_SOURCE_OPTIONS = [
//     { value: 'active_campaign', label: 'ActiveCampaign' },
//     { value: 'manual_sync', label: 'Sync Manual' },
//     { value: 'import', label: 'Importação' },
//     { value: 'api', label: 'API Externa' }
// ]

// eslint-disable-next-line react-refresh/only-export-components
export const SPECIAL_RULES = [
    { key: 'lost_reason_required', label: 'Motivo de Perda Obrigatório', icon: ShieldAlert }
]



// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function GovernanceConsole() {
    const queryClient = useQueryClient()
    const { currentProduct } = useProductContext()
    const pipelineId = PRODUCT_PIPELINE_MAP[currentProduct] || PRODUCT_PIPELINE_MAP.TRIPS
    const [selectedStageId, setSelectedStageId] = useState<string | null>(null)
    const [selectedRuleIds, setSelectedRuleIds] = useState<Set<string>>(new Set())
    const [isReplicating, setIsReplicating] = useState(false)
    const [targetStageIds, setTargetStageIds] = useState<Set<string>>(new Set())

    // 1. Fetch Phases & Stages
    const { data: phasesData } = usePipelinePhases(pipelineId)
    const phases = useMemo(() => phasesData || [], [phasesData])

    const { data: stages, isLoading: loadingStages } = useQuery({
        queryKey: ['pipeline-stages-governance', pipelineId],
        queryFn: async () => {
            const { data } = await supabase
                .from('pipeline_stages')
                .select('id, nome, fase, ordem, phase_id, pipeline_phases!pipeline_stages_phase_id_fkey(order_index)')
                .eq('pipeline_id', pipelineId)
                .order('ordem')
            // Sort by phase order_index then stage ordem
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (data || []).sort((a: any, b: any) => {
                const phaseA = a.pipeline_phases?.order_index ?? 999
                const phaseB = b.pipeline_phases?.order_index ?? 999
                if (phaseA !== phaseB) return phaseA - phaseB
                return a.ordem - b.ordem
            })
        }
    })

    // 2. Fetch All Requirements
    const { data: requirements, isLoading: loadingReqs } = useQuery({
        queryKey: ['action-requirements-all'],
        queryFn: async () => {
            const { data } = await supabase
                .from('stage_field_config')
                .select('*')
                .in('requirement_type', ['proposal', 'task', 'field', 'rule'])
            return (data || []) as ActionRequirement[]
        }
    })

    // 2.5 Fetch System Fields (with section for grouping)
    const { data: systemFields } = useQuery({
        queryKey: ['system-fields-governance'],
        queryFn: async () => {
            const { data } = await supabase
                .from('system_fields')
                .select('key, label, type, section')
                .eq('active', true)
                .order('label')
            return data || []
        }
    })

    // 3. Fetch Dynamic Task Types
    const { data: taskTypes } = useQuery({
        queryKey: ['task-types-distinct'],
        queryFn: async () => {
            const { data } = await supabase
                .from('task_type_outcomes')
                .select('tipo, outcome_label')

            // Deduplicate by type on client side since distinct on select might be tricky with outcome_label
            const uniqueTypes = new Map<string, string>()
            data?.forEach((item: { tipo: string; outcome_label: string }) => {
                // Use a nice label if available, or capitalize type
                if (!uniqueTypes.has(item.tipo)) {
                    uniqueTypes.set(item.tipo, item.tipo.charAt(0).toUpperCase() + item.tipo.slice(1))
                }
            })

            // Add known types if missing (fallback)
            const defaults = ['contato', 'reuniao', 'email', 'cobranca', 'handover']
            defaults.forEach(t => {
                if (!uniqueTypes.has(t)) uniqueTypes.set(t, t.charAt(0).toUpperCase() + t.slice(1))
            })

            return Array.from(uniqueTypes.entries()).map(([tipo, label]) => ({ tipo, label }))
        }
    })

    // 3.5 Fetch Sections for Grouping
    const { data: sections } = useQuery({
        queryKey: ['sections-governance'],
        queryFn: async () => {
            const { data } = await supabase
                .from('sections')
                .select('key, label, order_index')
                .order('order_index')
            return data || []
        }
    })

    // Mutations
    const insertMutation = useMutation({
        mutationFn: async (req: ActionRequirement) => {
            const { error } = await supabase.from('stage_field_config').insert([req])
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['action-requirements-all'] })
            queryClient.invalidateQueries({ queryKey: ['stage-field-config-all'] })
            queryClient.invalidateQueries({ queryKey: ['stage-requirements'] })
            toast.success('Regra adicionada com sucesso')
        },
        onError: (err: Error) => toast.error(`Erro: ${err.message}`)
    })

    const deleteMutation = useMutation({
        mutationFn: async (ids: string[]) => {
            const { error } = await supabase.from('stage_field_config').delete().in('id', ids)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['action-requirements-all'] })
            queryClient.invalidateQueries({ queryKey: ['stage-field-config-all'] })
            queryClient.invalidateQueries({ queryKey: ['stage-requirements'] })
            toast.success('Regras removidas com sucesso')
            setSelectedRuleIds(new Set())
        },
        onError: (err: Error) => toast.error(`Erro ao remover: ${err.message}`)
    })

    const updateMutation = useMutation({
        mutationFn: async ({ id, updates }: { id: string, updates: Partial<ActionRequirement> }) => {
            const { error } = await supabase
                .from('stage_field_config')
                .update(updates)
                .eq('id', id)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['action-requirements-all'] })
            queryClient.invalidateQueries({ queryKey: ['stage-field-config-all'] })
            queryClient.invalidateQueries({ queryKey: ['stage-requirements'] })
        },
        onError: (err: Error) => toast.error(`Erro ao atualizar: ${err.message}`)
    })

    const replicateMutation = useMutation({
        mutationFn: async ({ sourceRules, targetStageIds }: { sourceRules: ActionRequirement[], targetStageIds: string[] }) => {
            const newRules: ActionRequirement[] = []

            // For each target stage
            for (const targetId of targetStageIds) {
                // For each source rule
                for (const rule of sourceRules) {
                    // Check if already exists (client-side check for now, DB constraint might catch it too)
                    // We'll just try to insert and ignore duplicates if possible, or filter here.
                    // Let's construct the new rule
                    newRules.push({
                        stage_id: targetId,
                        requirement_type: rule.requirement_type,
                        requirement_label: rule.requirement_label,
                        is_required: rule.is_required,
                        is_blocking: rule.is_blocking,
                        proposal_min_status: rule.proposal_min_status,
                        task_tipo: rule.task_tipo,
                        task_require_completed: rule.task_require_completed,
                        field_key: rule.field_key,
                        bypass_sources: rule.bypass_sources,
                    })
                }
            }

            if (newRules.length === 0) return

            const { error } = await supabase.from('stage_field_config').insert(newRules)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['action-requirements-all'] })
            queryClient.invalidateQueries({ queryKey: ['stage-field-config-all'] })
            queryClient.invalidateQueries({ queryKey: ['stage-requirements'] })
            toast.success('Regras replicadas com sucesso')
            setIsReplicating(false)
            setTargetStageIds(new Set())
            setSelectedRuleIds(new Set())
        },
        onError: (err: Error) => toast.error(`Erro ao replicar: ${err.message}`)
    })

    // Derived State
    const sortedStages = useMemo(() => {
        if (!stages || !phases.length) return []
        const phaseOrderMap = new Map<string, number>()
        phases.forEach((phase, index) => {
            phaseOrderMap.set(phase.id, phase.order_index ?? index)
            phaseOrderMap.set(phase.name, phase.order_index ?? index)
        })
        return [...stages].sort((a, b) => {
            const aPhaseOrder = phaseOrderMap.get(a.phase_id || '') ?? phaseOrderMap.get(a.fase || '') ?? 999
            const bPhaseOrder = phaseOrderMap.get(b.phase_id || '') ?? phaseOrderMap.get(b.fase || '') ?? 999
            if (aPhaseOrder !== bPhaseOrder) return aPhaseOrder - bPhaseOrder
            return (a.ordem || 0) - (b.ordem || 0)
        })
    }, [stages, phases])

    const selectedStage = selectedStageId === 'all'
        ? { id: 'all', nome: 'Todas as Etapas', fase: 'Visão Global' }
        : stages?.find(s => s.id === selectedStageId)

    const stageRules = useMemo(() =>
        selectedStageId === 'all'
            ? requirements || []
            : requirements?.filter(r => r.stage_id === selectedStageId) || [],
        [selectedStageId, requirements]
    )

    // Hydrate Rules (Self-Healing)
    const hydratedRules = useMemo(() => {
        return stageRules.map(rule => {
            let label = rule.requirement_label
            let isInvalid = false

            if (rule.requirement_type === 'field') {
                const sysField = systemFields?.find(f => f.key === rule.field_key)
                if (sysField) {
                    label = sysField.label
                } else if (!label) {
                    // If no label and not found in system fields -> Invalid/Deprecated
                    label = rule.field_key || 'Campo Desconhecido'
                    isInvalid = true
                }
            }

            return { ...rule, _label: label, _isInvalid: isInvalid }
        })
    }, [stageRules, systemFields])

    // Group Rules
    const groupedRules = useMemo(() => {
        return {
            fields: hydratedRules.filter(r => r.requirement_type === 'field'),
            tasks: hydratedRules.filter(r => r.requirement_type === 'task'),
            proposals: hydratedRules.filter(r => r.requirement_type === 'proposal'),
            rules: hydratedRules.filter(r => r.requirement_type === 'rule')
        }
    }, [hydratedRules])

    // Handlers
    const handleAddRule = (type: string, value: string) => {
        if (!selectedStageId) return

        const label = type === 'proposal'
            ? `Proposta ${value}`
            : type === 'task'
                ? taskTypes?.find(t => t.tipo === value)?.label || value
                : type === 'rule'
                    ? SPECIAL_RULES.find(r => r.key === value)?.label || value
                    : systemFields?.find(f => f.key === value)?.label || value

        const newReq: ActionRequirement = {
            stage_id: selectedStageId,
            requirement_type: type as 'proposal' | 'task' | 'field' | 'rule',
            requirement_label: label,
            is_required: true,
            is_blocking: true,
            ...(type === 'proposal' && { proposal_min_status: value }),
            ...(type === 'task' && { task_tipo: value, task_require_completed: false }),
            ...(type === 'field' && { field_key: value }),
            ...(type === 'rule' && { field_key: value }) // We store rule key in field_key for simplicity
        }
        insertMutation.mutate(newReq)
    }

    const toggleRuleSelection = (id: string) => {
        const newSet = new Set(selectedRuleIds)
        if (newSet.has(id)) newSet.delete(id)
        else newSet.add(id)
        setSelectedRuleIds(newSet)
    }

    const handleBulkDelete = () => {
        if (selectedRuleIds.size === 0) return
        if (confirm(`Tem certeza que deseja remover ${selectedRuleIds.size} regras?`)) {
            deleteMutation.mutate(Array.from(selectedRuleIds))
        }
    }

    const handleReplicate = () => {
        if (selectedRuleIds.size === 0 || targetStageIds.size === 0) return
        const rulesToReplicate = hydratedRules.filter(r => r.id && selectedRuleIds.has(r.id))
        replicateMutation.mutate({
            sourceRules: rulesToReplicate,
            targetStageIds: Array.from(targetStageIds)
        })
    }

    if (loadingStages || loadingReqs) {
        return <div className="p-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600" /></div>
    }

    return (
        <div className="flex h-[calc(100vh-12rem)] bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden relative">
            {/* LEFT: Stage Navigation */}
            <div className="w-1/3 min-w-[300px] border-r border-gray-200 overflow-y-auto bg-gray-50/50">
                <div className="p-4 border-b border-gray-200 bg-white sticky top-0 z-10">
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                        <LayoutList className="w-4 h-4 text-gray-500" />
                        Etapas do Pipeline
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">Selecione uma etapa para gerenciar regras.</p>
                </div>
                <div className="p-2 space-y-1">
                    {/* Global View Button */}
                    <button
                        onClick={() => {
                            setSelectedStageId('all')
                            setSelectedRuleIds(new Set())
                        }}
                        className={cn(
                            "w-full text-left px-4 py-3 rounded-lg text-sm transition-all flex items-center justify-between group mb-2",
                            selectedStageId === 'all'
                                ? "bg-gray-900 text-white shadow-md ring-1 ring-gray-900"
                                : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300"
                        )}
                    >
                        <div className="flex items-center gap-3">
                            <div className={cn("w-2 h-2 rounded-full", selectedStageId === 'all' ? "bg-white animate-pulse" : "bg-gray-400")} />
                            <span className="font-medium">Todas as Etapas</span>
                        </div>
                        {requirements && requirements.length > 0 && (
                            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", selectedStageId === 'all' ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600")}>
                                {requirements.length}
                            </span>
                        )}
                    </button>
                    <div className="h-px bg-gray-200 my-2 mx-2" />

                    {sortedStages.map(stage => {
                        const ruleCount = requirements?.filter(r => r.stage_id === stage.id).length || 0
                        const isActive = selectedStageId === stage.id
                        const phase = phases.find(p => p.id === stage.phase_id) || phases.find(p => p.name === stage.fase)

                        return (
                            <button
                                key={stage.id}
                                onClick={() => {
                                    setSelectedStageId(stage.id)
                                    setSelectedRuleIds(new Set())
                                }}
                                className={cn(
                                    "w-full text-left px-4 py-3 rounded-lg text-sm transition-all flex items-center justify-between group",
                                    isActive
                                        ? "bg-white shadow-sm ring-1 ring-gray-200"
                                        : "hover:bg-gray-100/80 text-gray-600"
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <div
                                        className={cn("w-2 h-2 rounded-full", isActive ? "ring-2 ring-offset-1 ring-gray-300" : "")}
                                        style={{ backgroundColor: phase?.color || '#ccc' }}
                                    />
                                    <span className={cn("font-medium", isActive ? "text-gray-900" : "text-gray-600")}>
                                        {stage.nome}
                                    </span>
                                </div>
                                {ruleCount > 0 && (
                                    <span className="bg-gray-100 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                        {ruleCount}
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* RIGHT: Detail View */}
            <div className="flex-1 overflow-y-auto bg-white relative">
                {selectedStage ? (
                    <div className="p-8 max-w-3xl mx-auto pb-24">
                        {/* Header */}
                        <div className="mb-8 flex justify-between items-start">
                            <div>
                                <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                                    <span className="uppercase tracking-wider font-semibold text-[10px]">
                                        {selectedStageId === 'all' ? 'Visão Global' : 'Governança da Etapa'}
                                    </span>
                                </div>
                                <h2 className="text-3xl font-bold text-gray-900 mb-2">{selectedStage.nome}</h2>
                                <p className="text-gray-500">
                                    {selectedStageId === 'all'
                                        ? "Gerencie regras de todas as etapas em um único lugar."
                                        : "Defina o que é obrigatório para um card entrar nesta etapa."}
                                </p>
                            </div>

                            {/* Add Rule Dropdown - Hide in All mode */}
                            {selectedStageId !== 'all' && (
                                <RuleSelector
                                    onSelect={handleAddRule}
                                    systemFields={systemFields || []}
                                    taskTypes={taskTypes || []}
                                    sections={sections || []}
                                    specialRules={SPECIAL_RULES}
                                />
                            )}
                        </div>


                        {/* Rules List - Grouped */}
                        <div className="space-y-8">
                            {/* Special Rules Group */}
                            {groupedRules.rules.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-3 mb-3">
                                        <Checkbox
                                            checked={groupedRules.rules.every(r => r.id && selectedRuleIds.has(r.id))}
                                            onCheckedChange={(checked) => {
                                                const newSet = new Set(selectedRuleIds)
                                                groupedRules.rules.forEach(r => {
                                                    if (r.id) {
                                                        if (checked) newSet.add(r.id)
                                                        else newSet.delete(r.id)
                                                    }
                                                })
                                                setSelectedRuleIds(newSet)
                                            }}
                                        />
                                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                            <ShieldAlert className="w-4 h-4" /> Regras Especiais
                                        </h3>
                                    </div>
                                    <div className="space-y-2">
                                        {groupedRules.rules.map(rule => (
                                            <RuleItem
                                                key={rule.id}
                                                rule={rule}
                                                stageName={stages?.find(s => s.id === rule.stage_id)?.nome}
                                                selected={rule.id ? selectedRuleIds.has(rule.id) : false}
                                                onToggle={() => rule.id && toggleRuleSelection(rule.id)}
                                                onDelete={() => rule.id && deleteMutation.mutate([rule.id])}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Fields Group */}
                            {groupedRules.fields.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-3 mb-3">
                                        <Checkbox
                                            checked={groupedRules.fields.every(r => r.id && selectedRuleIds.has(r.id))}
                                            onCheckedChange={(checked) => {
                                                const newSet = new Set(selectedRuleIds)
                                                groupedRules.fields.forEach(r => {
                                                    if (r.id) {
                                                        if (checked) newSet.add(r.id)
                                                        else newSet.delete(r.id)
                                                    }
                                                })
                                                setSelectedRuleIds(newSet)
                                            }}
                                        />
                                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                            <FileText className="w-4 h-4" /> Campos Obrigatórios
                                        </h3>
                                    </div>
                                    <div className="space-y-2">
                                        {groupedRules.fields.map(rule => (
                                            <RuleItem
                                                key={rule.id}
                                                rule={rule}
                                                stageName={stages?.find(s => s.id === rule.stage_id)?.nome}
                                                selected={rule.id ? selectedRuleIds.has(rule.id) : false}
                                                onToggle={() => rule.id && toggleRuleSelection(rule.id)}
                                                onDelete={() => rule.id && deleteMutation.mutate([rule.id])}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Tasks Group */}
                            {groupedRules.tasks.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-3 mb-3">
                                        <Checkbox
                                            checked={groupedRules.tasks.every(r => r.id && selectedRuleIds.has(r.id))}
                                            onCheckedChange={(checked) => {
                                                const newSet = new Set(selectedRuleIds)
                                                groupedRules.tasks.forEach(r => {
                                                    if (r.id) {
                                                        if (checked) newSet.add(r.id)
                                                        else newSet.delete(r.id)
                                                    }
                                                })
                                                setSelectedRuleIds(newSet)
                                            }}
                                        />
                                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                            <CheckCircle2 className="w-4 h-4" /> Tarefas Obrigatórias
                                        </h3>
                                    </div>
                                    <div className="space-y-2">
                                        {groupedRules.tasks.map(rule => (
                                            <RuleItem
                                                key={rule.id}
                                                rule={rule}
                                                stageName={stages?.find(s => s.id === rule.stage_id)?.nome}
                                                selected={rule.id ? selectedRuleIds.has(rule.id) : false}
                                                onToggle={() => rule.id && toggleRuleSelection(rule.id)}
                                                onDelete={() => rule.id && deleteMutation.mutate([rule.id])}
                                                onToggleCompleted={rule.id ? (newVal) => updateMutation.mutate({
                                                    id: rule.id!,
                                                    updates: { task_require_completed: newVal }
                                                }) : undefined}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Proposals Group */}
                            {groupedRules.proposals.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-3 mb-3">
                                        <Checkbox
                                            checked={groupedRules.proposals.every(r => r.id && selectedRuleIds.has(r.id))}
                                            onCheckedChange={(checked) => {
                                                const newSet = new Set(selectedRuleIds)
                                                groupedRules.proposals.forEach(r => {
                                                    if (r.id) {
                                                        if (checked) newSet.add(r.id)
                                                        else newSet.delete(r.id)
                                                    }
                                                })
                                                setSelectedRuleIds(newSet)
                                            }}
                                        />
                                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                            <FileText className="w-4 h-4" /> Propostas
                                        </h3>
                                    </div>
                                    <div className="space-y-2">
                                        {groupedRules.proposals.map(rule => (
                                            <RuleItem
                                                key={rule.id}
                                                rule={rule}
                                                stageName={stages?.find(s => s.id === rule.stage_id)?.nome}
                                                selected={rule.id ? selectedRuleIds.has(rule.id) : false}
                                                onToggle={() => rule.id && toggleRuleSelection(rule.id)}
                                                onDelete={() => rule.id && deleteMutation.mutate([rule.id])}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {stageRules.length === 0 && (
                                <div className="text-center py-12 border-2 border-dashed border-gray-100 rounded-xl bg-gray-50/50">
                                    <ShieldAlert className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                    <p className="text-gray-500 font-medium">Nenhuma regra ativa</p>
                                    <p className="text-sm text-gray-400">O card pode entrar nesta etapa livremente.</p>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400">
                        <LayoutList className="w-12 h-12 mb-4 opacity-20" />
                        <p>Selecione uma etapa ao lado para começar</p>
                    </div>
                )}
            </div>

            {/* Bulk Actions Floating Bar - Fixed relative to the main container */}
            {selectedRuleIds.size > 0 && (
                <div className="absolute bottom-8 left-[60%] -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-6 animate-in slide-in-from-bottom-4 z-50">
                    <span className="font-medium text-sm">{selectedRuleIds.size} regras selecionadas</span>
                    <div className="h-4 w-px bg-gray-700" />
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setIsReplicating(true)}
                            className="text-sm font-medium hover:text-blue-300 transition-colors flex items-center gap-2"
                        >
                            <Copy className="w-4 h-4" /> Replicar
                        </button>
                        <button
                            onClick={handleBulkDelete}
                            className="text-sm font-medium hover:text-red-300 transition-colors flex items-center gap-2"
                        >
                            <Trash2 className="w-4 h-4" /> Excluir
                        </button>
                    </div>
                    <button
                        onClick={() => setSelectedRuleIds(new Set())}
                        className="ml-2 hover:bg-gray-800 rounded-full p-1"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Replication Modal */}
            <Dialog open={isReplicating} onOpenChange={setIsReplicating}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Replicar Regras</DialogTitle>
                        <DialogDescription>
                            Copiar {selectedRuleIds.size} regras para outras etapas.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="max-h-[300px] overflow-y-auto space-y-2 py-4">
                        {sortedStages.filter(s => s.id !== selectedStageId).map(stage => (
                            <div key={stage.id} className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded-lg">
                                <Checkbox
                                    id={`target-${stage.id}`}
                                    checked={targetStageIds.has(stage.id)}
                                    onCheckedChange={(checked) => {
                                        const newSet = new Set(targetStageIds)
                                        if (checked) newSet.add(stage.id)
                                        else newSet.delete(stage.id)
                                        setTargetStageIds(newSet)
                                    }}
                                />
                                <label
                                    htmlFor={`target-${stage.id}`}
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                                >
                                    {stage.nome}
                                </label>
                            </div>
                        ))}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsReplicating(false)}>Cancelar</Button>
                        <Button
                            onClick={handleReplicate}
                            disabled={targetStageIds.size === 0 || replicateMutation.isPending}
                        >
                            {replicateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Replicar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}


function RuleItem({ rule, stageName, selected, onToggle, onDelete, onToggleCompleted }: { rule: ActionRequirement & { _label: string; _isInvalid: boolean }, stageName?: string, selected: boolean, onToggle: () => void, onDelete: () => void, onToggleCompleted?: (newValue: boolean) => void }) {
    return (
        <div className={cn(
            "group flex items-center justify-between p-4 bg-white border rounded-xl shadow-sm transition-all cursor-pointer",
            selected ? "border-blue-500 ring-1 ring-blue-500 bg-blue-50/10" : "border-gray-200 hover:border-gray-300"
        )}
            onClick={(e) => {
                // Prevent toggling if clicking delete button
                if ((e.target as HTMLElement).closest('button')) return
                onToggle()
            }}
        >
            <div className="flex items-center gap-4">
                <Checkbox checked={selected} onCheckedChange={onToggle} />

                <div className={cn(
                    "p-2 rounded-lg",
                    rule.requirement_type === 'task' ? "bg-purple-50 text-purple-600" :
                        rule.requirement_type === 'proposal' ? "bg-emerald-50 text-emerald-600" :
                            rule.requirement_type === 'rule' ? "bg-amber-50 text-amber-600" :
                                "bg-blue-50 text-blue-600"
                )}>
                    {rule.requirement_type === 'task' ? <CheckCircle2 className="w-5 h-5" /> :
                        rule.requirement_type === 'proposal' ? <FileText className="w-5 h-5" /> :
                            rule.requirement_type === 'rule' ? <ShieldAlert className="w-5 h-5" /> :
                                <FileText className="w-5 h-5" />}
                </div>
                <div>
                    <h4 className={cn("font-medium", rule._isInvalid ? "text-red-500 line-through" : "text-gray-900")}>
                        {rule._label}
                        {rule._isInvalid && <span className="ml-2 text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full no-underline">Inválido</span>}
                    </h4>
                    <p className="text-xs text-gray-500 flex items-center gap-1 flex-wrap">
                        {stageName && (
                            <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-[10px] font-medium mr-1">
                                {stageName}
                            </span>
                        )}
                        {rule.is_blocking ? (
                            <span className="text-red-600 font-medium flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                Bloqueia Avanço
                            </span>
                        ) : "Apenas Aviso"}
                        {rule.bypass_sources && rule.bypass_sources.length > 0 && (
                            <span className="ml-2 bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[10px] font-medium" title={`Bypass: ${rule.bypass_sources.join(', ')}`}>
                                🔓 {rule.bypass_sources.length} bypass
                            </span>
                        )}
                    </p>
                    {rule.requirement_type === 'task' && onToggleCompleted && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                onToggleCompleted(!rule.task_require_completed)
                            }}
                            className={cn(
                                "mt-1.5 text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors border",
                                rule.task_require_completed
                                    ? "bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-200"
                                    : "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200"
                            )}
                        >
                            {rule.task_require_completed ? 'Exige conclusão' : 'Apenas existir'}
                        </button>
                    )}
                </div>
            </div>
            <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                    e.stopPropagation()
                    onDelete()
                }}
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all"
            >
                <Trash2 className="w-4 h-4" />
            </Button>
        </div>
    )
}
