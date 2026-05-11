import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface ContactProposal {
    contact_id: string
    contact_name: string
    proposal_id: string
    card_id: string
    proposal_title: string | null
    status: string
    created_at: string
    accepted_at: string | null
    valid_until: string | null
    total_value: number
    card_title: string
    data_viagem_inicio: string | null
    data_viagem_fim: string | null
    role: 'titular' | 'viajante'
}

export interface ContactProposalStats {
    totalProposals: number
    acceptedProposals: number
    totalRevenue: number
    averageTicket: number
    conversionRate: number
}

export function useContactProposals(contactId: string | undefined) {
    return useQuery({
        queryKey: ['contact-proposals', contactId],
        queryFn: async () => {
            if (!contactId) return []

            const { data, error } = await supabase
                .from('v_contact_proposals')
                .select('*')
                .eq('contact_id', contactId)
                .order('created_at', { ascending: false })

            if (error) throw error
            return data as ContactProposal[]
        },
        enabled: !!contactId,
    })
}

export function useContactProposalStats(contactId: string | undefined) {
    const { data: proposals = [], isLoading } = useContactProposals(contactId)

    const stats: ContactProposalStats = {
        totalProposals: proposals.length,
        acceptedProposals: proposals.filter(p => p.status === 'accepted').length,
        totalRevenue: proposals
            .filter(p => p.status === 'accepted')
            .reduce((sum, p) => sum + Number(p.total_value || 0), 0),
        averageTicket: 0,
        conversionRate: 0,
    }

    if (stats.acceptedProposals > 0) {
        stats.averageTicket = stats.totalRevenue / stats.acceptedProposals
    }

    const sentCount = proposals.filter(p =>
        ['sent', 'viewed', 'accepted', 'rejected'].includes(p.status)
    ).length

    if (sentCount > 0) {
        stats.conversionRate = Math.round((stats.acceptedProposals / sentCount) * 100)
    }

    return { stats, isLoading }
}
