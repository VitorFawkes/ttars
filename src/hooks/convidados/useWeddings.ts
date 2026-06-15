import { useQuery } from '@tanstack/react-query'
import { useOrg } from '../../contexts/OrgContext'
import { sbAny } from './_supabaseUntyped'
import { ETAPA_DEFAULT, type EtapaConvidados, type Wedding } from './types'

const POS_VENDA_PHASE_SLUG = 'pos_venda'

interface CardRow {
  id: string
  titulo: string
  pipeline_stage_id: string | null
  created_at: string
  data_viagem_inicio: string | null
  produto_data: Record<string, unknown> | null
  wedding_convidados_state: { etapa: EtapaConvidados } | { etapa: EtapaConvidados }[] | null
}

function pickEtapa(state: CardRow['wedding_convidados_state']): EtapaConvidados {
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

export function useWeddings() {
  const { org } = useOrg()
  const orgId = org?.id ?? null

  return useQuery<Wedding[]>({
    queryKey: ['convidados', 'weddings', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      if (!orgId) return []

      // 1) Stages da fase pos_venda do pipeline WEDDING dessa org.
      const [phaseRes, pipelineRes] = await Promise.all([
        sbAny
          .from('pipeline_phases')
          .select('id')
          .eq('org_id', orgId)
          .eq('slug', POS_VENDA_PHASE_SLUG)
          .maybeSingle(),
        sbAny
          .from('pipelines')
          .select('id')
          .eq('org_id', orgId)
          .eq('produto', 'WEDDING')
          .maybeSingle(),
      ])
      if (phaseRes.error) throw phaseRes.error
      if (pipelineRes.error) throw pipelineRes.error

      const phaseId: string | undefined = phaseRes.data?.id
      const pipelineId: string | undefined = pipelineRes.data?.id
      if (!phaseId || !pipelineId) return []

      const { data: stages, error: stagesErr } = await sbAny
        .from('pipeline_stages')
        .select('id')
        .eq('phase_id', phaseId)
        .eq('pipeline_id', pipelineId)
      if (stagesErr) throw stagesErr

      const stageIds = ((stages ?? []) as { id: string }[]).map(s => s.id)
      if (stageIds.length === 0) return []

      // 2) Cards WEDDING da org em qualquer stage de pos_venda (paginado por
      //    causa do cap server-side de 1000 do PostgREST).
      const PAGE = 1000
      const rows: CardRow[] = []
      for (let start = 0; ; start += PAGE) {
        const { data, error } = await sbAny
          .from('cards')
          .select('id, titulo, pipeline_stage_id, created_at, data_viagem_inicio, produto_data, wedding_convidados_state(etapa)')
          .eq('produto', 'WEDDING')
          .eq('org_id', orgId)
          .in('pipeline_stage_id', stageIds)
          .is('deleted_at', null)
          // Esconde casamentos arquivados (ex.: o duplicado que sobrou após
          // unir dois casamentos) — senão a sobra vazia continua aparecendo
          // no board como uma falsa duplicata.
          .is('archived_at', null)
          .order('created_at', { ascending: false })
          .range(start, start + PAGE - 1)
        if (error) throw error
        const page = (data ?? []) as CardRow[]
        rows.push(...page)
        if (page.length < PAGE) break
      }
      return rows.map(row => ({
        id: row.id,
        titulo: row.titulo,
        pipeline_stage_id: row.pipeline_stage_id,
        created_at: row.created_at,
        wedding_date: row.data_viagem_inicio,
        local: readString(row.produto_data, 'ww_local', 'local_casamento', 'local', 'venue', 'ww_destino'),
        site_url: readString(row.produto_data, 'ww_site_casamento', 'ww_site', 'site_casamento', 'site_url', 'website'),
        etapa: pickEtapa(row.wedding_convidados_state),
      }))
    },
  })
}
