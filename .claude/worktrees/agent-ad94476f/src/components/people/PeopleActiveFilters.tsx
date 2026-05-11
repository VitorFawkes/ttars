import { X } from 'lucide-react'
import type { PeopleFilters } from '../../hooks/usePeopleIntelligence'
import { useFilterOptions } from '../../hooks/useFilterOptions'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface PeopleActiveFiltersProps {
    filters: PeopleFilters
    setFilters: (filters: PeopleFilters) => void
}

export function PeopleActiveFilters({ filters, setFilters }: PeopleActiveFiltersProps) {
    const { data: options } = useFilterOptions()

    const hasFilters = (
        filters.search ||
        filters.type !== 'all' ||
        filters.minSpend !== undefined ||
        filters.maxSpend !== undefined ||
        filters.lastTripAfter ||
        filters.lastTripBefore ||
        filters.isGroupLeader ||
        (filters.createdByIds && filters.createdByIds.length > 0) ||
        filters.createdAtStart ||
        filters.createdAtEnd
    )

    const removeFilter = (key: keyof PeopleFilters, value?: any) => {
        const newFilters = { ...filters }

        if (Array.isArray(newFilters[key])) {
            (newFilters as any)[key] = (newFilters[key] as any[]).filter(item => item !== value)
        } else if (key === 'type') {
            newFilters.type = 'all'
        } else {
            delete newFilters[key]
        }

        setFilters(newFilters)
    }

    const clearAll = () => {
        setFilters({
            search: '',
            type: 'all'
        })
    }

    if (!hasFilters) return null

    return (
        <div className="flex items-center">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider mr-1">Filtros:</span>

                {/* Search */}
                {filters.search && (
                    <Chip label={`Busca: "${filters.search}"`} onRemove={() => setFilters({ ...filters, search: '' })} />
                )}

                {/* Type */}
                {filters.type !== 'all' && (
                    <Chip label={`Tipo: ${filters.type === 'adulto' ? 'Adulto' : 'Não Adulto'}`} onRemove={() => removeFilter('type')} />
                )}

                {/* Group Leader */}
                {filters.isGroupLeader && (
                    <Chip label="Líder de Grupo" onRemove={() => removeFilter('isGroupLeader')} />
                )}

                {/* Created By */}
                {filters.createdByIds?.map(id => {
                    const name = options?.profiles.find(p => p.id === id)?.full_name || 'Usuário'
                    return <Chip key={id} label={`Criado por: ${name}`} onRemove={() => removeFilter('createdByIds', id)} />
                })}


                {/* Last Trip Date */}
                {(filters.lastTripAfter || filters.lastTripBefore) && (
                    <Chip
                        label={`Última Viagem: ${filters.lastTripAfter ? format(new Date(filters.lastTripAfter), 'dd/MM/yyyy', { locale: ptBR }) : '...'} - ${filters.lastTripBefore ? format(new Date(filters.lastTripBefore), 'dd/MM/yyyy', { locale: ptBR }) : '...'}`}
                        onRemove={() => {
                            const newFilters = { ...filters }
                            delete newFilters.lastTripAfter
                            delete newFilters.lastTripBefore
                            setFilters(newFilters)
                        }}
                    />
                )}

                {/* Creation Date */}
                {(filters.createdAtStart || filters.createdAtEnd) && (
                    <Chip
                        label={`Criado: ${filters.createdAtStart ? format(new Date(filters.createdAtStart), 'dd/MM/yyyy', { locale: ptBR }) : '...'} - ${filters.createdAtEnd ? format(new Date(filters.createdAtEnd), 'dd/MM/yyyy', { locale: ptBR }) : '...'}`}
                        onRemove={() => {
                            const newFilters = { ...filters }
                            delete newFilters.createdAtStart
                            delete newFilters.createdAtEnd
                            setFilters(newFilters)
                        }}
                    />
                )}

                {/* Spend */}
                {(filters.minSpend !== undefined || filters.maxSpend !== undefined) && (
                    <Chip
                        label={`Valor: ${filters.minSpend ? `R$ ${filters.minSpend}` : '0'} - ${filters.maxSpend ? `R$ ${filters.maxSpend}` : '∞'}`}
                        onRemove={() => {
                            const newFilters = { ...filters }
                            delete newFilters.minSpend
                            delete newFilters.maxSpend
                            setFilters(newFilters)
                        }}
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
