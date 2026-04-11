import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type SkillCategoria = 'data_retrieval' | 'action' | 'analytics' | 'integration' | 'query'
export type SkillTipo = 'supabase_query' | 'n8n_webhook' | 'edge_function' | 'http_api'

export interface AiSkill {
  id: string
  org_id: string
  nome: string
  descricao: string | null
  categoria: SkillCategoria
  tipo: SkillTipo
  config: Record<string, unknown>
  input_schema: Record<string, unknown>
  output_schema: Record<string, unknown>
  examples: Array<Record<string, unknown>>
  rate_limit_per_hour: number
  ativa: boolean
  created_by: string | null
  created_at: string
}

export interface AiSkillInput {
  nome: string
  descricao?: string | null
  categoria: SkillCategoria
  tipo: SkillTipo
  config: Record<string, unknown>
  input_schema: Record<string, unknown>
  output_schema: Record<string, unknown>
  examples?: Array<Record<string, unknown>>
  rate_limit_per_hour?: number
  ativa?: boolean
}

const QUERY_KEY = ['ai-skills']

export function useAiSkills() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_skills')
        .select('*')
        .order('nome')

      if (error) throw error
      return (data || []) as AiSkill[]
    },
  })

  const create = useMutation({
    mutationFn: async (input: AiSkillInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_skills')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      return data as AiSkill
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })

  const update = useMutation({
    mutationFn: async ({ id, ...input }: Partial<AiSkillInput> & { id: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_skills')
        .update(input)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as AiSkill
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('ai_skills')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })

  return {
    skills: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    create,
    update,
    remove,
  }
}
