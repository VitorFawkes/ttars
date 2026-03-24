import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

interface SectionFieldConfig {
    id: string
    section_key: string
    field_key: string
    is_visible: boolean
    is_required: boolean
}

const QUERY_KEY = ['section-field-configs']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sfc = () => supabase.from('section_field_config' as any)

export function useSectionFieldConfig() {
    const queryClient = useQueryClient()

    const { data: configs, isLoading } = useQuery({
        queryKey: QUERY_KEY,
        queryFn: async () => {
            const { data, error } = await sfc().select('*')
            if (error) throw error
            return data as unknown as SectionFieldConfig[]
        },
        staleTime: 1000 * 60 * 5
    })

    /** Returns section-level defaults for a field, or null if no row exists (system default) */
    const getFieldDefault = useCallback((sectionKey: string, fieldKey: string): { isVisible: boolean; isRequired: boolean } | null => {
        if (!configs) return null
        const config = configs.find(c => c.section_key === sectionKey && c.field_key === fieldKey)
        if (!config) return null
        return { isVisible: config.is_visible, isRequired: config.is_required }
    }, [configs])

    /** Returns true if a section-level default exists for this field */
    const hasDefault = useCallback((sectionKey: string, fieldKey: string): boolean => {
        if (!configs) return false
        return configs.some(c => c.section_key === sectionKey && c.field_key === fieldKey)
    }, [configs])

    /** Returns all configs for a given section */
    const getSectionDefaults = useCallback((sectionKey: string): SectionFieldConfig[] => {
        if (!configs) return []
        return configs.filter(c => c.section_key === sectionKey)
    }, [configs])

    /** Upsert a section-level default for a field */
    const upsertDefault = useMutation({
        mutationFn: async ({ sectionKey, fieldKey, isVisible, isRequired }: {
            sectionKey: string; fieldKey: string; isVisible: boolean; isRequired: boolean
        }) => {
            const { error } = await sfc()
                .upsert(
                    { section_key: sectionKey, field_key: fieldKey, is_visible: isVisible, is_required: isRequired },
                    { onConflict: 'section_key,field_key' }
                )
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEY })
            queryClient.invalidateQueries({ queryKey: ['section-field-configs'] })
        }
    })

    /** Delete a section-level default (restore system default: visible, not required) */
    const deleteDefault = useMutation({
        mutationFn: async ({ sectionKey, fieldKey }: { sectionKey: string; fieldKey: string }) => {
            const { error } = await sfc()
                .delete()
                .eq('section_key', sectionKey)
                .eq('field_key', fieldKey)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEY })
        }
    })

    return {
        configs,
        isLoading,
        getFieldDefault,
        hasDefault,
        getSectionDefaults,
        upsertDefault,
        deleteDefault
    }
}
