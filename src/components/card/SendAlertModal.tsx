import { useState, useMemo, useRef, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/textarea'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import { Megaphone, Check, Loader2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

interface SendAlertModalProps {
    isOpen: boolean
    onClose: () => void
    cardId: string
    cardTitle: string | null
}

export default function SendAlertModal({ isOpen, onClose, cardId, cardTitle }: SendAlertModalProps) {
    return (
        <Dialog open={isOpen} onOpenChange={open => { if (!open) onClose() }}>
            <DialogContent className="sm:max-w-md">
                {isOpen && (
                    <SendAlertForm cardId={cardId} cardTitle={cardTitle} onClose={onClose} />
                )}
            </DialogContent>
        </Dialog>
    )
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface EnrichedProfile {
    id: string
    nome: string | null
    email: string | null
    team_id: string | null
    is_admin: boolean | null
    teamName: string | null
    phaseName: string | null
    phaseOrder: number
}

interface CardRoleMember {
    profileId: string
    roleLabel: string
    roleOrder: number
}

const OWNER_ROLES: { key: string; label: string; order: number }[] = [
    { key: 'sdr_owner_id', label: 'SDR', order: 0 },
    { key: 'vendas_owner_id', label: 'Planner', order: 1 },
    { key: 'pos_owner_id', label: 'Pós-Venda', order: 2 },
    { key: 'concierge_owner_id', label: 'Concierge', order: 3 },
    { key: 'dono_atual_id', label: 'Responsável', order: -1 },
]

const MEMBER_ROLE_LABELS: Record<string, string> = {
    assistente_planner: 'Assist. Planner',
    assistente_pos: 'Assist. Pós',
    apoio: 'Apoio',
}

// ─── Form ───────────────────────────────────────────────────────────────────

function SendAlertForm({ cardId, cardTitle, onClose }: { cardId: string; cardTitle: string | null; onClose: () => void }) {
    const { user } = useAuth()
    const queryClient = useQueryClient()
    const [selectedUserId, setSelectedUserId] = useState('')
    const [message, setMessage] = useState('')
    const [search, setSearch] = useState('')
    const searchRef = useRef<HTMLInputElement>(null)
    const listRef = useRef<HTMLDivElement>(null)

    // Focus search on mount
    useEffect(() => {
        setTimeout(() => searchRef.current?.focus(), 100)
    }, [])

    // ── Data fetching ────────────────────────────────────────────────────

    // Profiles with team + phase info (same pattern as OwnerSelector)
    const { data: enrichedProfiles } = useQuery({
        queryKey: ['profiles-with-teams-phases'],
        queryFn: async () => {
            const { data: profiles, error } = await supabase
                .from('profiles')
                .select('id, nome, email, team_id, is_admin')
                .eq('active', true)
                .or('team_id.not.is.null,is_admin.eq.true')
                .order('nome')
            if (error) throw error

            const teamIds = [...new Set(profiles?.filter(p => p.team_id).map(p => p.team_id as string) ?? [])]
            const teamsMap: Record<string, { name: string; phaseName: string | null; phaseOrder: number }> = {}

            if (teamIds.length > 0) {
                const { data: teams } = await supabase
                    .from('teams')
                    .select('id, name, phase:pipeline_phases(name, order_index)')
                    .in('id', teamIds)

                teams?.forEach(t => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const phase = t.phase as any
                    teamsMap[t.id] = {
                        name: t.name,
                        phaseName: phase?.name ?? null,
                        phaseOrder: phase?.order_index ?? 99,
                    }
                })
            }

            return profiles?.map(p => ({
                ...p,
                teamName: p.team_id && teamsMap[p.team_id] ? teamsMap[p.team_id].name : null,
                phaseName: p.team_id && teamsMap[p.team_id] ? teamsMap[p.team_id].phaseName : null,
                phaseOrder: p.team_id && teamsMap[p.team_id] ? teamsMap[p.team_id].phaseOrder : 99,
            })) as EnrichedProfile[] ?? []
        },
        staleTime: 1000 * 60 * 5,
    })

    // Card owners (role-based)
    const { data: cardData } = useQuery({
        queryKey: ['card-owners-full', cardId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('cards')
                .select('sdr_owner_id, vendas_owner_id, pos_owner_id, concierge_owner_id, dono_atual_id')
                .eq('id', cardId)
                .single()
            if (error) return null
            return data
        },
        staleTime: 1000 * 60,
        enabled: !!cardId,
    })

    // Card team members (assistants, support)
    const { data: cardTeamMembers } = useQuery({
        queryKey: ['card-team-members-roles', cardId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('card_team_members')
                .select('profile_id, role')
                .eq('card_id', cardId)
            if (error) return []
            return data || []
        },
        staleTime: 1000 * 60,
        enabled: !!cardId,
    })

    // ── Build groups ─────────────────────────────────────────────────────

    // 1. Card-assigned people with role labels
    const cardRoleMembers = useMemo<CardRoleMember[]>(() => {
        if (!cardData) return []
        const members: CardRoleMember[] = []
        const seen = new Set<string>()

        // Owners from card fields
        for (const role of OWNER_ROLES) {
            const id = cardData[role.key as keyof typeof cardData] as string | null
            if (id && !seen.has(id) && id !== user?.id) {
                // "Responsável" only if not already listed by another role
                if (role.key === 'dono_atual_id' && seen.has(id)) continue
                seen.add(id)
                members.push({ profileId: id, roleLabel: role.label, roleOrder: role.order })
            }
        }

        // Team members (assistants, etc.)
        for (const m of (cardTeamMembers || [])) {
            if (m.profile_id && !seen.has(m.profile_id) && m.profile_id !== user?.id) {
                seen.add(m.profile_id)
                members.push({
                    profileId: m.profile_id,
                    roleLabel: MEMBER_ROLE_LABELS[m.role] || m.role,
                    roleOrder: 10,
                })
            }
        }

        return members.sort((a, b) => a.roleOrder - b.roleOrder)
    }, [cardData, cardTeamMembers, user?.id])

    const cardMemberIds = useMemo(() => new Set(cardRoleMembers.map(m => m.profileId)), [cardRoleMembers])

    // 2. Other people grouped by phase > team, alphabetically
    const phaseGroups = useMemo(() => {
        if (!enrichedProfiles) return []
        const available = enrichedProfiles.filter(p => p.id !== user?.id && !cardMemberIds.has(p.id))

        // Group by phase
        const phaseMap = new Map<string, { order: number; teams: Map<string, EnrichedProfile[]> }>()

        for (const p of available) {
            const phaseName = p.phaseName || 'Sem time'
            const teamName = p.teamName || 'Sem time'

            if (!phaseMap.has(phaseName)) {
                phaseMap.set(phaseName, { order: p.phaseOrder, teams: new Map() })
            }
            const phase = phaseMap.get(phaseName)!
            if (!phase.teams.has(teamName)) {
                phase.teams.set(teamName, [])
            }
            phase.teams.get(teamName)!.push(p)
        }

        // Sort phases by order_index, then teams alphabetically within each
        return [...phaseMap.entries()]
            .sort((a, b) => a[1].order - b[1].order)
            .map(([phaseName, { teams }]) => ({
                phaseName,
                teams: [...teams.entries()]
                    .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
                    .map(([teamName, members]) => ({
                        teamName,
                        members: members.sort((a, b) =>
                            (a.nome || a.email || '').localeCompare(b.nome || b.email || '', 'pt-BR')
                        ),
                    })),
            }))
    }, [enrichedProfiles, user?.id, cardMemberIds])

    // ── Search filter ────────────────────────────────────────────────────

    const q = search.toLowerCase()

    const filteredCardMembers = useMemo(() => {
        if (!q || !enrichedProfiles) return cardRoleMembers
        return cardRoleMembers.filter(m => {
            const p = enrichedProfiles.find(pr => pr.id === m.profileId)
            return p && (p.nome || p.email || '').toLowerCase().includes(q)
        })
    }, [cardRoleMembers, enrichedProfiles, q])

    const filteredPhaseGroups = useMemo(() => {
        if (!q) return phaseGroups
        return phaseGroups
            .map(phase => ({
                ...phase,
                teams: phase.teams
                    .map(team => ({
                        ...team,
                        members: team.members.filter(p =>
                            (p.nome || p.email || '').toLowerCase().includes(q)
                        ),
                    }))
                    .filter(team => team.members.length > 0),
            }))
            .filter(phase => phase.teams.length > 0)
    }, [phaseGroups, q])

    const hasResults = filteredCardMembers.length > 0 || filteredPhaseGroups.length > 0

    // ── Selected person info ─────────────────────────────────────────────

    const selectedInfo = useMemo(() => {
        if (!selectedUserId || !enrichedProfiles) return null
        const p = enrichedProfiles.find(pr => pr.id === selectedUserId)
        if (!p) return null
        const cardRole = cardRoleMembers.find(m => m.profileId === selectedUserId)
        return {
            name: p.nome || p.email || 'Sem nome',
            roleLabel: cardRole?.roleLabel || p.teamName || null,
        }
    }, [selectedUserId, enrichedProfiles, cardRoleMembers])

    // ── Check if card_alert is enabled ───────────────────────────────────

    const { data: alertConfig } = useQuery({
        queryKey: ['notification-type-config', 'card_alert'],
        queryFn: async () => {
            const { data, error } = await db
                .from('notification_type_config')
                .select('enabled')
                .eq('type_key', 'card_alert')
                .maybeSingle()
            if (error) return { enabled: true }
            return data ?? { enabled: true }
        },
        staleTime: 5 * 60_000,
    })

    // ── Send alert ───────────────────────────────────────────────────────

    const sendAlert = useMutation({
        mutationFn: async () => {
            if (!alertConfig?.enabled) {
                throw new Error('Alertas no card estão desativados pelo admin')
            }

            const { error: notifError } = await db
                .from('notifications')
                .insert({
                    user_id: selectedUserId,
                    type: 'card_alert',
                    title: `Alerta em "${cardTitle || 'Card'}"`,
                    body: message || null,
                    url: `/cards/${cardId}`,
                })
            if (notifError) throw notifError

            const senderName = enrichedProfiles?.find(p => p.id === user?.id)?.nome || 'Alguém'
            const recipientName = enrichedProfiles?.find(p => p.id === selectedUserId)?.nome || 'alguém'
            const { error: actError } = await supabase
                .from('activities')
                .insert({
                    card_id: cardId,
                    tipo: 'note_added',
                    descricao: `${senderName} enviou alerta para ${recipientName}: "${message || '(sem mensagem)'}"`,
                    metadata: {
                        alert_type: 'card_alert',
                        recipient_id: selectedUserId,
                        recipient_name: recipientName,
                    },
                    created_by: user?.id,
                })
            if (actError) console.error('Activity log failed:', actError)
        },
        onSuccess: () => {
            toast.success('Alerta enviado')
            queryClient.invalidateQueries({ queryKey: ['activities', cardId] })
            onClose()
        },
        onError: (err) => {
            toast.error(err instanceof Error ? err.message : 'Erro ao enviar alerta')
        },
    })

    // ── Helpers ──────────────────────────────────────────────────────────

    const selectPerson = (id: string) => {
        setSelectedUserId(id)
        setSearch('')
        // Scroll list back to top
        listRef.current?.scrollTo({ top: 0 })
    }

    const getInitials = (name: string | null, email: string | null) => {
        const s = name || email || '?'
        return s.substring(0, 2).toUpperCase()
    }

    const renderPerson = (
        p: { id: string; nome: string | null; email: string | null },
        badge?: string | null,
    ) => {
        const isSelected = selectedUserId === p.id
        return (
            <button
                key={p.id}
                type="button"
                onClick={() => selectPerson(p.id)}
                className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
                    isSelected
                        ? 'bg-amber-50 ring-1 ring-amber-200'
                        : 'hover:bg-slate-50'
                )}
            >
                <div className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                    isSelected ? 'bg-amber-200 text-amber-800' : 'bg-slate-100 text-slate-500'
                )}>
                    {getInitials(p.nome, p.email)}
                </div>
                <div className="flex-1 min-w-0 text-left">
                    <span className={cn(
                        'block truncate',
                        isSelected ? 'text-amber-900 font-medium' : 'text-slate-700'
                    )}>
                        {p.nome || p.email}
                    </span>
                </div>
                {badge && (
                    <span className={cn(
                        'text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0',
                        isSelected
                            ? 'bg-amber-200/60 text-amber-800'
                            : 'bg-slate-100 text-slate-500'
                    )}>
                        {badge}
                    </span>
                )}
                {isSelected && <Check className="w-4 h-4 text-amber-600 shrink-0" />}
            </button>
        )
    }

    // ── Render ───────────────────────────────────────────────────────────

    return (
        <>
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                    <Megaphone className="h-4.5 w-4.5 text-amber-600" />
                    Enviar Alerta
                </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-1">
                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        ref={searchRef}
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar por nome..."
                        className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-400 transition-colors"
                    />
                </div>

                {/* Person list */}
                <div ref={listRef} className="max-h-[280px] overflow-y-auto -mx-1 px-1 space-y-1">
                    {/* Section 1: Card team */}
                    {filteredCardMembers.length > 0 && (
                        <div>
                            <div className="px-2 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                Equipe deste card
                            </div>
                            {filteredCardMembers.map(m => {
                                const p = enrichedProfiles?.find(pr => pr.id === m.profileId)
                                if (!p) return null
                                return renderPerson(p, m.roleLabel)
                            })}
                        </div>
                    )}

                    {/* Divider */}
                    {filteredCardMembers.length > 0 && filteredPhaseGroups.length > 0 && (
                        <div className="border-t border-slate-100 my-1" />
                    )}

                    {/* Section 2: By phase > team */}
                    {filteredPhaseGroups.map(phase => (
                        <div key={phase.phaseName}>
                            <div className="px-2 py-1.5 text-[10px] font-bold text-indigo-500 uppercase tracking-wider">
                                {phase.phaseName}
                            </div>
                            {phase.teams.map(team => (
                                <div key={team.teamName}>
                                    {/* Show team name only if phase has multiple teams */}
                                    {phase.teams.length > 1 && (
                                        <div className="px-2 py-1 text-[10px] font-medium text-slate-400 pl-4">
                                            {team.teamName}
                                        </div>
                                    )}
                                    {team.members.map(p => renderPerson(p, team.teamName))}
                                </div>
                            ))}
                        </div>
                    ))}

                    {!hasResults && (
                        <div className="py-8 text-center text-sm text-slate-400">
                            Nenhuma pessoa encontrada
                        </div>
                    )}
                </div>

                {/* Selected indicator */}
                {selectedInfo && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                        <Megaphone className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span className="text-sm text-amber-800">
                            Alertar <strong>{selectedInfo.name}</strong>
                            {selectedInfo.roleLabel && (
                                <span className="text-amber-600 font-normal"> ({selectedInfo.roleLabel})</span>
                            )}
                        </span>
                    </div>
                )}

                {/* Message */}
                <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">
                        Mensagem <span className="text-slate-400 font-normal">(opcional)</span>
                    </label>
                    <Textarea
                        value={message}
                        onChange={e => setMessage(e.target.value)}
                        placeholder="Ex: Verificar documentação do passageiro..."
                        rows={3}
                        className="resize-none"
                    />
                </div>
            </div>

            <DialogFooter>
                <Button variant="outline" onClick={onClose} disabled={sendAlert.isPending}>
                    Cancelar
                </Button>
                <Button
                    onClick={() => sendAlert.mutate()}
                    disabled={!selectedUserId || sendAlert.isPending}
                    className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
                >
                    {sendAlert.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Megaphone className="w-4 h-4" />
                    )}
                    Enviar
                </Button>
            </DialogFooter>
        </>
    )
}
