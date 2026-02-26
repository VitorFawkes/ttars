import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Filter, Plane } from 'lucide-react'
import { useTripsFilters } from '../hooks/useTripsFilters'
import TripsGrid from '../components/trips/TripsGrid'
import TripsFilterDrawer from '../components/trips/TripsFilterDrawer'
import { ErrorBoundary } from '../components/ui/ErrorBoundary'


export default function Cards() {
    const navigate = useNavigate()
    const { filters, setFilters } = useTripsFilters()
    const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false)

    return (
        <ErrorBoundary>
            <div className="flex h-full flex-col relative overflow-hidden bg-gray-50/50">
                {/* Header */}
                <div className="flex-shrink-0 py-4 px-8 bg-white/50 backdrop-blur-sm border-b border-gray-200/50 z-10">
                    <header className="flex items-center justify-between gap-4 mb-4">
                        <div className="flex items-center gap-4">
                            <div className="p-2 bg-purple-100 rounded-lg">
                                <Plane className="h-6 w-6 text-purple-600" />
                            </div>
                            <div>
                                <h1 className="text-xl font-semibold text-gray-900 tracking-tight">Gestão de Viagens</h1>
                                <p className="text-sm text-gray-500">Acompanhamento operacional de viagens vendidas</p>
                            </div>
                        </div>
                    </header>

                    <div className="flex items-center justify-between gap-4">
                        {/* Search */}
                        <div className="relative flex-1 max-w-md">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Search className="h-4 w-4 text-gray-400" />
                            </div>
                            <input
                                type="text"
                                placeholder="Pesquisar viagem, passageiro..."
                                className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg leading-5 bg-white placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-1 focus:ring-purple-500 focus:border-purple-500 sm:text-sm transition-all shadow-sm"
                                value={filters.search || ''}
                                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                            />
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setIsFilterDrawerOpen(true)}
                                className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg shadow-sm transition-all"
                            >
                                <Filter className="h-4 w-4 mr-2 text-gray-500" />
                                Filtros
                            </button>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-h-0 p-8">
                    <TripsGrid
                        onCardClick={(cardId) => {
                            navigate(`/cards/${cardId}`)
                        }}
                    />
                </div>

                {/* Filter Drawer */}
                <TripsFilterDrawer isOpen={isFilterDrawerOpen} onClose={() => setIsFilterDrawerOpen(false)} />
            </div>
        </ErrorBoundary>
    )
}
