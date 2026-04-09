import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type TemplateModo = 'template_fixo' | 'template_ia' | 'ia_generativa'

export type TemplateCategoria =
  | 'follow_up' | 'nurturing' | 'lembrete' | 'reativacao'
  | 'pos_venda' | 'aviso' | 'boas_vindas' | 'confirmacao'
  | 'aniversario' | 'outro'

export interface MensagemTemplate {
  id: string
  org_id: string
  produto: string | null
  nome: string
  categoria: TemplateCategoria
  modo: TemplateModo
  corpo: string | null
  ia_prompt: string | null
  ia_contexto_config: Record<string, unknown>
  ia_restricoes: Record<string, unknown>
  is_hsm: boolean
  hsm_template_name: string | null
  hsm_namespace: string | null
  hsm_language: string
  corpo_fallback: string | null
  variaveis: Array<Record<string, unknown>>
  ativa: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface MensagemTemplateInput {
  produto?: string | null
  nome: string
  categoria?: TemplateCategoria
  modo?: TemplateModo
  corpo?: string | null
  ia_prompt?: string | null
  ia_contexto_config?: Record<string, unknown>
  ia_restricoes?: Record<string, unknown>
  is_hsm?: boolean
  hsm_template_name?: string | null
  hsm_namespace?: string | null
  corpo_fallback?: string | null
  variaveis?: Array<Record<string, unknown>>
  ativa?: boolean
}

const QUERY_KEY = ['mensagem-templates']

export function useMensagemTemplates(produto?: string) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: [...QUERY_KEY, produto],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from('mensagem_templates')
        .select('*')
        .order('categoria')
        .order('nome')

      if (produto) {
        q = q.or(`produto.eq.${produto},produto.is.null`)
      }

      const { data, error } = await q
      if (error) throw error
      return data as MensagemTemplate[]
    },
  })

  const create = useMutation({
    mutationFn: async (input: MensagemTemplateInput) => {
      const { data, error } = // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('mensagem_templates')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })

  const update = useMutation({
    mutationFn: async ({ id, ...input }: MensagemTemplateInput & { id: string }) => {
      const { data, error } = // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('mensagem_templates')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('mensagem_templates')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })

  return {
    templates: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    create,
    update,
    remove,
  }
}
