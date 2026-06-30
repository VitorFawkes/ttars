import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useOrg } from '../../contexts/OrgContext'
import { sbAny } from '../convidados/_supabaseUntyped'
import { colunaFromStageNome } from './displayedEtapaPlanejamento'
import { fetchPosVendaStages } from './_posVendaStages'

/**
 * "Entregar para a Produção": move o casamento NO FUNIL DE VERDADE (RPC
 * `mover_card`) para a etapa de Produção (a pos_venda fora das 6 de Planejamento).
 * Mesma régua do Kanban/CardDetail — nada de estado paralelo. O casamento sai do
 * quadro de Planejamento e passa a aparecer na área de Produção (Convidados, que
 * lê todos os pos_venda, continua intacto).
 */
export function useEntregarParaProducao() {
  const queryClient = useQueryClient()
  const { org } = useOrg()
  const orgId = org?.id ?? null

  // Etapa-alvo de Produção: prefere a que se chama "Produção…"; senão, a primeira
  // etapa pos_venda que não é uma das 6 de Planejamento.
  const targetQuery = useQuery<string | null>({
    queryKey: ['producao', 'target-stage', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      if (!orgId) return null
      const stages = await fetchPosVendaStages(orgId)
      const foraDas6 = stages.filter((s) => colunaFromStageNome(s.nome) === null)
      const porNome = foraDas6.find((s) => s.nome.trim().toLowerCase().startsWith('produção'))
      return (porNome ?? foraDas6[0])?.id ?? null
    },
  })

  return useMutation<void, Error, { cardId: string }>({
    mutationFn: async ({ cardId }) => {
      const stageId = targetQuery.data
      if (!stageId) throw new Error('Não achei a etapa de Produção no funil.')
      const { error } = await sbAny.rpc('mover_card', {
        p_card_id: cardId,
        p_nova_etapa_id: stageId,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      toast.success('Entregue para a Produção.')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['convidados', 'weddings'] }),
        queryClient.invalidateQueries({ queryKey: ['planejamento'] }),
        queryClient.invalidateQueries({ queryKey: ['producao'] }),
      ])
    },
    onError: (err) => toast.error(`Não consegui entregar para a Produção: ${err.message}`),
  })
}
