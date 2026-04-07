import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

export interface MondePendingSale {
  id: string
  org_id: string
  venda_num: string
  products: Array<{
    produto: string
    valorTotal: number
    receita: number
    passageiros: string[]
    fornecedor: string
    representante: string
    documento: string
    dataInicio: string | null
    dataFim: string | null
  }>
  total_venda: number
  total_receita: number
  products_count: number
  file_name: string | null
  import_log_id: string | null
  created_by: string | null
  created_at: string
  status: 'pending' | 'matched' | 'expired'
  matched_card_id: string | null
  matched_at: string | null
  // joined
  profile_name?: string
  card_titulo?: string
}

const pendingKeys = {
  all: ['monde-pending-sales'] as const,
  pending: () => [...pendingKeys.all, 'pending'] as const,
  matched: () => [...pendingKeys.all, 'matched'] as const,
}

export function useMondePendingSales() {
  return useQuery({
    queryKey: pendingKeys.pending(),
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from('monde_pending_sales')
        .select('*, profiles:created_by(nome)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (error) throw error

      return (data || []).map((row: Record<string, unknown>) => ({
        ...row,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        profile_name: (row.profiles as any)?.nome || null,
      })) as MondePendingSale[]
    },
  })
}

export function useMondeMatchedSales() {
  return useQuery({
    queryKey: pendingKeys.matched(),
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from('monde_pending_sales')
        .select('*, profiles:created_by(nome), card:matched_card_id(id, titulo)')
        .eq('status', 'matched')
        .order('matched_at', { ascending: false })
        .limit(50)

      if (error) throw error

      return (data || []).map((row: Record<string, unknown>) => ({
        ...row,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        profile_name: (row.profiles as any)?.nome || null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        card_titulo: (row.card as any)?.titulo || null,
      })) as MondePendingSale[]
    },
  })
}

export function useExpirePendingSale() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('monde_pending_sales')
        .update({ status: 'expired' })
        .eq('id', id)
        .eq('status', 'pending')

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pendingKeys.all })
      toast.success('Venda removida da fila de pendentes')
    },
    onError: (error: Error) => {
      toast.error('Erro ao remover venda', { description: error.message })
    },
  })
}
