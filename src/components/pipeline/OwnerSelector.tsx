import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { ChevronDown, User, Zap, Users, Search, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useRoles } from '../../hooks/useRoles'
interface Profile {
    id: string
    nome: string | null
    email: string | null
    role: string | null
    role_id: string | null
    produtos: string[] | null
    team_id: string | null
    is_admin: boolean | null
    teams: { name: string } | null
    teamPhaseSlug: string | null
}

interface OwnerSelectorProps {
    value: string | null
    onChange: (ownerId: string | null, ownerName: string | null) => void
    product?: string
    placeholder?: string
    className?: string
    /** If true, shows "Sem responsável" as default and "Auto-atribuir" as an option */
    showNoSdrOption?: boolean
    /** Callback when auto-assign is selected */
    onAutoAssign?: () => void
    /** Filter users by their team's pipeline phase slug (e.g. 'sdr', 'planner', 'pos_venda') */
    phaseSlug?: string
    /** Compact trigger for inline selectors (e.g. CardHeader) */
    compact?: boolean
    /** Filter users by their role_id (UUID from roles table) */
    roleId?: string
    /** Filter users by their team_id (UUID from teams table) */
    teamId?: string
}

export default function OwnerSelector({
    value,
    onChange,
    product,
    placeholder = 'Selecionar responsável',
    className,
    showNoSdrOption = false,
    onAutoAssign,
    phaseSlug,
    compact = false,
    roleId,
    teamId
}: OwnerSelectorProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [searchTerm, setSearchTerm] = useState('')
    const searchInputRef = useRef<HTMLInputElement>(null)

    // Derive autoMode from value and showNoSdrOption instead of syncing via effect
    const autoMode = !value && !showNoSdrOption

    // Focus search input when dropdown opens; clear search when closing
    useEffect(() => {
        if (isOpen && searchInputRef.current) {
            setTimeout(() => searchInputRef.current?.focus(), 0)
        } else {
            setTimeout(() => setSearchTerm(''), 0)
        }
    }, [isOpen])

    // Fetch roles from database for badge display
    const { roles } = useRoles()

    // Fetch eligible users (all active users) with team phase info
    const { data: allUsers = [], isLoading, error: usersError } = useQuery({
        queryKey: ['eligible-owners'],
        queryFn: async () => {
            // Query profiles with is_admin for phase filtering
            const { data: profiles, error } = await supabase
                .from('profiles')
                .select('id, nome, email, role, role_id, produtos, team_id, is_admin')
                .eq('active', true)
                .order('nome')

            if (error) throw error

            // Fetch team names and phase slugs separately
            const teamIds = [...new Set(profiles?.filter(p => p.team_id).map(p => p.team_id as string) ?? [])]
            const teamsMap: Record<string, { name: string; phaseSlug: string | null }> = {}

            if (teamIds.length > 0) {
                const { data: teams } = await supabase
                    .from('teams')
                    .select('id, name, phase:pipeline_phases(slug)')
                    .in('id', teamIds)

                teams?.forEach(t => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const phase = t.phase as any
                    teamsMap[t.id] = {
                        name: t.name,
                        phaseSlug: phase?.slug ?? null
                    }
                })
            }

            // Combine profiles with team info
            return profiles?.map(p => ({
                ...p,
                teams: p.team_id && teamsMap[p.team_id] ? { name: teamsMap[p.team_id].name } : null,
                teamPhaseSlug: p.team_id && teamsMap[p.team_id] ? teamsMap[p.team_id].phaseSlug : null
            })) as Profile[] ?? []
        }
    })

    // Filter users by product, phase, role, and team
    const users = useMemo(() => {
        // Check if any team is configured for the target phase (fail-open)
        const hasTeamsForPhase = phaseSlug
            ? allUsers.some(u => u.teamPhaseSlug === phaseSlug)
            : false

        return allUsers.filter(user => {
            // Admin bypass: admins pass all filters (product, phase, role, team)
            if (user.is_admin === true) return true

            // Product filter (only when product is provided)
            if (product && user.produtos && user.produtos.length > 0 && !user.produtos.includes(product)) return false

            // Role filter: only show users with the specified role_id
            if (roleId && user.role_id !== roleId) return false

            // Team filter: only show users from the specified team
            if (teamId && user.team_id !== teamId) return false

            // Phase filter
            if (phaseSlug && hasTeamsForPhase) {
                if (user.teamPhaseSlug !== phaseSlug) return false
            }

            return true
        })
    }, [allUsers, product, phaseSlug, roleId, teamId])

    // Apply search filter
    const filteredUsers = useMemo(() => {
        if (!searchTerm) return users
        const term = searchTerm.toLowerCase()
        return users.filter(user =>
            user.nome?.toLowerCase().includes(term) ||
            user.email?.toLowerCase().includes(term)
        )
    }, [users, searchTerm])

    // Fetch cards count per user for workload indicator
    const { data: workload = {} } = useQuery({
        queryKey: ['owner-workload'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('cards')
                .select('sdr_owner_id')
                .neq('status_comercial', 'perdido')
                .not('sdr_owner_id', 'is', null)

            if (error) throw error

            // Count cards per owner
            const counts: Record<string, number> = {}
            data?.forEach(card => {
                if (card.sdr_owner_id) {
                    counts[card.sdr_owner_id] = (counts[card.sdr_owner_id] || 0) + 1
                }
            })
            return counts
        },
        staleTime: 1000 * 30 // 30 seconds
    })

    // Selected user must come from allUsers (not filtered) to always show current selection
    const selectedUser = useMemo(() =>
        allUsers.find(u => u.id === value),
        [allUsers, value]
    )

    const getRoleBadge = (role: string | null) => {
        if (!role) return null
        // Try to find role in database roles first
        const dbRole = roles.find(r => r.name === role)
        if (dbRole) {
            return (
                <span className={cn('text-xs px-1.5 py-0.5 rounded', dbRole.color)}>
                    {dbRole.display_name}
                </span>
            )
        }
        // Fallback: capitalize role name
        return (
            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
                {role.charAt(0).toUpperCase() + role.slice(1).replace(/_/g, ' ')}
            </span>
        )
    }

    const handleSelect = (user: Profile | null) => {
        if (user) {
            onChange(user.id, user.nome)
        } else {
            onChange(null, null)
        }
        setIsOpen(false)
    }

    return (
        <div className={cn('relative', className)}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    'w-full flex items-center justify-between',
                    compact
                        ? 'gap-1.5 py-1 px-1.5 -mx-1.5 rounded-md hover:bg-slate-100/60'
                        : 'gap-2 px-3 py-2.5 border border-slate-200 rounded-lg bg-white hover:border-slate-300',
                    'transition-colors cursor-pointer',
                    'focus:outline-none focus:ring-2 focus:ring-indigo-500/20'
                )}
            >
                <div className="flex items-center gap-1.5 min-w-0">
                    {compact ? (
                        selectedUser ? (
                            <>
                                <div className="h-5 w-5 rounded-full bg-indigo-500 flex items-center justify-center flex-shrink-0">
                                    <span className="text-[9px] font-bold text-white leading-none">
                                        {(selectedUser.nome || selectedUser.email || '?')[0].toUpperCase()}
                                    </span>
                                </div>
                                <span className="text-[13px] font-medium text-slate-800 truncate">{selectedUser.nome || selectedUser.email}</span>
                            </>
                        ) : (
                            <span className="text-[13px] text-slate-400 italic truncate">Não atribuído</span>
                        )
                    ) : autoMode ? (
                        <>
                            <div className="h-7 w-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                                <Zap className="h-3.5 w-3.5 text-indigo-600" />
                            </div>
                            <div className="text-left min-w-0">
                                <p className="text-sm font-medium text-slate-900 truncate">Auto-atribuir</p>
                                <p className="text-xs text-slate-500 truncate">Distribuição automática</p>
                            </div>
                        </>
                    ) : selectedUser ? (
                        <>
                            <div className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                                <User className="h-3.5 w-3.5 text-slate-600" />
                            </div>
                            <div className="text-left min-w-0">
                                <p className="text-sm font-medium text-slate-900 truncate">{selectedUser.nome}</p>
                                <div className="flex items-center gap-1.5">
                                    {getRoleBadge(selectedUser.role)}
                                    {selectedUser.teams?.name && (
                                        <span className="text-xs text-slate-500">• {selectedUser.teams.name}</span>
                                    )}
                                </div>
                            </div>
                        </>
                    ) : showNoSdrOption ? (
                        <>
                            <div className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                                <User className="h-3.5 w-3.5 text-slate-400" />
                            </div>
                            <div className="text-left min-w-0">
                                <p className="text-sm font-medium text-slate-600 truncate">Sem responsável</p>
                                <p className="text-xs text-slate-400 truncate">Clique para atribuir</p>
                            </div>
                        </>
                    ) : (
                        <span className="text-sm text-slate-500">{placeholder}</span>
                    )}
                </div>
                <ChevronDown className={cn(
                    'text-slate-400 transition-transform flex-shrink-0',
                    compact ? 'h-3 w-3' : 'h-4 w-4',
                    isOpen && 'rotate-180'
                )} />
            </button>

            {isOpen && (
                <>
                    <div
                        className="fixed inset-0 z-10"
                        onClick={() => setIsOpen(false)}
                    />
                    <div className={cn("absolute top-full left-0 mt-1 z-20 bg-white border border-slate-200 rounded-lg shadow-lg max-h-72 flex flex-col", compact ? "min-w-[280px] right-auto" : "right-0")}>
                        {/* Search input */}
                        <div className="p-2 border-b border-slate-100 flex-shrink-0">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Buscar por nome..."
                                    className="w-full h-8 pl-8 pr-8 text-sm rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                                />
                                {searchTerm && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchTerm('')}
                                        className="absolute right-2 top-1/2 -translate-y-1/2"
                                    >
                                        <X className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600" />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="overflow-y-auto flex-1">
                            {/* "Sem responsável" option - only when showNoSdrOption is true */}
                            {!searchTerm && showNoSdrOption && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onChange(null, null)
                                            setIsOpen(false)
                                        }}
                                        className={cn(
                                            'w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 transition-colors',
                                            !autoMode && !value && 'bg-slate-50'
                                        )}
                                    >
                                        <div className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center">
                                            <User className="h-4 w-4 text-slate-400" />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-sm font-medium text-slate-700">Sem responsável</p>
                                            <p className="text-xs text-slate-500">Card sem responsável definido</p>
                                        </div>
                                    </button>
                                    <div className="border-t border-slate-100" />
                                </>
                            )}

                            {/* Auto-atribuir option - only in full mode */}
                            {!searchTerm && !compact && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onChange(null, null)
                                            onAutoAssign?.()
                                            setIsOpen(false)
                                        }}
                                        className={cn(
                                            'w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 transition-colors',
                                            autoMode && 'bg-indigo-50'
                                        )}
                                    >
                                        <div className="h-7 w-7 rounded-full bg-indigo-100 flex items-center justify-center">
                                            <Zap className="h-3.5 w-3.5 text-indigo-600" />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-sm font-medium text-slate-900">Auto-atribuir</p>
                                            <p className="text-xs text-slate-500">Distribuição automática por workload</p>
                                        </div>
                                    </button>
                                    <div className="border-t border-slate-100" />
                                </>
                            )}

                            {/* User list */}
                            {isLoading ? (
                                <div className="px-3 py-4 text-center text-sm text-slate-500">
                                    Carregando...
                                </div>
                            ) : usersError ? (
                                <div className="px-3 py-4 text-center text-sm text-red-500">
                                    Erro ao carregar usuários
                                </div>
                            ) : filteredUsers.length === 0 ? (
                                <div className="px-3 py-4 text-center text-sm text-slate-500">
                                    {searchTerm ? 'Nenhum resultado encontrado' : 'Nenhum usuário ativo encontrado'}
                                </div>
                            ) : (
                                filteredUsers.map(user => (
                                    <button
                                        key={user.id}
                                        type="button"
                                        onClick={() => handleSelect(user)}
                                        className={cn(
                                            'w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 transition-colors',
                                            value === user.id && 'bg-indigo-50'
                                        )}
                                    >
                                        <div className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center">
                                            <User className="h-4 w-4 text-slate-600" />
                                        </div>
                                        <div className="flex-1 text-left min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-medium text-slate-900 truncate">{user.nome}</p>
                                                {getRoleBadge(user.role)}
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                                {user.teams?.name && <span>{user.teams.name}</span>}
                                                {!compact && workload[user.id] !== undefined && (
                                                    <span className="flex items-center gap-0.5">
                                                        <Users className="h-3 w-3" />
                                                        {workload[user.id]} cards
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
