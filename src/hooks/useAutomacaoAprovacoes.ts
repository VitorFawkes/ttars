import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface AprovacaoPendente {
  id: string
  regra_id: string
  card_id: string | null
  contact_id: string | null
  corpo_ia_gerado: string | null
  ia_contexto_usado: Record<string, unknown> | null
  created_at: string
  cards?: { id: string; titulo: string } | null
  contatos?: { id: string; nome: string; sobrenome: string | null } | null
  automacao_regras?: { id: string; nome: string } | null
}

const QUERY_KEY = ['automacao-aprovacoes']

export function useAutomacaoAprovacoes() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('automacao_execucoes')
        .select('id, regra_id, card_id, contact_id, corpo_ia_gerado, ia_contexto_usado, created_at, cards(id, titulo), contatos(id, nome, sobrenome), automacao_regras(id, nome)')
        .eq('status', 'aguardando_aprovacao')
        .order('created_at', { ascending: true })
        .limit(50)

      if (error) throw error
      return (data || []) as AprovacaoPendente[]
    },
    refetchInterval: 30000, // Poll every 30s
  })

  const aprovar = useMutation({
    mutationFn: async ({ id, corpoEditado }: { id: string; corpoEditado?: string }) => {
      const updateData: Record<string, unknown> = {
        status: 'pending', // Back to pending for processor to send
      }
      if (corpoEditado) {
        updateData.corpo_ia_gerado = corpoEditado
        updateData.corpo_renderizado = corpoEditado
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('automacao_execucoes')
        .update(updateData)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })

  const rejeitar = useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo?: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('automacao_execucoes')
        .update({
          status: 'skipped',
          skip_reason: motivo ? `ia_rejeitada: ${motivo}` : 'ia_rejeitada',
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })

  return {
    pendentes: query.data || [],
    isLoading: query.isLoading,
    total: query.data?.length || 0,
    aprovar,
    rejeitar,
  }
}
