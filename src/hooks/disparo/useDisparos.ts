import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useOrg } from '../../contexts/OrgContext'
import { supabase } from '../../lib/supabase'
import { sbAny } from '../convidados/_supabaseUntyped'
import type { DisparoCampanha, DisparoFilaItem } from './types'

/** Lista campanhas de disparo da org ativa (realtime). */
export function useDisparoCampanhas() {
  const { org } = useOrg()
  const orgId = org?.id ?? null
  const qc = useQueryClient()

  const query = useQuery<DisparoCampanha[]>({
    queryKey: ['disparo', 'campanhas', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      if (!orgId) return []
      const { data, error } = await sbAny
        .from('disparo_campanhas')
        .select('*')
        .eq('org_id', orgId)
        .neq('status', 'rascunho') // esconde rascunhos incompletos do board
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []) as DisparoCampanha[]
    },
  })

  useEffect(() => {
    if (!orgId) return
    const channel = supabase
      .channel(`disparo-campanhas-${orgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'disparo_campanhas', filter: `org_id=eq.${orgId}` },
        () => qc.invalidateQueries({ queryKey: ['disparo', 'campanhas', orgId] }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [orgId, qc])

  return query
}

/** Itens da fila de uma campanha (pro relatório). */
export function useDisparoFila(campaignId: string | null) {
  const { org } = useOrg()
  const orgId = org?.id ?? null

  return useQuery<DisparoFilaItem[]>({
    queryKey: ['disparo', 'fila', campaignId],
    enabled: !!campaignId && !!orgId,
    queryFn: async () => {
      if (!campaignId) return []
      const { data, error } = await sbAny
        .from('disparo_fila')
        .select('id, campaign_id, contact_id, telefone_normalizado, status, execute_at, priority, attempts, corpo_renderizado, erro_motivo, enviado_at, variaveis, whatsapp_message_id, contato:contatos(nome)')
        .eq('campaign_id', campaignId)
        .order('execute_at', { ascending: true })
        .limit(2000)
      if (error) throw error
      return (data ?? []) as DisparoFilaItem[]
    },
  })
}
