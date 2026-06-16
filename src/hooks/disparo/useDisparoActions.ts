import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOrg } from '../../contexts/OrgContext'
import { sbAny } from '../convidados/_supabaseUntyped'
import type { IngestRow, IngestResult } from './types'

export interface CriarCampanhaInput {
  titulo: string
  corpo_mensagem: string
  corpos_alternativos: string[]
  phone_number_id: string
  cap_diario: number
  usar_ramp: boolean
  tamanho_leva: number
  intervalo_leva_min: number
  variaveis_mapeadas: string[]
}

export interface AgendaResultado {
  out_total: number
  out_termino: string | null
  out_dias: number
}

/** Ações de disparo (criar campanha, ingestão, agenda, controles). */
export function useDisparoActions() {
  const { org } = useOrg()
  const orgId = org?.id ?? null
  const qc = useQueryClient()

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['disparo'] })
  }, [qc])

  const criarCampanha = useCallback(
    async (input: CriarCampanhaInput): Promise<string> => {
      if (!orgId) throw new Error('Sem workspace ativo')
      const { data, error } = await sbAny
        .from('disparo_campanhas')
        .insert({
          org_id: orgId,
          titulo: input.titulo,
          corpo_mensagem: input.corpo_mensagem,
          corpos_alternativos: input.corpos_alternativos,
          phone_number_id: input.phone_number_id,
          cap_diario: input.cap_diario,
          usar_ramp: input.usar_ramp,
          tamanho_leva: input.tamanho_leva,
          intervalo_leva_min: input.intervalo_leva_min,
          variaveis_mapeadas: input.variaveis_mapeadas,
          status: 'rascunho',
        })
        .select('id')
        .single()
      if (error) throw error
      return (data as { id: string }).id
    },
    [orgId],
  )

  const ingestRecipients = useCallback(
    async (
      campaignId: string,
      publico: IngestRow[],
      weddingGuestIds?: string[],
    ): Promise<IngestResult[]> => {
      const { data, error } = await sbAny.rpc('disparo_ingest_recipients', {
        p_campaign_id: campaignId,
        p_publico: publico,
        p_wedding_guest_ids: weddingGuestIds && weddingGuestIds.length > 0 ? weddingGuestIds : null,
      })
      if (error) throw error
      return (data ?? []) as IngestResult[]
    },
    [],
  )

  const calcularAgenda = useCallback(
    async (campaignId: string): Promise<AgendaResultado> => {
      const { data, error } = await sbAny.rpc('disparo_calcular_agenda', { p_campaign_id: campaignId })
      if (error) throw error
      const row = (Array.isArray(data) ? data[0] : data) as AgendaResultado
      invalidate()
      return row
    },
    [invalidate],
  )

  const pausar = useCallback(async (id: string) => {
    const { error } = await sbAny.rpc('disparo_pausar', { p_campaign_id: id })
    if (error) throw error
    invalidate()
  }, [invalidate])

  const retomar = useCallback(async (id: string) => {
    const { error } = await sbAny.rpc('disparo_retomar', { p_campaign_id: id })
    if (error) throw error
    invalidate()
  }, [invalidate])

  const cancelar = useCallback(async (id: string) => {
    const { error } = await sbAny.rpc('disparo_cancelar', { p_campaign_id: id })
    if (error) throw error
    invalidate()
  }, [invalidate])

  const marcarOptOut = useCallback(async (campaignId: string, contactId: string) => {
    const { error } = await sbAny.rpc('disparo_marcar_opt_out', {
      p_campaign_id: campaignId,
      p_contact_id: contactId,
    })
    if (error) throw error
    invalidate()
  }, [invalidate])

  /** Antecipa o envio de uma leva: pessoas específicas (filaIds) OU os próximos N
   *  pendentes. Saem agora, escalonadas com segurança. Retorna quantas foram. */
  const enviarAgora = useCallback(
    async (campaignId: string, opts: { filaIds?: string[]; proximosN?: number }): Promise<number> => {
      const { data, error } = await sbAny.rpc('disparo_enviar_agora', {
        p_campaign_id: campaignId,
        p_fila_ids: opts.filaIds && opts.filaIds.length > 0 ? opts.filaIds : null,
        p_proximos_n: opts.proximosN ?? null,
      })
      if (error) throw error
      invalidate()
      return (data ?? 0) as number
    },
    [invalidate],
  )

  /** Muda o ritmo (leva + intervalo) e reescala os pendentes. */
  const ajustarRitmo = useCallback(
    async (
      campaignId: string,
      r: { tamanhoLeva: number; intervaloMin: number; capDiario: number; usarRamp: boolean },
    ) => {
      const { error } = await sbAny.rpc('disparo_ajustar_ritmo', {
        p_campaign_id: campaignId,
        p_tamanho_leva: r.tamanhoLeva,
        p_intervalo_leva_min: r.intervaloMin,
        p_cap_diario: r.capDiario,
        p_usar_ramp: r.usarRamp,
      })
      if (error) throw error
      invalidate()
    },
    [invalidate],
  )

  return { criarCampanha, ingestRecipients, calcularAgenda, pausar, retomar, cancelar, marcarOptOut, enviarAgora, ajustarRitmo, invalidate }
}
