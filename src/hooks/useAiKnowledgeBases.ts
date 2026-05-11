import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type KbTipo = 'faq' | 'product_catalog' | 'policies' | 'procedures' | 'custom'

export interface AiKnowledgeBase {
  id: string
  org_id: string
  produto: string | null
  nome: string
  tipo: KbTipo
  descricao: string | null
  tags: string[]
  ativa: boolean
  embedding_model: string
  last_synced_at: string | null
  created_by: string | null
  created_at: string
  // Count de items (via join)
  ai_knowledge_base_items?: Array<{ count: number }> | { count: number }[]
}

export interface KbItem {
  id: string
  kb_id: string
  titulo: string
  conteudo: string
  tags: string[]
  ordem: number
  ativa: boolean
  created_at: string
  updated_at: string
}

export interface KbInput {
  nome: string
  produto?: string | null
  tipo: KbTipo
  descricao?: string | null
  tags?: string[]
  ativa?: boolean
}

export interface KbItemInput {
  kb_id: string
  titulo: string
  conteudo: string
  tags?: string[]
  ordem?: number
  ativa?: boolean
}

const KB_KEY = ['ai-knowledge-bases']
const KB_ITEMS_KEY = ['ai-kb-items']

export function useAiKnowledgeBases(produto?: string) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: [...KB_KEY, produto],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from('ai_knowledge_bases')
        .select('*, ai_knowledge_base_items(count)')
        .order('nome')

      if (produto) q = q.eq('produto', produto)

      const { data, error } = await q
      if (error) throw error
      return (data || []) as AiKnowledgeBase[]
    },
  })

  const create = useMutation({
    mutationFn: async (input: KbInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_knowledge_bases')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      return data as AiKnowledgeBase
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KB_KEY }),
  })

  const update = useMutation({
    mutationFn: async ({ id, ...input }: Partial<KbInput> & { id: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_knowledge_bases')
        .update(input)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as AiKnowledgeBase
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KB_KEY }),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('ai_knowledge_bases')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KB_KEY }),
  })

  return {
    knowledgeBases: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    create,
    update,
    remove,
  }
}

export function useAiKbItems(kbId: string | undefined) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: [...KB_ITEMS_KEY, kbId],
    queryFn: async () => {
      if (!kbId) return []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_knowledge_base_items')
        .select('*')
        .eq('kb_id', kbId)
        .order('ordem')

      if (error) throw error
      return (data || []) as KbItem[]
    },
    enabled: !!kbId,
  })

  const createItem = useMutation({
    mutationFn: async (input: KbItemInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_knowledge_base_items')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      return data as KbItem
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...KB_ITEMS_KEY, kbId] })
      queryClient.invalidateQueries({ queryKey: KB_KEY })
    },
  })

  const updateItem = useMutation({
    mutationFn: async ({ id, ...input }: Partial<KbItemInput> & { id: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_knowledge_base_items')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as KbItem
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...KB_ITEMS_KEY, kbId] }),
  })

  const removeItem = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('ai_knowledge_base_items')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...KB_ITEMS_KEY, kbId] })
      queryClient.invalidateQueries({ queryKey: KB_KEY })
    },
  })

  return {
    items: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    createItem,
    updateItem,
    removeItem,
  }
}
