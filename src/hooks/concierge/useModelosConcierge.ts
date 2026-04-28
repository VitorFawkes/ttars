import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { sbAny } from './_supabaseUntyped'
import type { TipoConcierge } from './types'

export type DataAnchor = 'aceite' | 'viagem_inicio' | 'viagem_fim' | 'welcome_inicio' | 'welcome_fim'

export const DATA_ANCHOR_LABEL: Record<DataAnchor, { label: string; descricao: string }> = {
  aceite:         { label: 'No aceite da viagem',                    descricao: 'Conta a partir do dia em que a viagem foi marcada como vendida' },
  viagem_inicio:  { label: 'Embarque (viagem completa)',             descricao: 'A partir do início da viagem completa do cliente (data_viagem_inicio)' },
  viagem_fim:     { label: 'Volta (viagem completa)',                descricao: 'A partir do retorno da viagem completa (data_viagem_fim)' },
  welcome_inicio: { label: 'Início com Welcome',                     descricao: 'A partir da entrada na parte que é com a Welcome (Data Viagem c/ Welcome — início)' },
  welcome_fim:    { label: 'Fim com Welcome',                        descricao: 'A partir da saída da parte com Welcome (Data Viagem c/ Welcome — fim)' },
}

export interface ModeloConcierge {
  template_id: string
  template_name: string
  template_description: string | null
  template_active: boolean
  step_id: string
  tipo_concierge: TipoConcierge | null
  categoria_concierge: string | null
  day_offset: number | null
  data_anchor: DataAnchor
  condicao_extra: Record<string, unknown>
  task_titulo: string | null
  task_descricao: string | null
}

export function useModelosConcierge() {
  return useQuery({
    queryKey: ['concierge', 'modelos'],
    queryFn: async (): Promise<ModeloConcierge[]> => {
      const { data, error } = await sbAny
        .from('cadence_steps')
        .select(`
          id,
          template_id,
          tipo_concierge,
          categoria_concierge,
          day_offset,
          data_anchor,
          condicao_extra,
          task_config,
          gera_atendimento_concierge,
          cadence_templates!inner(id, name, description, is_active)
        `)
        .eq('gera_atendimento_concierge', true)

      if (error) throw error
      const rows = (data ?? []) as Array<{
        id: string
        template_id: string
        tipo_concierge: TipoConcierge | null
        categoria_concierge: string | null
        day_offset: number | null
        data_anchor: DataAnchor | null
        condicao_extra: Record<string, unknown> | null
        task_config: Record<string, unknown> | null
        cadence_templates: { id: string; name: string; description: string | null; is_active: boolean }
      }>

      return rows.map(r => ({
        template_id: r.template_id,
        template_name: r.cadence_templates.name,
        template_description: r.cadence_templates.description,
        template_active: r.cadence_templates.is_active,
        step_id: r.id,
        tipo_concierge: r.tipo_concierge,
        categoria_concierge: r.categoria_concierge,
        day_offset: r.day_offset,
        data_anchor: r.data_anchor ?? 'viagem_inicio',
        condicao_extra: r.condicao_extra ?? {},
        task_titulo: (r.task_config?.titulo as string) ?? null,
        task_descricao: (r.task_config?.descricao as string) ?? null,
      }))
    },
    staleTime: 30 * 1000,
  })
}

export function useToggleModeloAtivo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { template_id: string; is_active: boolean; org_id: string }) => {
      const { error } = await sbAny
        .from('cadence_templates')
        .update({ is_active: input.is_active })
        .eq('id', input.template_id)
        .eq('org_id', input.org_id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['concierge', 'modelos'] })
      queryClient.invalidateQueries({ queryKey: ['cadence-templates'] })
      toast.success('Modelo atualizado')
    },
    onError: (err: Error) => toast.error('Erro ao atualizar modelo', { description: err.message }),
  })
}

interface ModeloPayload {
  name: string
  description: string
  tipo_concierge: TipoConcierge
  categoria_concierge: string
  day_offset: number
  data_anchor: DataAnchor
  task_titulo: string
  task_descricao: string
  condicao_extra?: Record<string, unknown>
  org_id: string
}

export function useCriarModelo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: ModeloPayload): Promise<string> => {
      // 1) cria template
      const { data: template, error: errT } = await sbAny
        .from('cadence_templates')
        .insert({
          name: input.name,
          description: input.description,
          target_audience: 'posvenda',
          is_active: false,
          schedule_mode: 'interval',
          execution_mode: 'linear',
          respect_business_hours: true,
          business_hours_start: 9,
          business_hours_end: 18,
          allowed_weekdays: [1, 2, 3, 4, 5],
          soft_break_after_days: 14,
          require_completion_for_next: false,
          auto_cancel_on_stage_change: true,
          org_id: input.org_id,
        })
        .select('id')
        .single()
      if (errT) throw errT
      const templateId = (template as { id: string }).id

      // 2) cria step linkado
      const { error: errS } = await sbAny
        .from('cadence_steps')
        .insert({
          template_id: templateId,
          step_order: 1,
          step_key: 'b0_t1',
          step_type: 'task',
          task_config: {
            tipo: 'tarefa',
            titulo: input.task_titulo,
            descricao: input.task_descricao,
            prioridade: 'media',
            assign_to: 'role_owner',
            wait_for_outcome: false,
          },
          day_offset: input.day_offset,
          data_anchor: input.data_anchor,
          requires_previous_completed: false,
          gera_atendimento_concierge: true,
          tipo_concierge: input.tipo_concierge,
          categoria_concierge: input.categoria_concierge,
          condicao_extra: input.condicao_extra ?? {},
          org_id: input.org_id,
          block_index: 0,
        })
      if (errS) {
        // rollback template se step falhar (org_id explícito como defesa em profundidade)
        await sbAny.from('cadence_templates').delete().eq('id', templateId).eq('org_id', input.org_id)
        throw errS
      }

      return templateId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['concierge', 'modelos'] })
      queryClient.invalidateQueries({ queryKey: ['cadence-templates'] })
      toast.success('Modelo criado')
    },
    onError: (err: Error) => toast.error('Erro ao criar modelo', { description: err.message }),
  })
}

interface ModeloUpdatePayload {
  template_id: string
  step_id: string
  name: string
  description: string
  tipo_concierge: TipoConcierge
  categoria_concierge: string
  day_offset: number
  data_anchor: DataAnchor
  task_titulo: string
  task_descricao: string
  condicao_extra?: Record<string, unknown>
  org_id: string
}

export function useUpdateModelo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: ModeloUpdatePayload) => {
      const { error: errT } = await sbAny
        .from('cadence_templates')
        .update({ name: input.name, description: input.description })
        .eq('id', input.template_id)
        .eq('org_id', input.org_id)
      if (errT) throw errT

      const { error: errS } = await sbAny
        .from('cadence_steps')
        .update({
          tipo_concierge: input.tipo_concierge,
          categoria_concierge: input.categoria_concierge,
          day_offset: input.day_offset,
          data_anchor: input.data_anchor,
          condicao_extra: input.condicao_extra ?? {},
          task_config: {
            tipo: 'tarefa',
            titulo: input.task_titulo,
            descricao: input.task_descricao,
            prioridade: 'media',
            assign_to: 'role_owner',
            wait_for_outcome: false,
          },
        })
        .eq('id', input.step_id)
      if (errS) throw errS
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['concierge', 'modelos'] })
      queryClient.invalidateQueries({ queryKey: ['cadence-templates'] })
      toast.success('Modelo salvo')
    },
    onError: (err: Error) => toast.error('Erro ao salvar modelo', { description: err.message }),
  })
}

export function useDeleteModelo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { template_id: string; org_id: string }) => {
      // cadence_steps tem FK pra cadence_templates ON DELETE CASCADE
      const { error } = await sbAny
        .from('cadence_templates')
        .delete()
        .eq('id', input.template_id)
        .eq('org_id', input.org_id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['concierge', 'modelos'] })
      queryClient.invalidateQueries({ queryKey: ['cadence-templates'] })
      toast.success('Modelo excluído')
    },
    onError: (err: Error) => toast.error('Erro ao excluir modelo', { description: err.message }),
  })
}
