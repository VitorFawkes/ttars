import { ArrowUpDown, ArrowUp, ArrowDown, X } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover'
import { cn } from '../../lib/utils'
import { SORT_FIELD_LABELS } from '../../lib/constants'
import type { SortBy, SortDirection } from '../../hooks/usePipelineFilters'
import type { StageSortConfig } from '../../hooks/usePhaseSort'

interface PhaseSortPopoverProps {
    currentSort: StageSortConfig
    hasOverride: boolean
    onSortChange: (config: StageSortConfig) => void
    onClear: () => void
}

const SORT_FIELDS: SortBy[] = [
    'created_at',
    'updated_at',
    'data_viagem_inicio',
    'data_fechamento',
    'titulo',
    'valor_estimado',
    'tempo_etapa_dias',
    'data_proxima_tarefa',
]

export default function PhaseSortPopover({
    currentSort,
    hasOverride,
    onSortChange,
    onClear,
}: PhaseSortPopoverProps) {
    const handleSelect = (field: SortBy) => {
        if (field === currentSort.sortBy) {
            // Toggle direction
            onSortChange({
                sortBy: field,
                sortDirection: currentSort.sortDirection === 'asc' ? 'desc' : 'asc',
            })
        } else {
            // Default direction per field type
            const defaultDir: SortDirection =
                field === 'titulo' || field === 'valor_estimado' || field === 'tempo_etapa_dias'
                    ? 'asc'
                    : field === 'created_at' || field === 'updated_at'
                        ? 'desc'
                        : 'asc'
            onSortChange({ sortBy: field, sortDirection: defaultDir })
        }
    }

    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                        "relative flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors border",
                        hasOverride
                            ? "text-indigo-600 bg-indigo-50 border-indigo-200 hover:bg-indigo-100"
                            : "text-gray-500 bg-gray-50 border-gray-200 hover:bg-gray-100 hover:text-gray-700"
                    )}
                    title="Ordenar esta seção"
                >
                    <ArrowUpDown className="w-3.5 h-3.5" />
                    <span>Ordenar</span>
                    {hasOverride && (
                        <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                    )}
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                className="w-64 p-2"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Ordenar seção
                    </span>
                    {hasOverride && (
                        <button
                            onClick={onClear}
                            className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
                        >
                            <X className="w-3 h-3" />
                            Limpar
                        </button>
                    )}
                </div>
                <div className="space-y-0.5">
                    {SORT_FIELDS.map((field) => {
                        const meta = SORT_FIELD_LABELS[field]
                        if (!meta) return null
                        const isActive = currentSort.sortBy === field
                        const dirLabel = currentSort.sortDirection === 'asc' ? meta.asc : meta.desc

                        return (
                            <button
                                key={field}
                                onClick={() => handleSelect(field)}
                                className={cn(
                                    "flex items-center justify-between w-full px-2.5 py-1.5 rounded-md text-sm transition-colors",
                                    isActive
                                        ? "bg-indigo-50 text-indigo-700"
                                        : "text-gray-700 hover:bg-gray-100"
                                )}
                            >
                                <span className={cn(isActive && "font-medium")}>
                                    {meta.label}
                                </span>
                                {isActive && (
                                    <span className="flex items-center gap-1 text-xs font-medium text-indigo-500">
                                        {currentSort.sortDirection === 'asc' ? (
                                            <ArrowUp className="w-3 h-3" />
                                        ) : (
                                            <ArrowDown className="w-3 h-3" />
                                        )}
                                        {dirLabel}
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </div>
            </PopoverContent>
        </Popover>
    )
}
