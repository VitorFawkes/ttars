import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { SavedDashboard, DashboardWidget, DashboardGlobalFilters } from '@/lib/reports/reportTypes'

const DASHBOARDS_KEY = ['custom-dashboards']

export function useSavedDashboards() {
    const { session } = useAuth()

    return useQuery({
        queryKey: DASHBOARDS_KEY,
        queryFn: async () => {
            const { data, error } = await supabase
                .from('custom_dashboards')
                .select('*')
                .order('pinned', { ascending: false })
                .order('updated_at', { ascending: false })

            if (error) throw error
            return data as unknown as SavedDashboard[]
        },
        enabled: !!session,
    })
}

export function useSavedDashboard(dashboardId: string | undefined) {
    return useQuery({
        queryKey: [...DASHBOARDS_KEY, dashboardId],
        queryFn: async () => {
            if (!dashboardId) throw new Error('No dashboard ID')
            const { data, error } = await supabase
                .from('custom_dashboards')
                .select('*')
                .eq('id', dashboardId)
                .single()

            if (error) throw error
            return data as unknown as SavedDashboard
        },
        enabled: !!dashboardId,
    })
}

export function useDashboardWidgets(dashboardId: string | undefined) {
    return useQuery({
        queryKey: [...DASHBOARDS_KEY, dashboardId, 'widgets'],
        queryFn: async () => {
            if (!dashboardId) throw new Error('No dashboard ID')
            const { data, error } = await supabase
                .from('dashboard_widgets')
                .select('*, report:custom_reports(*)')
                .eq('dashboard_id', dashboardId)
                .order('grid_y', { ascending: true })
                .order('grid_x', { ascending: true })

            if (error) throw error
            return data as unknown as (DashboardWidget & { report: DashboardWidget['report'] })[]
        },
        enabled: !!dashboardId,
    })
}

export function useCreateDashboard() {
    const queryClient = useQueryClient()
    const { session } = useAuth()

    return useMutation({
        mutationFn: async (params: {
            title: string
            description?: string
            visibility?: 'private' | 'team' | 'everyone'
            global_filters?: DashboardGlobalFilters
        }) => {
            const { data, error } = await supabase
                .from('custom_dashboards')
                .insert({
                    title: params.title,
                    description: params.description || null,
                    created_by: session!.user.id,
                    visibility: params.visibility || 'private',
                    global_filters: params.global_filters || {},
                })
                .select()
                .single()

            if (error) throw error
            return data as unknown as SavedDashboard
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: DASHBOARDS_KEY })
        },
    })
}

export function useUpdateDashboard() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (params: {
            id: string
            title?: string
            description?: string
            global_filters?: DashboardGlobalFilters
            visibility?: 'private' | 'team' | 'everyone'
            pinned?: boolean
        }) => {
            const updates: Record<string, unknown> = {}
            if (params.title !== undefined) updates.title = params.title
            if (params.description !== undefined) updates.description = params.description
            if (params.global_filters !== undefined) updates.global_filters = params.global_filters
            if (params.visibility !== undefined) updates.visibility = params.visibility
            if (params.pinned !== undefined) updates.pinned = params.pinned

            const { data, error } = await supabase
                .from('custom_dashboards')
                .update(updates)
                .eq('id', params.id)
                .select()
                .single()

            if (error) throw error
            return data as unknown as SavedDashboard
        },
        onSuccess: (data: SavedDashboard) => {
            queryClient.invalidateQueries({ queryKey: DASHBOARDS_KEY })
            queryClient.invalidateQueries({ queryKey: [...DASHBOARDS_KEY, data.id] })
        },
    })
}

export function useDeleteDashboard() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (dashboardId: string) => {
            const { error } = await supabase
                .from('custom_dashboards')
                .delete()
                .eq('id', dashboardId)

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: DASHBOARDS_KEY })
        },
    })
}

export function useAddWidget() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (params: {
            dashboard_id: string
            report_id: string
            grid_x?: number
            grid_y?: number
            grid_w?: number
            grid_h?: number
        }) => {
            const { data, error } = await supabase
                .from('dashboard_widgets')
                .insert({
                    dashboard_id: params.dashboard_id,
                    report_id: params.report_id,
                    grid_x: params.grid_x ?? 0,
                    grid_y: params.grid_y ?? 0,
                    grid_w: params.grid_w ?? 6,
                    grid_h: params.grid_h ?? 4,
                })
                .select()
                .single()

            if (error) throw error
            return data as unknown as DashboardWidget
        },
        onSuccess: (data: DashboardWidget) => {
            queryClient.invalidateQueries({ queryKey: [...DASHBOARDS_KEY, data.dashboard_id, 'widgets'] })
        },
    })
}

export function useUpdateWidgetLayout() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (params: {
            dashboardId: string
            widgets: { id: string; grid_x: number; grid_y: number; grid_w: number; grid_h: number }[]
        }) => {
            const updates = params.widgets.map(w =>
                supabase
                    .from('dashboard_widgets')
                    .update({ grid_x: w.grid_x, grid_y: w.grid_y, grid_w: w.grid_w, grid_h: w.grid_h })
                    .eq('id', w.id)
            )
            await Promise.all(updates)
        },
        onSuccess: (_: unknown, params: { dashboardId: string; widgets: { id: string; grid_x: number; grid_y: number; grid_w: number; grid_h: number }[] }) => {
            queryClient.invalidateQueries({ queryKey: [...DASHBOARDS_KEY, params.dashboardId, 'widgets'] })
        },
    })
}

export function useRemoveWidget() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (params: { widgetId: string; dashboardId: string }) => {
            const { error } = await supabase
                .from('dashboard_widgets')
                .delete()
                .eq('id', params.widgetId)

            if (error) throw error
        },
        onSuccess: (_: unknown, params: { widgetId: string; dashboardId: string }) => {
            queryClient.invalidateQueries({ queryKey: [...DASHBOARDS_KEY, params.dashboardId, 'widgets'] })
        },
    })
}
