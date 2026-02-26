import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Json } from '@/database.types'
import type { SavedReport, ReportIQR, VisualizationConfig } from '@/lib/reports/reportTypes'

const REPORTS_KEY = ['custom-reports']

export function useSavedReports() {
    const { session } = useAuth()

    return useQuery({
        queryKey: REPORTS_KEY,
        queryFn: async () => {
            const { data, error } = await supabase
                .from('custom_reports')
                .select('*')
                .order('pinned', { ascending: false })
                .order('updated_at', { ascending: false })

            if (error) throw error
            return data as unknown as SavedReport[]
        },
        enabled: !!session,
    })
}

export function useSavedReport(reportId: string | undefined) {
    return useQuery({
        queryKey: [...REPORTS_KEY, reportId],
        queryFn: async () => {
            if (!reportId) throw new Error('No report ID')
            const { data, error } = await supabase
                .from('custom_reports')
                .select('*')
                .eq('id', reportId)
                .single()

            if (error) throw error
            return data as unknown as SavedReport
        },
        enabled: !!reportId,
    })
}

export function useCreateReport() {
    const queryClient = useQueryClient()
    const { session } = useAuth()

    return useMutation({
        mutationFn: async (params: {
            title: string
            description?: string
            config: ReportIQR
            visualization: VisualizationConfig
            visibility?: 'private' | 'team' | 'everyone'
            category?: string
        }) => {
            const { data, error } = await supabase
                .from('custom_reports')
                .insert({
                    title: params.title,
                    description: params.description || null,
                    config: params.config as unknown as Json,
                    visualization: params.visualization as unknown as Json,
                    created_by: session!.user.id,
                    visibility: params.visibility || 'private',
                    category: params.category || null,
                })
                .select()
                .single()

            if (error) throw error
            return data as unknown as SavedReport
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: REPORTS_KEY })
        },
    })
}

export function useUpdateReport() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (params: {
            id: string
            title?: string
            description?: string
            config?: ReportIQR
            visualization?: VisualizationConfig
            visibility?: 'private' | 'team' | 'everyone'
            pinned?: boolean
            category?: string
        }) => {
            const updates: Record<string, unknown> = {}
            if (params.title !== undefined) updates.title = params.title
            if (params.description !== undefined) updates.description = params.description
            if (params.config !== undefined) updates.config = params.config
            if (params.visualization !== undefined) updates.visualization = params.visualization
            if (params.visibility !== undefined) updates.visibility = params.visibility
            if (params.pinned !== undefined) updates.pinned = params.pinned
            if (params.category !== undefined) updates.category = params.category

            const { data, error } = await supabase
                .from('custom_reports')
                .update(updates)
                .eq('id', params.id)
                .select()
                .single()

            if (error) throw error
            return data as unknown as SavedReport
        },
        onSuccess: (data: SavedReport) => {
            queryClient.invalidateQueries({ queryKey: REPORTS_KEY })
            queryClient.invalidateQueries({ queryKey: [...REPORTS_KEY, data.id] })
        },
    })
}

export function useDeleteReport() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (reportId: string) => {
            const { error } = await supabase
                .from('custom_reports')
                .delete()
                .eq('id', reportId)

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: REPORTS_KEY })
        },
    })
}
