import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { sbAny } from './_supabaseUntyped'
import type { OutcomeConcierge, SourceConcierge, TipoConcierge, CobradoDe } from './types'

interface CriarAtendimentoInput {
  card_id: string
  tipo_concierge: TipoConcierge
  categoria: string
  source?: SourceConcierge
  titulo?: string
  descricao?: string
  data_vencimento?: string | null
  responsavel_id?: string | null
  prioridade?: string
  valor?: number | null
  cobrado_de?: CobradoDe | null
  origem_descricao?: string
  cadence_step_id?: string | null
  hospedagem_ref?: string | null
  payload?: Record<string, unknown>
}

export function useCriarAtendimento() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CriarAtendimentoInput): Promise<string> => {
      const { data, error } = await sbAny.rpc('rpc_criar_atendimento_concierge', {
        p_card_id: input.card_id,
        p_tipo_concierge: input.tipo_concierge,
        p_categoria: input.categoria,
        p_source: input.source ?? 'manual',
        p_titulo: input.titulo ?? null,
        p_descricao: input.descricao ?? null,
        p_data_vencimento: input.data_vencimento ?? null,
        p_responsavel_id: input.responsavel_id ?? null,
        p_prioridade: input.prioridade ?? 'media',
        p_valor: input.valor ?? null,
        p_cobrado_de: input.cobrado_de ?? null,
        p_origem_descricao: input.origem_descricao ?? null,
        p_cadence_step_id: input.cadence_step_id ?? null,
        p_hospedagem_ref: input.hospedagem_ref ?? null,
        p_payload: input.payload ?? {},
      })
      if (error) throw error
      return data as string
    },
    onSuccess: (_id, vars) => {
      queryClient.invalidateQueries({ queryKey: ['concierge'] })
      queryClient.invalidateQueries({ queryKey: ['tasks-list'] })
      queryClient.invalidateQueries({ queryKey: ['card-detail', vars.card_id] })
      toast.success('Atendimento criado')
    },
    onError: (err: Error) => toast.error('Erro ao criar atendimento', { description: err.message }),
  })
}

interface MarcarOutcomeInput {
  atendimento_id: string
  outcome: OutcomeConcierge
  valor_final?: number | null
  cobrado_de?: CobradoDe | null
  observacao?: string
}

export function useMarcarOutcome() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: MarcarOutcomeInput) => {
      const { error } = await sbAny.rpc('rpc_marcar_outcome', {
        p_atendimento_id: input.atendimento_id,
        p_outcome: input.outcome,
        p_valor_final: input.valor_final ?? null,
        p_cobrado_de: input.cobrado_de ?? null,
        p_observacao: input.observacao ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['concierge'] })
      queryClient.invalidateQueries({ queryKey: ['tasks-list'] })
      queryClient.invalidateQueries({ queryKey: ['my-day-tasks'] })
      toast.success('Atendimento atualizado')
    },
    onError: (err: Error) => toast.error('Erro ao marcar outcome', { description: err.message }),
  })
}

interface ExecutarEmLoteInput {
  atendimento_ids: string[]
  outcome: OutcomeConcierge
  observacao?: string
}

export function useExecutarEmLote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: ExecutarEmLoteInput): Promise<number> => {
      const { data, error } = await sbAny.rpc('rpc_executar_em_lote', {
        p_atendimento_ids: input.atendimento_ids,
        p_outcome: input.outcome,
        p_observacao: input.observacao ?? null,
      })
      if (error) throw error
      return data as number
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['concierge'] })
      queryClient.invalidateQueries({ queryKey: ['tasks-list'] })
      toast.success(`${count} atendimento${count === 1 ? '' : 's'} processado${count === 1 ? '' : 's'}`)
    },
    onError: (err: Error) => toast.error('Erro ao executar em lote', { description: err.message }),
  })
}

export function useNotificarCliente() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (atendimento_id: string) => {
      const { error } = await sbAny.rpc('rpc_notificar_cliente', {
        p_atendimento_id: atendimento_id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['concierge'] })
      toast.success('Notificação registrada')
    },
    onError: (err: Error) => toast.error('Erro ao registrar notificação', { description: err.message }),
  })
}
