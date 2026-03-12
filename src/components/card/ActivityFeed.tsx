import { Pencil, Plus, UserPlus, UserMinus, FileText, X, Check, TrendingUp, UserCheck, ArrowRightLeft, Mail, MessageSquare, Calendar, RotateCcw, FileEdit, MapPin, DollarSign, Upload, Trash2, FileSignature, CheckCircle, XCircle, Archive, CalendarClock, Bot, Sparkles, ArrowRight, ChevronDown } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { formatDistanceToNow, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Database } from '../../database.types'

interface ActivityFilters {
    userId?: string | null
    startDate?: string | null
    endDate?: string | null
    type?: string | null
    product?: string | null
}

interface ActivityFeedProps {
    cardId?: string
    filters?: ActivityFilters
}

type Activity = Database['public']['Tables']['activities']['Row'] & {
    created_by_user?: {
        nome: string | null
        email: string | null
    }
    card?: {
        titulo: string | null
    }
    party_type?: 'client' | 'supplier' | null
}

const activityIcons = {
    // Card
    'card_created': Plus,
    'card_archived': Archive,
    // Tasks
    'task_created': FileText,
    'task_completed': Check,
    'task_reopened': RotateCcw,
    'task_updated': Pencil,
    'task_deleted': Trash2,
    'task_rescheduled': CalendarClock,
    'task_cancelled': X,
    // Status & Ownership
    'status_changed': TrendingUp,
    'owner_changed': UserCheck,
    'stage_changed': ArrowRightLeft,
    // Travelers
    'traveler_added': UserPlus,
    'traveler_removed': UserMinus,
    'traveler_changed': UserCheck,
    'traveler_updated': UserCheck,
    // Communication
    'email_sent': Mail,
    'whatsapp_sent': MessageSquare,
    'message_sent': MessageSquare,
    // Notes
    'note_added': Pencil,
    'note_created': Pencil,
    'note_updated': Pencil,
    'note_deleted': Trash2,
    // Files
    'file_uploaded': Upload,
    'file_deleted': Trash2,
    // Proposals
    'proposal_created': FileText,
    'proposal_updated': FileEdit,
    // Contracts
    'contract_created': FileSignature,
    'contract_updated': FileSignature,
    'contract_signed': FileSignature,
    // Meetings
    'meeting_created': Calendar,
    'meeting_updated': Calendar,
    'meeting_deleted': Trash2,
    // Requirements
    'requirement_completed': CheckCircle,
    'requirement_uncompleted': XCircle,
    // Values & Data
    'value_changed': DollarSign,
    'destination_changed': MapPin,
    'budget_changed': DollarSign,
    'period_changed': Calendar,
    // AI
    'ai_summary_updated': Sparkles,
    'ai_context_updated': Sparkles,
    'ai_handoff': ArrowRightLeft,
    // Title & Notes
    'title_changed': Pencil,
    'notes_changed': FileEdit,
    // Generic
    'created': Plus,
    'updated': Pencil,
    'default': FileText
}

const activityColors = {
    // Card
    'card_created': 'text-green-600 bg-green-50',
    'card_archived': 'text-gray-600 bg-gray-50',
    // Tasks
    'task_created': 'text-blue-600 bg-blue-50',
    'task_completed': 'text-green-600 bg-green-50',
    'task_reopened': 'text-orange-600 bg-orange-50',
    'task_updated': 'text-blue-600 bg-blue-50',
    'task_deleted': 'text-red-600 bg-red-50',
    'task_rescheduled': 'text-purple-600 bg-purple-50',
    'task_cancelled': 'text-red-600 bg-red-50',
    // Status & Ownership
    'status_changed': 'text-purple-600 bg-purple-50',
    'owner_changed': 'text-indigo-600 bg-indigo-50',
    'stage_changed': 'text-cyan-600 bg-cyan-50',
    // Travelers
    'traveler_added': 'text-purple-600 bg-purple-50',
    'traveler_removed': 'text-red-600 bg-red-50',
    'traveler_changed': 'text-violet-600 bg-violet-50',
    'traveler_updated': 'text-violet-600 bg-violet-50',
    // Communication
    'email_sent': 'text-blue-600 bg-blue-50',
    'whatsapp_sent': 'text-green-600 bg-green-50',
    'message_sent': 'text-blue-600 bg-blue-50',
    // Notes
    'note_added': 'text-gray-600 bg-gray-50',
    'note_created': 'text-gray-600 bg-gray-50',
    'note_updated': 'text-gray-600 bg-gray-50',
    'note_deleted': 'text-red-600 bg-red-50',
    // Files
    'file_uploaded': 'text-teal-600 bg-teal-50',
    'file_deleted': 'text-red-600 bg-red-50',
    // Proposals
    'proposal_created': 'text-pink-600 bg-pink-50',
    'proposal_updated': 'text-pink-600 bg-pink-50',
    // Contracts
    'contract_created': 'text-amber-600 bg-amber-50',
    'contract_updated': 'text-amber-600 bg-amber-50',
    'contract_signed': 'text-green-600 bg-green-50',
    // Meetings
    'meeting_created': 'text-yellow-600 bg-yellow-50',
    'meeting_updated': 'text-yellow-600 bg-yellow-50',
    'meeting_deleted': 'text-red-600 bg-red-50',
    // Requirements
    'requirement_completed': 'text-green-600 bg-green-50',
    'requirement_uncompleted': 'text-orange-600 bg-orange-50',
    // Values & Data
    'value_changed': 'text-green-600 bg-green-50',
    'destination_changed': 'text-blue-600 bg-blue-50',
    'budget_changed': 'text-emerald-600 bg-emerald-50',
    'period_changed': 'text-orange-600 bg-orange-50',
    // AI
    'ai_summary_updated': 'text-violet-600 bg-violet-50',
    'ai_context_updated': 'text-violet-600 bg-violet-50',
    'ai_handoff': 'text-amber-600 bg-amber-50',
    // Title & Notes
    'title_changed': 'text-slate-600 bg-slate-50',
    'notes_changed': 'text-orange-600 bg-orange-50',
    // Generic
    'created': 'text-green-600 bg-green-50',
    'updated': 'text-blue-600 bg-blue-50',
    'default': 'text-gray-600 bg-gray-50'
}

/** Formata valor legível a partir de metadata JSONB */
function formatValue(val: unknown): string | null {
    if (val == null) return null
    if (typeof val === 'string') return val || null
    if (typeof val === 'number') return val.toLocaleString('pt-BR')
    if (typeof val === 'boolean') return val ? 'Sim' : 'Não'
    // JSONB objects (época, orçamento, etc.)
    if (typeof val === 'object') {
        const obj = val as Record<string, unknown>
        // Smart budget: { tipo, valor, ... }
        if (obj.valor != null) return `R$ ${Number(obj.valor).toLocaleString('pt-BR')}`
        // Flexible date: { tipo, mes, ano, ... }
        if (obj.mes) return `${obj.mes}${obj.ano ? '/' + obj.ano : ''}`
        if (obj.data_inicio) return String(obj.data_inicio)
        // Arrays (destinos, etc.)
        if (Array.isArray(val)) return val.join(', ') || null
        // Fallback: stringify compacto
        const str = JSON.stringify(val)
        return str.length > 80 ? str.slice(0, 77) + '...' : str
    }
    return String(val)
}

/** Extrai pares old→new do metadata por tipo de atividade */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- metadata is untyped JSONB
function getChangeDetail(tipo: string, meta: any): { oldVal: string | null; newVal: string | null } | null {
    if (!meta) return null
    switch (tipo) {
        case 'stage_changed':
            return { oldVal: meta.old_stage_name, newVal: meta.new_stage_name }
        case 'value_changed':
            return {
                oldVal: meta.old_value != null ? `R$ ${Number(meta.old_value).toLocaleString('pt-BR')}` : null,
                newVal: meta.new_value != null ? `R$ ${Number(meta.new_value).toLocaleString('pt-BR')}` : null
            }
        case 'status_changed':
            return { oldVal: meta.old_status, newVal: meta.new_status }
        case 'title_changed':
            return { oldVal: meta.old_title, newVal: meta.new_title }
        case 'ai_handoff':
            return {
                oldVal: meta.old_responsavel === 'ia' ? 'IA Julia' : meta.old_responsavel === 'humano' ? 'Humano' : meta.old_responsavel,
                newVal: meta.new_responsavel === 'ia' ? 'IA Julia' : meta.new_responsavel === 'humano' ? 'Humano' : meta.new_responsavel
            }
        case 'destination_changed':
        case 'traveler_changed':
        case 'period_changed':
        case 'budget_changed':
        case 'notes_changed':
            return { oldVal: formatValue(meta.old), newVal: formatValue(meta.new) }
        default:
            return null
    }
}

export default function ActivityFeed({ cardId, filters }: ActivityFeedProps) {
    const queryClient = useQueryClient()
    const hasProductFilter = !cardId && !!filters?.product
    const { data: activities, isLoading } = useQuery({
        queryKey: ['activity-feed', cardId || 'global', filters],
        queryFn: async () => {
            let query = supabase
                .from('activities')
                .select(`
                    *,
                    created_by_user:profiles!created_by (
                        nome,
                        email
                    ),
                    card:cards!card_id(titulo, produto)
                `)
                .order('created_at', { ascending: false })
                .limit(100)

            if (cardId) {
                query = query.eq('card_id', cardId)
            }

            // Apply filters
            if (filters?.userId && filters.userId !== 'all') {
                query = query.eq('created_by', filters.userId)
            }
            if (filters?.startDate) {
                query = query.gte('created_at', filters.startDate)
            }
            if (filters?.endDate) {
                // Add time to end date to include the whole day
                query = query.lte('created_at', `${filters.endDate}T23:59:59`)
            }
            if (filters?.type && filters.type !== 'all') {
                query = query.eq('tipo', filters.type)
            }

            const { data, error } = await query

            if (error) {
                console.error('Error fetching activities:', error)
                return []
            }

            let result = data as Activity[]
            // Filtrar por produto client-side (inner join via template literal não funciona com TS)
            if (hasProductFilter) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                result = result.filter((a: any) => a.card?.produto === filters!.product)
            }
            return result
        }
    })

    useEffect(() => {
        const channel = supabase
            .channel(`activity-feed-${cardId || 'global'}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'activities'
                },
                (payload) => {
                    console.log('Activity received:', payload)
                    if (cardId) {
                        if (payload.new.card_id === cardId) {
                            queryClient.invalidateQueries({ queryKey: ['activity-feed', cardId] })
                        }
                    } else {
                        // Global feed: update on any activity
                        queryClient.invalidateQueries({ queryKey: ['activity-feed', 'global'] })
                    }
                }
            )
            .subscribe((status) => {
                console.log('ActivityFeed subscription status:', status, cardId || 'global')
            })

        return () => {
            supabase.removeChannel(channel)
        }
    }, [cardId, queryClient])

    const [isExpanded, setIsExpanded] = useState(!cardId) // collapsed by default on card detail

    // Collapsed bar
    if (cardId && !isExpanded) {
        return (
            <button
                type="button"
                onClick={() => setIsExpanded(true)}
                className="w-full flex items-center justify-between px-3 py-1.5 bg-gray-50/50 border border-gray-300 rounded-xl transition-colors hover:bg-gray-100/80"
            >
                <div className="flex items-center gap-2">
                    <div className="p-1 rounded-lg bg-blue-100">
                        <MessageSquare className="h-3.5 w-3.5 text-blue-700" />
                    </div>
                    <span className="text-xs font-semibold text-gray-900">Atividades</span>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
            </button>
        )
    }

    if (isLoading) {
        return (
            <div className="rounded-lg border bg-white p-2.5 shadow-sm">
                <h3 className="text-xs font-semibold text-gray-900 mb-1.5">Atividades</h3>
                <p className="text-xs text-gray-500">Carregando...</p>
            </div>
        )
    }

    return (
        <div className="rounded-xl border border-gray-300 bg-white shadow-sm overflow-hidden">
            {/* Header — clickable to collapse */}
            {cardId && (
                <button
                    type="button"
                    onClick={() => setIsExpanded(false)}
                    className="w-full border-b border-gray-200 bg-gray-50/50 px-3 py-1.5 cursor-pointer hover:bg-gray-100/80 transition-colors"
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="p-1 rounded-lg bg-blue-100">
                                <MessageSquare className="h-3.5 w-3.5 text-blue-700" />
                            </div>
                            <h3 className="text-xs font-semibold text-gray-900">Atividades</h3>
                        </div>
                        <ChevronDown className="h-3.5 w-3.5 text-gray-400 rotate-180" />
                    </div>
                </button>
            )}
            {!cardId && (
                <h3 className="text-xs font-semibold text-gray-900 px-2.5 pt-2.5 pb-1.5">Atividades</h3>
            )}

            <div className="p-2.5">
                {activities && activities.length > 0 ? (
                    <div className="space-y-2">
                        {activities.map((activity) => {
                            const Icon = activityIcons[activity.tipo as keyof typeof activityIcons] || activityIcons.default
                            const colorClass = activityColors[activity.tipo as keyof typeof activityColors] || activityColors.default
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- metadata is untyped JSONB
                            const isAiActivity = (activity.metadata as any)?.source === 'ai_agent'
                            const userName = isAiActivity
                                ? 'IA Julia'
                                : (activity.created_by_user?.nome || activity.created_by_user?.email || 'Sistema')

                            return (
                                <div key={activity.id} className="flex gap-2 text-xs">
                                    {/* Icon */}
                                    <div className={`h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                                        <Icon className="h-3 w-3" />
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        {!cardId && activity.card?.titulo && (
                                            <Link to={`/cards/${activity.card_id}`} className="text-xs text-indigo-600 mb-0.5 font-medium hover:underline block">
                                                {activity.card.titulo}
                                            </Link>
                                        )}
                                        <div className="flex items-center gap-1.5">
                                            <p className="text-gray-900">{activity.descricao}</p>
                                            {activity.party_type === 'supplier' && (
                                                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 rounded">
                                                    Fornecedor
                                                </span>
                                            )}
                                        </div>
                                        {(() => {
                                            const detail = getChangeDetail(activity.tipo!, activity.metadata)
                                            if (!detail || (!detail.oldVal && !detail.newVal)) return null
                                            return (
                                                <div className="mt-1 flex items-center gap-1.5 text-[11px]">
                                                    {detail.oldVal && (
                                                        <span className="px-1.5 py-0.5 bg-red-50 text-red-700 rounded line-through max-w-[140px] truncate" title={detail.oldVal}>
                                                            {detail.oldVal}
                                                        </span>
                                                    )}
                                                    <ArrowRight className="h-3 w-3 text-gray-400 flex-shrink-0" />
                                                    {detail.newVal && (
                                                        <span className="px-1.5 py-0.5 bg-green-50 text-green-700 rounded font-medium max-w-[180px] truncate" title={detail.newVal}>
                                                            {detail.newVal}
                                                        </span>
                                                    )}
                                                </div>
                                            )
                                        })()}
                                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- metadata is untyped JSONB */}
                                        {activity.tipo === 'task_rescheduled' && (activity.metadata as any)?.new_date && (
                                            <div className="mt-1 text-xs text-purple-700 bg-purple-50 px-2 py-1 rounded border border-purple-100 inline-flex items-center gap-2">
                                                <CalendarClock className="h-3 w-3" />
                                                <span>
                                                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- metadata is untyped JSONB */}
                                                    Reagendada para: <span className="font-medium">{format(new Date((activity.metadata as any).new_date), "dd/MM 'às' HH:mm")}</span>
                                                </span>
                                            </div>
                                        )}
                                        <div className="flex flex-col mt-0.5">
                                            <span className="text-gray-500">
                                                por <span className="font-medium text-gray-700">{userName}</span>
                                                {isAiActivity && (
                                                    <span className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium bg-violet-100 text-violet-700 rounded">
                                                        <Bot className="h-2.5 w-2.5" />
                                                        Auto
                                                    </span>
                                                )}
                                            </span>
                                            <div className="flex items-center gap-1 text-gray-400 text-[10px]">
                                                <span>{formatDistanceToNow(new Date(activity.created_at!), { addSuffix: true, locale: ptBR })}</span>
                                                <span>•</span>
                                                <span>{format(new Date(activity.created_at!), "HH:mm '•' dd/MM")}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                ) : (
                    <p className="text-xs text-gray-500 italic">Nenhuma atividade registrada ainda</p>
                )}
            </div>
        </div>
    )
}
