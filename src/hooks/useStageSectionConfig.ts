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

    /** Toggle section visibility for a stage. Inserts is_visible=false to hide, deletes row to restore default. */
    const toggleVisibility = useMutation({
        mutationFn: async ({ stageId, sectionKey, visible }: { stageId: string; sectionKey: string; visible: boolean }) => {
            if (visible) {
                // Restore default: delete the row
                await ssc()
                    .delete()
                    .eq('stage_id', stageId)
                    .eq('section_key', sectionKey)
            } else {
                // Hide: upsert with is_visible=false
                await ssc()
                    .upsert(
                        { stage_id: stageId, section_key: sectionKey, is_visible: false },
                        { onConflict: 'stage_id,section_key' }
                    )
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEY })
        }
    })

    /** Toggle section collapse for a stage */
    const toggleCollapsed = useMutation({
        mutationFn: async ({ stageId, sectionKey, collapsed }: { stageId: string; sectionKey: string; collapsed: boolean }) => {
            // Upsert: set default_collapsed, keep is_visible as-is (default true)
            const existing = configs?.find(c => c.stage_id === stageId && c.section_key === sectionKey)
            await ssc()
                .upsert(
                    {
                        stage_id: stageId,
                        section_key: sectionKey,
                        is_visible: existing?.is_visible ?? true,
                        default_collapsed: collapsed
                    },
                    { onConflict: 'stage_id,section_key' }
                )
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
