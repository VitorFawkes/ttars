import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'

// wsdr_agents é módulo novo, fora dos tipos gerados.
const db = supabase as unknown as SupabaseClient

/**
 * Whitelist de telefones que a Sofia (ou clone wsdr) responde, por workspace.
 * Mora em wsdr_agents.test_mode_phone_whitelist (TEXT[]). Telefones são
 * normalizados pra só dígitos antes de gravar.
 *
 * SEGURANÇA: lista vazia = a Sofia NÃO responde ninguém (o webhook trata
 * vazio como "ningúem"). Isolado por org (RLS USING org_id = requesting_org_id()).
 */
export function useSofiaPhoneWhitelist(slug = 'sofia-weddings') {
  const { org } = useOrg()
  const orgId = org?.id
  const queryClient = useQueryClient()
  const key = ['sofia-phone-whitelist', orgId, slug]

  const { data: whitelist = [], isLoading } = useQuery<string[]>({
    queryKey: key,
    enabled: !!orgId && !!slug,
    queryFn: async () => {
      if (!orgId) return []
      const { data, error } = await db
        .from('wsdr_agents')
        .select('test_mode_phone_whitelist')
        .eq('org_id', orgId)
        .eq('slug', slug)
        .maybeSingle()
      if (error) throw error
      const list = (data as { test_mode_phone_whitelist?: string[] | null } | null)?.test_mode_phone_whitelist
      return list ?? []
    },
  })

  const save = useMutation({
    mutationFn: async (next: string[]) => {
      if (!orgId) throw new Error('Sem workspace ativo')
      const cleaned = next.map(p => p.replace(/\D/g, '')).filter(p => p.length >= 10)
      const unique = Array.from(new Set(cleaned))
      const { error } = await db
        .from('wsdr_agents')
        .update({ test_mode_phone_whitelist: unique })
        .eq('org_id', orgId)
        .eq('slug', slug)
      if (error) throw error
      return unique
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(key, saved)
    },
  })

  return {
    whitelist,
    isLoading,
    save: (next: string[]) => save.mutateAsync(next),
    isSaving: save.isPending,
  }
}
