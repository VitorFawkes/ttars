import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useOrg } from '../../contexts/OrgContext'
import { supabase } from '../../lib/supabase'
import { sbAny } from './_supabaseUntyped'

export interface EnvioLoteHistorico {
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

/** Lista TODOS os envio_lotes da org no dia selecionado — envios e reenvios,
 *  ordenados do mais recente pro mais antigo. Substitui o useEnvioStatus(card,
 *  slug) que só pegava o último.
 *
 *  Subscribe realtime: invalida quando qualquer lote da org muda. */
export function useEnviosLotesDoDia(date: Date) {
  const { org } = useOrg()
  const orgId = org?.id ?? null
  const qc = useQueryClient()

  const startOfDay = new Date(date)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(startOfDay)
  endOfDay.setDate(endOfDay.getDate() + 1)

  const query = useQuery<EnvioLoteHistorico[]>({
    queryKey: ['convidados', 'envios-lotes-dia', orgId, startOfDay.toISOString()],
    enabled: !!orgId,
    queryFn: async () => {
      if (!orgId) return []
      const { data, error } = await sbAny
        .from('envio_lotes')
        .select('id, card_id, template_slug, phone_number_id, total, sent, failed, status, started_at, finished_at')
        .eq('org_id', orgId)
        .gte('started_at', startOfDay.toISOString())
        .lt('started_at', endOfDay.toISOString())
        .order('started_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return (data ?? []) as EnvioLoteHistorico[]
    },
  })

  useEffect(() => {
    if (!orgId) return
    const channel = supabase
      .channel(`envios-lotes-dia-${orgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'envio_lotes', filter: `org_id=eq.${orgId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['convidados', 'envios-lotes-dia', orgId] })
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [orgId, qc])

  return query
}
