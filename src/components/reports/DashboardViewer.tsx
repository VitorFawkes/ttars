import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Edit2, Trash2, Pin, PinOff, Loader2, AlertCircle } from 'lucide-react'
import {
    useSavedDashboard,
    useDashboardWidgets,
    useUpdateDashboard,
    useDeleteDashboard,
} from '@/hooks/reports/useSavedDashboards'
import type { DashboardGlobalFilters as DGF } from '@/lib/reports/reportTypes'
import DashboardGrid from './dashboard/DashboardGrid'
import WidgetCard from './dashboard/WidgetCard'
import DashboardFilters from './dashboard/DashboardFilters'
import type { DashboardGlobalFilters } from '@/lib/reports/reportTypes'

export default function DashboardViewer() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const { data: dashboard, isLoading } = useSavedDashboard(id)
    const { data: widgets } = useDashboardWidgets(id)
    const updateDashboard = useUpdateDashboard()
    const deleteDashboard = useDeleteDashboard()

    // Sync filters from server data (render-time adjustment)
    const [syncedId, setSyncedId] = useState<string | undefined>()
    const [globalFilters, setGlobalFilters] = useState<DashboardGlobalFilters>({})
    if (dashboard && dashboard.id !== syncedId) {
        setSyncedId(dashboard.id)
        setGlobalFilters(dashboard.global_filters ?? {})
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
            </div>
        )
    }

    if (!dashboard) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <AlertCircle className="w-8 h-8 mb-2" />
                <p className="text-sm">Dashboard não encontrado</p>
            </div>
        )
    }

    const handleDelete = async () => {
        if (!confirm('Tem certeza que deseja excluir este dashboard?')) return
        await deleteDashboard.mutateAsync(dashboard.id)
        navigate('/reports/dashboards')
    }

    const handleTogglePin = () => {
        updateDashboard.mutate({ id: dashboard.id, pinned: !dashboard.pinned })
    }

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/reports/dashboards')}
                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div>
                        <h1 className="text-lg font-semibold text-slate-900">{dashboard.title}</h1>
                        {dashboard.description && (
                            <p className="text-xs text-slate-400 mt-0.5">{dashboard.description}</p>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleTogglePin}
                        className="p-2 text-slate-400 hover:text-amber-500 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        {dashboard.pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                    </button>
                    <button
                        onClick={() => navigate(`/reports/dashboards/${id}/edit`)}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        <Edit2 className="w-3.5 h-3.5" />
                        Editar
                    </button>
                    <button
                        onClick={handleDelete}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/50">
                <DashboardFilters filters={globalFilters} onChange={(f: DGF) => {
                    setGlobalFilters(f)
                    if (dashboard) updateDashboard.mutate({ id: dashboard.id, global_filters: f })
                }} />
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
                {widgets && widgets.length > 0 ? (
                    <DashboardGrid
                        widgets={widgets}
                        isEditing={false}
                        renderWidget={(widget) => (
                            <WidgetCard
                                widget={widget}
                                isEditing={false}
                                globalFilters={globalFilters}
                            />
                        )}
                    />
                ) : (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                        <p className="text-sm">Dashboard sem widgets</p>
                        <button
                            onClick={() => navigate(`/reports/dashboards/${id}/edit`)}
                            className="mt-2 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                        >
                            Editar dashboard
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
