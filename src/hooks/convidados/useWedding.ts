import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useOrg } from '../../contexts/OrgContext'
import { sbAny } from './_supabaseUntyped'
import { ETAPA_DEFAULT, type EtapaConvidados, type Wedding } from './types'
import { useFluxoTemplates } from './useFluxoConfig'
import { useAllWeddingFluxos } from './useWeddingFluxo'
import { computeDisplayedEtapa } from './displayedEtapa'

interface Row {
  id: string
  titulo: string
  pipeline_stage_id: string | null
  created_at: string
  data_viagem_inicio: string | null
  produto_data: Record<string, unknown> | null
  wedding_convidados_state: { etapa: EtapaConvidados } | { etapa: EtapaConvidados }[] | null
}

function pickEtapa(state: Row['wedding_convidados_state']): EtapaConvidados {
  if (!state) return ETAPA_DEFAULT
  if (Array.isArray(state)) return state[0]?.etapa ?? ETAPA_DEFAULT
  return state.etapa ?? ETAPA_DEFAULT
}

function readString(data: Record<string, unknown> | null, ...keys: string[]): string | null {
  if (!data) return null
  for (const k of keys) {
    const v = data[k]
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  }
  return null
}

export function useWedding(cardId: string | null | undefined) {
  const { org } = useOrg()
  const orgId = org?.id ?? null
  const { data: flows = [] } = useFluxoTemplates()
  const { data: assignmentStore = {} } = useAllWeddingFluxos()

  const query = useQuery<Wedding | null>({
    queryKey: ['convidados', 'wedding', orgId, cardId],
    enabled: !!orgId && !!cardId,
    queryFn: async () => {
      if (!orgId || !cardId) return null
      const { data, error } = await sbAny
        .from('cards')
        .select('id, titulo, pipeline_stage_id, created_at, data_viagem_inicio, produto_data, wedding_convidados_state(etapa)')
        .eq('id', cardId)
        .eq('org_id', orgId)
        .eq('produto', 'WEDDING')
        .is('deleted_at', null)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const row = data as Row
      return {
        id: row.id,
        titulo: row.titulo,
        pipeline_stage_id: row.pipeline_stage_id,
        created_at: row.created_at,
        wedding_date: row.data_viagem_inicio,
        local: readString(row.produto_data, 'ww_local', 'local_casamento', 'local', 'venue', 'ww_destino'),
        site_url: readString(row.produto_data, 'ww_site_casamento', 'ww_site', 'site_casamento', 'site_url', 'website'),
        etapa: pickEtapa(row.wedding_convidados_state),
      }
    },
  })

  // Sobrescreve etapa com a derivada do fluxo (promo/padrao), exceto quando
  // etapa "crua" for encerrado/cancelado (estados manuais).
  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const wedding = query.data
  const data: Wedding | null | undefined = useMemo(() => {
    if (!wedding) return wedding
    const assignment = assignmentStore[wedding.id] ?? null
    const fluxo = assignment ? flows.find(f => f.id === assignment.fluxoId) ?? null : null
    const etapa = computeDisplayedEtapa(wedding.etapa, assignment, fluxo, today)
    return { ...wedding, etapa }
  }, [wedding, today, assignmentStore, flows])

  return { ...query, data }
}
