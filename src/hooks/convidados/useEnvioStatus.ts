import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useOrg } from '../../contexts/OrgContext'
import { supabase } from '../../lib/supabase'
import { sbAny } from './_supabaseUntyped'

export interface EnvioLote {
  id: string
  card_id: string
  template_slug: string
  phone_number_id: string
  total: number
  sent: number
  failed: number
  status: 'enviando' | 'concluido' | 'erro'
  started_at: string
  finished_at: string | null
}

/** Retorna o lote mais recente do dia pra (card_id, template_slug). Subscribe
 *  realtime — atualiza quando o lote conclui (ou ao receber novo lote). */
export function useEnvioStatus(cardId: string, templateSlug: string) {
  const { org } = useOrg()
  const orgId = org?.id ?? null
  const qc = useQueryClient()

  const query = useQuery<EnvioLote | null>({
    queryKey: ['convidados', 'envio-lote', orgId, cardId, templateSlug],
    enabled: !!orgId && !!cardId && !!templateSlug,
    queryFn: async () => {
      if (!orgId) return null
      // Lote mais recente do dia (ou em andamento) pra esse card+template
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)
      const { data, error } = await sbAny
        .from('envio_lotes')
        .select('id, card_id, template_slug, phone_number_id, total, sent, failed, status, started_at, finished_at')
        .eq('org_id', orgId)
        .eq('card_id', cardId)
        .eq('template_slug', templateSlug)
        .gte('started_at', startOfDay.toISOString())
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as EnvioLote | null
    },
  })

  // Realtime: invalida quando insert/update no envio_lotes desse card+template
  useEffect(() => {
    if (!orgId || !cardId || !templateSlug) return
    const channel = supabase
      .channel(`envio-lote-${cardId}-${templateSlug}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'envio_lotes',
          filter: `card_id=eq.${cardId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ['convidados', 'envio-lote', orgId, cardId, templateSlug] })
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [orgId, cardId, templateSlug, qc])

  return query
}
