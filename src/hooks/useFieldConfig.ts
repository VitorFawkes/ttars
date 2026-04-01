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

export function useFieldConfig() {
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
    const { data: stageConfigs, isLoading: loadingConfigs } = useQuery({
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
    // When a stage has no field config, we fall back to sibling stages in the same phase
    const { data: pipelineStages, isLoading: loadingStages } = useQuery({
        queryKey: ['pipeline-stages-phase-map'],
        queryFn: async () => {
            const { data } = await supabase
                .from('pipeline_stages')
                .select('id, phase_id')
            return data as { id: string; phase_id: string | null }[] | null
        },
        staleTime: 1000 * 60 * 5
    })

    // Build phase → stages mapping for fallback lookups
    const { stageToPhase, phaseToStages } = useMemo(() => {
        const s2p = new Map<string, string>()
        const p2s = new Map<string, string[]>()
        if (!pipelineStages) return { stageToPhase: s2p, phaseToStages: p2s }
        for (const stage of pipelineStages) {
            if (!stage.phase_id) continue
            s2p.set(stage.id, stage.phase_id)
            const arr = p2s.get(stage.phase_id) || []
            arr.push(stage.id)
            p2s.set(stage.phase_id, arr)
        }
        return { stageToPhase: s2p, phaseToStages: p2s }
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
            if (phaseId) {
                const siblingIds = phaseToStages.get(phaseId) || []
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
    }, [systemFields, stageConfigs, sectionFieldConfigs, stageToPhase, phaseToStages])

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
