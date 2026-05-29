import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { sbAny } from './_supabaseUntyped'

export interface FundirCasamentosResult {
  success: boolean
  card_destino_id: string
  card_destino_titulo: string | null
  origens_processadas: number
  /** Convidados realocados da origem para o destino (sem duplicata). */
  guests_movidos: number
  /** Convidados que já existiam no destino e foram mesclados (mesmo telefone/contato). */
  guests_mesclados: number
}

export interface FundirCasamentosInput {
  /** Cards de casamento duplicados que serão arquivados. */
  origens: string[]
  /** Card de casamento que permanece e recebe a lista combinada. */
  destino: string
  motivo?: string
}

/**
 * Une casamentos duplicados num só. Combina as listas de convidados,
 * deduplicando por telefone (mesmo contato OU mesmo telefone normalizado),
 * preservando o melhor RSVP e os extras. Os casamentos de origem são
 * arquivados (recuperáveis).
 *
 * Backend: RPC `fundir_casamentos` (migration 20260529a_fundir_casamentos.sql),
 * que por sua vez delega a `fundir_cards_v2` o lado card + arquivamento.
 */
export function useFundirCasamentos() {
  const queryClient = useQueryClient()

  return useMutation<FundirCasamentosResult, Error, FundirCasamentosInput>({
    mutationFn: async ({ origens, destino, motivo }) => {
      const { data, error } = await sbAny.rpc('fundir_casamentos', {
        p_origens: origens,
        p_destino: destino,
        p_motivo: motivo ?? null,
      })
      if (error) throw error
      return data as FundirCasamentosResult
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['convidados'] })
      queryClient.invalidateQueries({ queryKey: ['cards'] })
      const partes: string[] = []
      if (result.guests_movidos > 0) {
        partes.push(`${result.guests_movidos} convidado${result.guests_movidos === 1 ? '' : 's'} movido${result.guests_movidos === 1 ? '' : 's'}`)
      }
      if (result.guests_mesclados > 0) {
        partes.push(`${result.guests_mesclados} repetido${result.guests_mesclados === 1 ? '' : 's'} mesclado${result.guests_mesclados === 1 ? '' : 's'}`)
      }
      const detalhe = partes.length > 0 ? ` (${partes.join(', ')})` : ''
      toast.success(`Casamentos unidos${detalhe}`)
    },
    onError: (err) => {
      toast.error(`Não consegui unir os casamentos: ${err.message}`)
    },
  })
}
