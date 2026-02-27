import { X } from 'lucide-react'
import { usePipelineFilters } from '../../hooks/usePipelineFilters'
import { cn } from '../../lib/utils'
import { useFilterOptions } from '../../hooks/useFilterOptions'
import { usePipelinePhases } from '../../hooks/usePipelinePhases'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const STATUS_LABELS: Record<string, string> = {
    aberto: 'Em Aberto',
    pausado: 'Pausado',
    ganho: 'Ganho',
    perdido: 'Perdido',
}

const DOC_STATUS_LABELS: Record<string, string> = {
    pendente: 'Pendente',
    completo: 'Completo',
    sem_documentos: 'Sem Documentos',
}

export function ActiveFilters() {
    const { filters: rawFilters, setFilters } = usePipelineFilters()
    const filters = rawFilters || {}
    const { data: options } = useFilterOptions()
    const { data: phasesData } = usePipelinePhases()

    const hasFilters = Object.keys(filters).length > 0 && (
        filters.search ||
        filters.ownerIds?.length ||
        filters.sdrIds?.length ||
        filters.plannerIds?.length ||
        filters.posIds?.length ||
        filters.teamIds?.length ||
        filters.departmentIds?.length ||
        filters.phaseFilter ||
        filters.statusComercial?.length ||
        filters.startDate ||
        filters.endDate ||
        filters.creationStartDate ||
        filters.creationEndDate ||
        filters.docStatus?.length
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic filter removal needs flexible typing
    const removeFilter = (key: keyof typeof filters, value?: any) => {
        const newFilters = { ...filters }

        if (Array.isArray(newFilters[key])) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (newFilters as any)[key] = (newFilters[key] as string[]).filter(item => item !== value)
        } else {
            delete newFilters[key]
        }

        setFilters(newFilters)
    }

    const clearAll = () => setFilters({})

    return (
        <div className={cn(
            "flex items-center",
            !hasFilters && "hidden"
        )}>
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider mr-1">Filtros:</span>

                {/* Search */}
                {filters.search && (
                    <Chip label={`Busca: "${filters.search}"`} onRemove={() => removeFilter('search')} />
                )}

                {/* Owners */}
                {filters.ownerIds?.map(id => {
                    const name = options?.profiles.find(p => p.id === id)?.full_name || 'Usuário'
                    return <Chip key={id} label={`Resp: ${name}`} onRemove={() => removeFilter('ownerIds', id)} />
                })}

                {/* SDRs */}
                {filters.sdrIds?.map(id => {
                    const name = options?.profiles.find(p => p.id === id)?.full_name || 'SDR'
                    return <Chip key={id} label={`SDR: ${name}`} onRemove={() => removeFilter('sdrIds', id)} />
                })}

                {/* Planners */}
                {filters.plannerIds?.map(id => {
                    const name = options?.profiles.find(p => p.id === id)?.full_name || 'Planner'
                    return <Chip key={id} label={`Planner: ${name}`} onRemove={() => removeFilter('plannerIds', id)} />
                })}

                {/* Pós-Venda */}
                {filters.posIds?.map(id => {
                    const name = options?.profiles.find(p => p.id === id)?.full_name || 'Pós'
                    return <Chip key={id} label={`Pós: ${name}`} onRemove={() => removeFilter('posIds', id)} />
                })}

                {/* Teams */}
                {filters.teamIds?.map(id => {
                    const name = options?.teams.find(t => t.id === id)?.name || 'Time'
                    return <Chip key={id} label={`Time: ${name}`} onRemove={() => removeFilter('teamIds', id)} />
                })}

                {/* Departments */}
                {filters.departmentIds?.map(id => {
                    const name = options?.departments.find(d => d.id === id)?.name || 'Depto'
                    return <Chip key={id} label={`Depto: ${name}`} onRemove={() => removeFilter('departmentIds', id)} />
                })}

                {/* Phase Filter */}
                {filters.phaseFilter && (
                    <Chip
                        label={`Fase: ${phasesData?.find(p => p.id === filters.phaseFilter)?.name || 'Fase'}`}
                        onRemove={() => removeFilter('phaseFilter')}
                    />
                )}

                {/* Status Comercial */}
                {filters.statusComercial?.map(status => (
                    <Chip key={status} label={`Status: ${STATUS_LABELS[status] || status}`} onRemove={() => removeFilter('statusComercial', status)} />
                ))}

                {/* Doc Status */}
                {filters.docStatus?.map(status => (
                    <Chip key={`doc-${status}`} label={`Docs: ${DOC_STATUS_LABELS[status] || status}`} onRemove={() => removeFilter('docStatus', status)} />
                ))}

                {/* Dates */}
                {(filters.startDate || filters.endDate) && (
                    <Chip
                        label={`Viagem: ${filters.startDate ? format(new Date(filters.startDate + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR }) : '...'} - ${filters.endDate ? format(new Date(filters.endDate + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR }) : '...'}`}
                        onRemove={() => { removeFilter('startDate'); removeFilter('endDate'); }}
                    />
                )}

                {(filters.creationStartDate || filters.creationEndDate) && (
                    <Chip
                        label={`Criado: ${filters.creationStartDate ? format(new Date(filters.creationStartDate + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR }) : '...'} - ${filters.creationEndDate ? format(new Date(filters.creationEndDate + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR }) : '...'}`}
                        onRemove={() => { removeFilter('creationStartDate'); removeFilter('creationEndDate'); }}
                    />
                )}

                <button
                    onClick={clearAll}
                    className="text-xs text-red-600 hover:text-red-700 font-medium ml-2 hover:underline"
                >
                    Limpar todos
                </button>
            </div>
        </div>
    )
}

function Chip({ label, onRemove }: { label: string, onRemove: () => void }) {
    return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
            {label}
            <button
                onClick={onRemove}
                className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full hover:bg-blue-200 text-blue-500 hover:text-blue-800 transition-colors"
            >
                <X className="w-3 h-3" />
            </button>
        </span>
    )
}
