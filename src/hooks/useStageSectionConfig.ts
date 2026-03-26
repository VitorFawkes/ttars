import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

interface StageSectionConfig {
    id: string
    stage_id: string
    section_key: string
    is_visible: boolean
    default_collapsed: boolean
}

const QUERY_KEY = ['stage-section-configs']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ssc = () => supabase.from('stage_section_config' as any)

export function useStageSectionConfig() {
    const queryClient = useQueryClient()

    const { data: configs, isLoading } = useQuery({
        queryKey: QUERY_KEY,
        queryFn: async () => {
            const { data, error } = await ssc().select('*')
            if (error) throw error
            return data as unknown as StageSectionConfig[]
        },
        staleTime: 1000 * 60 * 5
    })

    /** Returns true if section should be visible at this stage (default: visible) */
    const isSectionVisible = useCallback((stageId: string | null, sectionKey: string): boolean => {
        if (!stageId || !configs) return true
        const config = configs.find(c => c.stage_id === stageId && c.section_key === sectionKey)
        return config?.is_visible ?? true
    }, [configs])

    /** Returns all hidden section keys for a given stage */
    const getHiddenSections = useCallback((stageId: string): string[] => {
        if (!configs) return []
        return configs
            .filter(c => c.stage_id === stageId && !c.is_visible)
            .map(c => c.section_key)
    }, [configs])

    /** Returns true if section should start collapsed at this stage (default: expanded) */
    const isSectionCollapsed = useCallback((stageId: string | null, sectionKey: string): boolean => {
        if (!stageId || !configs) return false
        const config = configs.find(c => c.stage_id === stageId && c.section_key === sectionKey)
        return config?.default_collapsed ?? false
    }, [configs])

    /** Returns all collapsed section keys for a given stage */
    const getCollapsedSections = useCallback((stageId: string): string[] => {
        if (!configs) return []
        return configs
            .filter(c => c.stage_id === stageId && c.default_collapsed)
            .map(c => c.section_key)
    }, [configs])

    /** Toggle section visibility for a stage */
    const toggleVisibility = useMutation({
        mutationFn: async ({ stageId, sectionKey, visible }: { stageId: string; sectionKey: string; visible: boolean }) => {
            const existing = configs?.find(c => c.stage_id === stageId && c.section_key === sectionKey)
            if (visible && !existing?.default_collapsed) {
                // No collapse config either — safe to delete the row entirely
                const { error } = await ssc()
                    .delete()
                    .eq('stage_id', stageId)
                    .eq('section_key', sectionKey)
                if (error) throw error
            } else {
                // Upsert preserving default_collapsed
                const { error } = await ssc()
                    .upsert(
                        {
                            stage_id: stageId,
                            section_key: sectionKey,
                            is_visible: visible,
                            default_collapsed: existing?.default_collapsed ?? false
                        },
                        { onConflict: 'stage_id,section_key' }
                    )
                if (error) throw error
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEY })
        }
    })

    /** Toggle section collapse for a stage */
    const toggleCollapsed = useMutation({
        mutationFn: async ({ stageId, sectionKey, collapsed }: { stageId: string; sectionKey: string; collapsed: boolean }) => {
            const existing = configs?.find(c => c.stage_id === stageId && c.section_key === sectionKey)
            const isVisible = existing?.is_visible ?? true
            if (!collapsed && isVisible) {
                // Both defaults — delete the row
                const { error } = await ssc()
                    .delete()
                    .eq('stage_id', stageId)
                    .eq('section_key', sectionKey)
                if (error) throw error
                return
            }
            const { error } = await ssc()
                .upsert(
                    {
                        stage_id: stageId,
                        section_key: sectionKey,
                        is_visible: isVisible,
                        default_collapsed: collapsed
                    },
                    { onConflict: 'stage_id,section_key' }
                )
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEY })
        }
    })

    return {
        configs,
        isLoading,
        isSectionVisible,
        isSectionCollapsed,
        getHiddenSections,
        getCollapsedSections,
        toggleVisibility,
        toggleCollapsed
    }
}
