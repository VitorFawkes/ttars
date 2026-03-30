import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import KanbanBoard from '../components/pipeline/KanbanBoard'
import PipelineListView from '../components/pipeline/PipelineListView'
import { cn } from '../lib/utils'
import CreateCardModal from '../components/pipeline/CreateCardModal'

import { usePipelineFilters, useActiveFilterCount } from '../hooks/usePipelineFilters'
import { useProductContext } from '../hooks/useProductContext'
import { useMyVisiblePhases } from '../hooks/useMyVisiblePhases'
import { useAuth } from '../contexts/AuthContext'

import { FilterDrawer } from '../components/pipeline/filters/FilterDrawer'
import { ActiveFilters } from '../components/pipeline/ActiveFilters'
import { Filter, Link, User, ArrowUpDown, Search, Eye, EyeOff, Trophy } from 'lucide-react'
import { SORT_FIELD_LABELS } from '../lib/constants'
import type { SortBy, SortDirection } from '../hooks/usePipelineFilters'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "../components/ui/dropdown-menu"

import { ErrorBoundary } from '../components/ui/ErrorBoundary'
import { MyDayBar } from '../components/pipeline/MyDayBar'

export default function Pipeline() {
    const navigate = useNavigate()
    const {
        viewMode, subView, groupFilters, filters, showClosedCards, showWonDirect,
        _phaseAutoApplied,
        setGroupFilters, setAll,
        setScopeView, setShowClosedCards, setShowWonDirect, updateFilter,
    } = usePipelineFilters()
    const activeFilterCount = useActiveFilterCount()
    const { currentProduct } = useProductContext()
    const { profile } = useAuth()
    const { data: visiblePhases } = useMyVisiblePhases()
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

    const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false)

    // Auto-filter: agentes (não-admin) veem inicialmente as fases configuradas (própria + cross-phase)
    // Flag _phaseAutoApplied persiste no Zustand entre navegações, evitando re-aplicação
    const isAdmin = profile?.is_admin === true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isGestor = (profile as any)?.role_info?.name === 'gestor'
    const canViewTeam = isAdmin || isGestor || !!profile?.team_id
    const canViewAll = isAdmin || isGestor

    // Guard: if user lost access to current view (e.g. role changed), reset to MY_QUEUE
    useEffect(() => {
        if (subView === 'TEAM_VIEW' && !canViewTeam) {
            setScopeView('AGENT', 'MY_QUEUE')
        } else if (subView === 'ALL' && !canViewAll) {
            setScopeView('AGENT', 'MY_QUEUE')
        }
    }, [canViewTeam, canViewAll, subView, setScopeView])

    useEffect(() => {
        if (_phaseAutoApplied || isAdmin || !visiblePhases?.length) return
        setAll({ filters: { ...filters, phaseFilters: visiblePhases }, _phaseAutoApplied: true })
    }, [visiblePhases, isAdmin, _phaseAutoApplied]) // eslint-disable-line react-hooks/exhaustive-deps


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
        const meta = SORT_FIELD_LABELS[sortBy]
        if (!meta) return 'Ordenar'
        const dirLabel = sortDirection === 'asc' ? meta.asc : meta.desc
        return `${meta.label} (${dirLabel})`
    }

    const GLOBAL_SORT_FIELDS: SortBy[] = [
        'created_at', 'updated_at', 'data_viagem_inicio', 'data_fechamento',
        'titulo', 'valor_estimado', 'tempo_etapa_dias', 'data_proxima_tarefa',
    ]

    const getDefaultDirection = (field: SortBy): SortDirection => {
        if (field === 'titulo' || field === 'valor_estimado' || field === 'tempo_etapa_dias') return 'asc'
        if (field === 'created_at' || field === 'updated_at') return 'desc'
        return 'asc'
    }

    return (
        <ErrorBoundary>
            {/* Main Container: Uses h-full to fill the Layout shell */}
            <div className="flex h-full flex-col relative overflow-hidden bg-gray-50/50">

                {/* Header Section: Compact single row */}
                <div className="flex-shrink-0 py-2 px-6 bg-white/50 backdrop-blur-sm border-b border-gray-200/50 z-10">
                    <header className="flex items-center justify-between gap-4 mb-1">
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

                    <div className="flex flex-col gap-1">
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
                                        onChange={(e) => updateFilter({ search: e.target.value })}
                                    />
                                </div>

                                {/* View Switcher (Persona Based) — com cascading */}
                                <div className="flex bg-white rounded-lg p-1 border border-gray-200 shadow-sm">
                                    <button
                                        onClick={() => setScopeView('AGENT', 'MY_QUEUE')}
                                        className={cn(
                                            "px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-200",
                                            viewMode === 'AGENT' && subView === 'MY_QUEUE'
                                                ? "bg-primary text-white shadow-sm"
                                                : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                                        )}
                                    >
                                        Minha Fila
                                    </button>
                                    {canViewTeam && (
                                        <button
                                            onClick={() => setScopeView('MANAGER', 'TEAM_VIEW')}
                                            className={cn(
                                                "px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-200",
                                                viewMode === 'MANAGER' && subView === 'TEAM_VIEW'
                                                    ? "bg-primary text-white shadow-sm"
                                                    : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                                            )}
                                        >
                                            Visão de Time
                                        </button>
                                    )}
                                    {canViewAll && (
                                        <button
                                            onClick={() => setScopeView('MANAGER', 'ALL')}
                                            className={cn(
                                                "px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-200",
                                                subView === 'ALL'
                                                    ? "bg-primary text-white shadow-sm"
                                                    : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                                            )}
                                        >
                                            Todos
                                        </button>
                                    )}
                                </div>

                                {/* Group Filters + Closed Cards Toggle — com cascading */}
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
                                    <button
                                        onClick={() => setShowWonDirect(!showWonDirect)}
                                        className={cn(
                                            "flex items-center px-3 py-1.5 text-xs font-semibold rounded-full border transition-all duration-200",
                                            showWonDirect
                                                ? "bg-green-100 text-green-700 border-green-300 shadow-sm"
                                                : "bg-white text-gray-400 border-gray-200 hover:bg-gray-50"
                                        )}
                                        title={showWonDirect ? 'Ocultar ganhos sem pós-venda' : 'Mostrar ganhos sem pós-venda'}
                                    >
                                        <Trophy className="h-3 w-3 mr-1.5" />
                                        Sem Pós
                                    </button>
                                    <button
                                        onClick={() => setShowClosedCards(!showClosedCards)}
                                        className={cn(
                                            "flex items-center px-3 py-1.5 text-xs font-semibold rounded-full border transition-all duration-200",
                                            showClosedCards
                                                ? "bg-amber-100 text-amber-700 border-amber-300 shadow-sm"
                                                : "bg-white text-gray-400 border-gray-200 hover:bg-gray-50"
                                        )}
                                        title={showClosedCards ? 'Ocultar ganhos/perdidos' : 'Mostrar ganhos/perdidos'}
                                    >
                                        {showClosedCards ? <EyeOff className="h-3 w-3 mr-1.5" /> : <Eye className="h-3 w-3 mr-1.5" />}
                                        Finalizados
                                    </button>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center space-x-3">
                                {/* Sort Dropdown */}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button className="flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg shadow-sm transition-all min-w-[140px] justify-between group">
                                            <div className="flex items-center">
                                                <ArrowUpDown className="h-4 w-4 mr-2 text-gray-500 group-hover:text-primary transition-colors" />
                                                <span className="text-gray-500 mr-1">Ordenar:</span>
                                                <span className="text-gray-900">{getSortLabel()}</span>
                                            </div>
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-72">
                                        <DropdownMenuLabel>Ordenar por (global)</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        {GLOBAL_SORT_FIELDS.map((field) => {
                                            const meta = SORT_FIELD_LABELS[field]
                                            if (!meta) return null
                                            const isActive = filters.sortBy === field
                                            const dirLabel = filters.sortDirection === 'asc' ? meta.asc : meta.desc
                                            return (
                                                <DropdownMenuItem
                                                    key={field}
                                                    className="flex items-center justify-between cursor-pointer"
                                                    onClick={() => {
                                                        if (isActive) {
                                                            updateFilter({ sortBy: field, sortDirection: filters.sortDirection === 'asc' ? 'desc' : 'asc' })
                                                        } else {
                                                            updateFilter({ sortBy: field, sortDirection: getDefaultDirection(field) })
                                                        }
                                                    }}
                                                >
                                                    <span>{meta.label}</span>
                                                    {isActive && (
                                                        <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                                            {dirLabel}
                                                        </span>
                                                    )}
                                                </DropdownMenuItem>
                                            )
                                        })}
                                    </DropdownMenuContent>
                                </DropdownMenu>

                                {/* Smart Filter Button com badge */}
                                <button
                                    onClick={() => setIsFilterDrawerOpen(true)}
                                    className={cn(
                                        "flex items-center px-3 py-1.5 text-sm font-medium border rounded-lg shadow-sm transition-all",
                                        activeFilterCount > 0
                                            ? "text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100"
                                            : "text-gray-700 bg-white hover:bg-gray-50 border-gray-200"
                                    )}
                                >
                                    <Filter className={cn("h-4 w-4 mr-2", activeFilterCount > 0 ? "text-indigo-500" : "text-gray-500")} />
                                    Filtros
                                    {activeFilterCount > 0 && (
                                        <span className="ml-1.5 bg-indigo-600 text-white text-xs rounded-full min-w-[20px] h-5 flex items-center justify-center px-1 font-bold">
                                            {activeFilterCount}
                                        </span>
                                    )}
                                </button>



                                <button
                                    onClick={() => setIsCreateModalOpen(true)}
                                    className="flex items-center px-4 py-1.5 text-sm font-medium text-white bg-primary hover:bg-primary-dark border border-transparent rounded-lg shadow-sm transition-all"
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


                {/* My Day Bar: Tasks overview */}
                <MyDayBar productFilter={currentProduct} />

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
                            showClosedCards={showClosedCards}
                            showWonDirect={showWonDirect}
                            className="h-full px-8 pb-4" // Shared horizontal padding
                        />
                    ) : (
                        <PipelineListView
                            productFilter={currentProduct}
                            viewMode={viewMode}
                            subView={subView}
                            filters={filters}
                            showClosedCards={showClosedCards}
                            showWonDirect={showWonDirect}
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
