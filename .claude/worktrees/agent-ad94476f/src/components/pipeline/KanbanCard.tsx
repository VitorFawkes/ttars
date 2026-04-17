/* eslint-disable @typescript-eslint/no-explicit-any, no-case-declarations */
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Calendar, DollarSign, MapPin, Users, UserPlus, User, CheckSquare, AlertCircle, Clock, Link, Building, MoreVertical, Trash2, Paperclip, Package, Trophy, XCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { cn } from '../../lib/utils'
import type { Database } from '../../database.types'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useArchiveCard } from '../../hooks/useArchiveCard'
import DeleteCardModal from '../card/DeleteCardModal'
import { TagBadge } from '../card/TagBadge'
import { useCardTags } from '../../hooks/useCardTags'
import { useSeenCards } from '../../hooks/useSeenCards'
import { isGanhoDireto, getPhaseOwnerName } from '../../lib/pipeline/phaseLabels'
import { useCardTeamCounts } from '../../hooks/useCardTeamCounts'

type Card = Database['public']['Views']['view_cards_acoes']['Row']

interface KanbanCardProps {
    card: Card
    phaseSlug?: string | null
    onWin?: (cardId: string) => void
    onLoss?: (cardId: string) => void
}



import { GroupBadge } from './GroupBadge'
import SubCardBadge from './SubCardBadge'

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
        startStr = ev.data_inicio || ev.start || ev.inicio || null
        endStr = ev.data_fim || ev.end || ev.fim || null
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

export default function KanbanCard({ card, phaseSlug, onWin, onLoss }: KanbanCardProps) {
    const navigate = useNavigate()
    const { isNew, markSeen } = useSeenCards()
    const isUnseen = isNew(card.id!, card.created_at)

    const isClosedCard = card.status_comercial === 'ganho' || card.status_comercial === 'perdido'

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

        // Data Viagem Completa (epoca_viagem) — fonte única para data da viagem no Kanban.
        // Também usada quando o campo configurado é data_exata_da_viagem.
        if (fieldId === 'epoca_viagem' || fieldId === 'data_exata_da_viagem') {
            const produtoData = card.produto_data as any
            const ev = produtoData?.epoca_viagem ?? (card as any).epoca_viagem

            const label = renderTripDate(ev, (card as any).data_viagem_inicio)
            if (!label) return null

            return (
                <div key={fieldId} className="flex items-center text-xs text-gray-500 mt-1">
                    <Calendar className="mr-1.5 h-3 w-3 flex-shrink-0 text-blue-600" />
                    <span className="truncate block flex-1 text-gray-700">{label}</span>
                </div>
            )
        }
        if (fieldId === 'orcamento') {
            // Prioridade 1: valor_final (confirmado)
            const confirmedValue = (card as any).valor_final || (card as any).valor_display
            if (confirmedValue) {
                return (
                    <div key={fieldId} className="flex items-center text-xs text-emerald-600 mt-1">
                        <DollarSign className="mr-1.5 h-3 w-3 flex-shrink-0" />
                        <span className="truncate block flex-1 font-medium">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(confirmedValue))}
                        </span>
                    </div>
                )
            }
            // Prioridade 2: orcamento estimado (lógica original)
            if (!value?.total) return null
            return (
                <div key={fieldId} className="flex items-center text-xs text-gray-500 mt-1">
                    <DollarSign className="mr-1.5 h-3 w-3 flex-shrink-0" />
                    <span className="truncate block flex-1">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value.total)}
                    </span>
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

    const fieldsToShow = dedupeTripDate(rawFieldsToShow)
    const orderedFields = dedupeTripDate(rawOrderedFields)

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
        >
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

            {/* Status Badge (Ganho Direto / Ganho / Perdido) */}
            {card.status_comercial === 'ganho' && isGanhoDireto(card) && (
                <div className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full w-fit border border-amber-200">
                    <Trophy className="h-3 w-3" />
                    Ganho Direto
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

            <span className="line-clamp-2 text-sm font-medium text-gray-900 group-hover:text-blue-600">
                {card.titulo}
            </span>

            {/* Contato Principal — fixo abaixo do título, controlado via pipeline_card_settings */}
            {card.pessoa_nome && fieldsToShow.includes('pessoa_nome') && (
                <div className="flex items-center text-xs text-gray-500 -mt-0.5">
                    <Users className="mr-1.5 h-3 w-3 flex-shrink-0 text-indigo-500" />
                    <span className="truncate text-gray-700 font-medium">{card.pessoa_nome}</span>
                </div>
            )}

            <div className="flex flex-col gap-0.5">
                {/* Always show product/value if available as header info */}


                {/* Dynamic Fields */}
                {orderedFields.filter(f => f !== 'task_status').map(fieldId => renderDynamicField(fieldId))}

                {/* Task Status always at bottom of fields, above owner */}
                {renderDynamicField('task_status')}

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
