import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Retorna o valor de ai_agents.feature_flag_discovery_v2.
 *
 * Quando true, o router usa o schema V2 (goal/must_include/example_questions/
 * literal_question) na geração do prompt; a UI deve mostrar SÓ esses campos
 * e esconder os legados (coverage_notes/questions/must_collect).
 *
 * Default false enquanto a query carrega — UI fica com legado por segurança
 * (consistente com comportamento do backend).
 */
export function useAgentDiscoveryFlag(agentId: string | null | undefined): boolean {
  const { data } = useQuery({
    queryKey: ['agent-discovery-flag', agentId],
    enabled: !!agentId,
    queryFn: async () => {
      if (!agentId) return false
      // database.types.ts gerado via CLI pode estar defasado em relação a
      // colunas adicionadas em migrations recentes; cast inline pra contornar.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_agents')
        .select('feature_flag_discovery_v2')
        .eq('id', agentId)
        .maybeSingle()
      if (error) throw error
      return !!data?.feature_flag_discovery_v2
    },
    staleTime: 1000 * 60, // 1min — flag muda raramente
  })

  return !!data
}
