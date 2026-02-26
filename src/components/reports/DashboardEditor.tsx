import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Plus, Settings2 } from 'lucide-react'
import {
    useSavedDashboard,
    useDashboardWidgets,
    useCreateDashboard,
    useUpdateDashboard,
    useAddWidget,
    useUpdateWidgetLayout,
    useRemoveWidget,
} from '@/hooks/reports/useSavedDashboards'
import DashboardGrid from './dashboard/DashboardGrid'
import WidgetCard from './dashboard/WidgetCard'
import AddWidgetDialog from './dashboard/AddWidgetDialog'
import DashboardFilters from './dashboard/DashboardFilters'
import type { DashboardGlobalFilters } from '@/lib/reports/reportTypes'

export default function DashboardEditor() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const isNew = !id

    const [addWidgetOpen, setAddWidgetOpen] = useState(false)

    const { data: dashboard } = useSavedDashboard(id)
    const { data: widgets } = useDashboardWidgets(id)
    const createDashboard = useCreateDashboard()
    const updateDashboard = useUpdateDashboard()
    const addWidget = useAddWidget()
    const updateLayout = useUpdateWidgetLayout()
    const removeWidget = useRemoveWidget()

    // Sync state from server data (render-time adjustment)
    const [syncedId, setSyncedId] = useState<string | undefined>()
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [globalFilters, setGlobalFilters] = useState<DashboardGlobalFilters>({})
    if (dashboard && dashboard.id !== syncedId) {
        setSyncedId(dashboard.id)
        setTitle(dashboard.title)
        setDescription(dashboard.description ?? '')
        setGlobalFilters(dashboard.global_filters ?? {})
    }

    const handleSave = async () => {
        if (isNew) {
            const saved = await createDashboard.mutateAsync({
                title: title || 'Novo Dashboard',
                description: description || undefined,
            })
            navigate(`/reports/dashboards/${saved.id}/edit`, { replace: true })
        } else if (id) {
            await updateDashboard.mutateAsync({
                id,
                title,
                description,
                global_filters: globalFilters,
            })
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

    const handleLayoutChange = (updates: { id: string; grid_x: number; grid_y: number; grid_w: number; grid_h: number }[]) => {
        if (!id) return
        updateLayout.mutate({ dashboardId: id, widgets: updates })
    }

    const handleRemoveWidget = (widgetId: string) => {
        if (!id) return
        removeWidget.mutate({ widgetId, dashboardId: id })
    }

    const existingReportIds = widgets?.map(w => w.report_id) ?? []

    return (
        <div className="flex flex-col h-full">
            {/* Top bar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/reports/dashboards')}
                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Título do Dashboard"
                        className="text-lg font-semibold text-slate-900 bg-transparent border-0 focus:outline-none focus:ring-0 placeholder:text-slate-300 w-64"
                    />
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
                    <button
                        onClick={handleSave}
                        disabled={!title.trim()}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                        <Save className="w-4 h-4" />
                        Salvar
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
