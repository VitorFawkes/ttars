import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Plus, Settings2, Loader2, CheckCircle2, Copy } from 'lucide-react'
import {
    useSavedDashboard,
    useDashboardWidgets,
    useCreateDashboard,
    useUpdateDashboard,
    useAddWidget,
    useUpdateWidgetLayout,
    useRemoveWidget,
} from '@/hooks/reports/useSavedDashboards'
import { useAuth } from '@/contexts/AuthContext'
import DashboardGrid from './dashboard/DashboardGrid'
import WidgetCard from './dashboard/WidgetCard'
import AddWidgetDialog from './dashboard/AddWidgetDialog'
import DashboardFilters from './dashboard/DashboardFilters'
import type { DashboardGlobalFilters } from '@/lib/reports/reportTypes'

export default function DashboardEditor() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const { session, profile } = useAuth()
    const isNew = !id

    const [addWidgetOpen, setAddWidgetOpen] = useState(false)

    const { data: dashboard } = useSavedDashboard(id)
    const { data: widgets } = useDashboardWidgets(id)
    const createDashboard = useCreateDashboard()
    const updateDashboard = useUpdateDashboard()
    const addWidget = useAddWidget()
    const updateLayout = useUpdateWidgetLayout()
    const removeWidget = useRemoveWidget()

    // Can edit if: owner, admin, or new dashboard (not yet saved)
    const canEdit = !dashboard || dashboard.created_by === session?.user?.id || profile?.is_admin === true

    // Local edits — initialized from server data, user can override
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [globalFilters, setGlobalFilters] = useState<DashboardGlobalFilters>({})
    const [prevDashId, setPrevDashId] = useState<string | undefined>(undefined)

    // Adjust state when dashboard data changes (React-recommended pattern)
    // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
    if (dashboard?.id && dashboard.id !== prevDashId) {
        setPrevDashId(dashboard.id)
        setTitle(dashboard.title ?? '')
        setDescription(dashboard.description ?? '')
        setGlobalFilters(dashboard.global_filters ?? {})
    }

    const [saveError, setSaveError] = useState<string | null>(null)
    const [saveSuccess, setSaveSuccess] = useState(false)

    const handleSave = async () => {
        setSaveError(null)
        setSaveSuccess(false)
        try {
            if (isNew || !canEdit) {
                // New dashboard or fork (non-owner, non-admin)
                const saved = await createDashboard.mutateAsync({
                    title: title || 'Novo Dashboard',
                    description: description || undefined,
                    global_filters: globalFilters,
                })
                navigate(`/reports/dashboards/${saved.id}/edit`, { replace: true })
            } else if (id) {
                await updateDashboard.mutateAsync({
                    id,
                    title,
                    description,
                    global_filters: globalFilters,
                })
                setSaveSuccess(true)
                setTimeout(() => setSaveSuccess(false), 2000)
            }
        } catch (err) {
            setSaveError(err instanceof Error ? err.message : 'Erro ao salvar dashboard')
        }
    }

    const handleAddWidget = async (reportId: string) => {
        if (!id) return
        const maxY = widgets?.reduce((max, w) => Math.max(max, w.grid_y + w.grid_h), 0) ?? 0
        await addWidget.mutateAsync({
            dashboard_id: id,
            report_id: reportId,
            grid_y: maxY,
        })
    }

    const layoutDebounce = useRef<ReturnType<typeof setTimeout>>(undefined)
    const handleLayoutChange = useCallback((updates: { id: string; grid_x: number; grid_y: number; grid_w: number; grid_h: number }[]) => {
        if (!id) return
        clearTimeout(layoutDebounce.current)
        layoutDebounce.current = setTimeout(() => {
            updateLayout.mutate(
                { dashboardId: id, widgets: updates },
                { onError: (err) => setSaveError((err as Error).message ?? 'Erro ao salvar layout') },
            )
        }, 500)
    }, [id, updateLayout])

    // Cleanup debounce on unmount
    useEffect(() => () => clearTimeout(layoutDebounce.current), [])

    const handleRemoveWidget = async (widgetId: string) => {
        if (!id) return
        try {
            await removeWidget.mutateAsync({ widgetId, dashboardId: id })
        } catch (err) {
            setSaveError(err instanceof Error ? err.message : 'Erro ao remover widget')
        }
    }

    const isSaving = createDashboard.isPending || updateDashboard.isPending
    const existingReportIds = widgets?.map(w => w.report_id) ?? []

    return (
        <div className="flex flex-col h-full">
            {/* Top bar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/reports/dashboards')}
                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        aria-label="Voltar para dashboards"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div className="flex flex-col">
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Título do Dashboard"
                            className="text-lg font-semibold text-slate-900 bg-transparent border-0 focus:outline-none focus:ring-0 placeholder:text-slate-300 w-64"
                        />
                        <input
                            type="text"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Descrição (opcional)"
                            className="text-xs text-slate-500 bg-transparent border-0 focus:outline-none focus:ring-0 placeholder:text-slate-300 w-64 -mt-0.5"
                        />
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setAddWidgetOpen(true)}
                        disabled={isNew}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Widget
                    </button>
                    {saveError && (
                        <span className="text-xs text-red-500 mr-2">{saveError}</span>
                    )}
                    <button
                        onClick={handleSave}
                        disabled={!title.trim() || isSaving}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 ${saveSuccess ? 'bg-emerald-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                    >
                        {isSaving ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : saveSuccess ? (
                            <CheckCircle2 className="w-4 h-4" />
                        ) : !canEdit ? (
                            <Copy className="w-4 h-4" />
                        ) : (
                            <Save className="w-4 h-4" />
                        )}
                        {isSaving ? 'Salvando...' : saveSuccess ? 'Salvo!' : !canEdit ? 'Salvar cópia' : 'Salvar'}
                    </button>
                </div>
            </div>

            {/* Filters */}
            {!isNew && (
                <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/50">
                    <DashboardFilters filters={globalFilters} onChange={setGlobalFilters} />
                </div>
            )}

            {/* Grid */}
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
                {isNew ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                        <Settings2 className="w-12 h-12 mb-3 text-slate-200" />
                        <p className="text-sm font-medium">Salve o dashboard primeiro</p>
                        <p className="text-xs mt-1">Defina o título e salve para adicionar widgets</p>
                    </div>
                ) : widgets && widgets.length > 0 ? (
                    <DashboardGrid
                        widgets={widgets}
                        isEditing={true}
                        onLayoutChange={handleLayoutChange}
                        renderWidget={(widget) => (
                            <WidgetCard
                                widget={widget}
                                isEditing={true}
                                onRemove={() => handleRemoveWidget(widget.id)}
                                globalFilters={globalFilters}
                            />
                        )}
                    />
                ) : (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                        <Plus className="w-8 h-8 mb-2 text-slate-200" />
                        <p className="text-sm">Dashboard vazio</p>
                        <button
                            onClick={() => setAddWidgetOpen(true)}
                            className="mt-3 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                        >
                            + Adicionar primeiro widget
                        </button>
                    </div>
                )}
            </div>

            <AddWidgetDialog
                open={addWidgetOpen}
                onClose={() => setAddWidgetOpen(false)}
                onAdd={handleAddWidget}
                existingReportIds={existingReportIds}
            />
        </div>
    )
}
