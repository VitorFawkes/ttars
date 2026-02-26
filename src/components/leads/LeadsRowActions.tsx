import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MoreHorizontal, Flag, User, Layers, ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '../ui/Button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { cn } from '../../lib/utils'
import { useLeadQuickUpdate } from '../../hooks/useLeadQuickUpdate'
import { useFilterOptions } from '../../hooks/useFilterOptions'
import { usePipelineStages } from '../../hooks/usePipelineStages'
import type { LeadCard } from '../../hooks/useLeadsQuery'

interface LeadsRowActionsProps {
    lead: LeadCard
}

const PRIORIDADE_OPTIONS = [
    { value: 'alta', label: 'Alta', color: 'bg-red-100 text-red-700' },
    { value: 'media', label: 'Média', color: 'bg-yellow-100 text-yellow-700' },
    { value: 'baixa', label: 'Baixa', color: 'bg-green-100 text-green-700' }
]

export default function LeadsRowActions({ lead }: LeadsRowActionsProps) {
    const [isOpen, setIsOpen] = useState(false)
    const { mutate: quickUpdate, isPending } = useLeadQuickUpdate()
    const { data: options } = useFilterOptions()
    const { data: stages } = usePipelineStages()

    const profiles = options?.profiles || []

    const handlePriorityChange = (priority: string) => {
        quickUpdate({
            cardId: lead.id!,
            field: 'prioridade',
            value: priority
        })
        setIsOpen(false)
    }

    const handleOwnerChange = (ownerId: string) => {
        quickUpdate({
            cardId: lead.id!,
            field: 'dono_atual_id',
            value: ownerId
        })
        setIsOpen(false)
    }

    const handleStageChange = (stageId: string) => {
        quickUpdate({
            cardId: lead.id!,
            field: 'pipeline_stage_id',
            value: stageId
        })
        setIsOpen(false)
    }

    return (
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                    {isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <MoreHorizontal className="h-4 w-4" />
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Ações Rápidas</DropdownMenuLabel>
                <DropdownMenuSeparator />

                {/* Priority */}
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                        <Flag className="h-4 w-4 mr-2" />
                        Prioridade
                        {lead.prioridade && (
                            <span className={cn(
                                "ml-auto text-xs px-1.5 py-0.5 rounded",
                                lead.prioridade === 'alta' && "bg-red-100 text-red-700",
                                lead.prioridade === 'media' && "bg-yellow-100 text-yellow-700",
                                lead.prioridade === 'baixa' && "bg-green-100 text-green-700"
                            )}>
                                {lead.prioridade === 'alta' ? 'Alta' : lead.prioridade === 'media' ? 'Média' : 'Baixa'}
                            </span>
                        )}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                        {PRIORIDADE_OPTIONS.map(prio => (
                            <DropdownMenuItem
                                key={prio.value}
                                onClick={() => handlePriorityChange(prio.value)}
                                className={cn(
                                    lead.prioridade === prio.value && "bg-gray-100"
                                )}
                            >
                                <span className={cn("mr-2 px-1.5 py-0.5 rounded text-xs", prio.color)}>
                                    {prio.label}
                                </span>
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuSubContent>
                </DropdownMenuSub>

                {/* Owner */}
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                        <User className="h-4 w-4 mr-2" />
                        Responsável
                        {lead.dono_atual_nome && (
                            <span className="ml-auto text-xs text-gray-500 truncate max-w-[80px]">
                                {lead.dono_atual_nome.split(' ')[0]}
                            </span>
                        )}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="max-h-[300px] overflow-y-auto">
                        {profiles.map(profile => (
                            <DropdownMenuItem
                                key={profile.id}
                                onClick={() => handleOwnerChange(profile.id)}
                                className={cn(
                                    lead.dono_atual_id === profile.id && "bg-gray-100"
                                )}
                            >
                                <div className="flex items-center gap-2">
                                    <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                                        {(profile.full_name || profile.email || '?').substring(0, 2).toUpperCase()}
                                    </div>
                                    <span className="truncate max-w-[150px]">
                                        {profile.full_name || profile.email}
                                    </span>
                                </div>
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuSubContent>
                </DropdownMenuSub>

                {/* Stage */}
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                        <Layers className="h-4 w-4 mr-2" />
                        Etapa
                        {lead.etapa_nome && (
                            <span className="ml-auto text-xs text-gray-500 truncate max-w-[80px]">
                                {lead.etapa_nome}
                            </span>
                        )}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="max-h-[300px] overflow-y-auto">
                        {stages?.map(stage => (
                            <DropdownMenuItem
                                key={stage.id}
                                onClick={() => handleStageChange(stage.id)}
                                className={cn(
                                    lead.pipeline_stage_id === stage.id && "bg-gray-100"
                                )}
                            >
                                <div className="flex items-center gap-2">
                                    <div
                                        className="w-2 h-2 rounded-full"
                                        style={{ backgroundColor: stage.cor || '#6b7280' }}
                                    />
                                    <span className="truncate max-w-[150px]">
                                        {stage.nome}
                                    </span>
                                </div>
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuSeparator />

                {/* Open Lead */}
                <DropdownMenuItem asChild>
                    <Link to={`/cards/${lead.id}`} className="cursor-pointer">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Abrir Lead
                    </Link>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
