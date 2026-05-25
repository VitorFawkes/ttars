import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useOrg } from '../../contexts/OrgContext'
import { sbAny } from './_supabaseUntyped'

export interface UpdateWeddingInput {
  cardId: string
  titulo: string
  data_viagem_inicio: string | null
  ww_local: string | null
  ww_data_final_acao: string | null
  ww_link_atendimento: string | null
  ww_site_casamento: string | null
}

/** Atualiza colunas do card e mergeia chaves do produto_data sem perder outras
 *  chaves que outros módulos guardam lá (ex: ww_hotel, ww_cerimonia, etc).
 *
 *  Lê produto_data atual, faz spread e sobrescreve só as 4 chaves editáveis
 *  por aqui — usar update direto com `{ ww_local: ... }` apagaria as demais. */
export function useUpdateWedding() {
  const queryClient = useQueryClient()
  const { org } = useOrg()
  const orgId = org?.id ?? null

  return useMutation<void, Error, UpdateWeddingInput>({
    mutationFn: async (input) => {
      if (!orgId) throw new Error('Workspace não identificado.')

      const { data: current, error: readErr } = await sbAny
        .from('cards')
        .select('produto_data')
        .eq('id', input.cardId)
        .eq('org_id', orgId)
        .maybeSingle()
      if (readErr) throw readErr

      const currentProdutoData =
        (current?.produto_data && typeof current.produto_data === 'object'
          ? (current.produto_data as Record<string, unknown>)
          : {})

      const mergedProdutoData = {
        ...currentProdutoData,
        ww_local: input.ww_local,
        ww_data_final_acao: input.ww_data_final_acao,
        ww_link_atendimento: input.ww_link_atendimento,
        ww_site_casamento: input.ww_site_casamento,
      }

      const { error } = await sbAny
        .from('cards')
        .update({
          titulo: input.titulo,
          data_viagem_inicio: input.data_viagem_inicio,
          produto_data: mergedProdutoData,
        })
        .eq('id', input.cardId)
        .eq('org_id', orgId)
      if (error) throw error
    },
    onSuccess: async (_, vars) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['convidados'] }),
        queryClient.invalidateQueries({ queryKey: ['card-extras', vars.cardId] }),
      ])
      toast.success('Casamento atualizado.')
    },
    onError: (err) => {
      toast.error(`Não consegui salvar: ${err.message}`)
    },
  })
}
