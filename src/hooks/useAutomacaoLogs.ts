import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface AutomacaoExecucao {
  id: string
  org_id: string
  regra_id: string
  card_id: string | null
  contact_id: string | null
  passo_atual_ordem: number
  status: string
  skip_reason: string | null
  trigger_type: string | null
  trigger_data: Record<string, unknown> | null
  template_id: string | null
  corpo_renderizado: string | null
  corpo_ia_gerado: string | null
  attempts: number
  created_at: string
  enviado_at: string | null
  entregue_at: string | null
  lido_at: string | null
  respondido_at: string | null
  cards?: { id: string; titulo: string } | null
  contatos?: { id: string; nome: string; sobrenome: string | null } | null
}

export function useAutomacaoLogs(
  regraId: string | null,
  options?: { status?: string; limit?: number; offset?: number }
) {
  return useQuery({
    queryKey: ['automacao-logs', regraId, options?.status, options?.offset],
    queryFn: async () => {
      if (!regraId) return { logs: [], total: 0 }

      let q = // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('automacao_execucoes')
        .select('*, cards(id, titulo), contatos(id, nome, sobrenome)', { count: 'exact' })
        .eq('regra_id', regraId)
        .order('created_at', { ascending: false })
        .range(options?.offset || 0, (options?.offset || 0) + (options?.limit || 50) - 1)

      if (options?.status) q = q.eq('status', options.status)

      const { data, error, count } = await q
      if (error) throw error
      return { logs: (data || []) as AutomacaoExecucao[], total: count || 0 }
    },
    enabled: !!regraId,
  })
}

export function useAutomacaoMetricas(regraId?: string) {
  return useQuery({
    queryKey: ['automacao-metricas', regraId],
    queryFn: async () => {
      if (!regraId) return null

      const { data, error } = await // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('automacao_regras')
        .select('total_disparados, total_enviados, total_entregues, total_lidos, total_respondidos, total_falhas, total_skipped')
        .eq('id', regraId)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!regraId,
  })
}
