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
      const tarefaId = atendimento.tarefa_id
      const atendimentoId = atendimento.atendimento_id
      const agora = new Date().toISOString()

      if (destino === 'aguardando_atendimento') {
        // Reset total: zera started_at + concluida (trigger limpa outcome) e notificou_cliente_em.
        const { error: e1 } = await sbAny
          .from('tarefas')
          .update({ started_at: null, concluida: false })
          .eq('id', tarefaId)
        if (e1) throw e1
        const { error: e2 } = await sbAny
          .from('atendimentos_concierge')
          .update({ notificou_cliente_em: null })
          .eq('id', atendimentoId)
        if (e2) throw e2
        return
      }

      if (destino === 'em_contato') {
        const startedAt = atendimento.started_at ?? agora
        const { error: e1 } = await sbAny
          .from('tarefas')
          .update({ started_at: startedAt, concluida: false })
          .eq('id', tarefaId)
        if (e1) throw e1
        const { error: e2 } = await sbAny
          .from('atendimentos_concierge')
          .update({ notificou_cliente_em: null })
          .eq('id', atendimentoId)
        if (e2) throw e2
        return
      }

      if (destino === 'aguardando_retorno') {
        const startedAt = atendimento.started_at ?? agora
        const notificou = atendimento.notificou_cliente_em ?? agora
        const { error: e1 } = await sbAny
          .from('tarefas')
          .update({ started_at: startedAt, concluida: false })
          .eq('id', tarefaId)
        if (e1) throw e1
        const { error: e2 } = await sbAny
          .from('atendimentos_concierge')
          .update({ notificou_cliente_em: notificou })
          .eq('id', atendimentoId)
        if (e2) throw e2
        return
      }

      if (destino === 'feito') {
        const { error } = await sbAny.rpc('rpc_marcar_outcome', {
          p_atendimento_id: atendimentoId,
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
          p_atendimento_id: atendimentoId,
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

            const agora = new Date().toISOString()

            if (destino === 'aguardando_atendimento') {
              const next = {
                ...item,
                started_at: null,
                notificou_cliente_em: null,
                outcome: null,
                outcome_em: null,
                outcome_por: null,
              }
              return { ...next, estado_funil: computeEstadoFunil(next) }
            }
            if (destino === 'em_contato') {
              const next = {
                ...item,
                started_at: item.started_at ?? agora,
                notificou_cliente_em: null,
                outcome: null,
                outcome_em: null,
                outcome_por: null,
              }
              return { ...next, estado_funil: computeEstadoFunil(next) }
            }
            if (destino === 'aguardando_retorno') {
              const next = {
                ...item,
                started_at: item.started_at ?? agora,
                notificou_cliente_em: item.notificou_cliente_em ?? agora,
                outcome: null,
                outcome_em: null,
                outcome_por: null,
              }
              return { ...next, estado_funil: computeEstadoFunil(next) }
            }
            if (destino === 'feito') {
              const next = { ...item, outcome: 'feito' as OutcomeConcierge, outcome_em: agora }
              return { ...next, estado_funil: computeEstadoFunil(next) }
            }
            if (destino === 'encerrado') {
              const next = { ...item, outcome: (outcomeEncerramento ?? 'cancelado') as OutcomeConcierge, outcome_em: agora }
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

    onSuccess: () => {
      toast.success('Card movido com sucesso')

      queryClient.invalidateQueries({ queryKey: ['concierge'] })
      queryClient.invalidateQueries({ queryKey: ['tasks-list'] })
      queryClient.invalidateQueries({ queryKey: ['my-day-tasks'] })
    },
  })
}
