import { X } from 'lucide-react'
import { usePipelineFilters } from '../../hooks/usePipelineFilters'
import { cn } from '../../lib/utils'
import { useFilterOptions } from '../../hooks/useFilterOptions'
import { usePipelinePhases } from '../../hooks/usePipelinePhases'
import { useCurrentProductMeta } from '../../hooks/useCurrentProductMeta'
import { useCardTags } from '../../hooks/useCardTags'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { getPhaseLabel, getMilestoneLabel } from '../../lib/pipeline/phaseLabels'
import { SystemPhase } from '../../types/pipeline'

const STATUS_LABELS: Record<string, string> = {
    aberto: 'Em Aberto',
    ganho: 'Ganho',
    perdido: 'Perdido',
}

const DOC_STATUS_LABELS: Record<string, string> = {
    com_anexos: 'Com Anexos',
    sem_anexos: 'Sem Anexos',
}

const ORIGEM_LABELS: Record<string, string> = {
    mkt: 'Marketing',
    indicacao: 'Indicação',
    carteira_propria: 'Carteira Própria',
    carteira_wg: 'Carteira WG',
    carteira: 'Carteira',
    manual: 'Manual',
    outro: 'Outro',
    site: 'Site',
    active_campaign: 'Active Campaign',
    whatsapp: 'WhatsApp',
}

const SMART_FIELD_LABELS: Record<string, string> = {
    data_viagem_inicio: 'Data da Viagem',
    data_fechamento: 'Data de Fechamento',
    valor_estimado: 'Valor Estimado',
    valor_final: 'Valor Final',
    pessoa_email: 'Email',
    pessoa_telefone: 'Telefone',
    origem: 'Origem',
    dono_atual_id: 'Responsável',
    destinos: 'Destinos',
    condicoes_pagamento: 'Cond. Pagamento',
}

const PRIORIDADE_LABELS: Record<string, string> = {
    alta: 'Alta',
    media: 'Média',
    baixa: 'Baixa',
}

export function ActiveFilters() {
    const {
        filters: rawFilters, showWonDirect,
        setFilters, removeFilter, toggleFilterValue, updateFilter,
        setShowWonDirect,
    } = usePipelineFilters()
    const filters = rawFilters || {}
    const { data: options } = useFilterOptions()
    const { pipelineId } = useCurrentProductMeta()
    const { data: phasesData } = usePipelinePhases(pipelineId ?? undefined)
    const { tags } = useCardTags()

    const hasFilters = !!(
        filters.search ||
        filters.ownerIds?.length ||
        filters.sdrIds?.length ||
        filters.plannerIds?.length ||
        filters.posIds?.length ||
        filters.teamIds?.length ||
        filters.departmentIds?.length ||
        filters.phaseFilters?.length ||
        filters.statusComercial?.length ||
        filters.tagIds?.length ||
        filters.noTag ||
        filters.startDate ||
        filters.endDate ||
        filters.creationStartDate ||
        filters.creationEndDate ||
        filters.docStatus?.length ||
        filters.milestones?.length ||
        filters.taskStatus?.length ||
        filters.origem?.length ||
        filters.valorMin != null ||
        filters.valorMax != null ||
        filters.diasSemContato != null ||
        filters.diasAteViagem != null ||
        filters.emptyFields?.length ||
        filters.filledFields?.length ||
        filters.closingStartDate ||
        filters.closingEndDate ||
        filters.prioridade?.length ||
        filters.estadoOperacional?.length ||
        showWonDirect
    )

    const clearAll = () => {
        // Preserva sortBy/sortDirection ao limpar filtros
        setFilters({
            sortBy: filters.sortBy,
            sortDirection: filters.sortDirection,
        })
        if (showWonDirect) setShowWonDirect(false)
    }

    return (
        <div className={cn(
            "flex items-center",
            !hasFilters && "hidden"
        )}>
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider mr-1">Filtros:</span>

                {/* Quick toggles como chips */}
                {showWonDirect && (
                    <Chip label={`Sem ${getPhaseLabel(phasesData, SystemPhase.POS_VENDA)}`} variant="green" onRemove={() => setShowWonDirect(false)} />
                )}

                {/* Search */}
                {filters.search && (
                    <Chip label={`Busca: "${filters.search}"`} onRemove={() => removeFilter('search')} />
                )}

                {/* Owners */}
                {filters.ownerIds?.map(id => {
                    const name = options?.profiles.find(p => p.id === id)?.full_name || 'Usuário'
                    return <Chip key={id} label={`Resp: ${name}`} onRemove={() => toggleFilterValue('ownerIds', id)} />
                })}

                {/* SDRs */}
                {filters.sdrIds?.map(id => {
                    const name = options?.profiles.find(p => p.id === id)?.full_name || getPhaseLabel(phasesData, SystemPhase.SDR)
                    return <Chip key={id} label={`${getPhaseLabel(phasesData, SystemPhase.SDR)}: ${name}`} onRemove={() => toggleFilterValue('sdrIds', id)} />
                })}

                {/* Planners */}
                {filters.plannerIds?.map(id => {
                    const name = options?.profiles.find(p => p.id === id)?.full_name || getPhaseLabel(phasesData, SystemPhase.PLANNER)
                    return <Chip key={id} label={`${getPhaseLabel(phasesData, SystemPhase.PLANNER)}: ${name}`} onRemove={() => toggleFilterValue('plannerIds', id)} />
                })}

                {/* Pós-Venda */}
                {filters.posIds?.map(id => {
                    const name = options?.profiles.find(p => p.id === id)?.full_name || getPhaseLabel(phasesData, SystemPhase.POS_VENDA)
                    return <Chip key={id} label={`${getPhaseLabel(phasesData, SystemPhase.POS_VENDA)}: ${name}`} onRemove={() => toggleFilterValue('posIds', id)} />
                })}

                {/* Teams */}
                {filters.teamIds?.map(id => {
                    const name = options?.teams.find(t => t.id === id)?.name || 'Time'
                    return <Chip key={id} label={`Time: ${name}`} onRemove={() => toggleFilterValue('teamIds', id)} />
                })}

                {/* Departments */}
                {filters.departmentIds?.map(id => {
                    const name = options?.departments.find(d => d.id === id)?.name || 'Depto'
                    return <Chip key={id} label={`Depto: ${name}`} onRemove={() => toggleFilterValue('departmentIds', id)} />
                })}

                {/* Phase Filters */}
                {filters.phaseFilters?.map(phaseId => {
                    const phase = phasesData?.find(p => p.id === phaseId)
                    return (
                        <Chip
                            key={`phase-${phaseId}`}
                            label={`Fase: ${phase?.name || 'Fase'}`}
                            onRemove={() => toggleFilterValue('phaseFilters', phaseId)}
                        />
                    )
                })}

                {/* Status Comercial */}
                {filters.statusComercial?.map(status => (
                    <Chip key={status} label={`Status: ${STATUS_LABELS[status] || status}`} onRemove={() => toggleFilterValue('statusComercial', status)} />
                ))}

                {/* Origem */}
                {filters.origem?.map(o => (
                    <Chip key={`origem-${o}`} label={`Origem: ${ORIGEM_LABELS[o] || o}`} onRemove={() => toggleFilterValue('origem', o)} />
                ))}

                {/* Milestones */}
                {filters.milestones?.map(m => (
                    <Chip key={m} label={getMilestoneLabel(phasesData, m)} onRemove={() => toggleFilterValue('milestones', m)} />
                ))}

                {/* Anexos Status */}
                {filters.docStatus?.map(status => (
                    <Chip key={`doc-${status}`} label={`Anexos: ${DOC_STATUS_LABELS[status] || status}`} onRemove={() => toggleFilterValue('docStatus', status)} />
                ))}

                {/* Task Status */}
                {filters.taskStatus?.map(status => {
                    const labels: Record<string, string> = { atrasada: 'Atrasada', para_hoje: 'Para Hoje', em_dia: 'Em Dia', sem_tarefa: 'Sem Tarefa' }
                    return <Chip key={`task-${status}`} label={`Tarefa: ${labels[status] || status}`} onRemove={() => toggleFilterValue('taskStatus', status)} />
                })}

                {/* Tags */}
                {filters.noTag && (
                    <Chip label="Sem tag" onRemove={() => removeFilter('noTag')} />
                )}
                {filters.tagIds?.map(tagId => {
                    const tag = tags.find(t => t.id === tagId)
                    return <Chip key={`tag-${tagId}`} label={`Tag: ${tag?.name || 'Tag'}`} onRemove={() => toggleFilterValue('tagIds', tagId)} />
                })}

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

                {/* Faixa de Valor */}
                {(filters.valorMin != null || filters.valorMax != null) && (
                    <Chip
                        label={`Valor: ${filters.valorMin != null ? `R$${filters.valorMin.toLocaleString('pt-BR')}` : '...'} - ${filters.valorMax != null ? `R$${filters.valorMax.toLocaleString('pt-BR')}` : '...'}`}
                        onRemove={() => { removeFilter('valorMin'); removeFilter('valorMax'); }}
                    />
                )}

                {/* Dias Sem Contato */}
                {filters.diasSemContato != null && (
                    <Chip label={`Sem contato > ${filters.diasSemContato}d`} onRemove={() => removeFilter('diasSemContato')} />
                )}

                {/* Urgência Viagem */}
                {filters.diasAteViagem != null && (
                    <Chip label={`Viagem < ${filters.diasAteViagem}d`} onRemove={() => removeFilter('diasAteViagem')} />
                )}

                {/* Data de Fechamento */}
                {(filters.closingStartDate || filters.closingEndDate) && (
                    <Chip
                        label={`Fechamento: ${filters.closingStartDate ? format(new Date(filters.closingStartDate + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR }) : '...'} - ${filters.closingEndDate ? format(new Date(filters.closingEndDate + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR }) : '...'}`}
                        onRemove={() => { removeFilter('closingStartDate'); removeFilter('closingEndDate'); }}
                    />
                )}

                {/* Prioridade */}
                {filters.prioridade?.map(p => (
                    <Chip key={`prio-${p}`} label={`Prioridade: ${PRIORIDADE_LABELS[p] || p}`} onRemove={() => toggleFilterValue('prioridade', p)} />
                ))}

                {/* Estado Operacional */}
                {filters.estadoOperacional?.map(e => (
                    <Chip key={`estado-${e}`} label={`Estado: ${e}`} onRemove={() => toggleFilterValue('estadoOperacional', e)} />
                ))}

                {/* Campos Preenchidos */}
                {filters.filledFields?.map(f => (
                    <Chip
                        key={`filled-${f}`}
                        label={`${SMART_FIELD_LABELS[f] || f}: Preenchido`}
                        variant="green"
                        onRemove={() => {
                            const updated = filters.filledFields!.filter(x => x !== f)
                            updateFilter({ filledFields: updated.length ? updated : undefined })
                        }}
                    />
                ))}

                {/* Campos Vazios */}
                {filters.emptyFields?.map(f => (
                    <Chip
                        key={`empty-${f}`}
                        label={`${SMART_FIELD_LABELS[f] || f}: Vazio`}
                        variant="amber"
                        onRemove={() => {
                            const updated = filters.emptyFields!.filter(x => x !== f)
                            updateFilter({ emptyFields: updated.length ? updated : undefined })
                        }}
                    />
                ))}

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

function Chip({ label, onRemove, variant }: { label: string, onRemove: () => void, variant?: 'green' | 'amber' }) {
    const colorClasses = variant === 'green'
        ? "bg-green-50 text-green-700 border-green-200"
        : variant === 'amber'
            ? "bg-amber-50 text-amber-700 border-amber-200"
            : "bg-blue-50 text-blue-700 border-blue-100"

    return (
        <span className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border", colorClasses)}>
            {label}
            <button
                onClick={onRemove}
                className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full hover:bg-black/10 transition-colors"
            >
                <X className="w-3 h-3" />
            </button>
        </span>
    )
}
