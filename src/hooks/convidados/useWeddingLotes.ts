import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useOrg } from '../../contexts/OrgContext'
import { supabase } from '../../lib/supabase'
import { sbAny } from './_supabaseUntyped'
import type { EnvioLoteHistorico } from './useEnviosLotesDoDia'

/** Lista todos os envio_lotes de um card específico (casamento), ordenados do
 *  mais recente pro mais antigo. Realtime invalida quando qualquer lote da org
 *  muda — refiltra no client. */
export function useWeddingLotes(cardId: string | null) {
  const { org } = useOrg()
  const orgId = org?.id ?? null
  const qc = useQueryClient()

  const query = useQuery<EnvioLoteHistorico[]>({
    queryKey: ['convidados', 'envios-lotes-card', orgId, cardId],
    enabled: !!orgId && !!cardId,
    queryFn: async () => {
      if (!orgId || !cardId) return []
      const { data, error } = await sbAny
        .from('envio_lotes')
        .select('id, card_id, template_slug, phone_number_id, total, sent, failed, status, started_at, finished_at')
        .eq('org_id', orgId)
        .eq('card_id', cardId)
        .order('started_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []) as EnvioLoteHistorico[]
    },
  })

  useEffect(() => {
    if (!orgId || !cardId) return
    const channel = supabase
      .channel(`envios-lotes-card-${cardId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'envio_lotes', filter: `card_id=eq.${cardId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['convidados', 'envios-lotes-card', orgId, cardId] })
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [orgId, cardId, qc])

  return query
}
