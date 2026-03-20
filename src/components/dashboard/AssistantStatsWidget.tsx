import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Users, UserPlus, Briefcase } from 'lucide-react'
import type { Database } from '../../database.types'

type Product = Database['public']['Enums']['app_product']

interface AssistantStatsWidgetProps {
    productFilter: Product
}

interface AssistStats {
    myAssistCount: number
    myAssistRoles: Record<string, number>
    teamAssistTotal: number
    cardsWithTeam: number
}

const ROLE_LABELS: Record<string, string> = {
    assistente_planner: 'Assist. Planner',
    assistente_pos: 'Assist. Pós',
    apoio: 'Apoio',
}

export function AssistantStatsWidget({ productFilter }: AssistantStatsWidgetProps) {
    const { session, profile } = useAuth()
    const isAdmin = profile?.is_admin === true

    const { data: stats, isLoading } = useQuery({
        queryKey: ['assistant-stats', session?.user?.id, productFilter],
        enabled: !!session?.user?.id,
        queryFn: async (): Promise<AssistStats> => {
            const userId = session!.user.id

            // 1. Cards onde EU sou team member
            const { data: myAssists, error: myErr } = await supabase
                .from('card_team_members')
                .select('card_id, role, card:cards!card_team_members_card_id_fkey(produto)')
                .eq('profile_id', userId)

            if (myErr) throw myErr

            // Filtrar por produto
            const filtered = (myAssists || []).filter(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (a: any) => a.card?.produto === productFilter
            )

            const myAssistRoles: Record<string, number> = {}
            for (const a of filtered) {
                myAssistRoles[a.role] = (myAssistRoles[a.role] || 0) + 1
            }

            // 2. Total de registros de team members (para admin) — filtrado por produto
            let teamAssistTotal = 0
            let cardsWithTeam = 0
            if (isAdmin) {
                const { data: allAssists } = await supabase
                    .from('card_team_members')
                    .select('card_id, card:cards!card_team_members_card_id_fkey(produto)')

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const productFiltered = (allAssists || []).filter((a: any) => a.card?.produto === productFilter)
                teamAssistTotal = productFiltered.length

                const uniqueSet = new Set(productFiltered.map(c => c.card_id))
                cardsWithTeam = uniqueSet.size
            }

            return {
                myAssistCount: filtered.length,
                myAssistRoles,
                teamAssistTotal,
                cardsWithTeam,
            }
        },
        staleTime: 1000 * 60 * 2,
    })

    // Não mostrar widget se não há dados relevantes
    if (!isLoading && stats?.myAssistCount === 0 && !isAdmin) return null

    if (isLoading) {
        return (
            <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5 animate-pulse">
                <div className="h-4 bg-slate-100 rounded w-32 mb-4" />
                <div className="h-8 bg-slate-100 rounded w-16" />
            </div>
        )
    }

    if (!stats) return null

    return (
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 rounded-lg bg-indigo-50">
                    <Users className="h-4 w-4 text-indigo-600" />
                </div>
                <h3 className="text-sm font-semibold text-slate-700">Equipe de Apoio</h3>
            </div>

            <div className="space-y-3">
                {/* My assists */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                        <UserPlus className="h-3.5 w-3.5 text-indigo-500" />
                        <span>Cards que assisto</span>
                    </div>
                    <span className="text-lg font-bold text-slate-900">{stats.myAssistCount}</span>
                </div>

                {/* Role breakdown */}
                {Object.entries(stats.myAssistRoles).length > 0 && (
                    <div className="pl-6 space-y-1">
                        {Object.entries(stats.myAssistRoles).map(([role, count]) => (
                            <div key={role} className="flex items-center justify-between text-xs text-slate-500">
                                <span>{ROLE_LABELS[role] || role}</span>
                                <span className="font-medium text-slate-700">{count}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Admin view: system-wide stats */}
                {isAdmin && (
                    <>
                        <div className="border-t border-slate-100 pt-3 mt-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-sm text-slate-600">
                                    <Briefcase className="h-3.5 w-3.5 text-emerald-500" />
                                    <span>Cards com equipe</span>
                                </div>
                                <span className="text-lg font-bold text-slate-900">{stats.cardsWithTeam}</span>
                            </div>
                            <div className="flex items-center justify-between mt-1">
                                <span className="text-xs text-slate-500 pl-6">Total de atribuições</span>
                                <span className="text-xs font-medium text-slate-700">{stats.teamAssistTotal}</span>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
