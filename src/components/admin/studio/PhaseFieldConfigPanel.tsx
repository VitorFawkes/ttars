import { useState, useMemo, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import { useFieldConfig } from '../../../hooks/useFieldConfig'
import { useToast } from '../../../contexts/ToastContext'
import { Eye, EyeOff, CheckSquare, Square, AlertTriangle, ToggleLeft, ToggleRight } from 'lucide-react'
import { cn } from '../../../lib/utils'

interface PhaseFieldConfigPanelProps {
    sectionKey: string
    stages: { id: string; nome: string; phase_id: string | null; fase: string }[]
    phases: { id: string; slug: string | null; name: string; visible_in_card?: boolean | null }[]
}

export default function PhaseFieldConfigPanel({ sectionKey, stages, phases }: PhaseFieldConfigPanelProps) {
    const { toast } = useToast()
    const queryClient = useQueryClient()
    const { systemFields, stageConfigs } = useFieldConfig()

    // Filter to phases that have stages (skip resolucao)
    const visiblePhases = useMemo(() => {
        return phases.filter(p => {
            if (p.slug === 'resolucao') return false
            return stages.some(s => s.phase_id === p.id)
        })
    }, [phases, stages])

    const [activeTab, setActiveTab] = useState<string | null>(null)

    // Set initial tab
    const currentTab = activeTab ?? visiblePhases[0]?.id ?? null
    const currentPhase = visiblePhases.find(p => p.id === currentTab)

    // Fields for this section
    const sectionFields = useMemo(() => {
        if (!systemFields) return []
        return systemFields.filter(f => (f.section || 'details') === sectionKey)
    }, [systemFields, sectionKey])

    // Stages for the current phase
    const phaseStages = useMemo(() => {
        if (!currentPhase) return []
        return stages.filter(s => s.phase_id === currentPhase.id)
    }, [stages, currentPhase])

    // Representative stage = last stage of the phase
    const representativeStageId = useMemo(() => {
        if (phaseStages.length === 0) return null
        return phaseStages[phaseStages.length - 1].id
    }, [phaseStages])

    // Check divergence: do all stages in this phase have the same config for each field?
    const divergentFields = useMemo(() => {
        if (!stageConfigs || phaseStages.length <= 1) return new Set<string>()

        const divergent = new Set<string>()
        for (const field of sectionFields) {
            const configs = phaseStages.map(s => {
                const cfg = stageConfigs.find(c => c.stage_id === s.id && c.field_key === field.key)
                return {
                    is_visible: cfg?.is_visible ?? null,
                    is_required: cfg?.is_required ?? null
                }
            })
            // Check if all configs are the same
            const first = configs[0]
            const allSame = configs.every(c =>
                c.is_visible === first.is_visible && c.is_required === first.is_required
            )
            if (!allSame) divergent.add(field.key)
        }
        return divergent
    }, [stageConfigs, phaseStages, sectionFields])

    // Get field config from the representative stage
    const getFieldState = useCallback((fieldKey: string) => {
        if (!stageConfigs || !representativeStageId) return { isVisible: true, isRequired: false, hasOverride: false }
        const cfg = stageConfigs.find(c => c.stage_id === representativeStageId && c.field_key === fieldKey)
        if (!cfg) return { isVisible: true, isRequired: false, hasOverride: false }
        return { isVisible: cfg.is_visible ?? true, isRequired: cfg.is_required ?? false, hasOverride: true }
    }, [stageConfigs, representativeStageId])

    // Batch upsert mutation — applies to ALL stages of the phase
    const batchUpsertMutation = useMutation({
        mutationFn: async ({ fieldKey, isVisible, isRequired }: { fieldKey: string; isVisible: boolean; isRequired: boolean }) => {
            const rows = phaseStages.map(s => ({
                stage_id: s.id,
                field_key: fieldKey,
                is_visible: isVisible,
                is_required: isRequired,
                show_in_header: false
            }))

            // Upsert all stage configs in parallel
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
        }
    })

    // Normalize: apply representative stage's config to all stages in phase
    const normalizeMutation = useMutation({
        mutationFn: async () => {
            if (!stageConfigs || !representativeStageId) return

            const repConfigs = stageConfigs.filter(c => c.stage_id === representativeStageId)

            const rows: { stage_id: string; field_key: string; is_visible: boolean; is_required: boolean; show_in_header: boolean }[] = []
            for (const s of phaseStages) {
                if (s.id === representativeStageId) continue
                for (const field of sectionFields) {
                    const repCfg = repConfigs.find(c => c.field_key === field.key)
                    rows.push({
                        stage_id: s.id,
                        field_key: field.key,
                        is_visible: repCfg?.is_visible ?? true,
                        is_required: repCfg?.is_required ?? false,
                        show_in_header: false
                    })
                }
            }

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
            toast({ title: 'Stages normalizados', type: 'success' })
        }
    })

    // Toggle visible_in_card for the phase
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
        }
    })

    const handleToggleVisible = useCallback((fieldKey: string) => {
        const state = getFieldState(fieldKey)
        batchUpsertMutation.mutate({
            fieldKey,
            isVisible: !state.isVisible,
            isRequired: state.isRequired
        })
    }, [getFieldState, batchUpsertMutation])

    const handleToggleRequired = useCallback((fieldKey: string) => {
        const state = getFieldState(fieldKey)
        batchUpsertMutation.mutate({
            fieldKey,
            isVisible: state.isVisible,
            isRequired: !state.isRequired
        })
    }, [getFieldState, batchUpsertMutation])

    if (visiblePhases.length === 0 || sectionFields.length === 0) return null

    const hasDivergence = divergentFields.size > 0

    return (
        <div className="space-y-2">
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

            {/* Visible in card toggle */}
            {currentPhase && (
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
                    Mostrar aba "{currentPhase.name}" no card
                </button>
            )}

            {/* Divergence warning */}
            {hasDivergence && (
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-amber-50 border border-amber-200">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                    <span className="text-[11px] text-amber-700 flex-1">
                        {divergentFields.size} campo(s) com config diferente entre etapas
                    </span>
                    <button
                        onClick={() => normalizeMutation.mutate()}
                        disabled={normalizeMutation.isPending}
                        className="text-[11px] font-semibold text-amber-700 hover:text-amber-900 underline"
                    >
                        Normalizar
                    </button>
                </div>
            )}

            {/* Field list */}
            <div className="space-y-0.5">
                {sectionFields.map(field => {
                    const state = getFieldState(field.key)
                    const isDivergent = divergentFields.has(field.key)

                    return (
                        <div
                            key={field.key}
                            className={cn(
                                "flex items-center gap-2 py-1 px-1 rounded",
                                isDivergent && "bg-amber-50/50"
                            )}
                        >
                            <button
                                onClick={() => handleToggleVisible(field.key)}
                                disabled={batchUpsertMutation.isPending}
                                className={cn(
                                    "p-1 rounded transition-colors",
                                    state.isVisible
                                        ? "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                                        : "text-red-500 hover:text-red-700 hover:bg-red-50"
                                )}
                                title={state.isVisible ? "Visível (clique para ocultar)" : "Oculto (clique para mostrar)"}
                            >
                                {state.isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                            </button>
                            <button
                                onClick={() => handleToggleRequired(field.key)}
                                disabled={batchUpsertMutation.isPending}
                                className={cn(
                                    "p-1 rounded transition-colors",
                                    state.isRequired
                                        ? "text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                        : "text-slate-300 hover:text-slate-500 hover:bg-slate-100"
                                )}
                                title={state.isRequired ? "Obrigatório (clique para remover)" : "Não obrigatório (clique para tornar)"}
                            >
                                {state.isRequired ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                            </button>
                            <span className={cn(
                                "text-xs truncate flex-1",
                                !state.isVisible ? "text-muted-foreground line-through" : "text-foreground"
                            )}>
                                {field.label}
                            </span>
                            {isDivergent && (
                                <span className="text-[10px] text-amber-600 font-medium">diverge</span>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
