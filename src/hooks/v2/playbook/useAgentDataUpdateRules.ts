import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Regra de gravação de dados no CRM — define como o agente deve interpretar
 * e normalizar o que o lead disse antes de gravar em campos do card/contato.
 *
 * Substitui o texto livre legacy em prompts_extra.data_update. Quando o
 * array tem itens enabled, o router monta <data_update_rules> a partir
 * deste struct (em ordem ascendente de `order`).
 */
export interface DataUpdateRule {
  /** Slug pra estabilidade ao reordenar. Não vai pro prompt. */
  key: string
  /** Título curto que aparece como header do card. */
  title: string
  /** Corpo da regra — texto que vira parágrafo no prompt. Suporta variáveis {curly}/<angle>. */
  instruction: string
  /** Toggle on/off por regra. */
  enabled: boolean
  /** Ordem de exibição/render. Menor = mais cedo. */
  order: number
}

export function useAgentDataUpdateRules(agentId?: string) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['agent-data-update-rules', agentId],
    enabled: !!agentId,
    queryFn: async () => {
      if (!agentId) return [] as DataUpdateRule[]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_agents')
        .select('data_update_rules')
        .eq('id', agentId)
        .single()
      if (error) throw error
      const arr = data?.data_update_rules
      return Array.isArray(arr) ? (arr as DataUpdateRule[]) : []
    },
  })

  const save = useMutation({
    mutationFn: async (rules: DataUpdateRule[]) => {
      if (!agentId) throw new Error('agentId required')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('ai_agents')
        .update({ data_update_rules: rules })
        .eq('id', agentId)
      if (error) throw error
      return rules
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-data-update-rules', agentId] }),
  })

  return { rules: query.data ?? [], isLoading: query.isLoading, save }
}
