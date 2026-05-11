import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useCardTeam } from '../../hooks/useCardTeam'
import { Select } from '../ui/Select'
import { Users, Plus, X, ChevronDown, ChevronUp } from 'lucide-react'
import type { Database } from '../../database.types'

type Card = Database['public']['Tables']['cards']['Row']

const ROLE_OPTIONS = [
    { value: 'assistente_planner', label: 'Assist. Planner' },
    { value: 'assistente_pos', label: 'Assist. Pós' },
    { value: 'apoio', label: 'Apoio' },
]

// Maps card_team_members role → pipeline_phases slug for filtering
const ROLE_PHASE_MAP: Record<string, string | null> = {
    assistente_planner: 'planner',
    assistente_pos: 'pos_venda',
    apoio: null, // Apoio can be from any team
}

const ROLE_COLORS: Record<string, string> = {
    assistente_planner: 'bg-blue-50 text-blue-700 border-blue-200',
    assistente_pos: 'bg-green-50 text-green-700 border-green-200',
    apoio: 'bg-slate-50 text-slate-600 border-slate-200',
}

interface CardTeamSectionProps {
    card: Card
}

export default function CardTeamSection({ card }: CardTeamSectionProps) {
    const [isOpen, setIsOpen] = useState(true)
    const [showAdd, setShowAdd] = useState(false)
    const [selectedUserId, setSelectedUserId] = useState('')
    const [selectedRole, setSelectedRole] = useState('assistente_planner')

    const { members, isLoading, addMember, removeMember } = useCardTeam(card.id || undefined, card)

    // Fetch active profiles with team/phase info for filtering
    const { data: profilesWithTeam = [] } = useQuery({
        queryKey: ['active-profiles-with-phase'],
        queryFn: async () => {
            const { data: profs, error } = await supabase
                .from('profiles')
                .select('id, nome, email, team_id, is_admin')
                .eq('active', true)
                .order('nome')
            if (error) throw error

            // Fetch team phase slugs
            const teamIds = [...new Set(profs?.filter(p => p.team_id).map(p => p.team_id as string) ?? [])]
            const teamsMap: Record<string, string | null> = {}

            if (teamIds.length > 0) {
                const { data: teams } = await supabase
                    .from('teams')
                    .select('id, phase:pipeline_phases(slug)')
                    .in('id', teamIds)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                teams?.forEach(t => { teamsMap[t.id] = (t.phase as any)?.slug ?? null })
            }

            return (profs || []).map(p => ({
                ...p,
                phaseSlug: p.team_id ? teamsMap[p.team_id] ?? null : null,
            }))
        },
        staleTime: 1000 * 60 * 5,
        enabled: showAdd,
    })

    // Filter profiles by selected role's phase, excluding existing members
    const availableProfiles = useMemo(() => {
        const memberIdSet = new Set(members.map(m => m.profile_id))
        const targetPhase = ROLE_PHASE_MAP[selectedRole]
        return profilesWithTeam.filter(p => {
            if (memberIdSet.has(p.id)) return false
            // Admins always show
            if (p.is_admin) return true
            // If role has no phase constraint (apoio), show all with team
            if (!targetPhase) return !!p.team_id
            // Filter by matching phase
            return p.phaseSlug === targetPhase
        })
    }, [profilesWithTeam, selectedRole, members])

    const handleAdd = () => {
        if (!selectedUserId) return
        addMember.mutate(
            { profileId: selectedUserId, role: selectedRole },
            {
                onSuccess: () => {
                    setSelectedUserId('')
                    setShowAdd(false)
                },
            }
        )
    }

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            {/* Header */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-50 transition-colors rounded-t-xl"
            >
                <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-500" />
                    <span className="text-xs font-semibold text-slate-900">Equipe do Card</span>
                    {members.length > 0 && (
                        <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-medium">
                            {members.length}
                        </span>
                    )}
                </div>
                {isOpen ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
            </button>

            {isOpen && (
                <div className="px-3 pb-2.5 space-y-1.5">
                    {/* Members list */}
                    {isLoading ? (
                        <div className="text-xs text-slate-400 py-2">Carregando...</div>
                    ) : members.length === 0 && !showAdd ? (
                        <div className="text-xs text-slate-400 py-2">Nenhum membro adicional</div>
                    ) : (
                        <div className="space-y-1.5">
                            {members.map(member => (
                                <div
                                    key={member.id}
                                    className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-50 group"
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        {/* Avatar */}
                                        <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                                            {(member.profile?.nome || member.profile?.email || '?')[0].toUpperCase()}
                                        </div>
                                        <span className="text-sm text-slate-800 truncate">
                                            {member.profile?.nome || member.profile?.email || '—'}
                                        </span>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${ROLE_COLORS[member.role] || ROLE_COLORS.apoio}`}>
                                            {ROLE_OPTIONS.find(r => r.value === member.role)?.label || member.role}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => removeMember.mutate(member.id)}
                                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-50 rounded text-slate-400 hover:text-red-500 transition-all"
                                        title="Remover da equipe"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Add form */}
                    {showAdd ? (
                        <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
                            <Select
                                value={selectedRole}
                                onChange={(v) => { setSelectedRole(v); setSelectedUserId('') }}
                                options={ROLE_OPTIONS}
                                placeholder="Função..."
                            />
                            <Select
                                value={selectedUserId}
                                onChange={setSelectedUserId}
                                options={availableProfiles.map(p => ({
                                    value: p.id,
                                    label: p.nome || p.email || 'Sem nome',
                                }))}
                                placeholder="Selecione uma pessoa..."
                            />
                            <div className="flex gap-2">
                                <button
                                    onClick={handleAdd}
                                    disabled={!selectedUserId || addMember.isPending}
                                    className="flex-1 text-xs font-medium px-3 py-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    {addMember.isPending ? 'Adicionando...' : 'Adicionar'}
                                </button>
                                <button
                                    onClick={() => { setShowAdd(false); setSelectedUserId('') }}
                                    className="text-xs font-medium px-3 py-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button
                            onClick={() => setShowAdd(true)}
                            className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg border border-dashed border-indigo-200 transition-colors"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            Adicionar Membro
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}
