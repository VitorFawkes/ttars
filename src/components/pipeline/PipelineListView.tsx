import { useState, useEffect, useMemo } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Link } from 'react-router-dom'
import { ArrowUpDown, Calendar, Clock, AlertCircle, User as UserIcon, Trash2, Edit, Phone, Mail, MessageSquare, MoreHorizontal, CheckCircle2, Plane, AlertTriangle, ChevronLeft, ChevronRight, FileText, Paperclip, Trophy, XCircle } from 'lucide-react'
import { getOrigemLabel, getOrigemColor } from '../../lib/constants/origem'
import { usePipelineListCards } from '../../hooks/usePipelineListCards'
import { usePipelineFilters, type ViewMode, type SubView, type FilterState } from '../../hooks/usePipelineFilters'
import { useFilterOptions } from '../../hooks/useFilterOptions'
import { usePipelineStages } from '../../hooks/usePipelineStages'
import { useProducts } from '../../hooks/useProducts'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table'
import { Badge } from '../ui/Badge'
import { Avatar, AvatarFallback } from '../ui/avatar'
import { Checkbox } from '../ui/checkbox'
import { cn } from '../../lib/utils'
import type { Database } from '../../database.types'
import { ColumnManager, type ColumnConfig } from '../ui/data-grid/ColumnManager'
import { BulkActions } from '../ui/data-grid/BulkActions'
import { BulkEditModal, type BulkEditField } from '../ui/data-grid/BulkEditModal'
import { useArchiveCard } from '../../hooks/useArchiveCard'
import DeleteCardModal from '../card/DeleteCardModal'
import { supabase } from '../../lib/supabase'
import { toast } from 'sonner'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { Button } from '../ui/Button'
import { useSeenCards } from '../../hooks/useSeenCards'
import { useQualityGate } from '../../hooks/useQualityGate'
import { FilterEmptyState } from './FilterEmptyState'

type Card = Database['public']['Views']['view_cards_acoes']['Row']
type Product = Database['public']['Enums']['app_product']

interface ProximaTarefa {
    id: string
    titulo: string
    tipo: string | null
    data_vencimento: string
}
const asProximaTarefa = (t: Card['proxima_tarefa']): ProximaTarefa => t as unknown as ProximaTarefa

interface PipelineListViewProps {
    productFilter: Product
    viewMode: ViewMode
    subView: SubView
    filters: FilterState
    showClosedCards?: boolean
    showWonDirect?: boolean
    onCardClick?: (cardId: string) => void
}

export default function PipelineListView({ productFilter, viewMode, subView, filters, showClosedCards = false, showWonDirect = false }: PipelineListViewProps) {
    const queryClient = useQueryClient()
    const { groupFilters } = usePipelineFilters()
    const { isNew: isCardNew } = useSeenCards()

    // Dados para bulk actions
    const { data: filterOptions } = useFilterOptions()
    const { products } = useProducts()
    const pipelineId = products.find(p => p.slug === productFilter)?.pipeline_id ?? undefined
    const { data: stages } = usePipelineStages(pipelineId)

    // Paginação
    const [currentPage, setCurrentPage] = useState(1)

    // Resetar página ao mudar filtros ou toggle
    useEffect(() => {
        setCurrentPage(1)
    }, [filters, showClosedCards, showWonDirect])

    // Computar IDs de stages das fases filtradas (para phaseFilters)
    const phaseStageIds = useMemo(() => {
        if (!filters.phaseFilters?.length || !stages) return undefined
        return stages.filter(s => s.phase_id && filters.phaseFilters!.includes(s.phase_id)).map(s => s.id)
    }, [filters.phaseFilters, stages])

    const { data: queryResult, isLoading } = usePipelineListCards({
        productFilter,
        viewMode,
        subView,
        filters,
        groupFilters,
        showClosedCards,
        showWonDirect,
        phaseStageIds,
        page: currentPage,
        pageSize: 50
    })

    const cards = queryResult?.data
    const totalCards = queryResult?.total ?? 0
    const totalPages = queryResult?.totalPages ?? 1
    const { validateMoveSync } = useQualityGate()

    // --- State ---
    const [sortField, setSortField] = useState<keyof Card | 'proxima_tarefa'>('created_at')
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
    const [selectedCards, setSelectedCards] = useState<string[]>([])

    // Default column configuration with order
    const defaultColumns: ColumnConfig[] = [
        { id: 'atencao', label: 'Atenção', isVisible: true },
        { id: 'titulo', label: 'Negócio', isVisible: true },
        { id: 'etapa_nome', label: 'Etapa', isVisible: true },
        { id: 'valor_estimado', label: 'Valor', isVisible: true },
        { id: 'prioridade', label: 'Prioridade', isVisible: true },
        { id: 'proxima_tarefa', label: 'Próxima Tarefa', isVisible: true },
        { id: 'dono_atual_nome', label: 'Responsável', isVisible: true },
        { id: 'data_viagem_inicio', label: 'Data Viagem', isVisible: false },
        { id: 'created_at', label: 'Data Criação', isVisible: false },
        { id: 'updated_at', label: 'Última Atualização', isVisible: false },
        { id: 'origem', label: 'Origem', isVisible: false },
        { id: 'produto', label: 'Produto', isVisible: false },
        { id: 'sdr_nome', label: 'SDR', isVisible: false },
        { id: 'vendas_nome', label: 'Closer', isVisible: false },
        { id: 'tempo_etapa_dias', label: 'Dias na Etapa', isVisible: false },
        { id: 'documentos', label: 'Documentos', isVisible: false },
        { id: 'acoes', label: 'Ações', isVisible: true },
    ]

    // Load saved column preferences from localStorage (supports new format with order)
    const [columns, setColumns] = useState<ColumnConfig[]>(() => {
        const saved = localStorage.getItem('pipeline_list_columns_v2')
        if (saved) {
            try {
                const parsed = JSON.parse(saved) as ColumnConfig[]
                // Merge with defaults to handle new columns that might have been added
                const savedIds = new Set(parsed.map(c => c.id))
                const mergedColumns = [...parsed]
                // Add any new columns that weren't in saved config
                defaultColumns.forEach(col => {
                    if (!savedIds.has(col.id)) {
                        mergedColumns.push(col)
                    }
                })
                return mergedColumns
            } catch {
                // fallback to defaults
            }
        }
        return defaultColumns
    })

    // Persist column preferences
    useEffect(() => {
        localStorage.setItem('pipeline_list_columns_v2', JSON.stringify(columns))
    }, [columns])

    // Quick Filters state
    type QuickFilterType = 'overdue' | 'trip_soon' | 'sla' | 'no_task' | 'high_priority' | 'sem_anexos'
    const [activeQuickFilters, setActiveQuickFilters] = useState<QuickFilterType[]>([])

    const toggleQuickFilter = (filter: QuickFilterType) => {
        setActiveQuickFilters(prev =>
            prev.includes(filter)
                ? prev.filter(f => f !== filter)
                : [...prev, filter]
        )
    }

    // Calculate quick filter counts
    const quickFilterCounts = {
        overdue: cards?.filter(c => (c.tarefas_atrasadas as number) > 0).length ?? 0,
        trip_soon: cards?.filter(c => c.dias_ate_viagem !== null && (c.dias_ate_viagem as number) <= 30 && (c.dias_ate_viagem as number) >= 0).length ?? 0,
        sla: cards?.filter(c => (c.tempo_etapa_dias as number) > 7).length ?? 0,
        no_task: cards?.filter(c => !c.proxima_tarefa).length ?? 0,
        high_priority: cards?.filter(c => c.prioridade === 'alta').length ?? 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- anexos_count vem da view mas não está nos types gerados
        sem_anexos: cards?.filter(c => !Number((c as any).anexos_count)).length ?? 0,
    }

    const [showDeleteModal, setShowDeleteModal] = useState(false)
    const [showEditModal, setShowEditModal] = useState(false)
    const { archive, isArchiving } = useArchiveCard()

    // Mutation para marcar tarefa como concluída
    const completeTaskMutation = useMutation({
        mutationFn: async (taskId: string) => {
            const { error } = await supabase
                .from('tarefas')
                .update({
                    concluida: true,
                    status: 'concluida',
                    concluida_em: new Date().toISOString()
                })
                .eq('id', taskId)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['cards'] })
            toast.success('Tarefa concluída!')
        },
        onError: () => {
            toast.error('Erro ao concluir tarefa')
        }
    })

    // --- Handlers ---
    const handleSort = (field: keyof Card | 'proxima_tarefa') => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
        } else {
            setSortField(field)
            setSortDirection('asc')
        }
    }

    const handleSelectAll = (checked: boolean) => {
        if (checked && cards) {
            setSelectedCards(cards.map(c => c.id!))
        } else {
            setSelectedCards([])
        }
    }

    const handleSelectRow = (cardId: string, checked: boolean) => {
        if (checked) {
            setSelectedCards(prev => [...prev, cardId])
        } else {
            setSelectedCards(prev => prev.filter(id => id !== cardId))
        }
    }

    const handleColumnsChange = (newColumns: ColumnConfig[]) => {
        setColumns(newColumns)
    }

    const handleBulkDelete = () => {
        setShowDeleteModal(true)
    }

    const confirmBulkDelete = async () => {
        // Sequential archive for now (could be optimized with a bulk RPC)
        for (const id of selectedCards) {
            await archive(id)
        }
        setSelectedCards([])
        setShowDeleteModal(false)
        queryClient.invalidateQueries({ queryKey: ['cards'] })
    }

    const handleBulkEdit = async (fieldId: string, value: string | number | null) => {
        try {
            const updates: Record<string, string | number | null> = {}

            if (fieldId === 'data_viagem_inicio') {
                updates.data_viagem_inicio = value
            } else if (fieldId === 'prioridade') {
                updates.prioridade = value
            } else if (fieldId === 'dono_atual_id') {
                updates.dono_atual_id = value
            } else if (fieldId === 'etapa_id') {
                updates.etapa_id = value

                // Quality Gate: validar cada card contra a etapa destino
                if (value && cards) {
                    const targetStageId = value as string
                    const selectedCardData = cards.filter(c => c.id && selectedCards.includes(c.id))
                    const blocked: string[] = []

                    for (const card of selectedCardData) {
                        const syncResult = validateMoveSync(card as unknown as Record<string, unknown>, targetStageId)
                        if (!syncResult.valid) {
                            blocked.push(card.titulo || card.id || 'Card sem título')
                        }
                    }

                    if (blocked.length > 0) {
                        toast.error(
                            `${blocked.length} card(s) não atendem aos requisitos da etapa: ${blocked.slice(0, 3).join(', ')}${blocked.length > 3 ? ` e mais ${blocked.length - 3}` : ''}`
                        )
                        return
                    }
                }
            }

            // Perform update
            const { error } = await supabase
                .from('cards')
                .update(updates)
                .in('id', selectedCards)

            if (error) throw error

            toast.success(`${selectedCards.length} cards atualizados com sucesso!`)
            setSelectedCards([])
            queryClient.invalidateQueries({ queryKey: ['cards'] })
        } catch (error) {
            console.error('Error updating cards:', error)
            toast.error('Erro ao atualizar cards.')
        }
    }

    // --- Quick Filters + Sorting Logic ---
    const filteredCards = (cards || []).filter(card => {
        if (activeQuickFilters.length === 0) return true

        // Card must match ALL active filters (AND logic)
        return activeQuickFilters.every(filter => {
            switch (filter) {
                case 'overdue':
                    return (card.tarefas_atrasadas as number) > 0
                case 'trip_soon':
                    return card.dias_ate_viagem !== null && (card.dias_ate_viagem as number) <= 30 && (card.dias_ate_viagem as number) >= 0
                case 'sla':
                    return (card.tempo_etapa_dias as number) > 7
                case 'no_task':
                    return !card.proxima_tarefa
                case 'high_priority':
                    return card.prioridade === 'alta'
                case 'sem_anexos':
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- anexos_count vem da view
                    return !Number((card as any).anexos_count)
                default:
                    return true
            }
        })
    })

    const sortedCards = [...filteredCards].sort((a, b) => {
        let aValue: string | number | boolean | null | undefined = a[sortField as keyof Card] as string | number | boolean | null | undefined
        let bValue: string | number | boolean | null | undefined = b[sortField as keyof Card] as string | number | boolean | null | undefined

        // Special handling for nested/complex fields
        if (sortField === 'proxima_tarefa') {
            aValue = asProximaTarefa(a.proxima_tarefa)?.data_vencimento || ''
            bValue = asProximaTarefa(b.proxima_tarefa)?.data_vencimento || ''
        }

        if (!aValue && !bValue) return 0
        if (!aValue) return 1
        if (!bValue) return -1

        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
        return 0
    })

    if (isLoading) {
        return <div className="p-8 text-center text-gray-500">Carregando lista...</div>
    }


    // Helper: Check if card needs attention
    const getAttentionIndicators = (card: Card) => {
        const indicators: { type: 'overdue' | 'trip_soon' | 'sla' | 'no_task'; label: string }[] = []

        // Tarefas atrasadas
        if ((card.tarefas_atrasadas as number) > 0) {
            indicators.push({ type: 'overdue', label: `${card.tarefas_atrasadas} tarefa(s) atrasada(s)` })
        }

        // Viagem próxima (menos de 30 dias)
        if (card.dias_ate_viagem !== null && (card.dias_ate_viagem as number) <= 30 && (card.dias_ate_viagem as number) >= 0) {
            indicators.push({ type: 'trip_soon', label: `Viagem em ${card.dias_ate_viagem} dias` })
        }

        // SLA estourado (mais de 7 dias na etapa)
        if ((card.tempo_etapa_dias as number) > 7) {
            indicators.push({ type: 'sla', label: `${card.tempo_etapa_dias} dias na etapa` })
        }

        // Sem tarefa programada
        if (!card.proxima_tarefa) {
            indicators.push({ type: 'no_task', label: 'Sem tarefa programada' })
        }

        return indicators
    }

    // Configuração de renderização para cada coluna (header e cell)
    const columnRenderers: Record<string, {
        width: string
        headerClass?: string
        sortKey?: keyof Card | 'proxima_tarefa'
        renderHeader: () => React.ReactNode
        renderCell: (card: Card) => React.ReactNode
    }> = {
        atencao: {
            width: 'w-[80px]',
            headerClass: 'text-center',
            renderHeader: () => <span className="sr-only">Atenção</span>,
            renderCell: (card) => {
                const indicators = getAttentionIndicators(card)
                if (indicators.length === 0) return null
                return (
                    <div className="flex items-center justify-center gap-1" title={indicators.map(i => i.label).join('\n')}>
                        {indicators.some(i => i.type === 'overdue') && (
                            <span className="relative flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                            </span>
                        )}
                        {indicators.some(i => i.type === 'trip_soon') && <Plane className="h-3.5 w-3.5 text-orange-500" />}
                        {indicators.some(i => i.type === 'sla') && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                        {indicators.some(i => i.type === 'no_task') && !indicators.some(i => i.type === 'overdue') && (
                            <span className="h-2 w-2 rounded-full bg-gray-300"></span>
                        )}
                    </div>
                )
            }
        },
        titulo: {
            width: 'w-[300px]',
            sortKey: 'titulo',
            renderHeader: () => (
                <div className="flex items-center gap-1">
                    Negócio / Cliente
                    <ArrowUpDown className="h-3 w-3 text-gray-400" />
                </div>
            ),
            renderCell: (card) => (
                <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                        <Link to={`/cards/${card.id}`} className="text-gray-900 hover:text-primary hover:underline decoration-primary/30 underline-offset-2 transition-all font-semibold">
                            {card.titulo}
                        </Link>
                        {card.status_comercial === 'ganho' && card.ganho_planner === true && card.ganho_pos === false && card.fase !== 'Pós-venda' && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                                <Trophy className="h-2.5 w-2.5" /> Ganho Direto
                            </span>
                        )}
                        {card.status_comercial === 'ganho' && !(card.ganho_planner === true && card.ganho_pos === false && card.fase !== 'Pós-venda') && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700 border border-green-200">
                                <Trophy className="h-2.5 w-2.5" /> Ganho
                            </span>
                        )}
                        {card.status_comercial === 'perdido' && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
                                <XCircle className="h-2.5 w-2.5" /> Perdido
                            </span>
                        )}
                    </div>
                    <span className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                        <UserIcon className="h-3 w-3" />
                        {card.pessoa_nome || 'Sem cliente'}
                    </span>
                </div>
            )
        },
        etapa_nome: {
            width: 'w-[150px]',
            sortKey: 'etapa_nome',
            renderHeader: () => (
                <div className="flex items-center gap-1">
                    Etapa
                    <ArrowUpDown className="h-3 w-3 text-gray-400" />
                </div>
            ),
            renderCell: (card) => (
                <Badge variant="secondary" className="bg-gray-100 text-gray-600 hover:bg-gray-200 border-gray-200 font-normal">
                    {card.etapa_nome}
                </Badge>
            )
        },
        valor_estimado: {
            width: 'w-[120px]',
            headerClass: 'text-right',
            sortKey: 'valor_estimado',
            renderHeader: () => (
                <div className="flex items-center justify-end gap-1">
                    Valor
                    <ArrowUpDown className="h-3 w-3 text-gray-400" />
                </div>
            ),
            renderCell: (card) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const valor = (card as any).valor_display || card.valor_final || card.valor_estimado || 0
                const isConfirmed = !!card.valor_final
                return (
                    <span className={cn("text-right font-mono block", isConfirmed ? "text-emerald-700 font-medium" : "text-gray-700")}>
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)}
                    </span>
                )
            }
        },
        prioridade: {
            width: 'w-[100px]',
            sortKey: 'prioridade',
            renderHeader: () => (
                <div className="flex items-center gap-1">
                    Prioridade
                    <ArrowUpDown className="h-3 w-3 text-gray-400" />
                </div>
            ),
            renderCell: (card) => (
                <>
                    {card.prioridade === 'alta' && <Badge className="bg-red-100 text-red-700 hover:bg-red-200 border-red-200">Alta</Badge>}
                    {card.prioridade === 'media' && <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-200 border-yellow-200">Média</Badge>}
                    {card.prioridade === 'baixa' && <Badge className="bg-green-100 text-green-700 hover:bg-green-200 border-green-200">Baixa</Badge>}
                </>
            )
        },
        proxima_tarefa: {
            width: 'w-[200px]',
            sortKey: 'proxima_tarefa',
            renderHeader: () => (
                <div className="flex items-center gap-1">
                    Próxima Tarefa
                    <ArrowUpDown className="h-3 w-3 text-gray-400" />
                </div>
            ),
            renderCell: (card) => card.proxima_tarefa ? (
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex items-center gap-2 group/task">
                                <button
                                    onClick={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        completeTaskMutation.mutate(asProximaTarefa(card.proxima_tarefa).id)
                                    }}
                                    disabled={completeTaskMutation.isPending}
                                    className="opacity-0 group-hover/task:opacity-100 transition-opacity p-1 rounded hover:bg-green-100"
                                    title="Marcar como concluída"
                                >
                                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                                </button>
                                <div className="flex flex-col text-sm">
                                    <span className={cn(
                                        "font-medium flex items-center gap-1.5",
                                        new Date(asProximaTarefa(card.proxima_tarefa).data_vencimento) < new Date() ? "text-red-600" : "text-gray-700"
                                    )}>
                                        {(['contato', 'ligacao', 'followup'].includes(asProximaTarefa(card.proxima_tarefa).tipo || '')) && <Phone className="h-3.5 w-3.5" />}
                                        {asProximaTarefa(card.proxima_tarefa).tipo === 'whatsapp' && <MessageSquare className="h-3.5 w-3.5" />}
                                        {asProximaTarefa(card.proxima_tarefa).tipo === 'email' && <Mail className="h-3.5 w-3.5" />}
                                        {asProximaTarefa(card.proxima_tarefa).tipo === 'reuniao' && <Calendar className="h-3.5 w-3.5" />}
                                        {!asProximaTarefa(card.proxima_tarefa).tipo && (
                                            new Date(asProximaTarefa(card.proxima_tarefa).data_vencimento) < new Date()
                                                ? <AlertCircle className="h-3.5 w-3.5" />
                                                : <Clock className="h-3.5 w-3.5" />
                                        )}
                                        {format(new Date(asProximaTarefa(card.proxima_tarefa).data_vencimento), "dd/MM HH:mm", { locale: ptBR })}
                                    </span>
                                    <span className="text-xs text-gray-500 truncate max-w-[150px]">
                                        {asProximaTarefa(card.proxima_tarefa).titulo}
                                    </span>
                                </div>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                            <div className="text-xs space-y-1">
                                <p className="font-medium">{asProximaTarefa(card.proxima_tarefa).titulo}</p>
                                <p className="text-gray-400">Tipo: {asProximaTarefa(card.proxima_tarefa).tipo || 'Tarefa'}</p>
                                <p className="text-gray-400">Vencimento: {format(new Date(asProximaTarefa(card.proxima_tarefa).data_vencimento), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                            </div>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            ) : <span className="text-gray-400 text-xs italic">Sem tarefas</span>
        },
        dono_atual_nome: {
            width: 'w-[150px]',
            sortKey: 'dono_atual_nome',
            renderHeader: () => (
                <div className="flex items-center gap-1">
                    Responsável
                    <ArrowUpDown className="h-3 w-3 text-gray-400" />
                </div>
            ),
            renderCell: (card) => (
                <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-[10px] bg-blue-50 text-blue-700">
                            {card.dono_atual_nome?.substring(0, 2).toUpperCase() || 'U'}
                        </AvatarFallback>
                    </Avatar>
                    <span className="text-sm text-gray-600 truncate max-w-[100px]">
                        {card.dono_atual_nome?.split(' ')[0]}
                    </span>
                </div>
            )
        },
        data_viagem_inicio: {
            width: 'w-[120px]',
            sortKey: 'data_viagem_inicio',
            renderHeader: () => (
                <div className="flex items-center gap-1">
                    Data Viagem
                    <ArrowUpDown className="h-3 w-3 text-gray-400" />
                </div>
            ),
            renderCell: (card) => card.data_viagem_inicio ? (
                <div className="flex items-center gap-1.5 text-gray-600">
                    <Calendar className="h-3.5 w-3.5 text-gray-400" />
                    <span>{format(new Date(card.data_viagem_inicio), "dd/MM/yy")}</span>
                </div>
            ) : <span>-</span>
        },
        created_at: {
            width: 'w-[120px]',
            sortKey: 'created_at',
            renderHeader: () => (
                <div className="flex items-center gap-1">
                    Criação
                    <ArrowUpDown className="h-3 w-3 text-gray-400" />
                </div>
            ),
            renderCell: (card) => (
                <span className="text-gray-600 text-xs">
                    {card.created_at ? format(new Date(card.created_at), "dd/MM/yy HH:mm") : '-'}
                </span>
            )
        },
        updated_at: {
            width: 'w-[120px]',
            sortKey: 'updated_at',
            renderHeader: () => (
                <div className="flex items-center gap-1">
                    Atualização
                    <ArrowUpDown className="h-3 w-3 text-gray-400" />
                </div>
            ),
            renderCell: (card) => (
                <span className="text-gray-600 text-xs">
                    {card.updated_at ? format(new Date(card.updated_at), "dd/MM/yy HH:mm") : '-'}
                </span>
            )
        },
        origem: {
            width: 'w-[100px]',
            sortKey: 'origem',
            renderHeader: () => (
                <div className="flex items-center gap-1">
                    Origem
                    <ArrowUpDown className="h-3 w-3 text-gray-400" />
                </div>
            ),
            renderCell: (card) => (
                <Badge className={cn("text-xs font-medium", getOrigemColor(card.origem))}>
                    {getOrigemLabel(card.origem)}
                </Badge>
            )
        },
        produto: {
            width: 'w-[100px]',
            sortKey: 'produto',
            renderHeader: () => (
                <div className="flex items-center gap-1">
                    Produto
                    <ArrowUpDown className="h-3 w-3 text-gray-400" />
                </div>
            ),
            renderCell: (card) => (
                <span className="text-gray-600 text-sm capitalize">{card.produto || '-'}</span>
            )
        },
        sdr_nome: {
            width: 'w-[120px]',
            sortKey: 'sdr_owner_nome',
            renderHeader: () => (
                <div className="flex items-center gap-1">
                    SDR
                    <ArrowUpDown className="h-3 w-3 text-gray-400" />
                </div>
            ),
            renderCell: (card) => (
                <span className="text-gray-600 text-sm">{card.sdr_owner_nome?.split(' ')[0] || '-'}</span>
            )
        },
        vendas_nome: {
            width: 'w-[120px]',
            sortKey: 'vendas_nome',
            renderHeader: () => (
                <div className="flex items-center gap-1">
                    Closer
                    <ArrowUpDown className="h-3 w-3 text-gray-400" />
                </div>
            ),
            renderCell: (card) => (
                <span className="text-gray-600 text-sm">{card.vendas_nome?.split(' ')[0] || '-'}</span>
            )
        },
        tempo_etapa_dias: {
            width: 'w-[100px]',
            sortKey: 'tempo_etapa_dias',
            renderHeader: () => (
                <div className="flex items-center gap-1">
                    Dias Etapa
                    <ArrowUpDown className="h-3 w-3 text-gray-400" />
                </div>
            ),
            renderCell: (card) => card.tempo_etapa_dias !== null ? (
                <Badge variant="outline" className={cn(
                    "font-mono",
                    (card.tempo_etapa_dias || 0) > 7 ? "text-red-600 border-red-200 bg-red-50" : "text-gray-600"
                )}>
                    {card.tempo_etapa_dias}d
                </Badge>
            ) : <span>-</span>
        },
        anexos: {
            width: 'w-[80px]',
            renderHeader: () => 'Anexos',
            renderCell: (card) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- anexos_count vem da view
                const count = Number((card as any).anexos_count) || 0
                if (!count) return <span className="text-gray-400">-</span>
                return (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-600">
                        <Paperclip className="h-3 w-3" />
                        {count}
                    </span>
                )
            }
        },
        acoes: {
            width: 'w-[60px]',
            headerClass: 'text-center',
            renderHeader: () => <span className="sr-only">Ações</span>,
            renderCell: (card) => (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Ações</span>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                        {card.pessoa_telefone && (
                            <DropdownMenuItem asChild>
                                <a href={`https://wa.me/${card.pessoa_telefone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                                    <Phone className="h-4 w-4 text-green-600" />
                                    WhatsApp
                                </a>
                            </DropdownMenuItem>
                        )}
                        {card.pessoa_email && (
                            <DropdownMenuItem asChild>
                                <a href={`mailto:${card.pessoa_email}`} className="flex items-center gap-2">
                                    <Mail className="h-4 w-4 text-blue-600" />
                                    Enviar Email
                                </a>
                            </DropdownMenuItem>
                        )}
                        {(card.pessoa_telefone || card.pessoa_email) && <DropdownMenuSeparator />}
                        <DropdownMenuItem asChild>
                            <Link to={`/cards/${card.id}`} className="flex items-center gap-2">
                                <ArrowUpDown className="h-4 w-4" />
                                Ver Detalhes
                            </Link>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )
        }
    }

    // Colunas visíveis na ordem correta
    const visibleColumnsOrdered = columns.filter(col => col.isVisible && columnRenderers[col.id])

    const bulkEditFields: BulkEditField[] = [
        {
            id: 'prioridade',
            label: 'Prioridade',
            type: 'select',
            options: [
                { label: 'Alta', value: 'alta' },
                { label: 'Média', value: 'media' },
                { label: 'Baixa', value: 'baixa' }
            ]
        },
        { id: 'data_viagem_inicio', label: 'Data da Viagem', type: 'date' },
        {
            id: 'dono_atual_id',
            label: 'Responsável',
            type: 'select',
            options: (filterOptions?.profiles || []).map(p => ({
                label: p.full_name || p.email || 'Sem nome',
                value: p.id
            }))
        },
        {
            id: 'etapa_id',
            label: 'Etapa',
            type: 'select',
            options: (stages || []).map(s => ({
                label: s.nome,
                value: s.id
            }))
        }
    ]

    return (
        <div className="space-y-4 mx-6 mb-6">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2 h-9">
                    <BulkActions
                        selectedCount={selectedCards.length}
                        onClearSelection={() => setSelectedCards([])}
                        actions={[
                            {
                                label: 'Editar',
                                icon: Edit,
                                onClick: () => setShowEditModal(true),
                                variant: 'outline'
                            },
                            // DISABLED: Feature rolled back
                            // {
                            //     label: 'Arquivar',
                            //     icon: Archive,
                            //     onClick: () => {
                            //         archiveBulk(selectedCards)
                            //         setSelectedCards([])
                            //     },
                            //     variant: 'outline'
                            // },
                            {
                                label: 'Excluir',
                                icon: Trash2,
                                onClick: handleBulkDelete,
                                variant: 'destructive'
                            }
                        ]}
                    />
                </div>
                <ColumnManager
                    columns={columns}
                    onChange={handleColumnsChange}
                />
            </div>

            {/* Quick Filters */}
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500 font-medium">Filtros:</span>
                <button
                    onClick={() => toggleQuickFilter('overdue')}
                    className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                        activeQuickFilters.includes('overdue')
                            ? "bg-red-100 text-red-700 border border-red-200"
                            : "bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200"
                    )}
                >
                    <span className="relative flex h-2 w-2">
                        <span className={cn("absolute inline-flex h-full w-full rounded-full bg-red-400", activeQuickFilters.includes('overdue') && "animate-ping opacity-75")}></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                    </span>
                    Atrasados
                    <span className={cn(
                        "ml-0.5 px-1.5 py-0.5 rounded-full text-[10px]",
                        activeQuickFilters.includes('overdue') ? "bg-red-200" : "bg-gray-200"
                    )}>
                        {quickFilterCounts.overdue}
                    </span>
                </button>

                <button
                    onClick={() => toggleQuickFilter('trip_soon')}
                    className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                        activeQuickFilters.includes('trip_soon')
                            ? "bg-orange-100 text-orange-700 border border-orange-200"
                            : "bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200"
                    )}
                >
                    <Plane className="h-3 w-3" />
                    Viagem Proxima
                    <span className={cn(
                        "ml-0.5 px-1.5 py-0.5 rounded-full text-[10px]",
                        activeQuickFilters.includes('trip_soon') ? "bg-orange-200" : "bg-gray-200"
                    )}>
                        {quickFilterCounts.trip_soon}
                    </span>
                </button>

                <button
                    onClick={() => toggleQuickFilter('sla')}
                    className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                        activeQuickFilters.includes('sla')
                            ? "bg-amber-100 text-amber-700 border border-amber-200"
                            : "bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200"
                    )}
                >
                    <AlertTriangle className="h-3 w-3" />
                    SLA Estourado
                    <span className={cn(
                        "ml-0.5 px-1.5 py-0.5 rounded-full text-[10px]",
                        activeQuickFilters.includes('sla') ? "bg-amber-200" : "bg-gray-200"
                    )}>
                        {quickFilterCounts.sla}
                    </span>
                </button>

                <button
                    onClick={() => toggleQuickFilter('no_task')}
                    className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                        activeQuickFilters.includes('no_task')
                            ? "bg-gray-200 text-gray-700 border border-gray-300"
                            : "bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200"
                    )}
                >
                    <Clock className="h-3 w-3" />
                    Sem Tarefa
                    <span className={cn(
                        "ml-0.5 px-1.5 py-0.5 rounded-full text-[10px]",
                        activeQuickFilters.includes('no_task') ? "bg-gray-300" : "bg-gray-200"
                    )}>
                        {quickFilterCounts.no_task}
                    </span>
                </button>

                <button
                    onClick={() => toggleQuickFilter('high_priority')}
                    className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                        activeQuickFilters.includes('high_priority')
                            ? "bg-rose-100 text-rose-700 border border-rose-200"
                            : "bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200"
                    )}
                >
                    <AlertCircle className="h-3 w-3" />
                    Alta Prioridade
                    <span className={cn(
                        "ml-0.5 px-1.5 py-0.5 rounded-full text-[10px]",
                        activeQuickFilters.includes('high_priority') ? "bg-rose-200" : "bg-gray-200"
                    )}>
                        {quickFilterCounts.high_priority}
                    </span>
                </button>

                <button
                    onClick={() => toggleQuickFilter('sem_anexos')}
                    className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                        activeQuickFilters.includes('sem_anexos')
                            ? "bg-teal-100 text-teal-700 border border-teal-200"
                            : "bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200"
                    )}
                >
                    <FileText className="h-3 w-3" />
                    Sem Anexos
                    <span className={cn(
                        "ml-0.5 px-1.5 py-0.5 rounded-full text-[10px]",
                        activeQuickFilters.includes('sem_anexos') ? "bg-teal-200" : "bg-gray-200"
                    )}>
                        {quickFilterCounts.sem_anexos}
                    </span>
                </button>

                {/* Divider */}
                <div className="h-4 w-px bg-gray-200 mx-1" />

                {/* Toggle Arquivados - DISABLED: Feature rolled back */}
                {/* <button
                    onClick={() => setFilters({ ...filters, showArchived: !filters.showArchived })}
                    className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                        filters.showArchived
                            ? "bg-slate-200 text-slate-700 border border-slate-300"
                            : "bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200"
                    )}
                >
                    <Archive className="h-3 w-3" />
                    {filters.showArchived ? 'Mostrando Arquivados' : 'Ver Arquivados'}
                </button> */}

                {activeQuickFilters.length > 0 && (
                    <button
                        onClick={() => setActiveQuickFilters([])}
                        className="text-xs text-gray-500 hover:text-gray-700 underline ml-2"
                    >
                        Limpar filtros
                    </button>
                )}

                {/* Results count */}
                <span className="ml-auto text-xs text-gray-500">
                    {sortedCards.length} de {totalCards} cards
                    {totalPages > 1 && ` · Página ${currentPage} de ${totalPages}`}
                </span>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-4 gap-3 mb-4">
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <div className="text-xs text-gray-500 font-medium">Total Valor</div>
                    <div className="text-lg font-semibold text-gray-900 mt-1">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(
                            sortedCards.reduce((sum, c) => sum + ((c as Record<string, unknown>).valor_display as number || c.valor_final || c.valor_estimado || 0), 0)
                        )}
                    </div>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <div className="text-xs text-gray-500 font-medium">Cards Atrasados</div>
                    <div className="text-lg font-semibold text-red-600 mt-1">
                        {sortedCards.filter(c => (c.tarefas_atrasadas as number) > 0).length}
                    </div>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <div className="text-xs text-gray-500 font-medium">Prioridade Alta</div>
                    <div className="text-lg font-semibold text-amber-600 mt-1">
                        {sortedCards.filter(c => c.prioridade === 'alta').length}
                    </div>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <div className="text-xs text-gray-500 font-medium">Viagem Proxima</div>
                    <div className="text-lg font-semibold text-orange-600 mt-1">
                        {sortedCards.filter(c => c.dias_ate_viagem !== null && (c.dias_ate_viagem as number) <= 30 && (c.dias_ate_viagem as number) >= 0).length}
                    </div>
                </div>
            </div>

            <div className="rounded-md border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="max-h-[calc(100vh-350px)] overflow-auto">
                    <Table>
                        <TableHeader className="bg-gray-50/50 sticky top-0 z-10">
                            <TableRow>
                                <TableHead className="w-[40px] px-4">
                                    <Checkbox
                                        checked={cards && cards.length > 0 && selectedCards.length === cards.length}
                                        onCheckedChange={(checked) => handleSelectAll(checked as boolean)}
                                    />
                                </TableHead>

                                {/* Colunas renderizadas dinamicamente na ordem definida */}
                                {visibleColumnsOrdered.map((col) => {
                                    const renderer = columnRenderers[col.id]
                                    if (!renderer) return null
                                    return (
                                        <TableHead
                                            key={col.id}
                                            className={cn(
                                                renderer.width,
                                                renderer.headerClass,
                                                renderer.sortKey && "cursor-pointer hover:bg-gray-100 transition-colors"
                                            )}
                                            onClick={renderer.sortKey ? () => handleSort(renderer.sortKey!) : undefined}
                                        >
                                            {renderer.renderHeader()}
                                        </TableHead>
                                    )
                                })}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sortedCards.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={visibleColumnsOrdered.length + 1}>
                                        <FilterEmptyState />
                                    </TableCell>
                                </TableRow>
                            ) : (
                                sortedCards.map((card) => {
                                    const hasOverdueTasks = (card.tarefas_atrasadas as number) > 0
                                    const hasTripSoon = card.dias_ate_viagem !== null && (card.dias_ate_viagem as number) <= 30 && (card.dias_ate_viagem as number) >= 0
                                    const isUnseen = isCardNew(card.id!, card.created_at)

                                    return (
                                        <TableRow
                                            key={card.id}
                                            className={cn(
                                                "hover:bg-gray-50/50 transition-colors group",
                                                hasOverdueTasks && "bg-red-50/30 hover:bg-red-50/50",
                                                !hasOverdueTasks && hasTripSoon && "bg-orange-50/30 hover:bg-orange-50/50",
                                                isUnseen && !hasOverdueTasks && !hasTripSoon && "bg-emerald-50/40 hover:bg-emerald-50/60 border-l-4 border-l-emerald-500"
                                            )}
                                        >
                                            <TableCell className="px-4">
                                                <Checkbox
                                                    checked={selectedCards.includes(card.id!)}
                                                    onCheckedChange={(checked) => handleSelectRow(card.id!, checked as boolean)}
                                                />
                                            </TableCell>

                                            {/* Colunas renderizadas dinamicamente na ordem definida */}
                                            {visibleColumnsOrdered.map((col) => {
                                                const renderer = columnRenderers[col.id]
                                                if (!renderer) return null
                                                return (
                                                    <TableCell key={col.id} className={renderer.headerClass}>
                                                        {renderer.renderCell(card)}
                                                    </TableCell>
                                                )
                                            })}
                                        </TableRow>
                                    )
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* Paginação */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between px-1">
                    <span className="text-sm text-gray-500">
                        Mostrando {((currentPage - 1) * 50) + 1}–{Math.min(currentPage * 50, totalCards)} de {totalCards}
                    </span>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                        >
                            <ChevronLeft className="h-4 w-4 mr-1" />
                            Anterior
                        </Button>
                        <div className="flex items-center gap-1">
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                let pageNum: number
                                if (totalPages <= 5) {
                                    pageNum = i + 1
                                } else if (currentPage <= 3) {
                                    pageNum = i + 1
                                } else if (currentPage >= totalPages - 2) {
                                    pageNum = totalPages - 4 + i
                                } else {
                                    pageNum = currentPage - 2 + i
                                }
                                return (
                                    <button
                                        key={pageNum}
                                        onClick={() => setCurrentPage(pageNum)}
                                        className={cn(
                                            "h-8 w-8 rounded text-sm font-medium transition-colors",
                                            currentPage === pageNum
                                                ? "bg-indigo-600 text-white"
                                                : "text-gray-600 hover:bg-gray-100"
                                        )}
                                    >
                                        {pageNum}
                                    </button>
                                )
                            })}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                        >
                            Próxima
                            <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                    </div>
                </div>
            )}

            <DeleteCardModal
                isOpen={showDeleteModal}
                onClose={() => setShowDeleteModal(false)}
                onConfirm={confirmBulkDelete}
                isLoading={isArchiving}
                cardTitle={`${selectedCards.length} cards selecionados`}
            />

            <BulkEditModal
                isOpen={showEditModal}
                onClose={() => setShowEditModal(false)}
                onConfirm={handleBulkEdit}
                selectedCount={selectedCards.length}
                fields={bulkEditFields}
            />
        </div>
    )
}
