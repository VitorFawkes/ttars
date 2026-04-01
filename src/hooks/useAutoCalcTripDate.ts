import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useFieldLock } from './useFieldLock'
import { useDateFeatureSettings } from './useDateFeatureSettings'

interface FinancialItemDate {
  product_type: string
  description: string | null
  data_inicio: string | null
  data_fim: string | null
}

function isInsurance(item: FinancialItemDate): boolean {
  if (item.product_type === 'insurance') return true
  if (item.description && item.description.toLowerCase().includes('seguro')) return true
  return false
}

/**
 * Auto-calcula data_exata_da_viagem (Data Viagem c/ Welcome) a partir dos
 * financial items do card. Exclui seguro viagem. Respeita o lock do campo.
 */
export function useAutoCalcTripDate(cardId: string) {
  const { lockedFields } = useFieldLock(cardId)
  const { autoCalcEnabled } = useDateFeatureSettings()
  const queryClient = useQueryClient()
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const fieldIsLocked = lockedFields?.data_exata_da_viagem === true

  const { data: items } = useQuery({
    queryKey: ['financial-items-dates', cardId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('card_financial_items') as any)
        .select('product_type, description, data_inicio, data_fim')
        .eq('card_id', cardId)

      if (error) throw error
      return (data || []) as FinancialItemDate[]
    },
    enabled: !!cardId,
    staleTime: 10_000,
  })

  useEffect(() => {
    if (!items || !autoCalcEnabled) return
    if (fieldIsLocked) return

    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      const eligible = items.filter(i => !isInsurance(i))

      const starts = eligible
        .map(i => i.data_inicio)
        .filter((d): d is string => !!d)
        .sort()

      const ends = eligible
        .map(i => i.data_fim)
        .filter((d): d is string => !!d)
        .sort()

      if (starts.length === 0 && ends.length === 0) return

      const earliest = starts[0] || ends[0]
      const latest = ends[ends.length - 1] || starts[starts.length - 1]

      // Ler produto_data atual para merge
      const { data: card } = await supabase
        .from('cards')
        .select('produto_data')
        .eq('id', cardId)
        .single()

      if (!card) return

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const produtoData = (card.produto_data as any) || {}
      const current = produtoData.data_exata_da_viagem

      // Se já tem os mesmos valores, não atualizar
      if (
        current &&
        typeof current === 'object' &&
        (current.start === earliest || current.data_inicio === earliest) &&
        (current.end === latest || current.data_fim === latest)
      ) {
        return
      }

      const newValue = { start: earliest, end: latest }
      const updatedProdutoData = {
        ...produtoData,
        data_exata_da_viagem: newValue,
      }

      const { error } = await supabase
        .from('cards')
        .update({ produto_data: updatedProdutoData })
        .eq('id', cardId)

      if (!error) {
        // Invalidar cache do card detail
        queryClient.invalidateQueries({ queryKey: ['card-detail', cardId] })
      }
    }, 500)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [items, autoCalcEnabled, fieldIsLocked, cardId, queryClient])
}
