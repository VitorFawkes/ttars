import { useState } from 'react'
import { Search, X, ChevronDown, Calendar, User, Flag, Layers, SlidersHorizontal, Archive } from 'lucide-react'
import { Button } from '../ui/Button'
import { useLeadsFilters } from '../../hooks/useLeadsFilters'
import { useFilterOptions } from '../../hooks/useFilterOptions'
import { usePipelineStages } from '../../hooks/usePipelineStages'
import { useCurrentProductMeta } from '../../hooks/useCurrentProductMeta'
import { cn } from '../../lib/utils'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '../ui/popover'
import { Checkbox } from '../ui/checkbox'
import { Input } from '../ui/Input'
import { LeadsFilterDrawer } from './LeadsFilterDrawer'
import LeadsActiveFilters from './LeadsActiveFilters'

const STATUS_OPTIONS = [
    { value: 'aberto', label: 'Aberto' },
    { value: 'ganho', label: 'Ganho' },
    { value: 'perdido', label: 'Perdido' }
]

const PRIORIDADE_OPTIONS = [
    { value: 'alta', label: 'Alta', color: 'bg-red-100 text-red-700' },
    { value: 'media', label: 'Média', color: 'bg-yellow-100 text-yellow-700' },
    { value: 'baixa', label: 'Baixa', color: 'bg-green-100 text-green-700' }
]

export default function LeadsFilters() {
    const { filters, setFilters, setSearch, toggleOwner, toggleStage, toggleStatus, togglePrioridade, toggleArchived, clearFilters, hasActiveFilters } = useLeadsFilters()
    const { pipelineId } = useCurrentProductMeta()
    const { data: options } = useFilterOptions()
    const { data: stages } = usePipelineStages(pipelineId)

    const profiles = options?.profiles || []

    const [ownerSearch, setOwnerSearch] = useState('')
    const [stageSearch, setStageSearch] = useState('')
    const [isDrawerOpen, setIsDrawerOpen] = useState(false)

    const filteredProfiles = profiles.filter(p =>
        (p.full_name?.toLowerCase() || '').includes(ownerSearch.toLowerCase()) ||
        (p.email?.toLowerCase() || '').includes(ownerSearch.toLowerCase())
    )

    const filteredStages = (stages || []).filter(s =>
        s.nome.toLowerCase().includes(stageSearch.toLowerCase())
    )

    const getSelectedOwnersLabel = () => {
        if (!filters.ownerIds?.length) return 'Responsável'
        if (filters.ownerIds.length === 1) {
            const owner = profiles.find(p => p.id === filters.ownerIds![0])
            return owner?.full_name?.split(' ')[0] || 'Responsável'
        }
        return `${filters.ownerIds.length} selecionados`
    }

    const getSelectedStagesLabel = () => {
        if (!filters.stageIds?.length) return 'Etapa'
        if (filters.stageIds.length === 1) {
            const stage = stages?.find(s => s.id === filters.stageIds![0])
            return stage?.nome || 'Etapa'
        }
        return `${filters.stageIds.length} etapas`
    }

    return (
    <>
        <div className="flex flex-wrap items-center gap-3 p-4 bg-white border-b border-gray-200">
            {/* Search */}
            <div className="relative flex-1 min-w-[250px] max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                    type="text"
                    placeholder="Buscar por nome, email, telefone..."
                    className="pl-9 h-9"
                    value={filters.search || ''}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            {/* Date Range Filter */}
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                            "h-9 gap-2",
                            (filters.creationStartDate || filters.creationEndDate) && "border-primary text-primary"
                        )}
                    >
                        <Calendar className="h-4 w-4" />
                        Data Criação
                        <ChevronDown className="h-3 w-3 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-4" align="start">
                    <div className="space-y-3">
                        <h4 className="font-medium text-sm">Data de Criação</h4>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <label className="text-xs text-gray-500">De</label>
                                <input
                                    type="date"
                                    className="w-full h-9 rounded-md border border-gray-200 px-3 text-sm"
                                    value={filters.creationStartDate || ''}
                                    onChange={(e) => setFilters({ creationStartDate: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-gray-500">Até</label>
                                <input
                                    type="date"
                                    className="w-full h-9 rounded-md border border-gray-200 px-3 text-sm"
                                    value={filters.creationEndDate || ''}
                                    onChange={(e) => setFilters({ creationEndDate: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>
                </PopoverContent>
            </Popover>

            {/* Owner Filter */}
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                            "h-9 gap-2",
                            (filters.ownerIds?.length ?? 0) > 0 && "border-primary text-primary"
                        )}
                    >
                        <User className="h-4 w-4" />
                        {getSelectedOwnersLabel()}
                        <ChevronDown className="h-3 w-3 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-3" align="start">
                    <div className="space-y-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar..."
                                className="w-full pl-9 h-9 rounded-md border border-gray-200 text-sm"
                                value={ownerSearch}
                                onChange={(e) => setOwnerSearch(e.target.value)}
                            />
                        </div>
                        <div className="max-h-48 overflow-y-auto space-y-1">
                            {filteredProfiles.map(profile => (
                                <label
                                    key={profile.id}
                                    className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer"
                                >
                                    <Checkbox
                                        checked={(filters.ownerIds || []).includes(profile.id)}
                                        onCheckedChange={() => toggleOwner(profile.id)}
                                    />
                                    <span className="text-sm truncate">
                                        {profile.full_name || profile.email}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>
                </PopoverContent>
            </Popover>

            {/* Stage Filter */}
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                            "h-9 gap-2",
                            (filters.stageIds?.length ?? 0) > 0 && "border-primary text-primary"
                        )}
                    >
                        <Layers className="h-4 w-4" />
                        {getSelectedStagesLabel()}
                        <ChevronDown className="h-3 w-3 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-3" align="start">
                    <div className="space-y-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar etapa..."
                                className="w-full pl-9 h-9 rounded-md border border-gray-200 text-sm"
                                value={stageSearch}
                                onChange={(e) => setStageSearch(e.target.value)}
                            />
                        </div>
                        <div className="max-h-48 overflow-y-auto space-y-1">
                            {filteredStages.map(stage => (
                                <label
                                    key={stage.id}
                                    className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer"
                                >
                                    <Checkbox
                                        checked={(filters.stageIds || []).includes(stage.id)}
                                        onCheckedChange={() => toggleStage(stage.id)}
                                    />
                                    <div
                                        className="w-2 h-2 rounded-full"
                                        style={{ backgroundColor: stage.cor || '#6b7280' }}
                                    />
                                    <span className="text-sm truncate">{stage.nome}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </PopoverContent>
            </Popover>

            {/* Status Filter */}
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                            "h-9 gap-2",
                            (filters.statusComercial?.length ?? 0) > 0 && "border-primary text-primary"
                        )}
                    >
                        Status
                        <ChevronDown className="h-3 w-3 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-3" align="start">
                    <div className="space-y-1">
                        {STATUS_OPTIONS.map(status => (
                            <label
                                key={status.value}
                                className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer"
                            >
                                <Checkbox
                                    checked={(filters.statusComercial || []).includes(status.value)}
                                    onCheckedChange={() => toggleStatus(status.value)}
                                />
                                <span className="text-sm">{status.label}</span>
                            </label>
                        ))}
                    </div>
                </PopoverContent>
            </Popover>

            {/* Prioridade Filter */}
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                            "h-9 gap-2",
                            (filters.prioridade?.length ?? 0) > 0 && "border-primary text-primary"
                        )}
                    >
                        <Flag className="h-4 w-4" />
                        Prioridade
                        <ChevronDown className="h-3 w-3 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-3" align="start">
                    <div className="space-y-1">
                        {PRIORIDADE_OPTIONS.map(prio => (
                            <label
                                key={prio.value}
                                className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer"
                            >
                                <Checkbox
                                    checked={(filters.prioridade || []).includes(prio.value)}
                                    onCheckedChange={() => togglePrioridade(prio.value)}
                                />
                                <span className={cn("text-xs px-2 py-0.5 rounded", prio.color)}>
                                    {prio.label}
                                </span>
                            </label>
                        ))}
                    </div>
                </PopoverContent>
            </Popover>

            {/* Archived Toggle */}
            <Button
                variant="outline"
                size="sm"
                onClick={toggleArchived}
                className={cn(
                    "h-9 gap-2",
                    filters.showArchived && "border-amber-500 text-amber-700 bg-amber-50"
                )}
            >
                <Archive className="h-4 w-4" />
                Arquivados
            </Button>

            {/* Advanced Filters Button */}
            <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDrawerOpen(true)}
                className={cn(
                    "h-9 gap-2",
                    hasActiveFilters() && "border-primary text-primary"
                )}
            >
                <SlidersHorizontal className="h-4 w-4" />
                Filtros Avançados
            </Button>

            {/* Clear Filters */}
            {hasActiveFilters() && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    className="h-9 text-gray-500 hover:text-gray-700"
                >
                    <X className="h-4 w-4 mr-1" />
                    Limpar
                </Button>
            )}

            {/* Filter Drawer */}
            <LeadsFilterDrawer
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                filters={filters}
                setFilters={setFilters}
            />
        </div>

        {/* Active Filters Chips */}
        <LeadsActiveFilters filters={filters} setFilters={setFilters} />
    </>
    )
}
