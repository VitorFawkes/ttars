import { SearchX } from 'lucide-react'
import { usePipelineFilters, useActiveFilterCount } from '../../hooks/usePipelineFilters'
import type { FilterState } from '../../hooks/usePipelineFilters'
import { FILTER_LABELS } from '../../lib/filterCascadeRules'

const RESTRICTIVE_ORDER: (keyof FilterState)[] = [
    'ownerIds', 'sdrIds', 'plannerIds', 'posIds',
    'teamIds', 'departmentIds',
    'startDate', 'endDate', 'creationStartDate', 'creationEndDate',
    'statusComercial', 'origem',
    'tagIds', 'milestones', 'taskStatus', 'docStatus',
    'search',
]

const FIELD_LABELS: Record<string, string> = {
    ...FILTER_LABELS,
    search: 'Busca',
    startDate: 'Data da Viagem (de)',
    endDate: 'Data da Viagem (até)',
    creationStartDate: 'Data de Criação (de)',
    creationEndDate: 'Data de Criação (até)',
    origem: 'Origem',
    tagIds: 'Tags',
    noTag: 'Sem tag',
    milestones: 'Marcos',
    taskStatus: 'Tarefas',
    docStatus: 'Anexos',
}

export function FilterEmptyState() {
    const { filters, removeFilter } = usePipelineFilters()
    const activeCount = useActiveFilterCount()

    if (activeCount === 0) return null

    const activeKeys = RESTRICTIVE_ORDER.filter(key => {
        const val = filters[key]
        if (val == null) return false
        if (Array.isArray(val) && val.length === 0) return false
        if (val === '') return false
        return true
    })

    const suggestions = activeKeys.slice(0, 3)

    return (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <SearchX className="w-7 h-7 text-slate-400" />
            </div>
            <h3 className="text-base font-semibold text-slate-700 mb-1">
                Nenhum card encontrado
            </h3>
            <p className="text-sm text-slate-500 mb-5 max-w-sm">
                A combinação de {activeCount} filtro{activeCount > 1 ? 's' : ''} ativo{activeCount > 1 ? 's' : ''} não retornou resultados.
                Tente remover algum filtro:
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
                {suggestions.map(key => (
                    <button
                        key={key}
                        onClick={() => removeFilter(key)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all"
                    >
                        Remover "{FIELD_LABELS[key] || key}"
                    </button>
                ))}
            </div>
        </div>
    )
}
