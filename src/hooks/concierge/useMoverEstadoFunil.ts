import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { sbAny } from './_supabaseUntyped'
import type { OutcomeConcierge } from './types'
import type { EstadoFunil, KanbanTarefaItem } from './useKanbanTarefas'
import { computeEstadoFunil } from './useKanbanTarefas'

interface MoverEstadoInput {
  atendimento: KanbanTarefaItem
  destino: EstadoFunil
  /**
   * Quando o destino é 'encerrado' o caller passa qual outcome aplicar
   * (recusado | cancelado) e a observação.
   */
  outcomeEncerramento?: 'recusado' | 'cancelado'
  observacao?: string
}

interface OptimisticContext {
  rollback: () => void
}

export function useMoverEstadoFunil() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, MoverEstadoInput, OptimisticContext>({
    mutationFn: async ({ atendimento, destino, outcomeEncerramento, observacao }) => {
      if (destino === 'a_fazer') {
        throw new Error('Não dá pra voltar para "A fazer"')
      }

      if (destino === 'em_contato') {
        if (atendimento.notificou_cliente_em) return
        const { error } = await sbAny.rpc('rpc_notificar_cliente', {
          p_atendimento_id: atendimento.atendimento_id,
        })
        if (error) throw error
        return
      }

      if (destino === 'aceito') {
        if (atendimento.tipo_concierge !== 'oferta') {
          throw new Error('Só ofertas podem ser marcadas como aceitas')
        }
        const { error } = await sbAny.rpc('rpc_marcar_outcome', {
          p_atendimento_id: atendimento.atendimento_id,
          p_outcome: 'aceito' satisfies OutcomeConcierge,
          p_valor_final: atendimento.valor ?? null,
          p_cobrado_de: atendimento.cobrado_de ?? null,
          p_observacao: observacao ?? null,
        })
        if (error) throw error
        return
      }

      if (destino === 'feito') {
        const { error } = await sbAny.rpc('rpc_marcar_outcome', {
          p_atendimento_id: atendimento.atendimento_id,
          p_outcome: 'feito' satisfies OutcomeConcierge,
          p_valor_final: atendimento.valor ?? null,
          p_cobrado_de: atendimento.cobrado_de ?? null,
          p_observacao: observacao ?? null,
        })
        if (error) throw error
        return
      }

      if (destino === 'encerrado') {
        const outcome: OutcomeConcierge = outcomeEncerramento ?? 'cancelado'
        const { error } = await sbAny.rpc('rpc_marcar_outcome', {
          p_atendimento_id: atendimento.atendimento_id,
          p_outcome: outcome,
          p_valor_final: null,
          p_cobrado_de: null,
          p_observacao: observacao ?? null,
        })
        if (error) throw error
        return
      }
    },

    onMutate: async ({ atendimento, destino, outcomeEncerramento }) => {
      await queryClient.cancelQueries({ queryKey: ['concierge'] })

      const previous: Array<[readonly unknown[], unknown]> = []

      queryClient.setQueriesData<KanbanTarefaItem[]>(
        { queryKey: ['concierge', 'kanban-tarefas'] },
        (old) => {
          if (!old) return old
          previous.push([['concierge', 'kanban-tarefas'], old])
          return old.map(item => {
            if (item.atendimento_id !== atendimento.atendimento_id) return item

            if (destino === 'em_contato') {
              const next = { ...item, notificou_cliente_em: new Date().toISOString() }
              return { ...next, estado_funil: computeEstadoFunil(next) }
            }
            if (destino === 'aceito') {
              const next = { ...item, outcome: 'aceito' as OutcomeConcierge, outcome_em: new Date().toISOString() }
              return { ...next, estado_funil: computeEstadoFunil(next) }
            }
            if (destino === 'feito') {
              const next = { ...item, outcome: 'feito' as OutcomeConcierge, outcome_em: new Date().toISOString() }
              return { ...next, estado_funil: computeEstadoFunil(next) }
            }
            if (destino === 'encerrado') {
              const next = { ...item, outcome: (outcomeEncerramento ?? 'cancelado') as OutcomeConcierge, outcome_em: new Date().toISOString() }
              return { ...next, estado_funil: computeEstadoFunil(next) }
            }
            return item
          })
        }
      )

      return {
        rollback: () => {
          for (const [key, value] of previous) {
            queryClient.setQueryData(key, value)
          }
        },
      }
    },

    onError: (err, _vars, context) => {
      context?.rollback?.()
      toast.error('Não foi possível mover o atendimento', { description: err.message })
    },

    onSuccess: (_data, vars) => {
      if (vars.destino === 'em_contato')        toast.success('Cliente notificado')
      else if (vars.destino === 'aceito')       toast.success('Oferta marcada como aceita')
      else if (vars.destino === 'feito')        toast.success('Atendimento concluído')
      else if (vars.destino === 'encerrado')    toast.success('Atendimento encerrado')

      queryClient.invalidateQueries({ queryKey: ['concierge'] })
      queryClient.invalidateQueries({ queryKey: ['tasks-list'] })
      queryClient.invalidateQueries({ queryKey: ['my-day-tasks'] })
    },
  })
}
