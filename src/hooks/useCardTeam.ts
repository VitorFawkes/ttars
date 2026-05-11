import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { toast } from 'sonner'
import { useMemo } from 'react'

export interface CardTeamMember {
    id: string
    card_id: string
    profile_id: string
    role: string
    created_at: string | null
    created_by: string | null
    profile: {
        id: string
        nome: string | null
        email: string
        avatar_url: string | null
    } | null
}

export interface FullTeamMember {
    profileId: string
    nome: string
    role: string
    roleLabel: string
    isOwner: boolean
}

const ROLE_LABELS: Record<string, string> = {
    sdr: 'SDR',
    planner: 'Planner',
    pos_venda: 'Pós-Venda',
    concierge: 'Concierge',
    assistente_planner: 'Assist. Planner',
    assistente_pos: 'Assist. Pós',
    apoio: 'Apoio',
}

interface CardOwners {
    sdr_owner_id?: string | null
    vendas_owner_id?: string | null
    pos_owner_id?: string | null
    concierge_owner_id?: string | null
    dono_atual_id?: string | null
}

export function useCardTeam(cardId: string | undefined, card?: CardOwners | null) {
    const queryClient = useQueryClient()

    const { data: members = [], isLoading } = useQuery({
        queryKey: ['card-team', cardId],
        queryFn: async () => {
            if (!cardId) return []
            const { data, error } = await supabase
                .from('card_team_members')
                .select('*, profile:profiles!card_team_members_profile_id_fkey(id, nome, email, avatar_url)')
                .eq('card_id', cardId)
                .order('created_at', { ascending: true })

            if (error) throw error
            return (data || []) as unknown as CardTeamMember[]
        },
        enabled: !!cardId,
        staleTime: 1000 * 60,
    })

    // Query de profiles para resolver nomes dos owners
    const ownerIds = useMemo(() => {
        if (!card) return []
        return [card.sdr_owner_id, card.vendas_owner_id, card.pos_owner_id, card.concierge_owner_id].filter(Boolean) as string[]
    }, [card])

    const { data: ownerProfiles = [] } = useQuery({
        queryKey: ['profiles-by-ids', ownerIds],
        queryFn: async () => {
            if (ownerIds.length === 0) return []
            const { data, error } = await supabase
                .from('profiles')
                .select('id, nome, email')
                .in('id', ownerIds)

            if (error) throw error
            return data || []
        },
        enabled: ownerIds.length > 0,
        staleTime: 1000 * 60 * 5,
    })

    // Full team = owners + members (sem duplicatas)
    const fullTeam = useMemo<FullTeamMember[]>(() => {
        const seen = new Set<string>()
        const team: FullTeamMember[] = []

        // Owners primeiro
        if (card?.sdr_owner_id) {
            seen.add(card.sdr_owner_id)
            const p = ownerProfiles.find(p => p.id === card.sdr_owner_id)
            team.push({
                profileId: card.sdr_owner_id,
                nome: p?.nome || p?.email || 'SDR',
                role: 'sdr',
                roleLabel: 'SDR',
                isOwner: true,
            })
        }
        if (card?.vendas_owner_id) {
            seen.add(card.vendas_owner_id)
            const p = ownerProfiles.find(p => p.id === card.vendas_owner_id)
            team.push({
                profileId: card.vendas_owner_id,
                nome: p?.nome || p?.email || 'Planner',
                role: 'planner',
                roleLabel: 'Planner',
                isOwner: true,
            })
        }
        if (card?.pos_owner_id) {
            seen.add(card.pos_owner_id)
            const p = ownerProfiles.find(p => p.id === card.pos_owner_id)
            team.push({
                profileId: card.pos_owner_id,
                nome: p?.nome || p?.email || 'Pós-Venda',
                role: 'pos_venda',
                roleLabel: 'Pós-Venda',
                isOwner: true,
            })
        }
        if (card?.concierge_owner_id && !seen.has(card.concierge_owner_id)) {
            seen.add(card.concierge_owner_id)
            const p = ownerProfiles.find(p => p.id === card.concierge_owner_id)
            team.push({
                profileId: card.concierge_owner_id,
                nome: p?.nome || p?.email || 'Concierge',
                role: 'concierge',
                roleLabel: 'Concierge',
                isOwner: true,
            })
        }

        // Membros da tabela (sem duplicar owners)
        for (const m of members) {
            if (seen.has(m.profile_id)) continue
            seen.add(m.profile_id)
            team.push({
                profileId: m.profile_id,
                nome: m.profile?.nome || m.profile?.email || '—',
                role: m.role,
                roleLabel: ROLE_LABELS[m.role] || m.role,
                isOwner: false,
            })
        }

        return team
    }, [card, ownerProfiles, members])

    const addMember = useMutation({
        mutationFn: async ({ profileId, role }: { profileId: string; role: string }) => {
            const { data: { user } } = await supabase.auth.getUser()
            const { error } = await supabase
                .from('card_team_members')
                .insert({
                    card_id: cardId!,
                    profile_id: profileId,
                    role,
                    created_by: user?.id || null,
                })
            if (error) {
                if (error.code === '23505') throw new Error('Esta pessoa já faz parte da equipe deste card.')
                throw error
            }
        },
        onSuccess: () => {
            toast.success('Membro adicionado à equipe')
            queryClient.invalidateQueries({ queryKey: ['card-team', cardId] })
            queryClient.invalidateQueries({ queryKey: ['card-team-counts-global'] })
            queryClient.invalidateQueries({ queryKey: ['my-assist-card-ids'] })
            queryClient.invalidateQueries({ queryKey: ['assist-notification-cards'] })
            queryClient.invalidateQueries({ queryKey: ['assistant-stats'] })
        },
        onError: (error: Error) => {
            toast.error(error.message)
        },
    })

    const removeMember = useMutation({
        mutationFn: async (memberId: string) => {
            const { error } = await supabase
                .from('card_team_members')
                .delete()
                .eq('id', memberId)
            if (error) throw error
        },
        onSuccess: () => {
            toast.success('Membro removido da equipe')
            queryClient.invalidateQueries({ queryKey: ['card-team', cardId] })
            queryClient.invalidateQueries({ queryKey: ['card-team-counts-global'] })
            queryClient.invalidateQueries({ queryKey: ['my-assist-card-ids'] })
            queryClient.invalidateQueries({ queryKey: ['assist-notification-cards'] })
            queryClient.invalidateQueries({ queryKey: ['assistant-stats'] })
        },
        onError: (error: Error) => {
            toast.error('Erro ao remover membro: ' + error.message)
        },
    })

    return { members, fullTeam, isLoading, addMember, removeMember }
}
