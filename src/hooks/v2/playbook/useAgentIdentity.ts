import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Princípio único de caráter — vira 1 card editável na UI.
 *
 * Formato novo (substitui principles_text texto livre). Quando presente,
 * o router renderiza cada item com enabled=true em ordem dentro de
 * `<principles>`. Sem nova migration — vive dentro de identity_config JSONB.
 */
export interface IdentityPrinciple {
  /** Slug pra estabilidade ao reordenar. Não vai pro prompt. */
  key: string
  /** Título curto que aparece como header do card. Ex: "Não invento o que não sei" */
  title: string
  /** Corpo descritivo (1-3 frases). Pode conter variáveis {curly} e <angle>. */
  body: string
  /** Toggle on/off por princípio. Princípio desabilitado é ignorado pelo router. */
  enabled: boolean
  /** Ordem de exibição/render. Menor = mais cedo. */
  order: number
}

export interface IdentityConfig {
  role?: string
  role_custom?: string | null
  mission_one_liner?: string
  company_description_override?: string | null
  /**
   * @deprecated Texto livre antigo. Substituído por `principles` (array).
   * Quando `principles` não existir/vazio, hook converte deste texto on-load.
   * Save sempre escreve novo formato.
   */
  principles_text?: string | null
  /**
   * Princípios de caráter da agente. Cada item vira card editável na UI e
   * é renderizado pelo engine v2 como bloco `<principles>` separado entre
   * `<identity>` e `<agent_schedule>`. Substitui o texto livre legacy.
   */
  principles?: IdentityPrinciple[] | null
}

export function useAgentIdentity(agentId?: string) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['agent-identity', agentId],
    enabled: !!agentId,
    queryFn: async () => {
      if (!agentId) return null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_agents')
        .select('identity_config')
        .eq('id', agentId)
        .single()
      if (error) throw error
      return (data?.identity_config as IdentityConfig | null) ?? null
    },
  })

  const save = useMutation({
    mutationFn: async (config: IdentityConfig) => {
      if (!agentId) throw new Error('agentId required')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('ai_agents')
        .update({ identity_config: config })
        .eq('id', agentId)
      if (error) throw error
      return config
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-identity', agentId] }),
  })

  return { identity: query.data ?? null, isLoading: query.isLoading, save }
}
