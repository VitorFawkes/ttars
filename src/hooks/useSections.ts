import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface Section {
    id: string
    key: string
    label: string
    color: string
    icon: string
    position: 'left_column' | 'right_column'
    order_index: number
    pipeline_id: string | null
    is_governable: boolean
    is_system: boolean
    active: boolean
    created_at: string
    updated_at: string
    /** If set, renders a specialized widget component instead of dynamic fields */
    widget_component: string | null
    /** Product scope: NULL = shared across all products */
    produto: string | null
}

export type SectionPosition = 'left_column' | 'right_column'

/**
 * Fetches active sections from the database, optionally filtered by product.
 * When `produto` is provided, returns sections where produto matches OR produto is NULL (shared).
 * Without `produto`, returns all active sections (backward compatible).
 *
 * @example
 * const { data: sections } = useSections() // all sections
 * const { data: weddingSections } = useSections('WEDDING') // WEDDING + shared
 */
export function useSections(produto?: string) {
    return useQuery({
        queryKey: ['sections', produto || 'all'],
        queryFn: async () => {
            let query = supabase
                .from('sections')
                .select('*')
                .eq('active', true)
                .order('order_index')

            if (produto) {
                query = query.or(`produto.is.null,produto.eq.${produto}`)
            }

            const { data, error } = await query
            if (error) throw error
            return data as Section[]
        },
        staleTime: 1000 * 30
    })
}

/**
 * Returns sections filtered by position for CardDetail layout.
 */
export function useSectionsByPosition(position: SectionPosition) {
    const { data: sections, ...rest } = useSections()

    return {
        data: sections?.filter(s => s.position === position),
        ...rest
    }
}

/**
 * Returns only governable sections (for StudioUnified matrix).
 * Replaces GOVERNABLE_SECTIONS constant.
 */
export function useGovernableSections() {
    const { data: sections, ...rest } = useSections()

    return {
        data: sections?.filter(s => s.is_governable),
        ...rest
    }
}

/**
 * Returns section options formatted for Select components.
 * Replaces SECTIONS.map(s => ({ value: s.value, label: s.label }))
 */
export function useSectionOptions() {
    const { data: sections, ...rest } = useSections()

    return {
        data: sections?.map(s => ({
            value: s.key,
            label: s.label
        })),
        ...rest
    }
}

/**
 * Returns a map of section key to label for display purposes.
 * Replaces SECTION_LABELS in integration components.
 */
export function useSectionLabelsMap() {
    const { data: sections, ...rest } = useSections()

    const labelsMap = sections?.reduce((acc, s) => {
        acc[s.key] = s.label
        return acc
    }, {} as Record<string, string>)

    return {
        data: labelsMap,
        ...rest
    }
}

// --- MUTATIONS ---

interface CreateSectionInput {
    key: string
    label: string
    color?: string
    icon?: string
    position?: SectionPosition
    is_governable?: boolean
    pipeline_id?: string | null
}

interface UpdateSectionInput {
    id: string
    label?: string
    color?: string
    icon?: string
    position?: SectionPosition
    order_index?: number
    is_governable?: boolean
    active?: boolean
}

/**
 * Hook for section CRUD operations.
 */
export function useSectionMutations() {
    const queryClient = useQueryClient()

    const createSection = useMutation({
        mutationFn: async (input: CreateSectionInput) => {
            // Generate key from label if not provided
            const key = input.key || input.label.toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]+/g, '_')
                .replace(/^_|_$/g, '')

            const { data, error } = await supabase
                .from('sections')
                .insert({
                    key,
                    label: input.label,
                    color: input.color || 'bg-gray-50 text-gray-700 border-gray-100',
                    icon: input.icon || 'layers',
                    position: input.position || 'left_column',
                    is_governable: input.is_governable ?? true,
                    pipeline_id: input.pipeline_id || null,
                    is_system: false,
                    active: true
                })
                .select()
                .single()

            if (error) throw error
            return data as Section
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sections'] })
        }
    })

    const updateSection = useMutation({
        mutationFn: async (input: UpdateSectionInput) => {
            const { id, ...updates } = input

            const { data, error } = await supabase
                .from('sections')
                .update(updates)
                .eq('id', id)
                .select()
                .single()

            if (error) throw error
            return data as Section
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sections'] })
        }
    })

    const deleteSection = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('sections')
                .delete()
                .eq('id', id)
                .eq('is_system', false) // Can only delete non-system sections

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sections'] })
        }
    })

    const reorderSections = useMutation({
        mutationFn: async (updates: { id: string; order_index: number }[]) => {
            const promises = updates.map(({ id, order_index }) =>
                supabase
                    .from('sections')
                    .update({ order_index })
                    .eq('id', id)
            )

            const results = await Promise.all(promises)
            const errors = results.filter(r => r.error)

            if (errors.length > 0) {
                throw new Error('Failed to reorder sections')
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sections'] })
        }
    })

    return {
        createSection,
        updateSection,
        deleteSection,
        reorderSections
    }
}
