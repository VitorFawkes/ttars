import { useQuery } from '@tanstack/react-query'
import { useOrg } from '../../contexts/OrgContext'
import { sbAny } from './_supabaseUntyped'
import { ETAPA_DEFAULT, type EtapaConvidados, type Wedding } from './types'

// Slug da fase do funil onde a gestão de convidados faz sentido.
// Por design, só casamentos em pós-venda aparecem na aba Convidados.
const POS_VENDA_PHASE_SLUG = 'pos_venda'

interface CardRow {
  id: string
  titulo: string
  pipeline_stage_id: string | null
  created_at: string
  data_viagem_inicio: string | null
  wedding_convidados_state: { etapa: EtapaConvidados } | { etapa: EtapaConvidados }[] | null
}

function pickEtapa(state: CardRow['wedding_convidados_state']): EtapaConvidados {
  if (!state) return ETAPA_DEFAULT
  if (Array.isArray(state)) return state[0]?.etapa ?? ETAPA_DEFAULT
  return state.etapa ?? ETAPA_DEFAULT
}

export function useWeddings() {
  const { org } = useOrg()
  const orgId = org?.id ?? null

  return useQuery<Wedding[]>({
    queryKey: ['convidados', 'weddings', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      if (!orgId) return []

      // 1) Descobre phase_id da pos_venda e pipeline_id do WEDDING em paralelo.
      //    Sem embeds para evitar ambiguidade do PostgREST quando há FKs
      //    reversas entre pipelines e pipeline_stages.
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

      // 2) Stages da fase pos_venda dentro do pipeline WEDDING.
      const { data: stages, error: stagesErr } = await sbAny
        .from('pipeline_stages')
        .select('id')
        .eq('phase_id', phaseId)
        .eq('pipeline_id', pipelineId)
      if (stagesErr) throw stagesErr

      const stageIds = ((stages ?? []) as { id: string }[]).map(s => s.id)
      if (stageIds.length === 0) return []

      // 3) Cards WEDDING dessa org que estão em alguma stage de pos_venda.
      const { data, error } = await sbAny
        .from('cards')
        .select('id, titulo, pipeline_stage_id, created_at, data_viagem_inicio, wedding_convidados_state(etapa)')
        .eq('produto', 'WEDDING')
        .eq('org_id', orgId)
        .in('pipeline_stage_id', stageIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error

      const rows = (data ?? []) as CardRow[]
      return rows.map(row => ({
        id: row.id,
        titulo: row.titulo,
        pipeline_stage_id: row.pipeline_stage_id,
        created_at: row.created_at,
        wedding_date: row.data_viagem_inicio,
        local: null,
        site_url: null,
        etapa: pickEtapa(row.wedding_convidados_state),
      }))
    },
  })
}
