/* eslint-disable @typescript-eslint/no-explicit-any, no-case-declarations */
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Calendar, DollarSign, MapPin, Users, UserPlus, User, CheckSquare, AlertCircle, Clock, Link, Building, MoreVertical, Trash2, Paperclip, Package, Trophy, XCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { memo, useState } from 'react'
import { cn } from '../../lib/utils'
import type { Database } from '../../database.types'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useArchiveCard } from '../../hooks/useArchiveCard'
import DeleteCardModal from '../card/DeleteCardModal'
import { TagBadge } from '../card/TagBadge'
import { useCardTags } from '../../hooks/useCardTags'
import { useSeenCards } from '../../hooks/useSeenCards'
import { useUnreadDelegatedTaskCards } from '../../hooks/useUnreadDelegatedTaskCards'
import { useSharedHandoffStageIds } from '../../hooks/useSharedHandoffStageIds'
import { isGanhoDireto, getPhaseOwnerName } from '../../lib/pipeline/phaseLabels'
import { calculateExpectedPosVendaStage, isStageMismatch } from '../../lib/pipeline/posVendaStageRule'
import { useCardTeamCounts } from '../../hooks/useCardTeamCounts'
import { TIPO_LABEL, type CardConciergeStats } from '../../hooks/concierge/types'
import { getDiasAtrasoDataPrevista } from '../../hooks/usePipelineGovernance'
import { useCancellationOverlay, modoCancelamentoLabel } from '../../hooks/cancelamento/useCancelamento'
import { useOrg } from '../../contexts/OrgContext'

type Card = Database['public']['Views']['view_cards_acoes']['Row']

interface KanbanCardProps {
    card: Card
    phaseSlug?: string | null
    onWin?: (cardId: string) => void
    onLoss?: (cardId: string) => void
    conciergeStatsMap?: Map<string, CardConciergeStats>
    /** True quando admin marcou data_prevista_fechamento como visível na etapa do card. */
    isDataPrevistaTracked?: boolean
}



import { GroupBadge } from './GroupBadge'
import SubCardBadge from './SubCardBadge'
import { KanbanCardPendenciaFaixa } from './KanbanCardPendenciaFaixa'

const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function parseDateParts(input: unknown): { y: number; m: number; d: number } | null {
    if (typeof input !== 'string') return null
    const match = input.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (!match) return null
    const y = Number(match[1]), m = Number(match[2]), d = Number(match[3])
    if (!y || !m || !d || m > 12 || d > 31) return null
    return { y, m, d }
}

function renderTripDate(ev: any, fallbackStart?: string | null): string | null {
    let startStr: string | null = null
    let endStr: string | null = null
    let preformatted: string | null = null

    if (ev && typeof ev === 'object') {
        if (typeof ev.display === 'string' && ev.display.trim()) preformatted = ev.display.trim()
        // Ordem canônica (igual UniversalFieldRenderer): {start,end} é o formato atual do date picker;
        // data_inicio/data_fim são legado e às vezes guardam o mês inteiro (placeholder). Preferir o preciso.
        startStr = ev.start || ev.inicio || ev.data_inicio || null
        endStr = ev.end || ev.fim || ev.data_fim || null
    } else if (typeof ev === 'string') {
        const range = ev.match(/(\d{4}-\d{2}-\d{2}).*?(\d{4}-\d{2}-\d{2})/)
        if (range) { startStr = range[1]; endStr = range[2] }
        else {
            const single = ev.match(/\d{4}-\d{2}-\d{2}/)
            if (single) startStr = single[0]
        }
    }

    if (!startStr && fallbackStart) startStr = fallbackStart

    const start = parseDateParts(startStr)
    const end = parseDateParts(endStr)

    if (!start) return preformatted

    const currentYear = new Date().getFullYear()
    const showYear = (y: number) => y !== currentYear

    if (!end || (end.y === start.y && end.m === start.m && end.d === start.d)) {
        return `${start.d} ${MONTHS_PT[start.m - 1]}${showYear(start.y) ? ` ${start.y}` : ''}`
    }

    if (start.y === end.y && start.m === end.m) {
        return `${start.d}–${end.d} ${MONTHS_PT[start.m - 1]}${showYear(start.y) ? ` ${start.y}` : ''}`
    }

    if (start.y === end.y) {
        return `${start.d} ${MONTHS_PT[start.m - 1]} – ${end.d} ${MONTHS_PT[end.m - 1]}${showYear(start.y) ? ` ${start.y}` : ''}`
    }

    return `${start.d} ${MONTHS_PT[start.m - 1]} ${start.y} – ${end.d} ${MONTHS_PT[end.m - 1]} ${end.y}`
}

type TempoAberto = { label: string; level: 'fresh' | 'warn' | 'late' }

function formatTempoAberto(createdAt: string | null | undefined): TempoAberto | null {
    if (!createdAt) return null
    const created = new Date(createdAt).getTime()
    if (Number.isNaN(created)) return null
    const diffMs = Date.now() - created
    const minutes = Math.floor(diffMs / 60000)
    const hours = minutes / 60
    const level: TempoAberto['level'] = hours >= 24 ? 'late' : hours >= 4 ? 'warn' : 'fresh'
    let label: string
    if (minutes < 60) label = minutes <= 1 ? 'agora' : `há ${minutes}min`
    else if (hours < 24) label = hours < 2 ? 'há 1h' : `há ${Math.floor(hours)}h`
    else {
        const days = Math.floor(hours / 24)
        label = days === 1 ? 'há 1 dia' : `há ${days} dias`
    }
    return { label, level }
}

function KanbanCard({ card, phaseSlug, onWin, onLoss, conciergeStatsMap, isDataPrevistaTracked = false }: KanbanCardProps) {
    const navigate = useNavigate()
    const { org } = useOrg()
    const cancelOverlay = useCancellationOverlay(card.id ?? undefined, org?.id)
    const { isNew, markSeen } = useSeenCards()
    const isUnseen = isNew(card.id!, card.created_at, card.dono_atual_id)
    const { hasUnread } = useUnreadDelegatedTaskCards()
    const showDelegatedDot = hasUnread(card.id)
    // Etapa compartilhada (sem dono fixo) — badge visual quando card sem owner principal
    const { data: sharedStageIds } = useSharedHandoffStageIds()
    const isInSharedStage = !!card.pipeline_stage_id
        && Array.isArray(sharedStageIds)
        && sharedStageIds.includes(card.pipeline_stage_id)
    const isSharedCardNoOwner = isInSharedStage && !card.dono_atual_id
    // Lookup O(1) no Map batched (vinda do KanbanBoard via useCardConciergeStatsBatch).
    // Antes: cada KanbanCard disparava sua própria query → N+1 em pipelines com 100+ cards.
    const conciergeStats = card.id ? conciergeStatsMap?.get(card.id) ?? null : null

    const isClosedCard = card.status_comercial === 'ganho' || card.status_comercial === 'perdido'

    // Data Prevista de Fechamento atrasada (badge visual + borda no card).
    // Só aparece quando o admin marcou o campo como visível na etapa desta
    // coluna (Pipeline Studio → "Campos por Etapa"). Sem hardcode de fase.
    const diasAtrasoDataPrevista = getDiasAtrasoDataPrevista(card.produto_data)
    const isDataPrevistaOverdue = diasAtrasoDataPrevista !== null
        && !isClosedCard
        && isDataPrevistaTracked

    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: card.id!,
        data: card,
        disabled: isClosedCard
    })

    const style = {
        transform: CSS.Translate.toString(transform),
    }

    const handleClick = () => {
        if (!isDragging && !showMenu) {
            markSeen(card.id!, card.dono_atual_id)
            navigate(`/cards/${card.id}`)
        }
    }

    // Delete card functionality (only for default)
    const [showMenu, setShowMenu] = useState(false)
    const [showDeleteModal, setShowDeleteModal] = useState(false)
    const { archive, isArchiving } = useArchiveCard()

    // Tags: resolve from global cache using tag_ids from view
    const { allTags } = useCardTags()
    const cardTagIds: string[] = (card as any).tag_ids ?? []
    const cardTags = allTags.filter(t => cardTagIds.includes(t.id))
    const displayTags = cardTags.slice(0, 2)
    const extraTagCount = cardTags.length - displayTags.length

    // Team members indicator (assistentes/apoio) — global batch query, O(1) lookup
    const teamCounts = useCardTeamCounts()
    const teamMemberCount = teamCounts.get(card.id!) || 0

    const handleMenuClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        setShowMenu(!showMenu)
    }

    const handleDeleteClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        setShowMenu(false)
        setShowDeleteModal(true)
    }

    const { data: settings } = useQuery({
        queryKey: ['pipeline-settings', card.pipeline_stage_id, card.fase],
        queryFn: async () => {
            if (!card.fase && !card.pipeline_stage_id) return null

            // First, try to get phase_id from the current stage
            if (card.pipeline_stage_id) {
                const { data: stage } = await supabase
                    .from('pipeline_stages')
                    .select('phase_id')
                    .eq('id', card.pipeline_stage_id)
                    .single()

                if (stage?.phase_id) {
                    const { data: settingsByPhaseId } = await supabase
                        .from('pipeline_card_settings')
                        .select('campos_kanban, ordem_kanban')
                        .eq('phase_id', stage.phase_id)
                        .is('usuario_id', null)
                        .single()

                    if (settingsByPhaseId) return settingsByPhaseId
                }
            }

            // Fallback: fetch by fase name
            if (card.fase) {
                const { data: settingsByFase } = await (supabase.from('pipeline_card_settings') as any)
                    .select('campos_kanban, ordem_kanban')
                    .eq('fase', card.fase)
                    .is('usuario_id', null)
                    .single()

                if (settingsByFase) return settingsByFase
            }

            return null
        },
        enabled: !!(card.fase || card.pipeline_stage_id),
        staleTime: 1000 * 60 * 5 // 5 minutes - cache for performance
    })

    const { data: systemFields } = useQuery({
        queryKey: ['system-fields'],
        queryFn: async () => {
            const { data, error } = await (supabase.from('system_fields') as any)
                .select('*')
                .eq('active', true)
            if (error) throw error
            return data as any[]
        },
        staleTime: 1000 * 60 * 5 // 5 minutes
    })

    const renderDynamicField = (fieldId: string) => {
        // 1. Handle Special/Complex Fields (Legacy Custom UI)
        switch (fieldId) {
            case 'pessoa_nome':
                return null // rendered separately below the title
            case 'prioridade':
                if (!card.prioridade) return null
                const priorityColors: Record<string, string> = {
                    alta: 'text-red-700 bg-red-50',
                    media: 'text-yellow-700 bg-yellow-50',
                    baixa: 'text-green-700 bg-green-50'
                }
                const priorityLabels: Record<string, string> = {
                    alta: 'Alta Prioridade',
                    media: 'Média Prioridade',
                    baixa: 'Baixa Prioridade'
                }
                return (
                    <div key={fieldId} className="mt-1">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${priorityColors[card.prioridade] || 'text-gray-500'}`}>
                            {priorityLabels[card.prioridade] || card.prioridade}
                        </span>
                    </div>
                )
            case 'proxima_tarefa':
                if (!card.proxima_tarefa) return null
                const tarefa = card.proxima_tarefa as any
                const isLate = new Date(tarefa.data_vencimento) < new Date()
                return (
                    <div key={fieldId} className={cn(
                        "mt-2 flex items-start gap-2 rounded-md border p-2 text-xs",
                        isLate ? "border-red-100 bg-red-50" : "border-gray-100 bg-gray-50"
                    )}>
                        {isLate ? (
                            <AlertCircle className="mt-0.5 h-3.5 w-3.5 text-red-500" />
                        ) : (
                            <CheckSquare className="mt-0.5 h-3.5 w-3.5 text-blue-500" />
                        )}
                        <div className="flex-1 overflow-hidden">
                            <p className={cn("font-medium truncate", isLate ? "text-red-700" : "text-gray-700")}>
                                {tarefa.titulo}
                            </p>
                            <p className={cn("mt-0.5", isLate ? "text-red-600" : "text-gray-500")}>
                                {isLate ? 'Atrasada - ' : ''}
                                {new Date(tarefa.data_vencimento).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </p>
                        </div>
                    </div>
                )
            case 'ultima_interacao':
                if (!card.ultima_interacao) return null
                const interacao = card.ultima_interacao as any
                return (
                    <div key={fieldId} className="mt-1 flex items-center gap-1.5 text-[10px] text-gray-500">
                        <CheckSquare className="h-3 w-3 text-gray-400" />
                        <span className="truncate">
                            Última: {interacao.titulo} ({new Date(interacao.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })})
                        </span>
                    </div>
                )
            case 'taxa_planejamento':
                const data = card.produto_data as any
                if (!data?.taxa_planejamento?.status) return null
                const statusColors: Record<string, string> = {
                    pendente: 'text-yellow-600 bg-yellow-50',
                    paga: 'text-green-600 bg-green-50',
                    cortesia: 'text-blue-600 bg-blue-50',
                    nao_ativa: 'text-gray-400 bg-gray-50',
                    nao_aplicavel: 'text-gray-400 bg-gray-50'
                }
                const statusLabels: Record<string, string> = {
                    pendente: 'Taxa Pendente',
                    paga: 'Taxa Paga',
                    cortesia: 'Taxa Cortesia',
                    nao_ativa: 'Taxa Inativa',
                    nao_aplicavel: 'N/A'
                }
                const status = data.taxa_planejamento.status as string
                return (
                    <div key={fieldId} className="mt-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusColors[status] || 'text-gray-500'}`}>
                            {statusLabels[status] || status}
                        </span>
                    </div>
                )
            case 'task_status':
                if (!card.proxima_tarefa) {
                    return (
                        <div key={fieldId} className="mt-2">
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200 w-full justify-center">
                                <AlertCircle className="w-3 h-3" />
                                Sem Tarefa
                            </span>
                        </div>
                    )
                }

                const taskData = card.proxima_tarefa as any
                const today = new Date()
                today.setHours(0, 0, 0, 0)
                const due = new Date(taskData.data_vencimento)
                due.setHours(0, 0, 0, 0)
                const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

                if (diffDays < 0) {
                    const absDays = Math.abs(diffDays)
                    return (
                        <div key={fieldId} className="mt-2">
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold bg-red-50 text-red-700 border border-red-100 w-full justify-center animate-pulse">
                                <AlertCircle className="w-3 h-3" />
                                Atrasada {absDays} {absDays === 1 ? 'dia' : 'dias'}
                            </span>
                        </div>
                    )
                }

                if (diffDays === 0) {
                    return (
                        <div key={fieldId} className="mt-2">
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100 w-full justify-center">
                                <Clock className="w-3 h-3" />
                                Para Hoje
                            </span>
                        </div>
                    )
                }

                if (diffDays === 1) {
                    return (
                        <div key={fieldId} className="mt-2">
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100 w-full justify-center">
                                <CheckSquare className="w-3 h-3" />
                                Amanha
                            </span>
                        </div>
                    )
                }

                return (
                    <div key={fieldId} className="mt-2">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100 w-full justify-center">
                            <CheckSquare className="w-3 h-3" />
                            Em {diffDays} dias
                        </span>
                    </div>
                )

            case 'pessoas':
                const pData = card.produto_data as any
                if (!pData?.pessoas) return null
                return (
                    <div key={fieldId} className="flex items-center text-xs text-gray-500 mt-1">
                        <Users className="mr-1.5 h-3 w-3 flex-shrink-0" />
                        <span className="truncate block flex-1">
                            {pData.pessoas.adultos} Adt
                            {pData.pessoas.criancas ? `, ${pData.pessoas.criancas} Não Adulto(s)` : ''}
                        </span>
                    </div>
                )

            // --- Marketing Data Renderers ---
            case 'mkt_pretende_viajar_tempo':
                return (
                    <div key={fieldId} className="flex items-center text-xs text-gray-500 mt-1">
                        <Clock className="mr-1.5 h-3 w-3 flex-shrink-0 text-blue-600" />
                        <span className="truncate block flex-1 text-gray-700">
                            {String((card.marketing_data as any)?.[fieldId] || (card as any)[fieldId] || '')}
                        </span>
                    </div>
                )
            case 'mkt_hospedagem_contratada':
                const hasHotel = String((card.marketing_data as any)?.[fieldId] || (card as any)[fieldId] || '').toLowerCase()
                const isYes = hasHotel.includes('sim')
                return (
                    <div key={fieldId} className="flex items-center text-xs text-gray-500 mt-1">
                        <Building className={cn("mr-1.5 h-3 w-3 flex-shrink-0", isYes ? "text-green-600" : "text-gray-400")} />
                        <span className="truncate block flex-1 text-gray-700">
                            Hospedagem: <span className="font-medium">{hasHotel}</span>
                        </span>
                    </div>
                )
            case 'mkt_quem_vai_viajar_junto':
                return (
                    <div key={fieldId} className="flex items-center text-xs text-gray-500 mt-1">
                        <Users className="mr-1.5 h-3 w-3 flex-shrink-0 text-purple-600" />
                        <span className="truncate block flex-1 text-gray-700">
                            {String((card.marketing_data as any)?.[fieldId] || (card as any)[fieldId] || '')}
                        </span>
                    </div>
                )
            case 'mkt_valor_por_pessoa_viagem':
                return (
                    <div key={fieldId} className="flex items-center text-xs text-gray-500 mt-1">
                        <DollarSign className="mr-1.5 h-3 w-3 flex-shrink-0 text-emerald-600" />
                        <span className="truncate block flex-1 font-medium text-gray-700">
                            {String((card.marketing_data as any)?.[fieldId] || (card as any)[fieldId] || '')}
                        </span>
                    </div>
                )
        }

        // 2. Generic Dynamic Rendering (The "Ferrari Engine")
        const fieldDef = systemFields?.find(f => f.key === fieldId)
        if (!fieldDef) return null

        // Resolve value (check root, then produto_data, then marketing_data, then briefing_inicial)
        let value = (card as any)[fieldId]
        if (value === undefined || value === null) {
            const produtoData = card.produto_data as any
            value = produtoData?.[fieldId]
        }
        if (value === undefined || value === null) {
            const marketingData = card.marketing_data as any
            value = marketingData?.[fieldId]
        }
        if (value === undefined || value === null) {
            const briefingData = card.briefing_inicial as any
            value = briefingData?.[fieldId]
        }

        // Data da viagem no Kanban — prioridade explícita:
        //   1) Data da viagem completa (epoca_viagem);
        //   2) se vazia, Data da viagem com a Welcome (data_exata_da_viagem);
        //   3) fallback legado (data_viagem_inicio).
        // Ambos os fieldIds caem aqui (qualquer um pode estar configurado no card).
        if (fieldId === 'epoca_viagem' || fieldId === 'data_exata_da_viagem') {
            const produtoData = card.produto_data as any
            const epoca = produtoData?.epoca_viagem ?? (card as any).epoca_viagem
            const comWelcome = produtoData?.data_exata_da_viagem ?? (card as any).data_exata_da_viagem

            const label =
                renderTripDate(epoca) ??
                renderTripDate(comWelcome) ??
                renderTripDate(null, (card as any).data_viagem_inicio)
            if (!label) return null

            const expectedStage = calculateExpectedPosVendaStage(produtoData, card.pipeline_id)
            const wrongStage = isStageMismatch(card.pipeline_stage_id, expectedStage)

            return (
                <div key={fieldId} className={cn(
                    "flex items-center text-xs mt-1",
                    wrongStage ? "text-red-600" : "text-gray-500"
                )}>
                    <Calendar className={cn(
                        "mr-1.5 h-3 w-3 flex-shrink-0",
                        wrongStage ? "text-red-600" : "text-blue-600"
                    )} />
                    <span className={cn(
                        "truncate block flex-1",
                        wrongStage ? "text-red-700 font-medium" : "text-gray-700"
                    )}>{label}</span>
                </div>
            )
        }
        if (fieldId === 'orcamento') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cardAny = card as any
            const totalFechado = Number(cardAny.total_fechado) || 0
            const valorFinal = Number(cardAny.valor_final) || 0
            const valorEstimado = Number(cardAny.valor_estimado) || 0
            const formatBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

            // Prioridade 1: total_fechado > 0 → tem produto cadastrado, mostra fechado / previsto
            if (totalFechado > 0) {
                return (
                    <div key={fieldId} className="flex items-center text-xs mt-1 tabular-nums">
                        <DollarSign className="mr-1.5 h-3 w-3 flex-shrink-0 text-emerald-600" />
                        <span className="truncate block flex-1">
                            <span className="text-emerald-700 font-medium">{formatBRL(totalFechado)}</span>
                            {valorEstimado > 0 && (
                                <span className="text-slate-400"> / {formatBRL(valorEstimado)}</span>
                            )}
                        </span>
                    </div>
                )
            }
            // Prioridade 2: valor_final legado (sub-cards ou cards ganhos que já passaram pelo trigger)
            if (valorFinal > 0) {
                return (
                    <div key={fieldId} className="flex items-center text-xs text-emerald-600 mt-1 tabular-nums">
                        <DollarSign className="mr-1.5 h-3 w-3 flex-shrink-0" />
                        <span className="truncate block flex-1 font-medium">{formatBRL(valorFinal)}</span>
                    </div>
                )
            }
            // Prioridade 3: valor_estimado > 0 → só orçamento previsto, sem produto cadastrado
            if (valorEstimado > 0) {
                return (
                    <div key={fieldId} className="flex items-center text-xs text-slate-500 mt-1 tabular-nums">
                        <DollarSign className="mr-1.5 h-3 w-3 flex-shrink-0" />
                        <span className="truncate block flex-1">{formatBRL(valorEstimado)}</span>
                    </div>
                )
            }
            // Prioridade 4: orçamento dentro de produto_data (legado bem antigo)
            if (!value?.total) return null
            return (
                <div key={fieldId} className="flex items-center text-xs text-slate-500 mt-1 tabular-nums">
                    <DollarSign className="mr-1.5 h-3 w-3 flex-shrink-0" />
                    <span className="truncate block flex-1">{formatBRL(value.total)}</span>
                </div>
            )
        }
        if (fieldId === 'destinos' && value) {
            let displayValue = ''
            if (Array.isArray(value)) {
                displayValue = value.map(v => typeof v === 'object' ? (v.nome || v.name || JSON.stringify(v)) : String(v)).join(', ')
            } else if (typeof value === 'string') {
                displayValue = value
            } else if (typeof value === 'object') {
                displayValue = value.nome || value.name || Object.values(value).filter(Boolean).join(', ') || ''
            }
            if (!displayValue) return null
            return (
                <div key={fieldId} className="flex items-center text-xs text-gray-500 mt-1">
                    <MapPin className="mr-1.5 h-3 w-3 flex-shrink-0" />
                    <span className="truncate block flex-1">{displayValue}</span>
                </div>
            )
        }

        if (value === undefined || value === null || value === '') return null

        // Generic Renderers based on Type
        switch (fieldDef.type) {
            case 'currency':
                return (
                    <div key={fieldId} className="flex items-center text-xs text-gray-500 mt-1">
                        <DollarSign className="mr-1.5 h-3 w-3 flex-shrink-0 text-emerald-600" />
                        <span className="font-medium text-gray-700">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value))}
                        </span>
                    </div>
                )
            case 'date':
                return (
                    <div key={fieldId} className="flex items-center text-xs text-gray-500 mt-1">
                        <Calendar className="mr-1.5 h-3 w-3 flex-shrink-0 text-blue-600" />
                        <span className="text-gray-700">{new Date(value).toLocaleDateString('pt-BR')}</span>
                    </div>
                )
            case 'multiselect':
                const vals = Array.isArray(value) ? value : [value]
                return (
                    <div key={fieldId} className="flex items-center text-xs text-gray-500 mt-1">
                        <CheckSquare className="mr-1.5 h-3 w-3 flex-shrink-0 text-purple-600" />
                        <span className="truncate block flex-1 text-gray-700">{vals.join(', ')}</span>
                    </div>
                )
            case 'number':
                return (
                    <div key={fieldId} className="flex items-center text-xs text-gray-500 mt-1">
                        <span className="mr-1.5 h-3 w-3 flex items-center justify-center font-bold text-[9px] text-gray-400 border border-gray-300 rounded-sm flex-shrink-0">#</span>
                        <span className="text-gray-700">{String(value)}</span>
                    </div>
                )
            case 'boolean':
                return (
                    <div key={fieldId} className="flex items-center text-xs text-gray-500 mt-1">
                        {value ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-100">
                                <CheckSquare className="mr-1 h-3 w-3" /> Sim
                            </span>
                        ) : (
                            <span className="text-gray-400">Não</span>
                        )}
                    </div>
                )
            default: // text, select, etc
                // Special icons for specific fields
                let Icon = null
                if (fieldId === 'origem') Icon = Link
                if (fieldId === 'tempo_sem_contato') Icon = Clock
                if (fieldId === 'dias_ate_viagem') Icon = Calendar
                if (fieldId === 'forma_pagamento') Icon = DollarSign

                // Guard: never render raw objects
                const displayStr = (typeof value === 'object' && value !== null)
                    ? (Array.isArray(value) ? value.join(', ') : '')
                    : String(value)
                if (!displayStr) return null

                return (
                    <div key={fieldId} className="flex items-center text-xs text-gray-500 mt-1">
                        {Icon && <Icon className="mr-1.5 h-3 w-3 flex-shrink-0 text-gray-400" />}
                        <span className="truncate block flex-1 text-gray-600">{displayStr}</span>
                    </div>
                )
        }
    }

    // Default fields if no settings found (fallback)
    const defaultFields = ['destinos', 'epoca_viagem', 'orcamento']
    const settingsAny = settings as any
    const rawFieldsToShow = (settingsAny?.campos_kanban as string[]) || defaultFields
    const rawOrderedFields = (settingsAny?.ordem_kanban as string[]) || rawFieldsToShow

    // epoca_viagem e data_exata_da_viagem renderizam a mesma Data Viagem Completa — desduplica
    const dedupeTripDate = (arr: string[]) =>
        arr.includes('epoca_viagem') ? arr.filter(f => f !== 'data_exata_da_viagem') : arr
    // Dedup geral: ordem_kanban pode conter duplicatas (system_fields tem 1 row por produto, e o
    // PhaseSettingsDrawer escrevia o array bruto).
    const dedupe = (arr: string[]) => Array.from(new Set(arr))

    const fieldsToShow = dedupe(dedupeTripDate(rawFieldsToShow))
    const orderedFields = dedupe(dedupeTripDate(rawOrderedFields))
    // ordem_kanban define a ordem; campos_kanban define a visibilidade. Render só os visíveis.
    const visibleSet = new Set(fieldsToShow)
    const fieldsToRender = orderedFields.filter(f => visibleSet.has(f))

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            onClick={handleClick}
            className={cn(
                "group relative flex flex-col gap-2 rounded-lg border bg-white p-3 shadow-sm transition-all duration-200 ease-out hover:shadow-md",
                isClosedCard ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
                isDragging && "opacity-0",
                conciergeStats?.vencidos && conciergeStats.vencidos > 0 && "border-l-4 border-l-red-300",
                isDataPrevistaOverdue && "border-l-4 border-l-red-500 ring-1 ring-red-200",
                cancelOverlay && "border-2 border-amber-500 animate-pulse",
                card.status_comercial === 'ganho' && isGanhoDireto(card) && "border-amber-300 bg-amber-50/40 opacity-80",
                card.status_comercial === 'ganho' && !(isGanhoDireto(card)) && "border-green-300 bg-green-50/40 opacity-80",
                card.status_comercial === 'perdido' && "border-red-300 bg-red-50/40 opacity-80",
                !isClosedCard && (
                    (card as any).card_type === 'sub_card'
                        ? "border-l-4 border-l-purple-400 border-t-gray-200 border-r-gray-200 border-b-gray-200 bg-purple-50/30"
                        : isUnseen
                            ? "border-l-4 border-l-emerald-500 border-t-gray-200 border-r-gray-200 border-b-gray-200 bg-emerald-50/40 hover:border-l-emerald-600"
                            : "border-gray-200 hover:border-gray-300"
                )
            )}
            title={
                isDataPrevistaOverdue
                    ? `Data Prevista de Fechamento atrasada (${diasAtrasoDataPrevista} ${diasAtrasoDataPrevista === 1 ? 'dia' : 'dias'})`
                    : conciergeStats
                        ? `${conciergeStats.ativos} atendimentos abertos · ${conciergeStats.vencidos} vencidos · R$ ${(conciergeStats.valor_vendido_extra / 100).toFixed(2)} vendido`
                        : undefined
            }
        >
            <KanbanCardPendenciaFaixa cardId={card.id!} />
            {cancelOverlay && (
                <span
                    className={cn(
                        "absolute -top-2 -right-1 z-40 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide border shadow-sm pointer-events-none",
                        cancelOverlay.modo_cancelamento === 'total'
                            ? "bg-red-100 text-red-800 border-red-300"
                            : cancelOverlay.modo_cancelamento === 'mudanca_brusca'
                                ? "bg-violet-100 text-violet-800 border-violet-300"
                                : "bg-amber-100 text-amber-800 border-amber-300",
                    )}
                    title="Esta viagem está em cancelamento"
                >
                    ⚠ {modoCancelamentoLabel(cancelOverlay.modo_cancelamento)}
                </span>
            )}
            {showDelegatedDot && (
                <span
                    className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5 z-30 pointer-events-none"
                    title="Você tem uma tarefa atribuída neste card"
                    aria-label="Tarefa nova atribuída"
                >
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
                </span>
            )}
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn(
                        "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full transition-colors",
                        card.produto === 'TRIPS' && "bg-product-trips/10 text-product-trips border border-product-trips/20",
                        card.produto === 'WEDDING' && "bg-product-wedding/10 text-product-wedding border border-product-wedding/20",
                        card.produto === 'CORP' && "bg-product-corp/10 text-product-corp border border-product-corp/20"
                    )}>
                        {card.produto}
                    </span>

                    {/* Group Affiliation Badge — only for group children */}
                    {card.parent_card_id && (card as any).card_type === 'group_child' && (
                        <GroupBadge card={card} />
                    )}

                    {/* SDR qualification score badge (WEDDING) */}
                    {card.produto === 'WEDDING' && (card as any).sdr_qualification_score_latest && (
                        (() => {
                            const sdr = (card as any).sdr_qualification_score_latest as { score: number; qualificado: boolean; disqualified: boolean }
                            const color = sdr.disqualified
                                ? 'bg-rose-100 text-rose-700 border-rose-200'
                                : sdr.qualificado
                                    ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                    : 'bg-slate-100 text-slate-700 border-slate-200'
                            return (
                                <span
                                    className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border', color)}
                                    title={`Pontuação SDR: ${sdr.score} (${sdr.disqualified ? 'desqualificado' : sdr.qualificado ? 'qualificado' : 'abaixo do mínimo'})`}
                                >
                                    {sdr.score}
                                    {sdr.qualificado && !sdr.disqualified && <span>✓</span>}
                                    {sdr.disqualified && <span>✗</span>}
                                </span>
                            )
                        })()
                    )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                    {conciergeStats && conciergeStats.ativos > 0 && (
                        <div
                            className={cn(
                                'flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium',
                                conciergeStats.tipo_prioritario
                                    ? `${TIPO_LABEL[conciergeStats.tipo_prioritario].bgColor} ${TIPO_LABEL[conciergeStats.tipo_prioritario].color}`
                                    : 'bg-purple-100 text-purple-700'
                            )}
                            title={conciergeStats.tipo_prioritario ? `${conciergeStats.ativos} concierge · ${TIPO_LABEL[conciergeStats.tipo_prioritario].label}` : `${conciergeStats.ativos} concierge`}
                        >
                            {conciergeStats.ativos}
                        </div>
                    )}
                </div>

                {card.prioridade === 'alta' && (
                    <div className="h-2 w-2 rounded-full bg-red-500 flex-shrink-0 mt-1.5" title="Prioridade Alta" />
                )}

                {/* Context Menu Button */}
                <div className="relative">
                    <button
                        onClick={handleMenuClick}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-100 transition-all"
                        title="Mais opções"
                    >
                        <MoreVertical className="h-4 w-4 text-gray-400" />
                    </button>

                    {showMenu && (
                        <>
                            <div
                                className="fixed inset-0 z-40"
                                onClick={(e) => { e.stopPropagation(); setShowMenu(false); }}
                            />
                            <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                                <button
                                    onClick={handleDeleteClick}
                                    className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
                                >
                                    <Trash2 className="h-4 w-4" />
                                    Excluir
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Status Badge (Sem Pós-Venda / Ganho / Perdido) */}
            {card.status_comercial === 'ganho' && isGanhoDireto(card) && (
                <div className="flex items-center gap-1 text-[10px] font-bold text-lime-700 bg-lime-50 px-2 py-0.5 rounded-full w-fit border border-lime-200" title="Card fechado sem acompanhamento de Pós-Venda — sem cadências/automações ativas">
                    <Trophy className="h-3 w-3" />
                    Sem Pós-Venda
                </div>
            )}
            {card.status_comercial === 'ganho' && !(isGanhoDireto(card)) && (
                <div className="flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full w-fit border border-green-200">
                    <Trophy className="h-3 w-3" />
                    Ganho
                </div>
            )}
            {card.status_comercial === 'perdido' && (
                <div className="flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full w-fit border border-red-200">
                    <XCircle className="h-3 w-3" />
                    Perdido
                </div>
            )}

            {/* Win/Loss Hover Action Buttons */}
            {!isClosedCard && (onWin || onLoss) && (() => {
                const fase = card.fase?.toLowerCase() || ''
                const winTitle = fase.includes('sdr') ? 'Qualificado → Planner'
                    : fase.includes('planner') ? 'Venda Fechada → Pós-venda'
                    : fase.includes('pos') || fase.includes('pós') ? 'Viagem Concluída'
                    : 'Marcar como Ganho'
                return (
                    <div className="absolute bottom-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        {onWin && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onWin(card.id!) }}
                                className="flex items-center justify-center h-7 w-7 rounded-full bg-green-500 text-white shadow-md hover:bg-green-600 hover:scale-110 transition-all"
                                title={winTitle}
                            >
                                <Trophy className="h-3.5 w-3.5" />
                            </button>
                        )}
                        {onLoss && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onLoss(card.id!) }}
                                className="flex items-center justify-center h-7 w-7 rounded-full bg-red-500 text-white shadow-md hover:bg-red-600 hover:scale-110 transition-all"
                                title="Marcar como Perdido"
                            >
                                <XCircle className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                )
            })()}

            {/* Group Parent Badge */}
            {card.is_group_parent && (
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-purple-600 bg-purple-50/50 px-2 py-1 rounded border border-purple-200/50 w-fit shadow-sm">
                    <Building className="h-3 w-3" />
                    <span>Grupo</span>
                </div>
            )}

            {/* Sub-Card: show only badge (title is same as parent) */}
            {(card as any).card_type === 'sub_card' && (
                <SubCardBadge
                    status={(card as any).sub_card_status}
                    category={(card as any).sub_card_category}
                    variant="small"
                />
            )}

            {/* Active Sub-Cards Count (for parent cards) */}
            {(card as any).active_sub_cards_count > 0 && (card as any).card_type !== 'sub_card' && (
                <SubCardBadge
                    activeCount={(card as any).active_sub_cards_count}
                    variant="small"
                />
            )}

            {/* SLA Badge */}
            {(() => {
                if (Number(card.urgencia_tempo_etapa) === 1) {
                    return (
                        <div className="flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 px-2 py-1 rounded-md border border-red-100">
                            <Clock className="h-3 w-3" />
                            <span>ATRASADO ({Math.floor(card.tempo_etapa_dias || 0)}d)</span>
                        </div>
                    );
                }
                return null;
            })()}

            {/* Aviso: card criado pela importação Pós-Venda sem CPF do contato principal.
                Usuário deve passar pelo card e completar (ver tarefa "Atualizar CPF do contato principal"). */}
            {(card.produto_data as any)?.precisa_cpf === true && (
                <div className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-md border border-amber-200">
                    <AlertCircle className="h-3 w-3" />
                    <span>PRECISA CPF</span>
                </div>
            )}

            <span className="line-clamp-2 text-sm font-medium text-gray-900 group-hover:text-blue-600">
                {card.titulo}
            </span>

            {/* Handoff Compartilhado — card sem dono fixo, visível pra todo o time */}
            {isSharedCardNoOwner && (
                <div
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 -mt-0.5 self-start"
                    title="Card compartilhado entre membros do time. Coordenação via tarefas delegadas."
                >
                    <Users className="h-3 w-3" />
                    Time
                </div>
            )}

            {/* Contato Principal — fixo abaixo do título, controlado via pipeline_card_settings */}
            {card.pessoa_nome && fieldsToShow.includes('pessoa_nome') && (
                <div className="flex items-center text-xs text-gray-500 -mt-0.5">
                    <Users className="mr-1.5 h-3 w-3 flex-shrink-0 text-indigo-500" />
                    <span className="truncate text-gray-700 font-medium">{card.pessoa_nome}</span>
                </div>
            )}

            {/* Tempo aberto — exclusivo CORP, só em cards ainda abertos */}
            {card.produto === 'CORP' && !isClosedCard && (() => {
                const tempo = formatTempoAberto(card.created_at)
                if (!tempo) return null
                const colorCls = tempo.level === 'late'
                    ? 'bg-rose-50 text-rose-700 border-rose-100'
                    : tempo.level === 'warn'
                    ? 'bg-amber-50 text-amber-700 border-amber-100'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                return (
                    <div className="flex items-center -mt-0.5">
                        <span className={cn(
                            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium border',
                            colorCls
                        )}>
                            <Clock className="w-3 h-3" />
                            Aberto {tempo.label}
                        </span>
                    </div>
                )
            })()}

            <div className="flex flex-col gap-0.5">
                {/* Always show product/value if available as header info */}


                {/* Dynamic Fields */}
                {fieldsToRender.filter(f => f !== 'task_status').map(fieldId => renderDynamicField(fieldId))}

                {/* Task Status always at bottom of fields, above owner */}
                {visibleSet.has('task_status') && renderDynamicField('task_status')}

                {/* Anexos count */}
                {(() => {
                    const anexosCount = Number((card as any).anexos_count) || 0
                    if (anexosCount === 0) return null
                    return (
                        <div className="mt-1">
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border w-full justify-center bg-slate-50 text-slate-600 border-slate-200">
                                <Paperclip className="w-3 h-3" />
                                {anexosCount} {anexosCount === 1 ? 'anexo' : 'anexos'}
                            </span>
                        </div>
                    )
                })()}

                {/* Product Readiness Status */}
                {(() => {
                    const prodsTotal = Number((card as any).prods_total) || 0
                    const prodsReady = Number((card as any).prods_ready) || 0
                    if (prodsTotal === 0) return null
                    const isComplete = prodsReady >= prodsTotal
                    return (
                        <div className="mt-1">
                            <span className={cn(
                                "inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border w-full justify-center",
                                isComplete
                                    ? "bg-green-50 text-green-700 border-green-100"
                                    : "bg-amber-50 text-amber-700 border-amber-100"
                            )}>
                                <Package className="w-3 h-3" />
                                {prodsReady}/{prodsTotal} produtos prontos
                            </span>
                        </div>
                    )
                })()}

                {/* Tags */}
                {cardTags.length > 0 && (
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                        {displayTags.map(tag => (
                            <TagBadge key={tag.id} tag={tag} size="sm" />
                        ))}
                        {extraTagCount > 0 && (
                            <span className="text-[10px] text-slate-400 font-medium">+{extraTagCount}</span>
                        )}
                    </div>
                )}

                {/* Owner info always at bottom — mostra o responsável da fase atual */}
                <div className="mt-2 flex items-center justify-between border-t pt-2">
                    <div className="flex items-center gap-1.5">
                        {(() => {
                            const ownerName = getPhaseOwnerName(card, phaseSlug)
                            return ownerName ? (
                                <>
                                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-[10px] font-medium text-gray-600">
                                        {ownerName.charAt(0).toUpperCase()}
                                    </div>
                                    <span className="text-xs text-gray-500 truncate max-w-[80px]">
                                        {ownerName.split(' ')[0]}
                                    </span>
                                </>
                            ) : (
                                <>
                                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-50 text-[10px] font-medium text-gray-400">
                                        <Users className="h-3 w-3" />
                                    </div>
                                    <span className="text-xs text-gray-400 italic truncate max-w-[100px]">
                                        Sem responsável
                                    </span>
                                </>
                            )
                        })()}
                    </div>
                    {card.concierge_owner_id && (
                        <div className="flex items-center gap-0.5 text-[10px] text-purple-600 font-medium bg-purple-50 px-1.5 py-0.5 rounded-full" title="Concierge atribuído">
                            <User className="h-3 w-3" />
                            C
                        </div>
                    )}
                    {teamMemberCount > 0 && (
                        <div className="flex items-center gap-0.5 text-[10px] text-indigo-600 font-medium bg-indigo-50 px-1.5 py-0.5 rounded-full" title="Equipe de apoio atribuída">
                            <UserPlus className="h-3 w-3" />
                            {teamMemberCount}
                        </div>
                    )}
                </div>
            </div>

            <DeleteCardModal
                isOpen={showDeleteModal}
                onClose={() => setShowDeleteModal(false)}
                onConfirm={() => archive(card.id!)}
                isLoading={isArchiving}
                cardTitle={card.titulo || undefined}
            />
        </div>
    )
}

// Comparator customizado: re-renderiza só quando mudam os inputs que afetam visual do card.
// onWin/onLoss são funções recriadas a cada render do KanbanBoard mas funcionalmente
// equivalentes (lêem fechos sobre allCards/stages — estáveis no working set típico). Ignorar
// elas evita o cascade de re-render de 200+ cards quando KanbanBoard re-renderiza por
// state secundário (modal, drag overlay, sort). Card e conciergeStatsMap usam structural
// sharing do TanStack Query → mesma referência quando dados não mudaram.
export default memo(KanbanCard, (prev, next) => {
    return (
        prev.card === next.card &&
        prev.phaseSlug === next.phaseSlug &&
        prev.conciergeStatsMap === next.conciergeStatsMap &&
        prev.isDataPrevistaTracked === next.isDataPrevistaTracked
    )
})
