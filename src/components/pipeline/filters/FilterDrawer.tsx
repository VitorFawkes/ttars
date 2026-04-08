import { X, Filter } from 'lucide-react'
import { usePipelineFilters } from '../../../hooks/usePipelineFilters'
import { useFilterOptions } from '../../../hooks/useFilterOptions'
import { useCardTags } from '../../../hooks/useCardTags'
import type { ArrayFilterField, FilterState } from '../../../hooks/usePipelineFilters'
import { FilterSectionStatus } from './FilterSectionStatus'
import { FilterSectionOrigin } from './FilterSectionOrigin'
import { FilterSectionDates } from './FilterSectionDates'
import { FilterSectionPeople } from './FilterSectionPeople'
import { FilterSectionOrganization } from './FilterSectionOrganization'
import { FilterSectionAdvanced } from './FilterSectionAdvanced'
import { FilterSectionSmartFields } from './FilterSectionSmartFields'

interface FilterDrawerProps {
    isOpen: boolean
    onClose: () => void
}

export function FilterDrawer({ isOpen, onClose }: FilterDrawerProps) {
    const { filters, setFilters, toggleFilterValue, updateFilter } = usePipelineFilters()
    const { data: options } = useFilterOptions()
    const { tags: availableTags } = useCardTags()

    if (!isOpen) return null

    const profiles = options?.profiles || []
    const teams = options?.teams || []
    const departments = options?.departments || []

    const clearFilters = () => {
        // Preserva sortBy/sortDirection ao limpar filtros
        setFilters({
            sortBy: filters.sortBy,
            sortDirection: filters.sortDirection,
        })
    }

    const handleToggle = (field: ArrayFilterField, value: string) => {
        toggleFilterValue(field, value)
    }

    const handleUpdate = (partial: Partial<FilterState>) => {
        updateFilter(partial)
    }

    const handleToggleNoTag = () => {
        if (filters.noTag) {
            updateFilter({ noTag: undefined })
        } else {
            updateFilter({ noTag: true, tagIds: undefined })
        }
    }

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity"
                onClick={onClose}
            />

            {/* Drawer */}
            <div className="fixed inset-y-0 right-0 w-[500px] bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out border-l border-gray-100 flex flex-col">
                <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-white">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-primary/5 rounded-xl">
                            <Filter className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Filtros Avançados</h2>
                            <p className="text-xs text-gray-500">Alterações aplicam em tempo real</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-gray-50/50">
                    <FilterSectionStatus filters={filters} onToggle={handleToggle} />
                    <FilterSectionOrigin filters={filters} onToggle={handleToggle} />
                    <FilterSectionDates filters={filters} onUpdate={handleUpdate} />
                    <FilterSectionPeople filters={filters} profiles={profiles} onToggle={handleToggle} />
                    <FilterSectionAdvanced filters={filters} onUpdate={handleUpdate} />
                    <FilterSectionSmartFields filters={filters} onUpdate={handleUpdate} onToggle={handleToggle} />
                    <FilterSectionOrganization
                        filters={filters}
                        teams={teams}
                        departments={departments}
                        tags={availableTags}
                        onToggle={handleToggle}
                        onToggleNoTag={handleToggleNoTag}
                    />
                </div>

                {/* Footer — apenas Limpar */}
                <div className="p-6 border-t border-gray-100 bg-white flex items-center justify-center shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-10">
                    <button
                        onClick={clearFilters}
                        className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors px-4 py-2 rounded-lg hover:bg-gray-50"
                    >
                        Limpar Todos os Filtros
                    </button>
                </div>
            </div>
        </>
    )
}
