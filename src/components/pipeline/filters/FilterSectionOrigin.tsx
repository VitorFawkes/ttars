import { Link, Paperclip } from 'lucide-react'
import { FilterChipGroup } from './FilterChipGroup'
import { ALL_ORIGEM_OPTIONS } from '../../../lib/constants/origem'
import type { FilterState, ArrayFilterField } from '../../../hooks/usePipelineFilters'

const DOC_STATUS_OPTIONS = [
    { value: 'com_anexos', label: 'Com Anexos', color: 'bg-indigo-500 text-white border-indigo-500' },
    { value: 'sem_anexos', label: 'Sem Anexos', color: 'bg-gray-500 text-white border-gray-500' },
]

interface FilterSectionOriginProps {
    filters: FilterState
    onToggle: (field: ArrayFilterField, value: string) => void
}

export function FilterSectionOrigin({ filters, onToggle }: FilterSectionOriginProps) {
    return (
        <>
            {/* Origem */}
            <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                    <Link className="h-3 w-3" /> Origem do Lead
                </h3>
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                    <label className="text-sm font-semibold text-gray-700 block">Origem</label>
                    <FilterChipGroup
                        options={ALL_ORIGEM_OPTIONS.map(o => ({ value: o.value, label: o.label, color: o.color + ' border-transparent' }))}
                        selected={filters.origem || []}
                        onToggle={(v) => onToggle('origem', v)}
                    />
                </div>
            </div>

            {/* Anexos */}
            <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                    <Paperclip className="h-3 w-3" /> Anexos
                </h3>
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                    <FilterChipGroup
                        options={DOC_STATUS_OPTIONS}
                        selected={filters.docStatus || []}
                        onToggle={(v) => onToggle('docStatus', v)}
                    />
                </div>
            </div>
        </>
    )
}
