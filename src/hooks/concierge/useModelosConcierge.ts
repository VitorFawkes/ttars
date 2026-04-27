import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { sbAny } from './_supabaseUntyped'
import type { TipoConcierge } from './types'

export interface ModeloConcierge {
  template_id: string
  template_name: string
  template_description: string | null
  template_active: boolean
  step_id: string
  tipo_concierge: TipoConcierge | null
  categoria_concierge: string | null
  day_offset: number | null
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
    mutationFn: async (input: { template_id: string; is_active: boolean }) => {
      const { error } = await sbAny
        .from('cadence_templates')
        .update({ is_active: input.is_active })
        .eq('id', input.template_id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['concierge', 'modelos'] })
      toast.success('Modelo atualizado')
    },
    onError: (err: Error) => toast.error('Erro ao atualizar modelo', { description: err.message }),
  })
}
