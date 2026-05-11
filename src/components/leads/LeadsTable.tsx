import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Link } from 'react-router-dom'
import { ArrowUpDown, User as UserIcon, ExternalLink, AlertCircle, Clock, MapPin } from 'lucide-react'
import { getOrigemLabel, getOrigemColor } from '../../lib/constants/origem'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table'
import { Badge } from '../ui/Badge'
import { Avatar, AvatarFallback } from '../ui/avatar'
import { Checkbox } from '../ui/checkbox'
import { cn } from '../../lib/utils'
import type { LeadCard } from '../../hooks/useLeadsQuery'
import { useLeadsFilters, type SortBy } from '../../hooks/useLeadsFilters'
import { useLeadsColumns, type LeadsColumnConfig } from '../../hooks/useLeadsColumns'
import LeadsRowActions from './LeadsRowActions'

interface LeadsTableProps {
    leads: LeadCard[]
    selectedIds: string[]
    onSelectAll: (checked: boolean) => void
    onSelectRow: (id: string, checked: boolean) => void
    isLoading?: boolean
}

// Column renderers
const columnRenderers: Record<string, (lead: LeadCard) => React.ReactNode> = {
    titulo: (lead) => (
        <div className="flex flex-col">
            <span className="text-gray-900 font-semibold truncate max-w-[250px]">
                {lead.titulo}
            </span>
            <span className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                <UserIcon className="h-3 w-3" />
                {lead.pessoa_nome || 'Sem cliente'}
            </span>
        </div>
    ),

    etapa_nome: (lead) => (
        <Badge
            variant="secondary"
            className="text-xs font-normal bg-gray-100 text-gray-600 border-gray-200"
        >
            {lead.etapa_nome}
        </Badge>
    ),

    valor_estimado: (lead) => (
        <span className="font-mono text-gray-700">
            {new Intl.NumberFormat('pt-BR', {
                style: 'currency',
                currency: 'BRL'
            }).format(lead.valor_estimado || 0)}
        </span>
    ),

    prioridade: (lead) => {
        if (lead.prioridade === 'alta') {
            return <Badge className="bg-red-100 text-red-700 border-red-200">Alta</Badge>
        }
        if (lead.prioridade === 'media') {
            return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">Média</Badge>
        }
        if (lead.prioridade === 'baixa') {
            return <Badge className="bg-green-100 text-green-700 border-green-200">Baixa</Badge>
        }
        return <span className="text-gray-400 text-xs">-</span>
    },

    dono_atual_nome: (lead) => (
        <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
                <AvatarFallback className="text-[10px] bg-blue-50 text-blue-700">
                    {lead.dono_atual_nome?.substring(0, 2).toUpperCase() || 'U'}
                </AvatarFallback>
            </Avatar>
            <span className="text-sm text-gray-600 truncate max-w-[100px]">
                {lead.dono_atual_nome?.split(' ')[0] || 'Sem dono'}
            </span>
        </div>
    ),

    created_at: (lead) => (
        <span className="text-gray-600 text-sm">
            {lead.created_at
                ? format(new Date(lead.created_at), "dd/MM/yy", { locale: ptBR })
                : '-'}
        </span>
    ),

    updated_at: (lead) => (
        <span className="text-gray-600 text-sm">
            {lead.updated_at
                ? format(new Date(lead.updated_at), "dd/MM/yy HH:mm", { locale: ptBR })
                : '-'}
        </span>
    ),

    status_comercial: (lead) => {
        if (lead.status_comercial === 'ganho') {
            return <Badge className="bg-green-100 text-green-700 border-green-200">Ganho</Badge>
        }
        if (lead.status_comercial === 'perdido') {
            return <Badge className="bg-red-100 text-red-700 border-red-200">Perdido</Badge>
        }
        if (lead.status_comercial === 'aberto') {
            return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Aberto</Badge>
        }
        return <Badge variant="outline">-</Badge>
    },

    // New columns
    tempo_sem_contato: (lead) => {
        const dias = lead.tempo_sem_contato as number | null
        if (dias === null || dias === undefined) {
            return <span className="text-gray-400 text-sm">-</span>
        }
        const isWarning = dias > 7
        const isDanger = dias > 14
        return (
            <div className={cn(
                "flex items-center gap-1 text-sm",
                isDanger ? "text-red-600" : isWarning ? "text-amber-600" : "text-gray-600"
            )}>
                <Clock className="h-3 w-3" />
                {dias}d
            </div>
        )
    },

    proxima_tarefa: (lead) => {
        const tarefa = lead.proxima_tarefa as { titulo?: string, data_vencimento?: string } | null
        if (!tarefa?.titulo) {
            return <span className="text-gray-400 text-sm">-</span>
        }
        return (
            <span className="text-sm text-gray-600 truncate max-w-[150px]" title={tarefa.titulo}>
                {tarefa.titulo}
            </span>
        )
    },

    data_viagem_inicio: (lead) => (
        <span className="text-gray-600 text-sm">
            {lead.data_viagem_inicio
                ? format(new Date(lead.data_viagem_inicio), "dd/MM/yy", { locale: ptBR })
                : '-'}
        </span>
    ),

    dias_ate_viagem: (lead) => {
        const dias = lead.dias_ate_viagem as number | null
        if (dias === null || dias === undefined) {
            return <span className="text-gray-400 text-sm">-</span>
        }
        if (dias < 0) {
            return <span className="text-gray-400 text-sm">Passou</span>
        }
        const isUrgent = dias <= 30
        const isVeryUrgent = dias <= 7
        return (
            <span className={cn(
                "text-sm",
                isVeryUrgent ? "text-red-600 font-medium" : isUrgent ? "text-amber-600" : "text-gray-600"
            )}>
                {dias}d
            </span>
        )
    },

    tarefas_atrasadas: (lead) => {
        const count = lead.tarefas_atrasadas as number | null
        if (!count) {
            return <span className="text-gray-400 text-sm">0</span>
        }
        return (
            <Badge className="bg-red-100 text-red-700 border-red-200">
                <AlertCircle className="h-3 w-3 mr-1" />
                {count}
            </Badge>
        )
    },

    tarefas_pendentes: (lead) => {
        const count = lead.tarefas_pendentes as number | null
        return <span className="text-gray-600 text-sm">{count || 0}</span>
    },

    urgencia_viagem: (lead) => {
        const score = lead.urgencia_viagem as number | null
        if (!score) {
            return <span className="text-gray-400 text-sm">-</span>
        }
        const isCritical = score >= 80
        const isHigh = score >= 60
        const isMedium = score >= 40
        return (
            <div className={cn(
                "text-sm font-medium",
                isCritical ? "text-red-600" :
                    isHigh ? "text-orange-600" :
                        isMedium ? "text-amber-600" : "text-gray-600"
            )}>
                {score}
            </div>
        )
    },

    destinos: (lead) => {
        const destinos = lead.destinos as string[] | null
        if (!destinos?.length) {
            return <span className="text-gray-400 text-sm">-</span>
        }
        return (
            <div className="flex items-center gap-1 text-sm text-gray-600" title={destinos.join(', ')}>
                <MapPin className="h-3 w-3" />
                <span className="truncate max-w-[100px]">
                    {destinos.length > 1 ? `${destinos[0]} +${destinos.length - 1}` : destinos[0]}
                </span>
            </div>
        )
    },

    pipeline_nome: (lead) => (
        <span className="text-gray-600 text-sm truncate max-w-[120px]">
            {lead.pipeline_nome || '-'}
        </span>
    ),

    pessoa_email: (lead) => (
        <span className="text-gray-600 text-sm truncate max-w-[150px]" title={lead.pessoa_email || ''}>
            {lead.pessoa_email || '-'}
        </span>
    ),

    pessoa_telefone: (lead) => (
        <span className="text-gray-600 text-sm">
            {lead.pessoa_telefone || '-'}
        </span>
    ),

    origem: (lead) => (
        <Badge className={cn("text-xs font-medium", getOrigemColor(lead.origem))}>
            {getOrigemLabel(lead.origem)}
        </Badge>
    ),
}

// Sortable columns mapping
const sortableColumns: SortBy[] = ['created_at', 'updated_at', 'data_viagem_inicio', 'titulo', 'valor_estimado']

export default function LeadsTable({
    leads,
    selectedIds,
    onSelectAll,
    onSelectRow,
    isLoading
}: LeadsTableProps) {
    const { filters, setFilters } = useLeadsFilters()
    const { columns } = useLeadsColumns()

    const visibleColumns = columns.filter(col => col.isVisible)

    const handleSort = (field: string) => {
        if (!sortableColumns.includes(field as SortBy)) return

        if (filters.sortBy === field) {
            setFilters({ sortDirection: filters.sortDirection === 'asc' ? 'desc' : 'asc' })
        } else {
            setFilters({ sortBy: field as SortBy, sortDirection: 'desc' })
        }
    }

    const SortableHeader = ({ column }: { column: LeadsColumnConfig }) => {
        const isSortable = sortableColumns.includes(column.id as SortBy)

        return (
            <TableHead
                className={cn(
                    isSortable && "cursor-pointer hover:bg-gray-100 transition-colors"
                )}
                onClick={() => isSortable && handleSort(column.id)}
            >
                <div className="flex items-center gap-1">
                    {column.label}
                    {isSortable && (
                        <ArrowUpDown className={cn(
                            "h-3 w-3",
                            filters.sortBy === column.id ? "text-primary" : "text-gray-400"
                        )} />
                    )}
                </div>
            </TableHead>
        )
    }

    if (isLoading) {
        return (
            <div className="p-8 text-center text-gray-500">
                Carregando leads...
            </div>
        )
    }

    if (leads.length === 0) {
        return (
            <div className="p-12 text-center">
                <div className="text-gray-400 text-lg mb-2">Nenhum lead encontrado</div>
                <p className="text-gray-500 text-sm">Ajuste os filtros ou aguarde novos leads</p>
            </div>
        )
    }

    const allSelected = leads.length > 0 && selectedIds.length === leads.length
    const someSelected = selectedIds.length > 0 && selectedIds.length < leads.length

    return (
        <div className="rounded-md border border-gray-200 bg-white shadow-sm overflow-hidden">
            <Table>
                <TableHeader className="bg-gray-50/50">
                    <TableRow>
                        <TableHead className="w-[40px] px-4">
                            <Checkbox
                                checked={allSelected}
                                ref={(el) => {
                                    if (el) (el as unknown as HTMLInputElement).indeterminate = someSelected
                                }}
                                onCheckedChange={(checked) => onSelectAll(checked as boolean)}
                            />
                        </TableHead>
                        {visibleColumns.map((column) => (
                            <SortableHeader key={column.id} column={column} />
                        ))}
                        <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {leads.map((lead) => (
                        <TableRow
                            key={lead.id}
                            className={cn(
                                "hover:bg-gray-50/50 transition-colors group",
                                selectedIds.includes(lead.id!) && "bg-primary/5"
                            )}
                        >
                            <TableCell className="px-4">
                                <Checkbox
                                    checked={selectedIds.includes(lead.id!)}
                                    onCheckedChange={(checked) => onSelectRow(lead.id!, checked as boolean)}
                                />
                            </TableCell>

                            {visibleColumns.map((column) => (
                                <TableCell key={column.id}>
                                    {columnRenderers[column.id]?.(lead) || '-'}
                                </TableCell>
                            ))}

                            <TableCell>
                                <div className="flex items-center gap-1">
                                    <LeadsRowActions lead={lead} />
                                    <Link
                                        to={`/cards/${lead.id}`}
                                        className="text-gray-400 hover:text-primary transition-colors p-1"
                                        title="Abrir lead"
                                    >
                                        <ExternalLink className="h-4 w-4" />
                                    </Link>
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}
