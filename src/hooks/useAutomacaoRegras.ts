import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type TriggerType =
  | 'stage_enter' | 'stage_exit' | 'card_won' | 'card_lost'
  | 'card_created' | 'field_changed' | 'owner_changed'
  | 'dias_no_stage' | 'dias_sem_contato' | 'sem_resposta_horas'
  | 'dias_antes_viagem' | 'dias_apos_viagem' | 'aniversario_contato'
  | 'documento_recebido' | 'documento_pendente' | 'proposta_visualizada'
  | 'proposta_aceita' | 'proposta_expirada' | 'voo_alterado'
  | 'pagamento_recebido' | 'milestone_atingido'
  | 'webhook_externo'

export type RegraType = 'single' | 'jornada'

export interface AutomacaoRegra {
  id: string
  org_id: string
  produto: string
  nome: string
  descricao: string | null
  ativa: boolean
  tipo: RegraType
  trigger_type: TriggerType
  trigger_config: Record<string, unknown>
  condicoes: Array<Record<string, unknown>>
  template_id: string | null
  max_envios_por_card: number
  dedup_janela_horas: number
  max_mensagens_contato_dia: number
  response_aware: boolean
  modo_aprovacao: boolean
  phone_number_id: string | null
  total_disparados: number
  total_enviados: number
  total_entregues: number
  total_lidos: number
  total_respondidos: number
  total_falhas: number
  total_skipped: number
  created_by: string | null
  created_at: string
  updated_at: string
  mensagem_templates?: { id: string; nome: string; modo: string } | null
}

export interface AutomacaoRegraInput {
  produto: string
  nome: string
  descricao?: string | null
  ativa?: boolean
  tipo?: RegraType
  trigger_type: TriggerType
  trigger_config: Record<string, unknown>
  condicoes?: Array<Record<string, unknown>>
  template_id?: string | null
  max_envios_por_card?: number
  dedup_janela_horas?: number
  max_mensagens_contato_dia?: number
  response_aware?: boolean
  modo_aprovacao?: boolean
  phone_number_id?: string | null
}

const QUERY_KEY = ['automacao-regras']

export function useAutomacaoRegras(produto?: string) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: [...QUERY_KEY, produto],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from('automacao_regras')
        .select('*, mensagem_templates(id, nome, modo)')
        .order('created_at', { ascending: false })

      if (produto) q = q.eq('produto', produto)

      const { data, error } = await q
      if (error) throw error
      return (data || []) as AutomacaoRegra[]
    },
  })

  const create = useMutation({
    mutationFn: async (input: AutomacaoRegraInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('automacao_regras')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })

  const update = useMutation({
    mutationFn: async ({ id, ...input }: AutomacaoRegraInput & { id: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('automacao_regras')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })

  const toggleAtiva = useMutation({
    mutationFn: async ({ id, ativa }: { id: string; ativa: boolean }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('automacao_regras')
        .update({ ativa, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('automacao_regras')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })

  const duplicate = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: original, error: fetchErr } = await (supabase as any)
        .from('automacao_regras')
        .select('*')
        .eq('id', id)
        .single()
      if (fetchErr || !original) throw fetchErr || new Error('Not found')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { id: _id, created_at: _ca, updated_at: _ua, org_id: _oid, ...rest } = original as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('automacao_regras')
        .insert({
          ...rest,
          nome: `${rest.nome} (cópia)`,
          ativa: false,
          total_disparados: 0,
          total_enviados: 0,
          total_entregues: 0,
          total_lidos: 0,
          total_respondidos: 0,
          total_falhas: 0,
          total_skipped: 0,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })

  return {
    regras: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    create,
    update,
    toggleAtiva,
    remove,
    duplicate,
  }
}
