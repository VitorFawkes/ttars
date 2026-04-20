import { useMemo, useState, createElement } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/Button'
import {
    AlertTriangle, ExternalLink, FileText, FileCheck, CheckCircle2,
    LayoutList, ShieldAlert, AlertCircle, UserCheck, Search, User,
    Check, X, Loader2, ArrowRight,
    type LucideIcon
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { toast } from 'sonner'
import { cn } from '../../lib/utils'
import type { MissingRequirement } from '../../hooks/useQualityGate'

interface QualityGateModalProps {
    isOpen: boolean
    onClose: () => void
    /**
     * Chamado quando todos os requisitos foram satisfeitos — em card-detail/kanban isso
     * dispara a mudança de etapa. Recebe opcionalmente o mapa de roles → userId que
     * acabaram de ser atribuídos; o handler do pai pode usar para pular o modal de
     * definição de responsável quando o role do destino já foi escolhido aqui.
     */
    onConfirm: (autoAssignments?: Record<string, string>) => void
    cardId: string
    targetStageName: string
    missingRequirements: MissingRequirement[]
    initialData?: Record<string, unknown>
    context?: 'kanban' | 'card-detail'
}

interface TypeConfig {
    title: string
    icon: LucideIcon
    bg: string
    border: string
    text: string
    dot: string
    titleColor: string
}

const TYPE_CONFIG: Record<string, TypeConfig> = {
    field:        { title: 'Campos Obrigatórios',       icon: LayoutList,    bg: 'bg-blue-50',    border: 'border-blue-100',    text: 'text-blue-800',    dot: 'bg-blue-500',    titleColor: 'text-blue-700' },
    proposal:     { title: 'Propostas Obrigatórias',    icon: FileText,      bg: 'bg-emerald-50', border: 'border-emerald-100', text: 'text-emerald-800', dot: 'bg-emerald-500', titleColor: 'text-emerald-700' },
    task:         { title: 'Tarefas Obrigatórias',      icon: CheckCircle2,  bg: 'bg-purple-50',  border: 'border-purple-100',  text: 'text-purple-800',  dot: 'bg-purple-500',  titleColor: 'text-purple-700' },
    document:     { title: 'Documentos Pendentes',      icon: FileCheck,     bg: 'bg-teal-50',    border: 'border-teal-100',    text: 'text-teal-800',    dot: 'bg-teal-500',    titleColor: 'text-teal-700' },
    rule:         { title: 'Requisitos Obrigatórios',   icon: ShieldAlert,   bg: 'bg-amber-50',   border: 'border-amber-100',   text: 'text-amber-800',   dot: 'bg-amber-500',   titleColor: 'text-amber-700' },
    team_member:  { title: 'Responsáveis Pendentes',    icon: UserCheck,     bg: 'bg-indigo-50',  border: 'border-indigo-100',  text: 'text-indigo-800',  dot: 'bg-indigo-500',  titleColor: 'text-indigo-700' },
}

const FALLBACK_CONFIG: TypeConfig = {
    title: 'Outros Requisitos', icon: AlertCircle,
    bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-800',
    dot: 'bg-gray-500', titleColor: 'text-gray-700',
}

const TEAM_ROLE_TO_OWNER_COLUMN: Record<string, string> = {
    sdr: 'sdr_owner_id',
    planner: 'vendas_owner_id',
    pos_venda: 'pos_owner_id',
    concierge: 'concierge_owner_id',
}

const TEAM_ROLE_LABEL: Record<string, string> = {
    sdr: 'SDR',
    planner: 'Planner',
    pos_venda: 'Pós-Venda',
    concierge: 'Concierge',
}

// Regras de sistema (rule.field_key) → seção no card
const RULE_TO_SECTION: Record<string, string> = {
    contato_principal_required: 'people',
    contato_principal_completo: 'people',
    contato_principal_basico: 'people',
}

// Tipo de requisito sem field_key → seção padrão
const TYPE_TO_SECTION: Record<string, string> = {
    proposal: 'proposta',
    task: 'agenda_tarefas',
    document: 'anexos',
}

function scrollAndHighlight(sectionKey: string): boolean {
    // Tenta match exato primeiro; se não achar, tenta variantes expandidas por fase
    // (ex: trip_info → trip_info:sdr, trip_info:planner — DynamicSectionsList as divide).
    // Quando há várias variantes visíveis, prefere a que está mais próxima da
    // viewport pra não rolar pra uma seção colapsada no fim da página.
    const exact = document.querySelector(`[data-section="${sectionKey}"]`) as HTMLElement | null
    let el: HTMLElement | null = exact
    if (!el) {
        const candidates = Array.from(document.querySelectorAll(`[data-section^="${sectionKey}:"]`)) as HTMLElement[]
        if (candidates.length > 0) {
            // Prefere o primeiro visível acima da dobra, senão o primeiro
            const visibleInViewport = candidates.find(c => {
                const r = c.getBoundingClientRect()
                return r.top >= 0 && r.top < window.innerHeight
            })
            el = visibleInViewport || candidates[0]
        }
    }
    if (!el) return false
    // Se a seção está collapsed (único filho é um button), expandir antes de rolar
    const isCollapsed = el.children.length === 1 && el.children[0].tagName === 'BUTTON'
    if (isCollapsed) (el.children[0] as HTMLElement).click()
    setTimeout(() => {
        el!.scrollIntoView({ behavior: 'smooth', block: 'start' })
        el!.classList.add('ring-2', 'ring-indigo-400', 'ring-offset-2', 'rounded-xl', 'transition-all')
        setTimeout(() => {
            el!.classList.remove('ring-2', 'ring-indigo-400', 'ring-offset-2')
        }, 2200)
    }, isCollapsed ? 120 : 50)
    return true
}

interface EligibleUser {
    id: string
    nome: string | null
    email: string | null
    is_admin: boolean | null
    phaseSlugs: string[]
}

function useEligibleUsers(phaseSlug: string, enabled: boolean) {
    return useQuery<EligibleUser[]>({
        queryKey: ['quality-gate-eligible-owners', phaseSlug],
        enabled,
        queryFn: async () => {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, nome, email, is_admin')
                .eq('active', true)
                .order('nome')

            const ids = (profiles || []).map(p => p.id)
            const membership: Record<string, Set<string>> = {}
            if (ids.length > 0) {
                const { data: tms } = await supabase
                    .from('team_members')
                    .select('user_id, team:teams!inner(phase:pipeline_phases(slug))')
                    .in('user_id', ids)
                for (const row of tms || []) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- relacionamento aninhado não tipado
                    const slug: string | null = (row as any).team?.phase?.slug ?? null
                    if (slug) {
                        const userId = row.user_id as string
                        if (!membership[userId]) membership[userId] = new Set()
                        membership[userId].add(slug)
                    }
                }
            }

            return (profiles || []).map(p => ({
                id: p.id,
                nome: p.nome,
                email: p.email,
                is_admin: p.is_admin,
                phaseSlugs: Array.from(membership[p.id] || []),
            }))
        }
    })
}

interface InlineUserPickerProps {
    phaseSlug: string
    selectedUserId: string | null
    onPick: (user: EligibleUser) => void
}

function InlineUserPicker({ phaseSlug, selectedUserId, onPick }: InlineUserPickerProps) {
    const [search, setSearch] = useState('')
    const { data: users = [], isLoading } = useEligibleUsers(phaseSlug, true)

    const eligible = useMemo(() => {
        const hasAnyForPhase = users.some(u => u.phaseSlugs.includes(phaseSlug))
        const base = users.filter(u => {
            if (u.is_admin) return true
            if (!hasAnyForPhase) return true
            return u.phaseSlugs.includes(phaseSlug)
        })
        if (!search.trim()) return base
        const q = search.toLowerCase()
        return base.filter(u => (u.nome || u.email || '').toLowerCase().includes(q))
    }, [users, phaseSlug, search])

    return (
        <div className="mt-2 bg-white border border-indigo-200 rounded-lg overflow-hidden">
            <div className="relative border-b border-slate-100 bg-white">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por nome…"
                    className="w-full h-9 pl-9 pr-3 text-sm bg-transparent focus:outline-none text-slate-900 placeholder:text-slate-400"
                />
            </div>
            <div className="max-h-48 overflow-y-auto">
                {isLoading ? (
                    <div className="py-6 text-center text-xs text-slate-400">Carregando…</div>
                ) : eligible.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400">
                        {search ? 'Nenhum usuário encontrado' : 'Nenhum usuário disponível'}
                    </div>
                ) : (
                    eligible.map(u => {
                        const isSelected = u.id === selectedUserId
                        return (
                            <button
                                key={u.id}
                                type="button"
                                onClick={() => onPick(u)}
                                className={cn(
                                    'w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors border-b border-slate-50 last:border-b-0',
                                    isSelected ? 'bg-indigo-100' : 'hover:bg-indigo-50'
                                )}
                            >
                                <div className={cn(
                                    'h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0',
                                    isSelected ? 'bg-indigo-600' : 'bg-indigo-100'
                                )}>
                                    {isSelected
                                        ? <Check className="h-3.5 w-3.5 text-white" />
                                        : <User className="h-3.5 w-3.5 text-indigo-600" />
                                    }
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className={cn(
                                        'text-sm font-medium truncate',
                                        isSelected ? 'text-indigo-900' : 'text-slate-900'
                                    )}>
                                        {u.nome || u.email || '(sem nome)'}
                                    </div>
                                    {u.nome && u.email && (
                                        <div className="text-xs text-slate-500 truncate">{u.email}</div>
                                    )}
                                </div>
                            </button>
                        )
                    })
                )}
            </div>
        </div>
    )
}

interface PendingSelection {
    userId: string
    userName: string | null
}

export default function QualityGateModal({
    isOpen,
    onClose,
    onConfirm,
    cardId,
    targetStageName,
    missingRequirements,
    context = 'kanban',
}: QualityGateModalProps) {
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const [expandedRole, setExpandedRole] = useState<string | null>(null)
    const [pending, setPending] = useState<Record<string, PendingSelection>>({})
    // Atribuições confirmadas dentro deste modal (role → userId). Usado para:
    // 1) esconder o requisito da lista depois de salvo
    // 2) repassar pro onConfirm pra evitar 2º modal redundante
    const [savedAssignments, setSavedAssignments] = useState<Record<string, string>>({})

    const handleOpenCard = () => {
        onClose()
        navigate(`/cards/${cardId}`)
    }

    // Carrega o mapa field_key → section 1x (reaproveita cache entre abertas do modal)
    const { data: fieldToSection } = useQuery<Record<string, string>>({
        queryKey: ['quality-gate-field-sections'],
        enabled: isOpen && context === 'card-detail',
        staleTime: 1000 * 60 * 10,
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- system_fields não está nos types gerados
            const { data } = await (supabase.from('system_fields') as any)
                .select('key, section')
            const map: Record<string, string> = {}
            for (const row of (data as Array<{ key: string; section: string | null }> | null) || []) {
                if (row.key && row.section) map[row.key] = row.section
            }
            return map
        }
    })

    const resolveSection = (req: MissingRequirement): string | null => {
        if (req.type === 'team_member') return null // team_member tem fluxo próprio
        if (req.type === 'field' && req.field_key) {
            return fieldToSection?.[req.field_key] || null
        }
        if (req.type === 'rule' && req.field_key) {
            return RULE_TO_SECTION[req.field_key] || null
        }
        return TYPE_TO_SECTION[req.type] || null
    }

    const canNavigate = context === 'card-detail'

    const handleRowClick = (req: MissingRequirement) => {
        if (!canNavigate) return
        const section = resolveSection(req)
        if (!section) return
        onClose()
        // pequeno delay pro modal desmontar antes do scroll
        setTimeout(() => {
            const ok = scrollAndHighlight(section)
            if (!ok) toast.error('Não encontrei a seção. Role a página pra localizar.')
        }, 150)
    }

    // Requisitos que ainda bloqueiam considerando o que já foi salvo localmente
    const unresolvedRequirements = useMemo(
        () => missingRequirements.filter(r => {
            if (r.type === 'team_member' && r.required_team_role) {
                return !(r.required_team_role in savedAssignments)
            }
            return true
        }),
        [missingRequirements, savedAssignments]
    )

    const saveAllMutation = useMutation({
        mutationFn: async (entries: Array<{ role: string; userId: string }>) => {
            if (entries.length === 0) return []
            const updates: Record<string, string> = {}
            for (const { role, userId } of entries) {
                const ownerCol = TEAM_ROLE_TO_OWNER_COLUMN[role]
                if (!ownerCol) throw new Error(`Role desconhecida: ${role}`)
                updates[ownerCol] = userId
            }
            const { error } = await supabase.from('cards').update(updates).eq('id', cardId)
            if (error) throw error
            return entries
        },
        onSuccess: (savedEntries) => {
            queryClient.invalidateQueries({ queryKey: ['card-detail', cardId] })
            queryClient.invalidateQueries({ queryKey: ['card', cardId] })
            queryClient.invalidateQueries({ queryKey: ['cards'] })
            queryClient.invalidateQueries({ queryKey: ['card-team-roles', cardId] })
            queryClient.invalidateQueries({ queryKey: ['stage-requirements'] })

            const savedMap: Record<string, string> = {}
            for (const e of savedEntries || []) savedMap[e.role] = e.userId
            const nextAssignments = { ...savedAssignments, ...savedMap }
            setSavedAssignments(nextAssignments)
            setPending({})
            setExpandedRole(null)

            const stillPending = missingRequirements.filter(r => {
                if (r.type === 'team_member' && r.required_team_role) {
                    return !(r.required_team_role in nextAssignments)
                }
                return true
            })

            if (stillPending.length === 0) {
                toast.success('Tudo certo — movendo card…')
                onConfirm(nextAssignments)
                // Se o onConfirm do pai não fechar (ex: abriu via "Pendências" sem mover),
                // fecha manualmente — a pendência foi resolvida, não faz sentido manter aberto
                onClose()
            } else {
                toast.success(savedEntries && savedEntries.length > 1 ? 'Responsáveis salvos' : 'Responsável salvo')
            }
        },
        onError: (error: Error) => {
            toast.error('Erro ao salvar: ' + error.message)
        }
    })

    const pendingEntries = Object.entries(pending).map(([role, sel]) => ({ role, userId: sel.userId }))
    const hasPendingSelections = pendingEntries.length > 0
    const isSaving = saveAllMutation.isPending

    const handlePrimaryAction = () => {
        if (hasPendingSelections) {
            saveAllMutation.mutate(pendingEntries)
        } else {
            onClose()
        }
    }

    const grouped = new Map<string, MissingRequirement[]>()
    for (const req of unresolvedRequirements) {
        const list = grouped.get(req.type) || []
        list.push(req)
        grouped.set(req.type, list)
    }

    const remainingCount = unresolvedRequirements.length

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-amber-600">
                        <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                        <span className="truncate">Requisitos Obrigatórios</span>
                    </DialogTitle>
                </DialogHeader>

                <div className="py-2 space-y-4 overflow-y-auto -mr-2 pr-2">
                    <p className="text-sm text-gray-600">
                        {context === 'card-detail'
                            ? <>A etapa <strong className="text-gray-900">{targetStageName}</strong> exige os seguintes requisitos pendentes:</>
                            : <>Para mover para a etapa <strong className="text-gray-900">{targetStageName}</strong>, é necessário atender os seguintes requisitos:</>
                        }
                    </p>

                    {Array.from(grouped.entries()).map(([type, items]) => {
                        const config = TYPE_CONFIG[type] || FALLBACK_CONFIG

                        return (
                            <div key={type} className={`${config.bg} border ${config.border} rounded-lg p-4`}>
                                <div className={`flex items-center gap-2 mb-2 ${config.titleColor} font-medium text-sm`}>
                                    {createElement(config.icon, { className: 'w-4 h-4' })}
                                    {config.title}
                                </div>
                                <ul className="space-y-2">
                                    {items.map((item, idx) => {
                                        if (item.type === 'team_member' && item.required_team_role) {
                                            const role = item.required_team_role
                                            const isExpanded = expandedRole === role
                                            const pendingSel = pending[role]
                                            const roleLabel = TEAM_ROLE_LABEL[role] || ''

                                            return (
                                                <li key={idx} className="space-y-2">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className={`flex items-center gap-2 text-sm ${config.text} min-w-0 flex-1`}>
                                                            <span className={`w-1.5 h-1.5 ${config.dot} rounded-full flex-shrink-0`} />
                                                            <span className="truncate">{item.label}</span>
                                                        </div>

                                                        {pendingSel ? (
                                                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-white border border-indigo-200 text-xs flex-shrink-0">
                                                                <div className="h-4 w-4 rounded-full bg-indigo-600 flex items-center justify-center">
                                                                    <Check className="h-2.5 w-2.5 text-white" />
                                                                </div>
                                                                <span className="font-medium text-indigo-900 max-w-[140px] truncate">
                                                                    {pendingSel.userName || 'Selecionado'}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    disabled={isSaving}
                                                                    onClick={() => {
                                                                        setPending(prev => {
                                                                            const next = { ...prev }
                                                                            delete next[role]
                                                                            return next
                                                                        })
                                                                    }}
                                                                    className="ml-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-50"
                                                                    title="Desfazer"
                                                                >
                                                                    <X className="h-3 w-3" />
                                                                </button>
                                                            </span>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => setExpandedRole(isExpanded ? null : role)}
                                                                className={cn(
                                                                    'flex-shrink-0 text-xs font-medium px-2.5 py-1 rounded-md border transition-colors',
                                                                    isExpanded
                                                                        ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                                                                        : 'bg-white border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                                                                )}
                                                            >
                                                                {isExpanded ? 'Fechar' : `Escolher ${roleLabel}`}
                                                            </button>
                                                        )}
                                                    </div>

                                                    {isExpanded && !pendingSel && (
                                                        <InlineUserPicker
                                                            phaseSlug={role}
                                                            selectedUserId={null}
                                                            onPick={(u) => {
                                                                setPending(prev => ({
                                                                    ...prev,
                                                                    [role]: { userId: u.id, userName: u.nome || u.email }
                                                                }))
                                                                setExpandedRole(null)
                                                            }}
                                                        />
                                                    )}
                                                </li>
                                            )
                                        }

                                        const section = canNavigate ? resolveSection(item) : null
                                        const isClickable = !!section

                                        if (isClickable) {
                                            return (
                                                <li key={idx}>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRowClick(item)}
                                                        className={cn(
                                                            'group w-full flex items-center gap-2 text-sm rounded-md px-2 py-1 -mx-2 transition-colors text-left',
                                                            config.text,
                                                            'hover:bg-white/60'
                                                        )}
                                                        title="Ir pra seção no card"
                                                    >
                                                        <span className={`w-1.5 h-1.5 ${config.dot} rounded-full flex-shrink-0`} />
                                                        <span className="truncate flex-1">{item.label}</span>
                                                        {item.detail && (
                                                            <span className="text-xs opacity-70 flex-shrink-0">({item.detail})</span>
                                                        )}
                                                        <ArrowRight className="h-3.5 w-3.5 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                                                    </button>
                                                </li>
                                            )
                                        }

                                        return (
                                            <li
                                                key={idx}
                                                className={`flex items-center gap-2 text-sm ${config.text}`}
                                            >
                                                <span className={`w-1.5 h-1.5 ${config.dot} rounded-full flex-shrink-0`} />
                                                <span className="truncate">{item.label}</span>
                                                {item.detail && (
                                                    <span className="text-xs opacity-70 flex-shrink-0">({item.detail})</span>
                                                )}
                                            </li>
                                        )
                                    })}
                                </ul>
                            </div>
                        )
                    })}

                    {context === 'kanban' && remainingCount > 0 && (
                        <p className="text-xs text-gray-500">
                            Você também pode abrir o card para atender outros requisitos.
                        </p>
                    )}
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    {context === 'card-detail' ? (
                        <Button
                            onClick={handlePrimaryAction}
                            disabled={isSaving}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
                        >
                            {isSaving ? (
                                <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Salvando…
                                </>
                            ) : hasPendingSelections ? (
                                <>
                                    <Check className="h-3.5 w-3.5" />
                                    Salvar
                                </>
                            ) : remainingCount === 0 ? (
                                'Fechar'
                            ) : (
                                'Entendi'
                            )}
                        </Button>
                    ) : hasPendingSelections ? (
                        <>
                            <Button variant="outline" onClick={onClose} disabled={isSaving}>
                                Cancelar
                            </Button>
                            <Button
                                onClick={handlePrimaryAction}
                                disabled={isSaving}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
                            >
                                {isSaving ? (
                                    <>
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        Salvando…
                                    </>
                                ) : (
                                    <>
                                        <Check className="h-3.5 w-3.5" />
                                        Salvar
                                    </>
                                )}
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button variant="outline" onClick={onClose}>
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleOpenCard}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
                            >
                                <ExternalLink className="w-4 h-4" />
                                Abrir Card
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
