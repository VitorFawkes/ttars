import { useMutation } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

const db = supabase as unknown as SupabaseClient

export interface SofiaResetResult {
  ok: boolean
  reason?: string
  state_deleted?: number
  buffer_deleted?: number
  messages_deleted?: number
  cards_cleared?: number
  contacts_cleared?: number
}

/**
 * "Começa do zero" COMPLETO de um número (paridade com a Patricia): apaga a
 * memória consolidada + buffer + histórico de mensagens + zera os dados do card
 * e anonimiza o contato. Org-safe: a RPC usa a org do JWT (requesting_org_id()).
 */
export function useSofiaResetConversation(slug = 'sofia-weddings') {
  return useMutation({
    mutationFn: async (phone: string): Promise<SofiaResetResult> => {
      const { data, error } = await db.rpc('wsdr_reset_conversation_by_phone', {
        p_agent_slug: slug,
        p_phone: phone,
      })
      if (error) throw error
      return data as SofiaResetResult
    },
  })
}
