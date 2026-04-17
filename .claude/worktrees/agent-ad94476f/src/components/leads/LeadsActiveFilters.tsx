import { X } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { LeadsFilterState } from '../../hooks/useLeadsFilters'
import { useFilterOptions } from '../../hooks/useFilterOptions'
import { usePipelineStages } from '../../hooks/usePipelineStages'
import { usePipelines } from '../../hooks/usePipelines'
import { useCardTags } from '../../hooks/useCardTags'
import { useProductContext } from '../../hooks/useProductContext'
import { useCurrentProductMeta } from '../../hooks/useCurrentProductMeta'

interface LeadsActiveFiltersProps {
    filters: LeadsFilterState
    setFilters: (filters: Partial<LeadsFilterState>) => void
}

interface FilterChip {
    id: string
    label: string
    onRemove: () => void
}

export default function LeadsActiveFilters({ filters, setFilters }: LeadsActiveFiltersProps) {
    const { data: options } = useFilterOptions()
    const { currentProduct } = useProductContext()
    const { pipelineId } = useCurrentProductMeta()
    const { data: stages } = usePipelineStages(pipelineId)
    const { data: pipelines } = usePipelines()
    const { tags } = useCardTags(currentProduct)

    const profiles = options?.profiles || []

    const chips: FilterChip[] = []

    // Search
    if (filters.search) {
        chips.push({
            id: 'search',
            label: `Busca: "${filters.search}"`,
            onRemove: () => setFilters({ search: undefined })
        })
    }

    // Creation date range
    if (filters.creationStartDate || filters.creationEndDate) {
        const start = filters.creationStartDate
            ? format(new Date(filters.creationStartDate), "dd/MM/yy", { locale: ptBR })
            : '...'
        const end = filters.creationEndDate
            ? format(new Date(filters.creationEndDate), "dd/MM/yy", { locale: ptBR })
            : '...'
        chips.push({
            id: 'creation-date',
            label: `Criação: ${start} - ${end}`,
            onRemove: () => setFilters({ creationStartDate: undefined, creationEndDate: undefined })
        })
    }

    // Trip date range
    if (filters.dataViagemStart || filters.dataViagemEnd) {
        const start = filters.dataViagemStart
            ? format(new Date(filters.dataViagemStart), "dd/MM/yy", { locale: ptBR })
            : '...'
        const end = filters.dataViagemEnd
            ? format(new Date(filters.dataViagemEnd), "dd/MM/yy", { locale: ptBR })
            : '...'
        chips.push({
            id: 'trip-date',
            label: `Viagem: ${start} - ${end}`,
            onRemove: () => setFilters({ dataViagemStart: undefined, dataViagemEnd: undefined })
        })
    }

    // Owners
    filters.ownerIds?.forEach(ownerId => {
        const owner = profiles.find(p => p.id === ownerId)
        if (owner) {
            chips.push({
                id: `owner-${ownerId}`,
                label: `Dono: ${owner.full_name?.split(' ')[0] || owner.email}`,
                onRemove: () => setFilters({
                    ownerIds: filters.ownerIds?.filter(id => id !== ownerId)
                })
            })
        }
    })

    // Pipelines
    filters.pipelineIds?.forEach(pipelineId => {
        const pipeline = pipelines?.find(p => p.id === pipelineId)
        if (pipeline) {
            chips.push({
                id: `pipeline-${pipelineId}`,
                label: `Pipeline: ${pipeline.nome}`,
                onRemove: () => setFilters({
                    pipelineIds: filters.pipelineIds?.filter(id => id !== pipelineId)
                })
            })
        }
    })

    // Stages
    filters.stageIds?.forEach(stageId => {
        const stage = stages?.find(s => s.id === stageId)
        if (stage) {
            chips.push({
                id: `stage-${stageId}`,
                label: `Etapa: ${stage.nome}`,
                onRemove: () => setFilters({
                    stageIds: filters.stageIds?.filter(id => id !== stageId)
                })
            })
        }
    })

    // Status comercial
    filters.statusComercial?.forEach(status => {
        const statusLabels: Record<string, string> = {
            aberto: 'Aberto',
            ganho: 'Ganho',
            perdido: 'Perdido'
        }
        chips.push({
            id: `status-${status}`,
            label: `Status: ${statusLabels[status] || status}`,
            onRemove: () => setFilters({
                statusComercial: filters.statusComercial?.filter(s => s !== status)
            })
        })
    })

    // Prioridade
    filters.prioridade?.forEach(prio => {
        const prioLabels: Record<string, string> = {
            alta: 'Alta',
            media: 'Média',
            baixa: 'Baixa'
        }
        chips.push({
            id: `prio-${prio}`,
            label: `Prioridade: ${prioLabels[prio] || prio}`,
            onRemove: () => setFilters({
                prioridade: filters.prioridade?.filter(p => p !== prio)
            })
        })
    })

    // Value range
    if (filters.valorMin !== undefined || filters.valorMax !== undefined) {
        const min = filters.valorMin !== undefined
            ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(filters.valorMin)
            : '...'
        const max = filters.valorMax !== undefined
            ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(filters.valorMax)
            : '...'
        chips.push({
            id: 'value-range',
            label: `Valor: ${min} - ${max}`,
            onRemove: () => setFilters({ valorMin: undefined, valorMax: undefined })
        })
    }

    // No tag
    if (filters.noTag) {
        chips.push({
            id: 'no-tag',
            label: 'Sem tag',
            onRemove: () => setFilters({ noTag: undefined })
        })
    }

    // Tags
    filters.tagIds?.forEach(tagId => {
        const tag = tags.find(t => t.id === tagId)
        if (tag) {
            chips.push({
                id: `tag-${tagId}`,
                label: `Tag: ${tag.name}`,
                onRemove: () => setFilters({
                    tagIds: filters.tagIds?.filter(id => id !== tagId)
                })
            })
        }
    })

    // Days without contact
    if (filters.diasSemContatoMin !== undefined || filters.diasSemContatoMax !== undefined) {
        const min = filters.diasSemContatoMin ?? '...'
        const max = filters.diasSemContatoMax ?? '...'
        chips.push({
            id: 'days-without-contact',
            label: `Dias s/ contato: ${min} - ${max}`,
            onRemove: () => setFilters({ diasSemContatoMin: undefined, diasSemContatoMax: undefined })
        })
    }

    if (chips.length === 0) return null

    return (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200">
            <span className="text-xs text-gray-500 font-medium">Filtros ativos:</span>
            {chips.map(chip => (
                <button
                    key={chip.id}
                    onClick={chip.onRemove}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-gray-200 rounded-full text-xs text-gray-700 hover:bg-gray-100 hover:border-gray-300 transition-colors group"
                >
                    {chip.label}
                    <X className="h-3 w-3 text-gray-400 group-hover:text-gray-600" />
                </button>
            ))}
        </div>
    )
}
