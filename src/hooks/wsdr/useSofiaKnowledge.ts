import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

export interface KnowledgeItem {
  id: string
  pergunta: string
  resposta: string
  enabled: boolean
}

interface InvokeResult {
  items?: KnowledgeItem[]
  item?: KnowledgeItem
  embedded?: boolean
  error?: string
  ok?: boolean
}

// Base de conhecimento da Sofia por BUSCA: a lista vive na tabela wsdr_knowledge_items
// (com embeddings), gerida pela edge function wsdr-knowledge. A edição continua simples
// (pergunta/resposta); o embedding é calculado no servidor ao salvar.
export function useSofiaKnowledge(agentSlug = 'sofia-weddings') {
  const qc = useQueryClient()
  const key = ['wsdr-knowledge', agentSlug]

  const q = useQuery({
    queryKey: key,
    queryFn: async (): Promise<KnowledgeItem[]> => {
      const { data, error } = await supabase.functions.invoke<InvokeResult>('wsdr-knowledge', {
        body: { action: 'list', agent_slug: agentSlug },
      })
      if (error) throw error
      return data?.items ?? []
    },
  })

  const reload = () => qc.invalidateQueries({ queryKey: key })

  const upsert = async (item: Partial<KnowledgeItem>): Promise<boolean> => {
    const { data, error } = await supabase.functions.invoke<InvokeResult>('wsdr-knowledge', {
      body: { action: 'upsert', agent_slug: agentSlug, item },
    })
    if (error || data?.error) {
      toast.error(data?.error || 'Erro ao salvar')
      return false
    }
    if (data?.embedded === false) toast('Salvo, mas sem indexar a busca (tente de novo).')
    else toast.success('Salvo e indexado')
    await reload()
    return true
  }

  const remove = async (id: string): Promise<void> => {
    const { error } = await supabase.functions.invoke<InvokeResult>('wsdr-knowledge', {
      body: { action: 'delete', id },
    })
    if (error) {
      toast.error('Erro ao excluir')
      return
    }
    await reload()
  }

  return { items: q.data ?? [], loading: q.isLoading, upsert, remove, reload }
}
