import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useOrg } from '../../contexts/OrgContext'
import { sbAny } from '../convidados/_supabaseUntyped'

// Estado de ACEITE das decisões do casamento (destino/data/local/orcamento).
// O VALOR vive em cards.produto_data (single source); aqui só guardamos se foi
// proposto/aceito pelo casal. Tabela wedding_decisoes (per-org, FK ao card).

export type DecisaoTipo = 'destino' | 'data' | 'local' | 'orcamento'
export type DecisaoStatus = 'proposto' | 'aceito'

export interface DecisaoRow {
  id: string
  card_id: string
  tipo: DecisaoTipo
  status: DecisaoStatus
  valor_label: string | null
  proposto_em: string | null
  aceito_em: string | null
  aceito_por: string | null
}

export function useWeddingDecisoes(cardId: string | null | undefined) {
  const { org } = useOrg()
  const orgId = org?.id ?? null
  const queryClient = useQueryClient()

  const query = useQuery<DecisaoRow[]>({
    queryKey: ['planejamento', 'decisoes', orgId, cardId],
    enabled: !!orgId && !!cardId,
    queryFn: async () => {
      if (!orgId || !cardId) return []
      const { data, error } = await sbAny
        .from('wedding_decisoes')
        .select('id, card_id, tipo, status, valor_label, proposto_em, aceito_em, aceito_por')
        .eq('org_id', orgId)
        .eq('card_id', cardId)
      if (error) throw error
      return (data ?? []) as DecisaoRow[]
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['planejamento', 'decisoes', orgId, cardId] })

  // Define o estado de aceite de uma decisão (upsert por card_id+tipo).
  const setStatus = useMutation<void, Error, { tipo: DecisaoTipo; status: DecisaoStatus; valorLabel?: string | null }>({
    mutationFn: async ({ tipo, status, valorLabel }) => {
      if (!cardId) throw new Error('Casamento não identificado.')
      const payload: Record<string, unknown> = {
        card_id: cardId,
        tipo,
        status,
        valor_label: valorLabel ?? null,
      }
      if (status === 'aceito') {
        payload.aceito_em = new Date().toISOString()
        payload.aceito_por = 'casal'
      } else {
        payload.aceito_em = null
        payload.aceito_por = null
      }
      // org_id é carimbado pelo trigger strict a partir de cards.org_id.
      const { error } = await sbAny
        .from('wedding_decisoes')
        .upsert(payload, { onConflict: 'card_id,tipo' })
      if (error) throw error
    },
    onSuccess: async () => {
      await invalidate()
    },
    onError: (err) => toast.error(`Não consegui salvar o aceite: ${err.message}`),
  })

  const byTipo = (query.data ?? []).reduce<Partial<Record<DecisaoTipo, DecisaoRow>>>((acc, r) => {
    acc[r.tipo] = r
    return acc
  }, {})

  return { byTipo, isLoading: query.isLoading, setStatus }
}
