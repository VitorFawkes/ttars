import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Database, Json } from '../database.types'

type SystemField = Database['public']['Tables']['system_fields']['Row']
type StageFieldConfig = Database['public']['Tables']['stage_field_config']['Row']

export interface FieldConfigResult {
    key: string
    label: string
    type: string
    section: string
    isVisible: boolean
    isRequired: boolean
    isHeader: boolean
    isSecondary: boolean
    customLabel?: string | null
    options?: Json
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sfc = () => supabase.from('section_field_config' as any)

interface SectionFieldConfigRow {
    section_key: string
    field_key: string
    is_visible: boolean
    is_required: boolean
}

/**
 * Hook para configs de campos por etapa.
 * @param pipelineId — quando informado, filtra configs para stages desse pipeline apenas.
 *   Obter via `useCurrentProductMeta().pipelineId`. Sem ele, retorna configs de TODOS os pipelines
 *   (necessário no Pipeline Studio admin). Em telas de produto, SEMPRE passe pipelineId.
 */
export function useFieldConfig(pipelineId?: string) {
    // Fetch System Fields (The Dictionary)
    const { data: systemFields, isLoading: loadingFields } = useQuery({
        queryKey: ['system-fields-config'],
        queryFn: async () => {
            const { data } = await supabase
                .from('system_fields')
                .select('*')
                .eq('active', true)
                .order('section')
                .order('order_index')
                .order('label')
            return data as SystemField[]
        },
        staleTime: 1000 * 60 * 5 // 5 minutes
    })

    // Fetch Stage Configs (The Rules — per stage)
    const { data: allStageConfigs, isLoading: loadingConfigs } = useQuery({
        queryKey: ['stage-field-configs-all'],
        queryFn: async () => {
            const { data } = await supabase
                .from('stage_field_config')
                .select('*')
            return data as StageFieldConfig[]
        },
        staleTime: 1000 * 60 * 5 // 5 minutes
    })

    // Fetch Section Field Defaults (The Defaults — per section)
    const { data: sectionFieldConfigs, isLoading: loadingSectionDefaults } = useQuery({
        queryKey: ['section-field-configs'],
        queryFn: async () => {
            const { data, error } = await sfc().select('*')
            if (error) throw error
            return data as unknown as SectionFieldConfigRow[]
        },
        staleTime: 1000 * 60 * 5 // 5 minutes
    })

    // Fetch pipeline stages for phase-aware fallback
    // When pipelineId is provided, only fetch stages for that pipeline
    const { data: pipelineStages, isLoading: loadingStages } = useQuery({
        queryKey: ['pipeline-stages-phase-map', pipelineId ?? 'all'],
        queryFn: async () => {
            let query = supabase
                .from('pipeline_stages')
                .select('id, phase_id, pipeline_id')
            if (pipelineId) {
                query = query.eq('pipeline_id', pipelineId)
            }
            const { data } = await query
            return data as { id: string; phase_id: string | null; pipeline_id: string | null }[] | null
        },
        staleTime: 1000 * 60 * 5
    })

    // Filter stage configs by pipeline when pipelineId is provided
    const stageConfigs = useMemo(() => {
        if (!allStageConfigs) return null
        if (!pipelineId || !pipelineStages) return allStageConfigs
        const validStageIds = new Set(pipelineStages.map(s => s.id))
        return allStageConfigs.filter(c => c.stage_id && validStageIds.has(c.stage_id))
    }, [allStageConfigs, pipelineId, pipelineStages])

    // Build phase → stages mapping for fallback lookups
    // Agrupa por phase_id+pipeline_id para não herdar configs cross-pipeline
    const { stageToPhase, phaseToStages, stageToPipeline } = useMemo(() => {
        const s2p = new Map<string, string>()
        const s2pip = new Map<string, string>()
        const p2s = new Map<string, string[]>()
        if (!pipelineStages) return { stageToPhase: s2p, phaseToStages: p2s, stageToPipeline: s2pip }
        for (const stage of pipelineStages) {
            if (!stage.phase_id) continue
            s2p.set(stage.id, stage.phase_id)
            if (stage.pipeline_id) s2pip.set(stage.id, stage.pipeline_id)
            // Chave composta phase+pipeline para não misturar pipelines
            const key = `${stage.phase_id}|${stage.pipeline_id || ''}`
            const arr = p2s.get(key) || []
            arr.push(stage.id)
            p2s.set(key, arr)
        }
        return { stageToPhase: s2p, phaseToStages: p2s, stageToPipeline: s2pip }
    }, [pipelineStages])

    const isLoading = loadingFields || loadingConfigs || loadingSectionDefaults || loadingStages

    // Helper: Get config for a specific field in a stage
    // Priority: stage_field_config (exact) > stage_field_config (sibling in same phase) > section_field_config > system defaults
    // The phase-aware fallback ensures that configs set via "Campos por fase" in Seções
    // are respected even when individual stages don't have explicit configs.
    const getFieldConfig = useCallback((stageId: string, fieldKey: string): FieldConfigResult | null => {
        if (!systemFields) return null

        const field = systemFields.find(f => f.key === fieldKey)
        if (!field) return null

        // 1. Exact stage config
        let stageConfig = stageConfigs?.find(c => c.stage_id === stageId && c.field_key === fieldKey)

        // 2. Phase-aware fallback: if no config for this stage, check sibling stages in the same phase.
        // Only inherit if ALL siblings agree (i.e., it's a uniform phase-level config).
        // If siblings diverge, skip fallback to avoid arbitrary results.
        if (!stageConfig && stageConfigs) {
            const phaseId = stageToPhase.get(stageId)
            const pipeId = stageToPipeline.get(stageId)
            if (phaseId) {
                const key = `${phaseId}|${pipeId || ''}`
                const siblingIds = phaseToStages.get(key) || []
                const sibConfigs = siblingIds
                    .filter(id => id !== stageId)
                    .map(id => stageConfigs.find(c => c.stage_id === id && c.field_key === fieldKey))
                    .filter((c): c is StageFieldConfig => !!c)

                if (sibConfigs.length > 0) {
                    const first = sibConfigs[0]
                    const allSame = sibConfigs.every(c =>
                        c.is_visible === first.is_visible &&
                        c.is_required === first.is_required &&
                        c.show_in_header === first.show_in_header &&
                        (c as StageFieldConfig & { is_secondary?: boolean }).is_secondary === (first as StageFieldConfig & { is_secondary?: boolean }).is_secondary
                    )
                    if (allSame) {
                        stageConfig = first
                    }
                }
            }
        }

        // 3. Section-level defaults
        const sectionDefault = sectionFieldConfigs?.find(
            c => c.section_key === (field.section || 'details') && c.field_key === fieldKey
        )

        return {
            key: field.key,
            label: stageConfig?.custom_label || field.label,
            type: field.type,
            section: field.section || 'details',
            isVisible: stageConfig?.is_visible ?? sectionDefault?.is_visible ?? true,
            isRequired: stageConfig?.is_required ?? sectionDefault?.is_required ?? false,
            isHeader: stageConfig?.show_in_header ?? false,
            isSecondary: (stageConfig as StageFieldConfig & { is_secondary?: boolean })?.is_secondary ?? false,
            customLabel: stageConfig?.custom_label,
            options: field.options
        }
    }, [systemFields, stageConfigs, sectionFieldConfigs, stageToPhase, phaseToStages, stageToPipeline])

    // Helper: Get all visible fields for a stage, optionally filtered by section
    const getVisibleFields = useCallback((stageId: string, section?: string): FieldConfigResult[] => {
        if (!systemFields) return []

        return systemFields
            .map(field => getFieldConfig(stageId, field.key))
            .filter((config): config is FieldConfigResult => {
                if (!config) return false
                if (!config.isVisible) return false
                if (section && config.section !== section) return false
                return true
            })
    }, [systemFields, getFieldConfig])

    // Helper: Get header fields for a stage
    const getHeaderFields = useCallback((stageId: string): FieldConfigResult[] => {
        if (!systemFields) return []

        return systemFields
            .map(field => getFieldConfig(stageId, field.key))
            .filter((config): config is FieldConfigResult => {
                if (!config) return false
                return config.isHeader && config.isVisible
            })
    }, [systemFields, getFieldConfig])

    // Helper: Get required fields for a stage
    const getRequiredFields = useCallback((stageId: string): FieldConfigResult[] => {
        if (!systemFields) return []

        return systemFields
            .map(field => getFieldConfig(stageId, field.key))
            .filter((config): config is FieldConfigResult => {
                if (!config) return false
                return config.isRequired && config.isVisible
            })
    }, [systemFields, getFieldConfig])

    // Helper: Check if a field has a section-level default
    const hasSectionDefault = useCallback((sectionKey: string, fieldKey: string): boolean => {
        if (!sectionFieldConfigs) return false
        return sectionFieldConfigs.some(c => c.section_key === sectionKey && c.field_key === fieldKey)
    }, [sectionFieldConfigs])

    return {
        isLoading,
        systemFields,
        stageConfigs,
        sectionFieldConfigs,
        getFieldConfig,
        getVisibleFields,
        getHeaderFields,
        getRequiredFields,
        hasSectionDefault
    }
}
