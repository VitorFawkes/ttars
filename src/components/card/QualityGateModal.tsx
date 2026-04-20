import { useMemo, useState, createElement } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/Button'
import {
    AlertTriangle, ExternalLink, FileText, FileCheck, CheckCircle2,
    LayoutList, ShieldAlert, AlertCircle, UserCheck, Search, User,
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
    onConfirm: () => void
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

// --- Inline user picker (sem dropdown flutuante — lista fica dentro do modal) ---

interface InlineUserPickerProps {
    phaseSlug: string
    onPick: (userId: string, userName: string | null) => void
    isSaving?: boolean
}

interface EligibleUser {
    id: string
    nome: string | null
    email: string | null
    is_admin: boolean | null
    phaseSlugs: string[]
}

function InlineUserPicker({ phaseSlug, onPick, isSaving }: InlineUserPickerProps) {
    const [search, setSearch] = useState('')

    const { data: users = [], isLoading } = useQuery<EligibleUser[]>({
        queryKey: ['quality-gate-eligible-owners', phaseSlug],
        queryFn: async () => {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, nome, email, is_admin')
                .eq('active', true)
                .order('nome')

            const ids = (profiles || []).map(p => p.id)
            let membership: Record<string, Set<string>> = {}
            if (ids.length > 0) {
                const { data: tms } = await supabase
                    .from('team_members')
                    .select('user_id, team:teams!inner(phase:pipeline_phases(slug))')
                    .in('user_id', ids)
                membership = (tms || []).reduce<Record<string, Set<string>>>((acc, row) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- relacionamento aninhado não tipado
                    const slug: string | null = (row as any).team?.phase?.slug ?? null
                    if (slug) {
                        const userId = row.user_id as string
                        if (!acc[userId]) acc[userId] = new Set()
                        acc[userId].add(slug)
                    }
                    return acc
                }, {})
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

    const eligible = useMemo(() => {
        // Fail-open: se ninguém tem a phase atribuída, mostra todos (não quebra UX)
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
        <div className="mt-2 bg-white border border-indigo-100 rounded-lg overflow-hidden">
            <div className="relative border-b border-indigo-100 bg-white">
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
                    eligible.map(u => (
                        <button
                            key={u.id}
                            type="button"
                            disabled={isSaving}
                            onClick={() => onPick(u.id, u.nome)}
                            className={cn(
                                'w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-indigo-50 transition-colors border-b border-slate-50 last:border-b-0',
                                isSaving && 'opacity-50 cursor-not-allowed'
                            )}
                        >
                            <div className="h-7 w-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                                <User className="h-3.5 w-3.5 text-indigo-600" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-slate-900 truncate">
                                    {u.nome || u.email || '(sem nome)'}
                                </div>
                                {u.nome && u.email && (
                                    <div className="text-xs text-slate-500 truncate">{u.email}</div>
                                )}
                            </div>
                        </button>
                    ))
                )}
            </div>
        </div>
    )
}

export default function QualityGateModal({
    isOpen,
    onClose,
    cardId,
    targetStageName,
    missingRequirements,
    context = 'kanban',
}: QualityGateModalProps) {
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const [expandedRole, setExpandedRole] = useState<string | null>(null)

    const handleOpenCard = () => {
        onClose()
        navigate(`/cards/${cardId}`)
    }

    const assignOwnerMutation = useMutation({
        mutationFn: async ({ role, userId }: { role: string; userId: string }) => {
            const ownerCol = TEAM_ROLE_TO_OWNER_COLUMN[role]
            if (!ownerCol) throw new Error(`Role desconhecida: ${role}`)
            const { error } = await supabase.from('cards').update({ [ownerCol]: userId }).eq('id', cardId)
            if (error) throw error
        },
        onSuccess: () => {
            toast.success('Responsável atribuído')
            queryClient.invalidateQueries({ queryKey: ['card-detail', cardId] })
            queryClient.invalidateQueries({ queryKey: ['card', cardId] })
            queryClient.invalidateQueries({ queryKey: ['cards'] })
            queryClient.invalidateQueries({ queryKey: ['card-team-roles', cardId] })
            queryClient.invalidateQueries({ queryKey: ['stage-requirements'] })
            setExpandedRole(null)
        },
        onError: (error: Error) => {
            toast.error('Erro ao atribuir responsável: ' + error.message)
        }
    })

    const grouped = new Map<string, MissingRequirement[]>()
    for (const req of missingRequirements) {
        const list = grouped.get(req.type) || []
        list.push(req)
        grouped.set(req.type, list)
    }

    const remainingCount = missingRequirements.length

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
                                            const isSavingThis = assignOwnerMutation.isPending && assignOwnerMutation.variables?.role === role

                                            return (
                                                <li key={idx}>
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className={`flex items-center gap-2 text-sm ${config.text} min-w-0`}>
                                                            <span className={`w-1.5 h-1.5 ${config.dot} rounded-full flex-shrink-0`} />
                                                            <span className="truncate">{item.label}</span>
                                                        </div>
                                                        {!isExpanded && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setExpandedRole(role)}
                                                                className="flex-shrink-0 text-xs font-medium px-2.5 py-1 rounded-md bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-100 transition-colors"
                                                            >
                                                                Atribuir {TEAM_ROLE_LABEL[role] || ''}
                                                            </button>
                                                        )}
                                                    </div>
                                                    {isExpanded && (
                                                        <InlineUserPicker
                                                            phaseSlug={role}
                                                            isSaving={isSavingThis}
                                                            onPick={(userId) => {
                                                                assignOwnerMutation.mutate({ role, userId })
                                                            }}
                                                        />
                                                    )}
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
                            onClick={onClose}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                            {remainingCount === 0 ? 'Fechar' : 'Entendi'}
                        </Button>
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
