import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

export interface ProposalRecipient {
  id: string
  proposal_id: string
  contato_id: string
  recipient_token: string
  is_primary: boolean
  sent_at: string | null
  sent_via: 'whatsapp' | 'email' | 'manual' | null
  first_opened_at: string | null
  last_opened_at: string | null
  open_count: number
  created_at: string
  contato: {
    id: string
    nome: string
    sobrenome: string | null
    email: string | null
    telefone: string | null
  }
}

export const proposalRecipientKeys = {
  all: ['proposal-recipients'] as const,
  byProposal: (proposalId: string) =>
    [...proposalRecipientKeys.all, proposalId] as const,
  batch: (proposalIds: string[]) =>
    [...proposalRecipientKeys.all, 'batch', proposalIds.slice().sort().join(',')] as const,
}

/**
 * Carrega destinatários de várias propostas numa só query, agrupando por proposal_id.
 * Usado pra renderizar badges na listagem sem fazer N queries.
 */
export function useProposalRecipientsBatch(proposalIds: string[]) {
  return useQuery({
    queryKey: proposalRecipientKeys.batch(proposalIds),
    queryFn: async () => {
      if (proposalIds.length === 0) return {} as Record<string, ProposalRecipient[]>
      const { data, error } = await (supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('proposal_recipients') as any)
        .select(`
          *,
          contato:contatos!proposal_recipients_contato_id_fkey (
            id, nome, sobrenome, email, telefone
          )
        `)
        .in('proposal_id', proposalIds)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true })

      if (error) throw error
      const grouped: Record<string, ProposalRecipient[]> = {}
      ;(data ?? []).forEach((r: ProposalRecipient) => {
        if (!grouped[r.proposal_id]) grouped[r.proposal_id] = []
        grouped[r.proposal_id].push(r)
      })
      return grouped
    },
    enabled: proposalIds.length > 0,
  })
}

export function useProposalRecipients(proposalId: string | undefined) {
  return useQuery({
    queryKey: proposalRecipientKeys.byProposal(proposalId ?? ''),
    queryFn: async () => {
      if (!proposalId) return []
      const { data, error } = await (supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase types desincronizados pra novas tabelas
        .from('proposal_recipients') as any)
        .select(`
          *,
          contato:contatos!proposal_recipients_contato_id_fkey (
            id, nome, sobrenome, email, telefone
          )
        `)
        .eq('proposal_id', proposalId)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true })

      if (error) throw error
      return (data ?? []) as ProposalRecipient[]
    },
    enabled: !!proposalId,
  })
}

export function useAddProposalRecipient() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      proposalId,
      contatoId,
      isPrimary = false,
    }: {
      proposalId: string
      contatoId: string
      isPrimary?: boolean
    }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Usuário não autenticado')

      const { data, error } = await (supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('proposal_recipients') as any)
        .insert({
          proposal_id: proposalId,
          contato_id: contatoId,
          is_primary: isPrimary,
          created_by: user.id,
        })
        .select()
        .single()

      if (error) throw error
      return data as ProposalRecipient
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: proposalRecipientKeys.byProposal(variables.proposalId),
      })
    },
    onError: (err: Error) => {
      // Conflito de unique (proposal_id + contato_id) é esperado quando o
      // mesmo contato é selecionado duas vezes — silencia esse caso.
      if (err.message?.includes('duplicate key')) return
      toast.error(`Erro ao adicionar destinatário: ${err.message}`)
    },
  })
}

export function useRemoveProposalRecipient() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      proposalId,
    }: {
      id: string
      proposalId: string
    }) => {
      const { error } = await (supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('proposal_recipients') as any)
        .delete()
        .eq('id', id)

      if (error) throw error
      return { id, proposalId }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: proposalRecipientKeys.byProposal(variables.proposalId),
      })
    },
    onError: (err: Error) => {
      toast.error(`Erro ao remover destinatário: ${err.message}`)
    },
  })
}

export function useMarkRecipientSent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      proposalId,
      sentVia,
    }: {
      id: string
      proposalId: string
      sentVia: 'whatsapp' | 'email' | 'manual'
    }) => {
      const { error } = await (supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('proposal_recipients') as any)
        .update({
          sent_at: new Date().toISOString(),
          sent_via: sentVia,
        })
        .eq('id', id)

      if (error) throw error
      return { id, proposalId }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: proposalRecipientKeys.byProposal(variables.proposalId),
      })
    },
    onError: (err: Error) => {
      toast.error(`Erro ao marcar como enviado: ${err.message}`)
    },
  })
}
