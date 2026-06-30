import { sbAny } from '../convidados/_supabaseUntyped'

const POS_VENDA_PHASE_SLUG = 'pos_venda'

export interface PosVendaStage {
  id: string
  nome: string
}

/**
 * Stages da fase `pos_venda` do pipeline WEDDING desta org (id + nome).
 * Fonte única para resolver coluna↔stage tanto no Planejamento (as 6 etapas)
 * quanto na Produção (a etapa fora das 6). Sempre filtrado por org_id + produto.
 */
export async function fetchPosVendaStages(orgId: string): Promise<PosVendaStage[]> {
  const [phaseRes, pipelineRes] = await Promise.all([
    sbAny.from('pipeline_phases').select('id').eq('org_id', orgId).eq('slug', POS_VENDA_PHASE_SLUG).maybeSingle(),
    sbAny.from('pipelines').select('id').eq('org_id', orgId).eq('produto', 'WEDDING').maybeSingle(),
  ])
  if (phaseRes.error) throw phaseRes.error
  if (pipelineRes.error) throw pipelineRes.error
  const phaseId: string | undefined = phaseRes.data?.id
  const pipelineId: string | undefined = pipelineRes.data?.id
  if (!phaseId || !pipelineId) return []

  const { data, error } = await sbAny
    .from('pipeline_stages')
    .select('id, nome, ordem')
    .eq('phase_id', phaseId)
    .eq('pipeline_id', pipelineId)
    .order('ordem', { ascending: true })
  if (error) throw error
  return ((data ?? []) as { id: string; nome: string }[]).map((s) => ({ id: s.id, nome: s.nome }))
}
