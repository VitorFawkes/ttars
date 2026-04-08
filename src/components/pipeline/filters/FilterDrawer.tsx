import { useState } from 'react'
import { X, Filter, ChevronDown, Target, Calendar, DollarSign, Clock, Users as UsersIcon, Building2, Search } from 'lucide-react'
import { usePipelineFilters } from '../../../hooks/usePipelineFilters'
import { useFilterOptions } from '../../../hooks/useFilterOptions'
import { useCardTags } from '../../../hooks/useCardTags'
import type { ArrayFilterField, FilterState } from '../../../hooks/usePipelineFilters'
import { FilterSectionStatus } from './FilterSectionStatus'
import { FilterSectionDates } from './FilterSectionDates'
import { FilterSectionFinancial } from './FilterSectionFinancial'
import { FilterSectionUrgency } from './FilterSectionUrgency'
import { FilterSectionPeople } from './FilterSectionPeople'
import { FilterSectionOrganization } from './FilterSectionOrganization'
import { FilterSectionSmartFields } from './FilterSectionSmartFields'
import { cn } from '../../../lib/utils'

interface FilterDrawerProps {
    isOpen: boolean
    onClose: () => void
}

interface SectionDef {
    id: string
    label: string
    icon: React.ReactNode
}

const SECTIONS: SectionDef[] = [
    { id: 'status', label: 'Status & Prioridade', icon: <Target className="h-4 w-4" /> },
    { id: 'dates', label: 'Datas', icon: <Calendar className="h-4 w-4" /> },
    { id: 'financial', label: 'Valores & Financeiro', icon: <DollarSign className="h-4 w-4" /> },
    { id: 'urgency', label: 'Tempo & Urgência', icon: <Clock className="h-4 w-4" /> },
    { id: 'people', label: 'Pessoas', icon: <UsersIcon className="h-4 w-4" /> },
    { id: 'organization', label: 'Origem & Organização', icon: <Building2 className="h-4 w-4" /> },
    { id: 'fields', label: 'Preenchimento de Campos', icon: <Search className="h-4 w-4" /> },
]

export function FilterDrawer({ isOpen, onClose }: FilterDrawerProps) {
    const { filters, setFilters, toggleFilterValue, updateFilter } = usePipelineFilters()
    const { data: options } = useFilterOptions()
    const { tags: availableTags } = useCardTags()
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['status']))

    if (!isOpen) return null

    const profiles = options?.profiles || []
    const teams = options?.teams || []
    const departments = options?.departments || []

    const clearFilters = () => {
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

    const toggleSection = (id: string) => {
        setExpandedSections(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const renderSectionContent = (id: string) => {
        switch (id) {
            case 'status':
                return <FilterSectionStatus filters={filters} onToggle={handleToggle} />
            case 'dates':
                return <FilterSectionDates filters={filters} onUpdate={handleUpdate} />
            case 'financial':
                return <FilterSectionFinancial filters={filters} onUpdate={handleUpdate} onToggle={handleToggle} />
            case 'urgency':
                return <FilterSectionUrgency filters={filters} onUpdate={handleUpdate} />
            case 'people':
                return <FilterSectionPeople filters={filters} profiles={profiles} onToggle={handleToggle} />
            case 'organization':
                return (
                    <FilterSectionOrganization
                        filters={filters}
                        teams={teams}
                        departments={departments}
                        tags={availableTags}
                        onToggle={handleToggle}
                        onToggleNoTag={handleToggleNoTag}
                    />
                )
            case 'fields':
                return <FilterSectionSmartFields filters={filters} onUpdate={handleUpdate} />
            default:
                return null
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
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/5 rounded-xl">
                            <Filter className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Filtros</h2>
                            <p className="text-xs text-gray-500">Clique nas seções para expandir</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Accordion sections */}
                <div className="flex-1 overflow-y-auto bg-gray-50/50">
                    {SECTIONS.map(section => {
                        const isExpanded = expandedSections.has(section.id)
                        return (
                            <div key={section.id} className="border-b border-gray-100">
                                <button
                                    onClick={() => toggleSection(section.id)}
                                    className={cn(
                                        "w-full flex items-center justify-between px-6 py-3.5 transition-colors",
                                        isExpanded ? "bg-white" : "bg-white/80 hover:bg-white"
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className={cn(
                                            "transition-colors",
                                            isExpanded ? "text-primary" : "text-gray-400"
                                        )}>
                                            {section.icon}
                                        </span>
                                        <span className={cn(
                                            "text-sm font-semibold transition-colors",
                                            isExpanded ? "text-gray-900" : "text-gray-600"
                                        )}>
                                            {section.label}
                                        </span>
                                    </div>
                                    <ChevronDown className={cn(
                                        "h-4 w-4 text-gray-400 transition-transform duration-200",
                                        isExpanded && "rotate-180"
                                    )} />
                                </button>
                                {isExpanded && (
                                    <div className="px-6 pb-6 pt-2 space-y-6 bg-gray-50/50">
                                        {renderSectionContent(section.id)}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 bg-white flex items-center justify-center shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-10">
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
