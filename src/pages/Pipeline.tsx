import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import KanbanBoard from '../components/pipeline/KanbanBoard'
import PipelineListView from '../components/pipeline/PipelineListView'
import { cn } from '../lib/utils'
import CreateCardModal from '../components/pipeline/CreateCardModal'

import { usePipelineFilters } from '../hooks/usePipelineFilters'
import { useProductContext } from '../hooks/useProductContext'
import { useMyTeamPhase } from '../hooks/useMyTeamPhase'
import { useAuth } from '../contexts/AuthContext'

import { FilterDrawer } from '../components/pipeline/FilterDrawer'
import { ActiveFilters } from '../components/pipeline/ActiveFilters'
import { Filter, Link, User, ArrowUpDown, Calendar, Clock, CheckSquare, Search } from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "../components/ui/dropdown-menu"

import { ErrorBoundary } from '../components/ui/ErrorBoundary'

export default function Pipeline() {
    const navigate = useNavigate()
    const {
        viewMode, subView, groupFilters, filters, _phaseAutoApplied,
        setViewMode, setSubView, setGroupFilters, setFilters, setAll
    } = usePipelineFilters()
    const { currentProduct } = useProductContext()
    const { profile } = useAuth()
    const { data: myTeamPhase } = useMyTeamPhase()
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

    const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false)

    // Auto-filter: agentes (não-admin) veem inicialmente apenas a fase do seu time
    // Flag _phaseAutoApplied persiste no Zustand entre navegações, evitando re-aplicação
    const isAdmin = profile?.is_admin === true
    useEffect(() => {
        if (_phaseAutoApplied || isAdmin || !myTeamPhase) return
        setAll({ filters: { ...filters, phaseFilter: myTeamPhase.id }, _phaseAutoApplied: true })
    }, [myTeamPhase, isAdmin, _phaseAutoApplied]) // eslint-disable-line react-hooks/exhaustive-deps


    const [viewType, setViewType] = useState<'kanban' | 'list'>(() => {
        const saved = localStorage.getItem('pipeline_view_type')
        return (saved === 'kanban' || saved === 'list') ? saved : 'kanban'
    })

    const handleSetViewType = (type: 'kanban' | 'list') => {
        setViewType(type)
        localStorage.setItem('pipeline_view_type', type)
    }

    const getSortLabel = () => {
        const { sortBy, sortDirection } = filters
        if (!sortBy) return 'Ordenar'

        switch (sortBy) {
            case 'created_at':
                return sortDirection === 'asc' ? 'Criação (Antigos)' : 'Criação (Novos)'
            case 'updated_at':
                return sortDirection === 'asc' ? 'Atualização (Antigos)' : 'Atualização (Recentes)'
            case 'data_viagem_inicio':
                return sortDirection === 'asc' ? 'Viagem (Próximas)' : 'Viagem (Distantes)'
            case 'data_proxima_tarefa':
                return sortDirection === 'asc' ? 'Tarefa (Urgentes)' : 'Tarefa (Futuras)'
            default:
                return 'Ordenar'
        }
    }

    return (
        <ErrorBoundary>
            {/* Main Container: Uses h-full to fill the Layout shell */}
            <div className="flex h-full flex-col relative overflow-hidden bg-gray-50/50">

                {/* Header Section: Compact single row */}
                <div className="flex-shrink-0 py-3 px-6 bg-white/50 backdrop-blur-sm border-b border-gray-200/50 z-10">
                    <header className="flex items-center justify-between gap-4 mb-3">
                        <div className="flex items-center gap-4">
                            <h1 className="text-xl font-semibold text-gray-900 tracking-tight">Pipeline</h1>
                            <span className="text-sm text-gray-400 hidden md:inline">Gerencie suas oportunidades</span>
                        </div>

                        {/* View Type Toggle */}
                        <div className="flex bg-gray-100/50 p-1 rounded-lg border border-gray-200/50">
                            <button
                                onClick={() => handleSetViewType('kanban')}
                                className={cn(
                                    "px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-2",
                                    viewType === 'kanban'
                                        ? "bg-white text-primary shadow-sm border border-gray-200/50"
                                        : "text-gray-500 hover:text-gray-700"
                                )}
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" /></svg>
                                Kanban
                            </button>
                            <button
                                onClick={() => handleSetViewType('list')}
                                className={cn(
                                    "px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-2",
                                    viewType === 'list'
                                        ? "bg-white text-primary shadow-sm border border-gray-200/50"
                                        : "text-gray-500 hover:text-gray-700"
                                )}
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                                Lista
                            </button>
                        </div>
                    </header>

                    <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div className="flex items-center gap-4 flex-wrap flex-1">
                                {/* Search Bar */}
                                <div className="relative flex-1 min-w-[200px] max-w-md">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Search className="h-4 w-4 text-gray-400" />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Buscar por nome, telefone, email, título..."
                                        className="block w-full pl-10 pr-3 py-1.5 border border-gray-200 rounded-lg leading-5 bg-white placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm transition-all shadow-sm"
                                        value={filters.search || ''}
                                        onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                                    />
                                </div>

                                {/* View Switcher (Persona Based) */}
                                <div className="flex bg-white rounded-lg p-1 border border-gray-200 shadow-sm">
                                    <button
                                        onClick={() => { setViewMode('AGENT'); setSubView('MY_QUEUE'); }}
                                        className={cn(
                                            "px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-200",
                                            viewMode === 'AGENT' && subView === 'MY_QUEUE'
                                                ? "bg-primary text-white shadow-sm"
                                                : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                                        )}
                                    >
                                        Minha Fila
                                    </button>
                                    <button
                                        onClick={() => { setViewMode('MANAGER'); setSubView('TEAM_VIEW'); }}
                                        className={cn(
                                            "px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-200",
                                            viewMode === 'MANAGER' && subView === 'TEAM_VIEW'
                                                ? "bg-primary text-white shadow-sm"
                                                : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                                        )}
                                    >
                                        Visão de Time
                                    </button>
                                    <button
                                        onClick={() => { setViewMode('MANAGER'); setSubView('ALL'); }}
                                        className={cn(
                                            "px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-200",
                                            subView === 'ALL'
                                                ? "bg-primary text-white shadow-sm"
                                                : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                                        )}
                                    >
                                        Todos
                                    </button>
                                </div>

                                {/* Group Filters (2 Chips - Linked/Solo) */}
                                <div className="flex items-center space-x-2 border-l border-gray-200 pl-4">
                                    <button
                                        onClick={() => setGroupFilters({ ...groupFilters, showLinked: !groupFilters.showLinked })}
                                        className={cn(
                                            "flex items-center px-3 py-1.5 text-xs font-semibold rounded-full border transition-all duration-200",
                                            groupFilters.showLinked
                                                ? "bg-blue-100 text-blue-700 border-blue-300 shadow-sm"
                                                : "bg-white text-gray-400 border-gray-200 hover:bg-gray-50"
                                        )}
                                    >
                                        <Link className="h-3 w-3 mr-1.5" />
                                        Em Grupo
                                    </button>
                                    <button
                                        onClick={() => setGroupFilters({ ...groupFilters, showSolo: !groupFilters.showSolo })}
                                        className={cn(
                                            "flex items-center px-3 py-1.5 text-xs font-semibold rounded-full border transition-all duration-200",
                                            groupFilters.showSolo
                                                ? "bg-emerald-100 text-emerald-700 border-emerald-300 shadow-sm"
                                                : "bg-white text-gray-400 border-gray-200 hover:bg-gray-50"
                                        )}
                                    >
                                        <User className="h-3 w-3 mr-1.5" />
                                        Avulsas
                                    </button>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center space-x-3">
                                {/* Sort Dropdown */}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg shadow-sm transition-all min-w-[140px] justify-between group">
                                            <div className="flex items-center">
                                                <ArrowUpDown className="h-4 w-4 mr-2 text-gray-500 group-hover:text-primary transition-colors" />
                                                <span className="text-gray-500 mr-1">Ordenar:</span>
                                                <span className="text-gray-900">{getSortLabel()}</span>
                                            </div>
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-72">
                                        <DropdownMenuLabel>Ordenar por</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem className="flex items-center justify-between cursor-pointer" onClick={() => setFilters({ ...filters, sortBy: 'created_at', sortDirection: 'desc' })}>
                                            <div className="flex items-center">
                                                <Calendar className="mr-2 h-4 w-4 text-gray-400" />
                                                <span>Data de Criação</span>
                                            </div>
                                            {filters.sortBy === 'created_at' && (
                                                <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                                    {filters.sortDirection === 'asc' ? 'Antigos' : 'Novos'}
                                                </span>
                                            )}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="flex items-center justify-between cursor-pointer" onClick={() => setFilters({ ...filters, sortBy: 'updated_at', sortDirection: 'desc' })}>
                                            <div className="flex items-center">
                                                <Clock className="mr-2 h-4 w-4 text-gray-400" />
                                                <span>Última Atualização</span>
                                            </div>
                                            {filters.sortBy === 'updated_at' && (
                                                <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                                    {filters.sortDirection === 'asc' ? 'Antigos' : 'Recentes'}
                                                </span>
                                            )}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="flex items-center justify-between cursor-pointer" onClick={() => setFilters({ ...filters, sortBy: 'data_viagem_inicio', sortDirection: 'asc' })}>
                                            <div className="flex items-center">
                                                <Calendar className="mr-2 h-4 w-4 text-gray-400" />
                                                <span>Data da Viagem</span>
                                            </div>
                                            {filters.sortBy === 'data_viagem_inicio' && (
                                                <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                                    {filters.sortDirection === 'asc' ? 'Próximas' : 'Distantes'}
                                                </span>
                                            )}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="flex items-center justify-between cursor-pointer" onClick={() => setFilters({ ...filters, sortBy: 'data_proxima_tarefa', sortDirection: 'asc' })}>
                                            <div className="flex items-center">
                                                <CheckSquare className="mr-2 h-4 w-4 text-gray-400" />
                                                <span>Próxima Tarefa</span>
                                            </div>
                                            {filters.sortBy === 'data_proxima_tarefa' && (
                                                <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                                    {filters.sortDirection === 'asc' ? 'Urgentes' : 'Futuras'}
                                                </span>
                                            )}
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>

                                {/* Smart Filter Button */}
                                <button
                                    onClick={() => setIsFilterDrawerOpen(true)}
                                    className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg shadow-sm transition-all"
                                >
                                    <Filter className="h-4 w-4 mr-2 text-gray-500" />
                                    Filtros
                                </button>



                                <button
                                    onClick={() => setIsCreateModalOpen(true)}
                                    className="flex items-center px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-dark border border-transparent rounded-lg shadow-sm transition-all"
                                >
                                    <span className="mr-1.5 text-lg leading-none">+</span>
                                    Novo Card
                                </button>
                            </div>
                        </div>

                        {/* Active Filters - Full Width Row */}
                        <div className="w-full">
                            <ActiveFilters />
                        </div>
                    </div>
                </div>


                {/* Board Container: Fills remaining space, passes padding prop for alignment */}
                <div className={cn(
                    "flex-1 min-h-0 relative",
                    viewType === 'list' && "overflow-y-auto"
                )}>
                    {viewType === 'kanban' ? (
                        <KanbanBoard
                            productFilter={currentProduct}
                            viewMode={viewMode}
                            subView={subView}
                            filters={filters}
                            className="h-full px-8 pb-4" // Shared horizontal padding
                        />
                    ) : (
                        <PipelineListView
                            productFilter={currentProduct}
                            viewMode={viewMode}
                            subView={subView}
                            filters={filters}
                            onCardClick={(cardId) => {
                                navigate(`/cards/${cardId}`)
                            }}
                        />
                    )}
                </div>

                <CreateCardModal
                    isOpen={isCreateModalOpen}
                    onClose={() => setIsCreateModalOpen(false)}
                />



                <FilterDrawer
                    isOpen={isFilterDrawerOpen}
                    onClose={() => setIsFilterDrawerOpen(false)}
                />
            </div>
        </ErrorBoundary >
    )
}
