import { useState, useEffect, useMemo } from 'react'
import { ArrowLeft, Calendar, DollarSign, History, Edit2, Check, X, ChevronDown, AlertCircle, RefreshCw, Clock, Pencil, TrendingUp, Link, Search, UserPlus, Phone, Mail, Loader2 } from 'lucide-react'
import { getOrigemLabel, getOrigemColor, ORIGEM_OPTIONS, needsOrigemDetalhe } from '../../lib/constants/origem'
import { useNavigate } from 'react-router-dom'
import { cn, buildContactSearchFilter } from '../../lib/utils'
import type { Database } from '../../database.types'

interface TripsProdutoData {
    orcamento?: {
        // Estrutura antiga (date_range)
        total?: number
        por_pessoa?: number
        // Estrutura nova (smart_budget)
        tipo?: 'total' | 'por_pessoa' | 'range'
        valor?: number
        total_calculado?: number
        display?: string
    }
    epoca_viagem?: {
        // Estrutura antiga (date_range)
        inicio?: string
        fim?: string
        flexivel?: boolean
        // Estrutura nova (flexible_date)
        tipo?: 'data_exata' | 'mes' | 'range_meses' | 'indefinido'
        data_inicio?: string
        data_fim?: string
        mes_inicio?: number
        mes_fim?: number
        ano?: number
        display?: string
    }
    destinos?: Record<string, unknown>[]
}
import OwnerHistoryModal from './OwnerHistoryModal'
import ActionButtons from './ActionButtons'
import ContactSelector from './ContactSelector'
import { formatContactName, getContactInitials } from '../../lib/contactUtils'
import { Button } from '../ui/Button'
import OwnerSelector from '../pipeline/OwnerSelector'
import { useCardTeam } from '../../hooks/useCardTeam'
import { useRoles } from '../../hooks/useRoles'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useQualityGate } from '../../hooks/useQualityGate'
import QualityGateModal from './QualityGateModal'
import StageChangeModal from './StageChangeModal'
import LossReasonModal, { type FutureOpportunityData } from './LossReasonModal'
import { useStageRequirements } from '../../hooks/useStageRequirements'
import { useFieldConfig } from '../../hooks/useFieldConfig'
import { usePipelinePhases } from '../../hooks/usePipelinePhases'
import { PRODUCT_PIPELINE_MAP } from '../../lib/constants'
import { SystemPhase } from '@/types/pipeline'

type CardBase = Database['public']['Tables']['cards']['Row']

// Extended card type including fields from views (e.g. cards_complete_view)
type Card = CardBase & {
    proxima_tarefa?: { data_vencimento?: string; titulo?: string } | null
    ganho_sdr?: boolean | null
    ganho_planner?: boolean | null
    ganho_pos?: boolean | null
    motivo_perda_id?: string | null
    motivo_perda_comentario?: string | null
}

interface CardHeaderProps {
    card: Card
}

/** Inline-editable origin badge with popover */
function OrigemBadgeEditable({ cardId, origem, origemLead, indicadoPorId }: { cardId: string, origem: string | null, origemLead: string | null, indicadoPorId: string | null }) {
    const queryClient = useQueryClient()
    const [isOpen, setIsOpen] = useState(false)
    const [localOrigem, setLocalOrigem] = useState(origem)
    const [localDetalhe, setLocalDetalhe] = useState(origemLead || '')
    const [showContactSelector, setShowContactSelector] = useState(false)

    // Indicação contact search
    const [indicacaoSearch, setIndicacaoSearch] = useState('')
    const [debouncedIndicacao, setDebouncedIndicacao] = useState('')
    const [showIndicacaoResults, setShowIndicacaoResults] = useState(false)

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedIndicacao(indicacaoSearch), 300)
        return () => clearTimeout(timer)
    }, [indicacaoSearch])

    const { data: indicacaoContacts, isLoading: isSearching } = useQuery({
        queryKey: ['indicacao-search-header', debouncedIndicacao],
        queryFn: async () => {
            if (!debouncedIndicacao) return []
            const { data, error } = await supabase
                .from('contatos')
                .select('id, nome, sobrenome, telefone, email')
                .is('deleted_at', null)
                .or(buildContactSearchFilter(debouncedIndicacao))
                .limit(6)
            if (error) throw error
            return data
        },
        enabled: debouncedIndicacao.length > 1
    })

    // Fetch linked contact info
    const { data: linkedContact } = useQuery({
        queryKey: ['indicado-por', indicadoPorId],
        queryFn: async () => {
            if (!indicadoPorId) return null
            const { data } = await supabase
                .from('contatos')
                .select('id, nome, sobrenome, telefone, email')
                .eq('id', indicadoPorId)
                .single()
            return data
        },
        enabled: !!indicadoPorId
    })

    // Sync local state when props change (popover closed = source of truth is server)
    if (!isOpen && localOrigem !== origem) setLocalOrigem(origem)
    if (!isOpen && localDetalhe !== (origemLead || '')) setLocalDetalhe(origemLead || '')

    const invalidateCards = () => {
        queryClient.invalidateQueries({ queryKey: ['card-detail', cardId] })
        queryClient.invalidateQueries({ queryKey: ['card', cardId] })
        queryClient.invalidateQueries({ queryKey: ['cards'] })
        queryClient.invalidateQueries({ queryKey: ['indicado-por'] })
    }

    const mutation = useMutation({
        mutationFn: async ({ newOrigem, newDetalhe, newIndicadoPorId }: { newOrigem: string, newDetalhe: string | null, newIndicadoPorId?: string | null }) => {
            const updatePayload: Record<string, unknown> = { origem: newOrigem, origem_lead: newDetalhe }
            if (newIndicadoPorId !== undefined) updatePayload.indicado_por_id = newIndicadoPorId
            const { error } = await supabase
                .from('cards')
                .update(updatePayload)
                .eq('id', cardId)
            if (error) throw error
        },
        onSuccess: () => {
            invalidateCards()
            setIsOpen(false)
        }
    })

    const handleSelect = (value: string) => {
        setLocalOrigem(value)
        if (!needsOrigemDetalhe(value)) {
            mutation.mutate({ newOrigem: value, newDetalhe: null, newIndicadoPorId: null })
        } else if (value !== 'indicacao') {
            setLocalDetalhe('')
        }
    }

    const handleSaveDetalhe = () => {
        if (localOrigem) {
            mutation.mutate({ newOrigem: localOrigem, newDetalhe: localDetalhe || null })
        }
    }

    const handleSelectContact = (contact: { id: string, nome: string | null, sobrenome?: string | null }) => {
        const displayName = formatContactName(contact) || contact.nome || ''
        setLocalDetalhe(displayName)
        setIndicacaoSearch('')
        setShowIndicacaoResults(false)
        if (localOrigem) {
            mutation.mutate({ newOrigem: localOrigem, newDetalhe: displayName, newIndicadoPorId: contact.id })
        }
    }

    const handleUnlinkContact = () => {
        if (localOrigem) {
            mutation.mutate({ newOrigem: localOrigem, newDetalhe: null, newIndicadoPorId: null })
        }
    }

    const colorClass = getOrigemColor(origem)

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "px-2 py-0.5 rounded-full text-[10px] font-medium border cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-indigo-500 transition-all",
                    colorClass
                )}
                title={origemLead ? `Origem: ${getOrigemLabel(origem)} — ${origemLead}` : `Origem: ${getOrigemLabel(origem)}`}
            >
                <Link className="inline h-2.5 w-2.5 mr-0.5" />
                {getOrigemLabel(origem)}
                {origemLead && <span className="ml-1 opacity-70">· {origemLead}</span>}
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                    <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-3 w-72 space-y-3">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Origem do Lead</p>
                        <div className="flex flex-wrap gap-1.5">
                            {ORIGEM_OPTIONS.map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => handleSelect(opt.value)}
                                    className={cn(
                                        "px-2.5 py-1 text-xs font-medium rounded-lg border transition-all",
                                        localOrigem === opt.value
                                            ? opt.color + " ring-1 ring-indigo-500"
                                            : "border-slate-200 text-slate-600 hover:border-slate-300 bg-white"
                                    )}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>

                        {/* Indicação: contact picker */}
                        {needsOrigemDetalhe(localOrigem) === 'indicacao' && (
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-slate-600">Quem indicou?</label>

                                {/* Show linked contact */}
                                {linkedContact ? (
                                    <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                                        <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-[10px] font-semibold flex-shrink-0">
                                            {getContactInitials(linkedContact)}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-medium text-slate-900 truncate">{formatContactName(linkedContact)}</p>
                                            <p className="text-[10px] text-slate-500 truncate">
                                                {linkedContact.telefone || linkedContact.email || ''}
                                            </p>
                                        </div>
                                        <button
                                            onClick={handleUnlinkContact}
                                            className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                                            title="Remover indicação"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {/* Search input */}
                                        <div className="relative">
                                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                            <input
                                                type="text"
                                                value={indicacaoSearch}
                                                onChange={(e) => {
                                                    setIndicacaoSearch(e.target.value)
                                                    setShowIndicacaoResults(true)
                                                }}
                                                onFocus={() => setShowIndicacaoResults(true)}
                                                onBlur={() => setTimeout(() => setShowIndicacaoResults(false), 200)}
                                                placeholder="Buscar contato..."
                                                className="w-full pl-7 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            />
                                            {isSearching && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 animate-spin" />}
                                        </div>

                                        {/* Search results */}
                                        {showIndicacaoResults && indicacaoContacts && indicacaoContacts.length > 0 && (
                                            <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                                                {indicacaoContacts.map(c => (
                                                    <button
                                                        key={c.id}
                                                        type="button"
                                                        className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 text-left"
                                                        onMouseDown={(e) => {
                                                            e.preventDefault()
                                                            handleSelectContact(c)
                                                        }}
                                                    >
                                                        <div className="h-6 w-6 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 text-[10px] font-medium flex-shrink-0">
                                                            {getContactInitials(c)}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-xs font-medium text-slate-900 truncate">{formatContactName(c)}</p>
                                                            <p className="text-[10px] text-slate-500 truncate">
                                                                {c.telefone && <><Phone className="inline h-2.5 w-2.5 mr-0.5" />{c.telefone}</>}
                                                                {c.telefone && c.email && ' · '}
                                                                {c.email && <><Mail className="inline h-2.5 w-2.5 mr-0.5" />{c.email}</>}
                                                            </p>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        {/* No results message */}
                                        {showIndicacaoResults && debouncedIndicacao.length > 1 && indicacaoContacts?.length === 0 && !isSearching && (
                                            <p className="text-[10px] text-slate-400 text-center py-1">Nenhum contato encontrado</p>
                                        )}

                                        {/* Create new contact button */}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowContactSelector(true)
                                                setIsOpen(false)
                                            }}
                                            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
                                        >
                                            <UserPlus className="h-3.5 w-3.5" />
                                            Criar novo contato
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Marketing: campanha/fonte text field */}
                        {needsOrigemDetalhe(localOrigem) === 'mkt' && (
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-slate-600">Campanha / Fonte</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={localDetalhe}
                                        onChange={(e) => setLocalDetalhe(e.target.value)}
                                        placeholder="Ex: Google Ads..."
                                        className="flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        onKeyDown={(e) => e.key === 'Enter' && handleSaveDetalhe()}
                                    />
                                    <button
                                        onClick={handleSaveDetalhe}
                                        disabled={mutation.isPending}
                                        className="px-2 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                                    >
                                        {mutation.isPending ? '...' : 'OK'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* ContactSelector modal for creating new contact */}
            {showContactSelector && (
                <ContactSelector
                    cardId={cardId}
                    addToCard={false}
                    onClose={() => setShowContactSelector(false)}
                    onContactAdded={(contactId, contact) => {
                        if (contactId && contact) {
                            const displayName = contact.nome || ''
                            mutation.mutate({ newOrigem: 'indicacao', newDetalhe: displayName, newIndicadoPorId: contactId })
                        }
                        setShowContactSelector(false)
                    }}
                />
            )}
        </div>
    )
}

export default function CardHeader({ card }: CardHeaderProps) {
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const [showOwnerHistory, setShowOwnerHistory] = useState(false)

    // Title editing
    const [isEditingTitle, setIsEditingTitle] = useState(false)
    const [editedTitle, setEditedTitle] = useState(card.titulo || '')

    // Stage selection
    const [showStageDropdown, setShowStageDropdown] = useState(false)
    const { validateMove } = useQualityGate()
    const [isValidatingStage, setIsValidatingStage] = useState(false)
    const [qualityGateModalOpen, setQualityGateModalOpen] = useState(false)
    const [stageChangeModalOpen, setStageChangeModalOpen] = useState(false)
    const [pendingStageChange, setPendingStageChange] = useState<{
        stageId: string,
        targetStageName: string,
        missingFields?: { key: string, label: string }[],
        missingProposals?: { label: string, min_status: string }[],
        missingTasks?: { label: string, task_tipo: string, task_require_completed: boolean }[],
        missingDocuments?: { label: string, total: number, completed: number }[],
        currentOwnerId?: string,
        sdrName?: string,
        targetPhaseId?: string,
        targetPhaseName?: string
    } | null>(null)

    const [lossReasonModalOpen, setLossReasonModalOpen] = useState(false)
    const [pendingLossMove, setPendingLossMove] = useState<{ stageId: string; stageName: string } | null>(null)

    const { missingBlocking } = useStageRequirements(card)
    const { getHeaderFields } = useFieldConfig()
    const headerFields = card.pipeline_stage_id ? getHeaderFields(card.pipeline_stage_id) : []
    const pipelineId = card.produto ? PRODUCT_PIPELINE_MAP[card.produto] : undefined
    const { data: phasesData } = usePipelinePhases(pipelineId)

    // Card team (assistants)
    const { members: teamMembers, addMember, removeMember } = useCardTeam(card.id || undefined, card)
    const { roles: allRoles } = useRoles()

    const assistenteRoleId = useMemo(() =>
        allRoles.find(r => r.name === 'assistente')?.id || null
    , [allRoles])

    const assistentePlanner = useMemo(() =>
        teamMembers.find(m => m.role === 'assistente_planner') || null
    , [teamMembers])

    const assistentePos = useMemo(() =>
        teamMembers.find(m => m.role === 'assistente_pos') || null
    , [teamMembers])

    // Fetch pipeline stages with proper Kanban ordering (phase order_index -> stage ordem)
    const { data: stages } = useQuery({
        queryKey: ['pipeline-stages-ordered', pipelineId],
        queryFn: async () => {
            let query = supabase
                .from('pipeline_stages')
                .select(`
                    id,
                    nome,
                    ordem,
                    fase,
                    phase_id,
                    is_lost,
                    is_won,
                    pipeline_phases!pipeline_stages_phase_id_fkey(id, name, order_index)
                `)
                .eq('ativo', true)

            if (pipelineId) {
                query = query.eq('pipeline_id', pipelineId)
            }

            const { data, error } = await query

            if (error) throw error

            // Sort by phase order_index first, then by stage ordem within phase
            return (data || []).sort((a, b) => {
                const phaseOrderA = (a.pipeline_phases as { order_index?: number } | null)?.order_index ?? 999
                const phaseOrderB = (b.pipeline_phases as { order_index?: number } | null)?.order_index ?? 999
                if (phaseOrderA !== phaseOrderB) return phaseOrderA - phaseOrderB
                return a.ordem - b.ordem
            }) as { id: string; nome: string; ordem: number; fase: string; is_lost?: boolean; is_won?: boolean }[]
        }
    })

    // Find lost stage for the "Mark as Lost" button
    // Verifica tanto a flag is_lost quanto o nome da stage (fallback)
    const lostStage = stages?.find(s =>
        s.is_lost === true ||
        s.nome?.toLowerCase().includes('perdido') ||
        s.nome?.toLowerCase().includes('lost')
    )

    // Derived fields
    const currentStage = stages?.find(s => s.id === card.pipeline_stage_id)
    const currentFase = currentStage?.fase
    const daysInStage = card.stage_entered_at
        ? Math.floor((new Date().getTime() - new Date(card.stage_entered_at).getTime()) / (1000 * 60 * 60 * 24))
        : null

    useEffect(() => {
        // Sync local title state when card data changes (e.g. after save or refetch)
        setEditedTitle(card.titulo || '')
    }, [card.titulo])

    // Fetch active change requests
    const { data: hasActiveChange } = useQuery({
        queryKey: ['tasks', card.id, 'active-change'],
        queryFn: async () => {
            if (!card.id) return false
            const { data } = await supabase
                .from('tarefas')
                .select('id')
                .eq('card_id', card.id)
                .eq('tipo', 'solicitacao_mudanca')
                .eq('concluida', false)
                .maybeSingle()
            return !!data
        },
        enabled: !!card.id
    })

    // Determine Operational Badge
    const getOperationalBadge = () => {
        // 1. High Priority: Active Change Request
        if (hasActiveChange) {
            return (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-50 border border-orange-200 text-orange-700 text-xs font-medium">
                    <RefreshCw className="h-3 w-3" />
                    Mudança ativa
                </div>
            )
        }

        // 2. Task Status Logic
        if (card.proxima_tarefa) {
            const task = card.proxima_tarefa
            if (task.data_vencimento) {
                const today = new Date()
                today.setHours(0, 0, 0, 0)
                const taskDate = new Date(task.data_vencimento)
                taskDate.setHours(0, 0, 0, 0)

                const diffDays = Math.floor((taskDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

                // Overdue
                if (diffDays < 0) {
                    const daysLate = Math.abs(diffDays)
                    return (
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                            <Clock className="h-3 w-3" />
                            Atrasada há {daysLate} dia{daysLate > 1 ? 's' : ''}
                        </div>
                    )
                }

                // Today
                if (diffDays === 0) {
                    return (
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-50 border border-yellow-200 text-yellow-700 text-xs font-medium">
                            <Clock className="h-3 w-3" />
                            Para hoje
                        </div>
                    )
                }

                // Future
                return (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 border border-green-200 text-green-700 text-xs font-medium">
                        <Calendar className="h-3 w-3" />
                        Para daqui a {diffDays} dia{diffDays > 1 ? 's' : ''}
                    </div>
                )
            }
        }

        // 3. Warning: No Next Task
        return (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                <AlertCircle className="h-3 w-3" />
                Sem próxima tarefa
            </div>
        )
    }

    // Fetch pipeline stages


    const getPhaseColor = (phaseName: string | null | undefined) => {
        if (!phaseName) return 'bg-gray-600 text-white'
        const phase = phasesData?.find(p => p.name === phaseName)
        // If we have a phase color (e.g. bg-blue-600), we use it. 
        // If not found, fallback to gray.
        return phase?.color ? `${phase.color} text-white` : 'bg-gray-600 text-white'
    }

    const getPhaseBgColor = (phaseName: string | null | undefined) => {
        if (!phaseName) return 'bg-gray-500'
        const phase = phasesData?.find(p => p.name === phaseName)
        // Extract the color name (e.g. blue-500) from bg-blue-500 if possible, or just return the class
        // The DB stores 'bg-blue-600'.
        return phase?.color || 'bg-gray-500'
    }

    // statusColors moved to StatusSelector component

    const updateOwnerMutation = useMutation({
        mutationFn: async ({ field, userId }: { field: 'dono_atual_id' | 'sdr_owner_id' | 'vendas_owner_id' | 'pos_owner_id', userId: string | null }) => {
            const updateData: Partial<CardBase> = { [field]: userId || null }

            const { error } = await supabase.from('cards')
                .update(updateData)
                .eq('id', card.id)

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['card-detail', card.id] })
            queryClient.invalidateQueries({ queryKey: ['card', card.id] })
            queryClient.invalidateQueries({ queryKey: ['cards'] })
            queryClient.invalidateQueries({ queryKey: ['activity-feed', card.id] })
        },
        onError: (error) => {
            console.error('Failed to update owner:', error)
            alert('Erro ao atualizar responsável: ' + error.message)
        }
    })

    const updateTitleMutation = useMutation({
        mutationFn: async (newTitle: string) => {
            const { error } = await supabase.from('cards')
                .update({ titulo: newTitle })
                .eq('id', card.id)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['card-detail', card.id] })
            queryClient.invalidateQueries({ queryKey: ['card', card.id] })
            queryClient.invalidateQueries({ queryKey: ['cards'] })
            queryClient.invalidateQueries({ queryKey: ['activity-feed', card.id] })
            setIsEditingTitle(false)
        }
    })

    const updateStageMutation = useMutation({
        mutationFn: async (stageId: string) => {
            const { error } = await supabase.from('cards')
                .update({ pipeline_stage_id: stageId })
                .eq('id', card.id)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['card-detail', card.id] })
            queryClient.invalidateQueries({ queryKey: ['card', card.id] })
            queryClient.invalidateQueries({ queryKey: ['cards'] })
            queryClient.invalidateQueries({ queryKey: ['activity-feed', card.id] })
            setShowStageDropdown(false)
        }
    })

    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- stageFase mantido na assinatura pois caller passa 3 args
    const handleStageSelect = async (stageId: string, stageName: string, _stageFase: string) => {
        if (isValidatingStage) return
        setIsValidatingStage(true)

        try {
        // 1. Validate Move (async - checks fields, proposals, tasks, rules)
        const validation = await validateMove(card, stageId)

        // Check for Lost Reason Rule
        if (validation.missingRules?.some(r => r.key === 'lost_reason_required')) {
            setPendingLossMove({ stageId, stageName })
            setLossReasonModalOpen(true)
            setShowStageDropdown(false)
            return
        }

        if (!validation.valid) {
            setPendingStageChange({
                stageId,
                targetStageName: stageName,
                missingFields: validation.missingFields,
                missingProposals: validation.missingProposals,
                missingTasks: validation.missingTasks,
                missingDocuments: validation.missingDocuments
            })
            setQualityGateModalOpen(true)
            setShowStageDropdown(false)
            return
        }

        // 2. Check Owner Change (qualquer stage com target_phase_id)
        const targetStageData = stages?.find(s => s.id === stageId)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- target_phase_id pendente de regeneracao de types
        const targetPhaseId = (targetStageData as any)?.target_phase_id as string | null
        if (targetPhaseId) {
            const targetPhase = phasesData?.find(p => p.id === targetPhaseId)
            setPendingStageChange({
                stageId,
                targetStageName: stageName,
                currentOwnerId: card.dono_atual_id || undefined,
                sdrName: card.sdr_owner_id ? 'SDR Atual' : undefined,
                targetPhaseId,
                targetPhaseName: targetPhase?.name || 'Nova Fase'
            })
            setStageChangeModalOpen(true)
            setShowStageDropdown(false)
            return
        }

        // 3. Proceed if valid
        updateStageMutation.mutate(stageId)
        } finally {
            setIsValidatingStage(false)
        }
    }

    const updateStatusMutation = useMutation({
        mutationFn: async (vars: { status: string, motivoId?: string, comentario?: string }) => {
            const updateData: Partial<CardBase> = { status_comercial: vars.status }

            if (vars.status === 'ganho') {
                updateData.taxa_data_status = new Date().toISOString()
            } else if (vars.status === 'perdido') {
                updateData.motivo_perda_id = vars.motivoId
                updateData.motivo_perda_comentario = vars.comentario
            }

            const { error } = await supabase.from('cards')
                .update(updateData)
                .eq('id', card.id)

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['card-detail', card.id] })
            queryClient.invalidateQueries({ queryKey: ['card', card.id] })
            queryClient.invalidateQueries({ queryKey: ['cards'] }) // Refresh lists/analytics
            setLossReasonModalOpen(false)
        },
        onError: (error) => {
            console.error('Failed to update status:', error)
            alert('Erro ao atualizar status: ' + error.message)
        }
    })

    const handleStatusSelect = (newStatus: string) => {
        if (newStatus === 'perdido') {
            setLossReasonModalOpen(true)
        } else {
            updateStatusMutation.mutate({ status: newStatus })
        }
    }

    const handleLossConfirm = async (motivoId: string, comentario: string, futureOpportunity?: FutureOpportunityData) => {
        // Check if we're just editing the loss reason (card already in perdido)
        const isJustEditingReason = card.status_comercial === 'perdido' &&
            pendingLossMove?.stageId === card.pipeline_stage_id

        if (isJustEditingReason) {
            // Just update the loss reason fields directly
            const { error } = await supabase
                .from('cards')
                .update({
                    motivo_perda_id: motivoId || null,
                    motivo_perda_comentario: comentario || null
                })
                .eq('id', card.id)

            if (error) {
                console.error('Failed to update loss reason:', error)
                alert('Erro ao atualizar motivo: ' + error.message)
            } else {
                queryClient.invalidateQueries({ queryKey: ['card-detail', card.id] })
                queryClient.invalidateQueries({ queryKey: ['card', card.id] })
                queryClient.invalidateQueries({ queryKey: ['cards'] })
                queryClient.invalidateQueries({ queryKey: ['loss-reason', motivoId] })
            }

            setPendingLossMove(null)
            setLossReasonModalOpen(false)
        } else if (pendingLossMove) {
            // Move to lost stage via RPC (trigger will set status_comercial='perdido')
            const { error } = await supabase.rpc('mover_card', {
                p_card_id: card.id,
                p_nova_etapa_id: pendingLossMove.stageId,
                p_motivo_perda_id: motivoId || undefined,
                p_motivo_perda_comentario: comentario || undefined
            })

            if (error) {
                console.error('Failed to move card to lost stage:', error)
                alert('Erro ao mover card: ' + error.message)
            } else {
                queryClient.invalidateQueries({ queryKey: ['card-detail', card.id] })
                queryClient.invalidateQueries({ queryKey: ['card', card.id] })
                queryClient.invalidateQueries({ queryKey: ['cards'] })
            }

            // Create future opportunity if scheduled
            if (futureOpportunity) {
                try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabela pendente de regeneração de types
                    await (supabase as any).from('future_opportunities').insert({
                        source_card_id: card.id,
                        source_type: 'lost_future',
                        titulo: futureOpportunity.titulo,
                        scheduled_date: futureOpportunity.scheduledDate,
                        descricao: comentario || null,
                        produto: card.produto,
                        pipeline_id: card.pipeline_id,
                        responsavel_id: card.dono_atual_id,
                        pessoa_principal_id: card.pessoa_principal_id,
                    } as Record<string, unknown>)
                    queryClient.invalidateQueries({ queryKey: ['future-opportunities', card.id] })
                } catch (err) {
                    console.error('Erro ao agendar oportunidade futura:', err)
                }
            }

            setPendingLossMove(null)
            setLossReasonModalOpen(false)
        } else {
            // Fallback: just update status (legacy behavior)
            updateStatusMutation.mutate({ status: 'perdido', motivoId, comentario })
        }
    }

    const handleMarkAsLost = () => {
        if (lostStage) {
            setPendingLossMove({ stageId: lostStage.id, stageName: lostStage.nome })
            setLossReasonModalOpen(true)
        }
    }

    const handleConfirmQualityGate = () => {
        if (pendingStageChange) {
            setQualityGateModalOpen(false)

            // Check owner change after quality gate
            const targetStage = stages?.find(s => s.id === pendingStageChange.stageId)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- target_phase_id pendente de regeneracao de types
            const phaseId = (targetStage as any)?.target_phase_id as string | null

            if (phaseId) {
                const targetPhase = phasesData?.find(p => p.id === phaseId)
                setPendingStageChange(prev => prev ? {
                    ...prev,
                    targetPhaseId: phaseId,
                    targetPhaseName: targetPhase?.name || 'Nova Fase'
                } : null)
                setStageChangeModalOpen(true)
            } else {
                updateStageMutation.mutate(pendingStageChange.stageId)
                setPendingStageChange(null)
            }
        }
    }

    const handleConfirmStageChange = (newOwnerId: string) => {
        if (pendingStageChange) {
            updateOwnerMutation.mutate({ field: 'dono_atual_id', userId: newOwnerId })
            updateStageMutation.mutate(pendingStageChange.stageId)
            setStageChangeModalOpen(false)
            setPendingStageChange(null)
        }
    }



    const handleSdrSelect = (userId: string | null) => {
        updateOwnerMutation.mutate({ field: 'sdr_owner_id', userId })

        // If current stage is SDR, update current owner too
        const currentPhase = phasesData?.find(p => p.name === currentFase)
        if (currentPhase?.slug === SystemPhase.SDR) {
            updateOwnerMutation.mutate({ field: 'dono_atual_id', userId })
        }
    }

    const handlePlannerSelect = (userId: string | null) => {
        updateOwnerMutation.mutate({ field: 'vendas_owner_id', userId })

        // If current stage is Planner (Vendas), update current owner too
        const currentPhase = phasesData?.find(p => p.name === currentFase)
        if (currentPhase?.slug === SystemPhase.PLANNER) {
            updateOwnerMutation.mutate({ field: 'dono_atual_id', userId })
        }
    }

    const handlePosVendaSelect = (userId: string | null) => {
        updateOwnerMutation.mutate({ field: 'pos_owner_id', userId })

        // If current stage is Pós-Venda, update current owner too
        const currentPhase = phasesData?.find(p => p.name === currentFase)
        if (currentPhase?.slug === SystemPhase.POS_VENDA) {
            updateOwnerMutation.mutate({ field: 'dono_atual_id', userId })
        }
    }

    const handleAssistentePlannerSelect = (userId: string | null) => {
        if (assistentePlanner) {
            // Chain: remove first, then add (avoids UNIQUE constraint race)
            removeMember.mutate(assistentePlanner.id, {
                onSuccess: () => {
                    if (userId) addMember.mutate({ profileId: userId, role: 'assistente_planner' })
                }
            })
        } else if (userId) {
            addMember.mutate({ profileId: userId, role: 'assistente_planner' })
        }
    }

    const handleAssistentePosSelect = (userId: string | null) => {
        if (assistentePos) {
            // Chain: remove first, then add (avoids UNIQUE constraint race)
            removeMember.mutate(assistentePos.id, {
                onSuccess: () => {
                    if (userId) addMember.mutate({ profileId: userId, role: 'assistente_pos' })
                }
            })
        } else if (userId) {
            addMember.mutate({ profileId: userId, role: 'assistente_pos' })
        }
    }

    const handleTitleSave = () => {
        if (editedTitle.trim() && editedTitle !== card.titulo) {
            updateTitleMutation.mutate(editedTitle.trim())
        } else {
            setIsEditingTitle(false)
            setEditedTitle(card.titulo || '')
        }
    }

    const handleTitleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleTitleSave()
        }
        if (e.key === 'Escape') {
            setIsEditingTitle(false)
            setEditedTitle(card.titulo || '')
        }
    }

    return (
        <>

            <div className="flex flex-col bg-white border-b border-gray-200 shadow-sm">
                {/* Top Bar: Breadcrumbs & Stage */}
                <div className="px-4 py-1.5 flex items-center justify-between gap-2 border-b border-gray-100">
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                        <button onClick={() => navigate(-1)} className="hover:text-gray-900 flex items-center gap-1 transition-colors">
                            <ArrowLeft className="h-4 w-4" /> Voltar
                        </button>
                        <span className="text-gray-300">/</span>
                        <button
                            onClick={() => navigate('/pipeline')}
                            className="px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium text-xs uppercase tracking-wide transition-colors"
                        >
                            {card.produto}
                        </button>
                    </div>

                    {/* Stage Selector & Time in Stage */}
                    <div className="relative z-20 flex items-center gap-2">
                        {daysInStage !== null && (
                            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-gray-50 border border-gray-200 text-xs font-medium text-gray-500" title="Tempo nesta etapa">
                                <History className="h-3 w-3" />
                                {daysInStage}d
                            </div>
                        )}

                        <div className="relative">
                            <button
                                onClick={() => setShowStageDropdown(!showStageDropdown)}
                                className="group flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-700 text-sm font-medium transition-all border border-gray-200 hover:border-gray-300"
                            >
                                <span className={cn(
                                    "w-2 h-2 rounded-full",
                                    getPhaseBgColor(currentFase)
                                )} />
                                {currentStage?.nome || 'Sem Etapa'}
                                <ChevronDown className="h-4 w-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
                            </button>

                            {showStageDropdown && stages && (
                                <div className="absolute top-full right-0 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-xl py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100 z-30">
                                    <div className="max-h-[300px] overflow-y-auto">
                                        {stages.map((stage) => (
                                            <button
                                                key={stage.id}
                                                onClick={() => handleStageSelect(stage.id, stage.nome, stage.fase)}
                                                className={cn(
                                                    "w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 flex items-center gap-3 transition-colors",
                                                    card.pipeline_stage_id === stage.id && "bg-indigo-50 text-indigo-700 font-medium"
                                                )}
                                            >
                                                <span className={cn(
                                                    "w-2.5 h-2.5 rounded-full shrink-0",
                                                    getPhaseBgColor(stage.fase)
                                                )} />
                                                <span className="truncate">{stage.nome}</span>
                                                {card.pipeline_stage_id === stage.id && (
                                                    <Check className="h-4 w-4 ml-auto shrink-0" />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Main Content: Title & Actions */}
                <div className="px-4 py-1.5 flex flex-col gap-1.5">
                    {/* Row 1: Title */}
                    <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-start gap-3">
                            {isEditingTitle ? (
                                <div className="flex items-center gap-2 flex-1 max-w-2xl">
                                    <input
                                        type="text"
                                        value={editedTitle}
                                        onChange={(e) => setEditedTitle(e.target.value)}
                                        onKeyDown={handleTitleKeyDown}
                                        className="flex-1 text-lg font-bold text-gray-900 tracking-tight border-b-2 border-indigo-500 bg-transparent outline-none px-1 py-0.5"
                                        autoFocus
                                    />
                                    <div className="flex gap-1">
                                        <button onClick={handleTitleSave} className="p-2 bg-green-100 hover:bg-green-200 rounded-lg text-green-700 transition-colors">
                                            <Check className="h-4 w-4" />
                                        </button>
                                        <button
                                            onClick={() => {
                                                setIsEditingTitle(false)
                                                setEditedTitle(card.titulo || '')
                                            }}
                                            className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition-colors"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="group flex items-center gap-3">
                                    <h1
                                        onClick={() => setIsEditingTitle(true)}
                                        className="text-lg font-bold text-gray-900 tracking-tight truncate cursor-pointer hover:text-indigo-900 transition-colors"
                                        title={card.titulo || ''}
                                    >
                                        {card.titulo}
                                    </h1>
                                    <Edit2
                                        onClick={() => setIsEditingTitle(true)}
                                        className="h-4 w-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-all cursor-pointer hover:text-indigo-600"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Metadata Row: Badges | Value | Trip Date */}
                        <div className="flex flex-wrap items-center gap-1.5 text-sm">
                            <span className={cn(
                                "px-2.5 py-0.5 rounded-full font-semibold text-xs uppercase tracking-wide",
                                getPhaseColor(currentFase)
                            )}>
                                {currentFase}
                            </span>

                            {/* Operational Badge */}
                            {getOperationalBadge()}

                            {/* Status Selector */}
                            <StatusSelector
                                currentStatus={card.status_comercial}
                                onSelect={handleStatusSelect}
                            />

                            {/* Marcos do Funil (ganhos por fase) */}
                            {(card.ganho_sdr || card.ganho_planner || card.ganho_pos) && (
                                <div className="flex items-center gap-1" title="Marcos alcançados no funil de vendas">
                                    <span className="text-[10px] text-gray-400 uppercase tracking-wide mr-1">Marcos:</span>
                                    {card.ganho_sdr && (
                                        <span
                                            className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200 text-[10px] font-medium"
                                            title="Qualificado pelo SDR"
                                        >
                                            SDR
                                        </span>
                                    )}
                                    {card.ganho_planner && (
                                        <span
                                            className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 border border-purple-200 text-[10px] font-medium"
                                            title="Venda fechada - viagem confirmada"
                                        >
                                            Planner
                                        </span>
                                    )}
                                    {card.ganho_pos && (
                                        <span
                                            className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200 text-[10px] font-medium"
                                            title="Viagem concluída com sucesso"
                                        >
                                            Pós
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* Origin Badge (editable) */}
                            <OrigemBadgeEditable
                                cardId={card.id}
                                origem={card.origem}
                                origemLead={card.origem_lead}
                                indicadoPorId={card.indicado_por_id}
                            />

                            {/* Mark as Lost Button OR Loss Reason Display */}
                            {card.status_comercial !== 'perdido' && lostStage && (
                                <button
                                    onClick={handleMarkAsLost}
                                    className="px-2 py-0.5 rounded-md border border-red-200 bg-white text-red-600 text-xs font-medium hover:bg-red-50 transition-colors"
                                >
                                    Marcar Perdido
                                </button>
                            )}

                            {/* Loss Reason Display - when card is lost */}
                            {card.status_comercial === 'perdido' && (
                                <LossReasonBadge
                                    motivoId={card.motivo_perda_id}
                                    comentario={card.motivo_perda_comentario}
                                    onClick={() => {
                                        setPendingLossMove({
                                            stageId: card.pipeline_stage_id || '',
                                            stageName: currentStage?.nome || 'Perdido'
                                        })
                                        setLossReasonModalOpen(true)
                                    }}
                                />
                            )}

                            {/* Divider */}
                            <div className="h-3.5 w-px bg-gray-300" />

                            {/* Value - Always show when data exists */}
                            {(() => {
                                // Parse both produto_data and briefing_inicial - priority to produto_data
                                const productData = (typeof card.produto_data === 'string' ? JSON.parse(card.produto_data || '{}') : card.produto_data || {}) as TripsProdutoData
                                const briefingData = (typeof card.briefing_inicial === 'string' ? JSON.parse(card.briefing_inicial || '{}') : card.briefing_inicial || {}) as TripsProdutoData

                                // Merge: produto_data takes priority, fallback to briefing_inicial
                                const mergedData: TripsProdutoData = {
                                    ...briefingData,
                                    ...productData,
                                    // For nested objects, merge them too
                                    orcamento: productData?.orcamento || briefingData?.orcamento,
                                    epoca_viagem: productData?.epoca_viagem || briefingData?.epoca_viagem
                                }

                                // Check for TRIPS (including null/undefined which defaults to TRIPS behavior)
                                if (card.produto === 'TRIPS' || !card.produto) {
                                    const orcamento = mergedData?.orcamento

                                    // Tentar múltiplas fontes de valor (nova e antiga estrutura)
                                    const valorDisplay =
                                        orcamento?.display ||                    // Novo: display pré-formatado
                                        orcamento?.total_calculado ||            // Novo: total calculado
                                        orcamento?.total ||                       // Antigo: total direto
                                        (orcamento?.tipo === 'total' && orcamento?.valor) ||  // Novo: valor quando tipo=total
                                        null

                                    if (valorDisplay) {
                                        // Se já é string formatada (display), usar diretamente
                                        if (typeof valorDisplay === 'string') {
                                            return (
                                                <div className="flex items-center gap-1.5 text-gray-600 font-medium">
                                                    <DollarSign className="h-3 w-3 text-gray-400" />
                                                    {valorDisplay}
                                                </div>
                                            )
                                        }
                                        // Se é número, formatar
                                        return (
                                            <div className="flex items-center gap-1.5 text-gray-600 font-medium">
                                                <DollarSign className="h-3 w-3 text-gray-400" />
                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorDisplay)}
                                            </div>
                                        )
                                    }
                                    return null
                                }

                                if (card.valor_estimado || card.valor_final) {
                                    return (
                                        <div className="flex items-center gap-1.5 text-gray-600 font-medium">
                                            <DollarSign className="h-3 w-3 text-gray-400" />
                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                                                (card.status_comercial === 'ganho' || card.status_comercial === 'perdido')
                                                    ? (card.valor_final || card.valor_estimado || 0)
                                                    : (card.valor_estimado || 0)
                                            )}
                                        </div>
                                    )
                                }
                                return null
                            })()}

                            {/* Receita - Visível para todos */}
                            {card.receita != null && (
                                <>
                                    <div className="h-3.5 w-px bg-gray-300" />
                                    <div
                                        className="flex items-center gap-1.5 text-amber-700 font-medium"
                                        title="Receita/Margem da viagem"
                                    >
                                        <TrendingUp className="h-3 w-3 text-amber-500" />
                                        {new Intl.NumberFormat('pt-BR', {
                                            style: 'currency',
                                            currency: 'BRL'
                                        }).format(card.receita)}
                                        {card.receita_source === 'calculated' && (
                                            <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200">
                                                Auto
                                            </span>
                                        )}
                                    </div>
                                </>
                            )}

                            {/* Trip Date - Always show when data exists */}
                            {(() => {
                                let tripDate: Date | null = null

                                // Check for TRIPS (including null/undefined which defaults to TRIPS behavior)
                                if (card.produto === 'TRIPS' || !card.produto) {
                                    // Parse both produto_data and briefing_inicial - priority to produto_data
                                    const productData = (typeof card.produto_data === 'string' ? JSON.parse(card.produto_data || '{}') : card.produto_data || {}) as TripsProdutoData
                                    const briefingData = (typeof card.briefing_inicial === 'string' ? JSON.parse(card.briefing_inicial || '{}') : card.briefing_inicial || {}) as TripsProdutoData

                                    // Merge: produto_data.epoca_viagem takes priority, fallback to briefing_inicial
                                    const epocaViagem = productData?.epoca_viagem || briefingData?.epoca_viagem

                                    // Se tem display pré-formatado (nova estrutura), usar diretamente
                                    if (epocaViagem?.display) {
                                        return (
                                            <>
                                                <div className="h-3.5 w-px bg-gray-300" />
                                                <div className="flex items-center gap-1.5 text-gray-600 font-medium">
                                                    <Calendar className="h-3.5 w-3.5 text-gray-400" />
                                                    {epocaViagem.display}
                                                </div>
                                                {epocaViagem.flexivel && (
                                                    <span className="text-xs text-amber-600 px-1.5 py-0.5 bg-amber-50 rounded">📌 Flexível</span>
                                                )}
                                            </>
                                        )
                                    }

                                    // Tentar múltiplas fontes de data (nova e antiga estrutura)
                                    const dataStr =
                                        epocaViagem?.data_inicio ||      // Novo: flexible_date
                                        epocaViagem?.inicio ||           // Antigo: date_range
                                        null

                                    if (dataStr) {
                                        // Preferir coluna sincronizada se disponível
                                        if (card.data_viagem_inicio) {
                                            tripDate = new Date(card.data_viagem_inicio + 'T12:00:00')
                                        } else {
                                            tripDate = new Date(dataStr + 'T12:00:00')
                                        }
                                    }
                                } else if (card.data_viagem_inicio) {
                                    tripDate = new Date(card.data_viagem_inicio + 'T12:00:00')
                                }

                                if (tripDate && !isNaN(tripDate.getTime())) {
                                    const daysToTrip = Math.floor((tripDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                                    return (
                                        <>
                                            <div className="h-3.5 w-px bg-gray-300" />
                                            <div className="flex items-center gap-1.5 text-gray-600 font-medium">
                                                <Calendar className="h-3.5 w-3.5 text-gray-400" />
                                                {tripDate.getDate()} de {tripDate.toLocaleString('pt-BR', { month: 'short' })}
                                                <span className="text-gray-400 ml-0.5">'{tripDate.getFullYear().toString().slice(2)}</span>
                                            </div>
                                            {daysToTrip >= 0 && (
                                                <div className={cn(
                                                    "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                                                    daysToTrip < 14 ? "bg-red-50 text-red-700 border border-red-200" :
                                                        daysToTrip < 30 ? "bg-orange-50 text-orange-700 border border-orange-200" :
                                                            "bg-blue-50 text-blue-700 border border-blue-200"
                                                )}>
                                                    ✈️ {daysToTrip}d
                                                </div>
                                            )}
                                        </>
                                    )
                                }
                                return null
                            })()}

                            {/* Extra Dynamic Header Fields from config */}
                            {headerFields.filter(f => !['orcamento', 'valor_estimado', 'epoca_viagem', 'data_viagem_inicio'].includes(f.key)).map(field => {
                                let value = card[field.key as keyof Card]

                                if (card.produto === 'TRIPS' && !value) {
                                    const productData = (typeof card.produto_data === 'string' ? JSON.parse(card.produto_data) : card.produto_data) as Record<string, unknown> | null
                                    value = productData?.[field.key] as typeof value
                                }

                                if (!value) return null

                                let displayValue: string
                                if (Array.isArray(value)) displayValue = value.join(', ')
                                else if (typeof value === 'boolean') displayValue = value ? 'Sim' : 'Não'
                                else displayValue = String(value)

                                return (
                                    <div key={field.key} className="flex items-center gap-2">
                                        <div className="h-3.5 w-px bg-gray-300" />
                                        <div className="flex items-center gap-1.5 text-gray-600 font-medium" title={field.label}>
                                            <span className="text-gray-400 text-xs uppercase font-bold">{field.label}:</span>
                                            {displayValue}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* Row 2: Owners & Actions */}
                    <div className="flex items-center justify-between gap-3 pt-1 border-t border-gray-100">
                        {/* Phase columns — compact horizontal */}
                        <div className="flex items-center gap-4 flex-wrap">
                            {/* SDR */}
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-none">SDR</span>
                                <OwnerSelector
                                    value={card.sdr_owner_id}
                                    onChange={(id) => handleSdrSelect(id)}
                                    phaseSlug="sdr"
                                    compact
                                    showNoSdrOption
                                />
                            </div>

                            <div className="h-4 w-px bg-gray-200" />

                            {/* Planner + Assistente */}
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-none">Planner</span>
                                <OwnerSelector
                                    value={card.vendas_owner_id}
                                    onChange={(id) => handlePlannerSelect(id)}
                                    phaseSlug="planner"
                                    compact
                                    showNoSdrOption
                                />
                                <span className="text-[10px] font-medium text-slate-300 leading-none">Assist.</span>
                                <OwnerSelector
                                    value={assistentePlanner?.profile_id || null}
                                    onChange={(id) => handleAssistentePlannerSelect(id)}
                                    phaseSlug="planner"
                                    roleId={assistenteRoleId || undefined}
                                    compact
                                    showNoSdrOption
                                />
                            </div>

                            <div className="h-4 w-px bg-gray-200" />

                            {/* Pós-Venda + Assistente */}
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-none">Pós</span>
                                <OwnerSelector
                                    value={card.pos_owner_id}
                                    onChange={(id) => handlePosVendaSelect(id)}
                                    phaseSlug="pos_venda"
                                    compact
                                    showNoSdrOption
                                />
                                <span className="text-[10px] font-medium text-slate-300 leading-none">Assist.</span>
                                <OwnerSelector
                                    value={assistentePos?.profile_id || null}
                                    onChange={(id) => handleAssistentePosSelect(id)}
                                    phaseSlug="pos_venda"
                                    roleId={assistenteRoleId || undefined}
                                    compact
                                    showNoSdrOption
                                />
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                            {missingBlocking.length > 0 && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setQualityGateModalOpen(true)}
                                    className="gap-1.5 text-red-600 border-red-200 bg-red-50"
                                >
                                    <AlertCircle className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">{missingBlocking.length}</span> Pendências
                                </Button>
                            )}
                            <ActionButtons card={card} />
                        </div>
                    </div>
                </div>
            </div>


            {/* Close dropdown when clicking outside */}
            {showStageDropdown && (
                <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowStageDropdown(false)}
                />
            )}

            <OwnerHistoryModal
                cardId={card.id!}
                isOpen={showOwnerHistory}
                onClose={() => setShowOwnerHistory(false)}
            />

            <QualityGateModal
                isOpen={qualityGateModalOpen}
                onClose={() => setQualityGateModalOpen(false)}
                missingFields={pendingStageChange?.missingFields || []}
                missingProposals={pendingStageChange?.missingProposals || []}
                missingTasks={pendingStageChange?.missingTasks || []}
                missingDocuments={pendingStageChange?.missingDocuments || []}
                onConfirm={handleConfirmQualityGate}
                targetStageName={pendingStageChange?.targetStageName || ''}
                cardId={card.id!}
            />

            <StageChangeModal
                isOpen={stageChangeModalOpen}
                onClose={() => setStageChangeModalOpen(false)}
                onConfirm={handleConfirmStageChange}
                targetStageName={pendingStageChange?.targetStageName || ''}
                currentOwnerId={pendingStageChange?.currentOwnerId || null}
                sdrName={pendingStageChange?.sdrName}
                targetPhaseId={pendingStageChange?.targetPhaseId}
                targetPhaseName={pendingStageChange?.targetPhaseName}
            />

            <LossReasonModal
                isOpen={lossReasonModalOpen}
                onClose={() => {
                    setLossReasonModalOpen(false)
                    setPendingLossMove(null)
                }}
                onConfirm={handleLossConfirm}
                targetStageId={pendingLossMove?.stageId || card.pipeline_stage_id || ''}
                targetStageName={pendingLossMove?.stageName || 'Perdido'}
                initialMotivoId={card.motivo_perda_id}
                initialComentario={card.motivo_perda_comentario}
                isEditing={card.status_comercial === 'perdido'}
                cardTitle={card.titulo || undefined}
            />
        </>
    )
}

function LossReasonBadge({ motivoId, comentario, onClick }: { motivoId?: string | null, comentario?: string | null, onClick?: () => void }) {
    const { data: motivo } = useQuery({
        queryKey: ['loss-reason', motivoId],
        queryFn: async () => {
            if (!motivoId) return null
            const { data, error } = await supabase
                .from('motivos_perda')
                .select('nome')
                .eq('id', motivoId)
                .single()
            if (error) return null
            return data
        },
        enabled: !!motivoId,
        staleTime: 1000 * 60 * 60 // 1 hour cache
    })

    const baseClasses = "flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-red-50 border border-red-200 text-red-700 text-xs font-medium transition-all"
    const clickableClasses = onClick ? "cursor-pointer hover:bg-red-100 hover:border-red-300 hover:shadow-sm" : ""

    if (!motivoId && !comentario) {
        return (
            <button
                onClick={onClick}
                className={`${baseClasses} ${clickableClasses}`}
                title="Clique para informar o motivo da perda"
            >
                <AlertCircle className="h-3 w-3" />
                <span>Sem motivo informado</span>
                {onClick && <Pencil className="h-3 w-3 ml-0.5 opacity-60" />}
            </button>
        )
    }

    const displayText = motivo?.nome || comentario
    const tooltipText = comentario && motivo?.nome ? `Comentário: ${comentario}` : (comentario || 'Clique para editar')

    return (
        <button
            onClick={onClick}
            className={`${baseClasses} ${clickableClasses} max-w-[200px]`}
            title={tooltipText}
        >
            <AlertCircle className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{displayText}</span>
            {onClick && <Pencil className="h-3 w-3 ml-0.5 opacity-60 flex-shrink-0" />}
        </button>
    )
}

function StatusSelector({ currentStatus, onSelect }: { currentStatus: string | null, onSelect: (status: string) => void }) {
    const [isOpen, setIsOpen] = useState(false)
    // Note: 'perdido' removed - use "Marcar como Perdido" button instead (moves to lost stage)
    const statusOptions = [
        { value: 'aberto', label: 'Em Aberto', color: 'bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-200' },
        { value: 'pausado', label: 'Pausado', color: 'bg-gray-100 text-gray-800 border-gray-300 hover:bg-gray-200' }
    ]

    const statusColors: Record<string, string> = {
        'aberto': 'bg-yellow-100 text-yellow-800 border-yellow-200',
        'ganho': 'bg-green-100 text-green-800 border-green-200',
        'perdido': 'bg-red-100 text-red-800 border-red-200',
        'pausado': 'bg-gray-100 text-gray-800 border-gray-300'
    }

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "px-2.5 py-0.5 rounded-md border text-xs font-medium uppercase tracking-wide flex items-center gap-1 hover:brightness-95 transition-all",
                    statusColors[currentStatus?.toLowerCase() as keyof typeof statusColors] || statusColors['aberto']
                )}
            >
                {currentStatus?.replace('_', ' ') || 'Em Aberto'}
                <ChevronDown className="h-3 w-3 opacity-50" />
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
                    <div className="absolute top-full left-0 mt-1 w-32 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                        {statusOptions.map((option) => (
                            <button
                                key={option.value}
                                onClick={() => {
                                    onSelect(option.value)
                                    setIsOpen(false)
                                }}
                                className={cn(
                                    "w-full px-3 py-2 text-left text-xs font-medium uppercase tracking-wide transition-colors flex items-center justify-between",
                                    option.value === currentStatus ? "bg-gray-50" : "hover:bg-gray-50",
                                    option.color.split(' ').filter(c => c.startsWith('text-')).join(' ') // Keep text color
                                )}
                            >
                                {option.label}
                                {option.value === currentStatus && <Check className="h-3 w-3" />}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    )
}
