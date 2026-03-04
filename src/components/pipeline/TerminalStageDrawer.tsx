import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { cn } from '../../lib/utils'
import { prepareSearchTerms } from '../../lib/utils'
import { Search, ChevronLeft, ChevronRight, Trophy, XCircle } from 'lucide-react'
import { Drawer, DrawerContent, DrawerHeader, DrawerBody, DrawerFooter, DrawerTitle, DrawerClose } from '../ui/drawer'
import type { Database } from '../../database.types'
import { type ViewMode, type SubView, type FilterState, type GroupFilters } from '../../hooks/usePipelineFilters'

type Product = Database['public']['Enums']['app_product'] | 'ALL'
type Card = Database['public']['Views']['view_cards_acoes']['Row']
type Stage = Database['public']['Tables']['pipeline_stages']['Row']

interface TerminalStageDrawerProps {
    isOpen: boolean
    onClose: () => void
    stage: Stage
    totalCards: number
    totalValue: number
    productFilter: Product
    viewMode: ViewMode
    subView: SubView
    filters: FilterState
    groupFilters: GroupFilters
    myTeamMembers?: string[]
}

const PAGE_SIZE = 50

export default function TerminalStageDrawer({
    isOpen,
    onClose,
    stage,
    totalCards,
    totalValue,
    productFilter,
    viewMode,
    subView,
    filters,
    groupFilters,
    myTeamMembers
}: TerminalStageDrawerProps) {
    const { session } = useAuth()
    const navigate = useNavigate()
    const [page, setPage] = useState(1)
    const [search, setSearch] = useState('')

    const isWon = stage.is_won === true

    const { data: result, isLoading } = useQuery({
        queryKey: ['terminal-drawer', stage.id, productFilter, viewMode, subView, filters, groupFilters, myTeamMembers, page, search],
        enabled: isOpen,
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let query = (supabase.from('view_cards_acoes') as any)
                .select('*', { count: 'exact' })
                .eq('pipeline_stage_id', stage.id)

            if (productFilter !== 'ALL') {
                query = query.eq('produto', productFilter)
            }

            // Smart View Filters
            if (viewMode === 'AGENT' && subView === 'MY_QUEUE' && session?.user?.id) {
                query = query.eq('dono_atual_id', session.user.id)
            } else if (viewMode === 'MANAGER') {
                if (subView === 'TEAM_VIEW' && myTeamMembers && myTeamMembers.length > 0) {
                    query = query.in('dono_atual_id', myTeamMembers)
                }
            }

            // Drawer-local search
            if (search) {
                const { original, normalized, digitsOnly } = prepareSearchTerms(search)
                if (original) {
                    const textFields = [
                        `titulo.ilike.%${original}%`,
                        `pessoa_nome.ilike.%${original}%`,
                        `dono_atual_nome.ilike.%${original}%`,
                        `pessoa_email.ilike.%${original}%`
                    ]
                    if (normalized) {
                        textFields.push(`pessoa_telefone_normalizado.ilike.%${normalized}%`)
                    } else if (digitsOnly) {
                        textFields.push(`pessoa_telefone_normalizado.ilike.%${digitsOnly}%`)
                    }
                    query = query.or(textFields.join(','))
                }
            }

            // Owner filters from parent
            if ((filters.ownerIds?.length ?? 0) > 0) query = query.in('dono_atual_id', filters.ownerIds)
            if ((filters.sdrIds?.length ?? 0) > 0) query = query.in('sdr_owner_id', filters.sdrIds)
            if ((filters.plannerIds?.length ?? 0) > 0) query = query.in('vendas_owner_id', filters.plannerIds)
            if ((filters.posIds?.length ?? 0) > 0) query = query.in('pos_owner_id', filters.posIds)

            // Date filters
            if (filters.startDate) query = query.gte('data_viagem_inicio', filters.startDate)
            if (filters.endDate) query = query.lte('data_viagem_inicio', filters.endDate)
            if (filters.creationStartDate) query = query.gte('created_at', `${filters.creationStartDate}T00:00:00`)
            if (filters.creationEndDate) query = query.lte('created_at', `${filters.creationEndDate}T23:59:59`)

            // Status, Origem & Tags
            if ((filters.statusComercial?.length ?? 0) > 0) query = query.in('status_comercial', filters.statusComercial)
            if ((filters.origem?.length ?? 0) > 0) query = query.in('origem', filters.origem)
            if ((filters.tagIds?.length ?? 0) > 0) query = query.overlaps('tag_ids', filters.tagIds)

            // Archived + group parent exclusion
            query = query.is('archived_at', null)
            query = query.eq('is_group_parent', false)

            // Group Filters
            const { showLinked, showSolo } = groupFilters
            if (showLinked && !showSolo) {
                query = query.not('parent_card_id', 'is', null)
            } else if (showSolo && !showLinked) {
                query = query.is('parent_card_id', null)
            }

            query = query.order('created_at', { ascending: false })

            // Pagination
            const from = (page - 1) * PAGE_SIZE
            const to = from + PAGE_SIZE - 1
            query = query.range(from, to)

            const { data, error, count } = await query
            if (error) throw error

            return {
                data: data as Card[],
                total: count || 0,
                totalPages: Math.ceil((count || 0) / PAGE_SIZE)
            }
        }
    })

    const cards = result?.data || []
    const total = result?.total || totalCards
    const totalPages = result?.totalPages || 1

    const handleCardClick = (cardId: string) => {
        navigate(`/cards/${cardId}`)
    }

    return (
        <Drawer open={isOpen} onOpenChange={onClose}>
            <DrawerContent className="max-w-lg">
                <DrawerHeader>
                    <DrawerClose onClick={onClose} />
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            "flex h-8 w-8 items-center justify-center rounded-lg",
                            isWon ? "bg-emerald-100" : "bg-red-100"
                        )}>
                            {isWon
                                ? <Trophy className="h-4 w-4 text-emerald-600" />
                                : <XCircle className="h-4 w-4 text-red-500" />
                            }
                        </div>
                        <div>
                            <DrawerTitle>{stage.nome}</DrawerTitle>
                            <p className="text-sm text-gray-500 mt-0.5">
                                {total} cards · {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValue)}
                            </p>
                        </div>
                    </div>

                    {/* Search */}
                    <div className="relative mt-3">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar por nome, titulo, email..."
                            className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                        />
                    </div>
                </DrawerHeader>

                <DrawerBody className="p-0">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-primary" />
                        </div>
                    ) : cards.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                            <p className="text-sm">Nenhum card encontrado</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {cards.map((card) => (
                                <button
                                    key={card.id}
                                    onClick={() => handleCardClick(card.id!)}
                                    className="w-full flex items-center gap-3 px-6 py-3 hover:bg-gray-50 transition-colors text-left"
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-900 truncate">{card.titulo}</p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            {card.pessoa_nome && (
                                                <span className="text-xs text-gray-500 truncate max-w-[150px]">{card.pessoa_nome}</span>
                                            )}
                                            {card.data_fechamento && (
                                                <>
                                                    <span className="text-xs text-gray-300">·</span>
                                                    <span className="text-xs text-gray-400">
                                                        {new Date(card.data_fechamento).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex-shrink-0 text-right">
                                        <span className="text-sm font-medium text-gray-700">
                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact' }).format(card.valor_display || card.valor_estimado || 0)}
                                        </span>
                                        {card.dono_atual_nome && (
                                            <p className="text-[10px] text-gray-400 mt-0.5">{card.dono_atual_nome.split(' ')[0]}</p>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </DrawerBody>

                {totalPages > 1 && (
                    <DrawerFooter>
                        <div className="flex items-center justify-between w-full">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page <= 1}
                                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <ChevronLeft className="h-4 w-4" />
                                Anterior
                            </button>
                            <span className="text-xs text-gray-500">
                                {page} de {totalPages}
                            </span>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Proxima
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    </DrawerFooter>
                )}
            </DrawerContent>
        </Drawer>
    )
}
