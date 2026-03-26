import { useCallback } from 'react'
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

    const isLoading = loadingFields || loadingConfigs || loadingSectionDefaults

    // Helper: Get config for a specific field in a stage
    // Priority: stage_field_config > section_field_config > system defaults (visible, not required)
    const getFieldConfig = useCallback((stageId: string, fieldKey: string): FieldConfigResult | null => {
        if (!systemFields) return null

        const field = systemFields.find(f => f.key === fieldKey)
        if (!field) return null

        const stageConfig = stageConfigs?.find(c => c.stage_id === stageId && c.field_key === fieldKey)
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
    }, [systemFields, stageConfigs, sectionFieldConfigs])

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
