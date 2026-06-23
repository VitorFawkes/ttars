import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useOrg } from '../../contexts/OrgContext'
import { sbAny } from '../convidados/_supabaseUntyped'
import { colunaFromStageNome } from './displayedEtapaPlanejamento'
import { PLANEJAMENTO_LABEL, type EtapaPlanejamento } from './types'

const POS_VENDA_PHASE_SLUG = 'pos_venda'

interface UpdatePlanejamentoInput {
  cardId: string
  etapa: EtapaPlanejamento
}

/**
 * Move o casamento de etapa NO FUNIL DE VERDADE (cards.pipeline_stage_id via RPC
 * `mover_card`) — a mesma régua do Kanban/CardDetail/AC. O board de Planejamento
 * é uma LENTE do funil nativo, não um estado paralelo. Resolve a coluna do board
 * → stage real da fase pos_venda WEDDING pelo NOME (PLANEJAMENTO_LABEL bate 1:1).
 */
export function useUpdatePlanejamentoEtapa() {
  const queryClient = useQueryClient()
  const { org } = useOrg()
  const orgId = org?.id ?? null

  // coluna do board -> stageId real da fase pos_venda WEDDING.
  const colToStageQuery = useQuery<Partial<Record<EtapaPlanejamento, string>>>({
    queryKey: ['planejamento', 'coluna-to-stage', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      if (!orgId) return {}
      const [phaseRes, pipelineRes] = await Promise.all([
        sbAny.from('pipeline_phases').select('id').eq('org_id', orgId).eq('slug', POS_VENDA_PHASE_SLUG).maybeSingle(),
        sbAny.from('pipelines').select('id').eq('org_id', orgId).eq('produto', 'WEDDING').maybeSingle(),
      ])
      if (phaseRes.error) throw phaseRes.error
      if (pipelineRes.error) throw pipelineRes.error
      const phaseId: string | undefined = phaseRes.data?.id
      const pipelineId: string | undefined = pipelineRes.data?.id
      if (!phaseId || !pipelineId) return {}

      const { data, error } = await sbAny
        .from('pipeline_stages')
        .select('id, nome')
        .eq('phase_id', phaseId)
        .eq('pipeline_id', pipelineId)
      if (error) throw error

      const map: Partial<Record<EtapaPlanejamento, string>> = {}
      for (const s of (data ?? []) as { id: string; nome: string }[]) {
        const col = colunaFromStageNome(s.nome)
        if (col && !map[col]) map[col] = s.id
      }
      return map
    },
  })

  return useMutation<void, Error, UpdatePlanejamentoInput, { previous: [readonly unknown[], unknown][] }>({
    mutationFn: async ({ cardId, etapa }) => {
      const stageId = colToStageQuery.data?.[etapa]
      if (!stageId) throw new Error('Não achei a etapa correspondente no funil.')
      const { error } = await sbAny.rpc('mover_card', {
        p_card_id: cardId,
        p_nova_etapa_id: stageId,
      })
      if (error) throw error
    },
    // Otimista: move o card de coluna na hora, trocando o pipeline_stage_id no cache.
    onMutate: async ({ cardId, etapa }) => {
      const stageId = colToStageQuery.data?.[etapa]
      await queryClient.cancelQueries({ queryKey: ['convidados', 'weddings'] })
      const previous = queryClient.getQueriesData({ queryKey: ['convidados', 'weddings'] })
      if (stageId) {
        queryClient.setQueriesData(
          { queryKey: ['convidados', 'weddings'] },
          (old: unknown) => {
            if (!Array.isArray(old)) return old
            return old.map((c) =>
              c && typeof c === 'object' && (c as { id?: string }).id === cardId
                ? { ...(c as object), pipeline_stage_id: stageId }
                : c,
            )
          },
        )
      }
      return { previous }
    },
    onError: (err, _vars, ctx) => {
      // Reverte o otimismo.
      for (const [key, value] of ctx?.previous ?? []) {
        queryClient.setQueryData(key, value)
      }
      toast.error(`Não consegui mudar a etapa: ${err.message}`)
    },
    onSuccess: (_, vars) => {
      toast.success(`Etapa: ${PLANEJAMENTO_LABEL[vars.etapa]}`)
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['convidados', 'weddings'] }),
        queryClient.invalidateQueries({ queryKey: ['planejamento'] }),
      ])
    },
  })
}
