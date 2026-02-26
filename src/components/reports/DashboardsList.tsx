import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Pin, Clock, Loader2, LayoutDashboard } from 'lucide-react'
import { useSavedDashboards } from '@/hooks/reports/useSavedDashboards'

export default function DashboardsList() {
    const navigate = useNavigate()
    const [search, setSearch] = useState('')
    const { data: dashboards, isLoading } = useSavedDashboards()

    const filtered = useMemo(() => {
        if (!dashboards) return []
        if (!search) return dashboards
        const q = search.toLowerCase()
        return dashboards.filter(d =>
            d.title.toLowerCase().includes(q) ||
            d.description?.toLowerCase().includes(q)
        )
    }, [dashboards, search])

    return (
        <div className="flex-1 overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Meus Dashboards</h1>
                    <p className="text-sm text-slate-400 mt-0.5">Painéis customizados com múltiplos relatórios</p>
                </div>
                <button
                    onClick={() => navigate('/reports/dashboards/new')}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm"
                >
                    <Plus className="w-4 h-4" />
                    Novo Dashboard
                </button>
            </div>

            <div className="relative mb-4">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                    type="text"
                    placeholder="Buscar dashboards..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                    <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                        <LayoutDashboard className="w-7 h-7 text-slate-300" />
                    </div>
                    <p className="text-sm font-medium text-slate-500">Nenhum dashboard criado</p>
                    <p className="text-xs mt-1 mb-4">Crie um dashboard para agrupar seus relatórios</p>
                    <button
                        onClick={() => navigate('/reports/dashboards/new')}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Novo Dashboard
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map(dash => (
                        <button
                            key={dash.id}
                            onClick={() => navigate(`/reports/dashboards/${dash.id}`)}
                            className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md hover:border-indigo-200 transition-all group"
                        >
                            <div className="flex items-start justify-between mb-3">
                                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                                    <LayoutDashboard className="w-4 h-4 text-indigo-600" />
                                </div>
                                {dash.pinned && <Pin className="w-3 h-3 text-amber-500" />}
                            </div>
                            <h3 className="text-sm font-semibold text-slate-900 group-hover:text-indigo-700 truncate">
                                {dash.title}
                            </h3>
                            {dash.description && (
                                <p className="text-xs text-slate-400 mt-1 line-clamp-2">{dash.description}</p>
                            )}
                            <div className="flex items-center gap-1.5 mt-3 text-[10px] text-slate-400">
                                <Clock className="w-3 h-3" />
                                {new Date(dash.updated_at).toLocaleDateString('pt-BR')}
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
