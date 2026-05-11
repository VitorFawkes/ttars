import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

interface CardRulesSettings {
  subcardRequiresPosVenda: boolean
}

/**
 * Lê regras configuráveis do fluxo de cards (sub-cards etc.) salvas em
 * integration_settings sob namespace card_rules.*. Editadas pelo admin via
 * Gerenciador de Seções → "Regras de Sub-Cards".
 *
 * Keys:
 *   - card_rules.subcard_requires_pos_venda (default true)
 */
export function useCardRulesSettings() {
  const { data, isLoading } = useQuery({
    queryKey: ['card-rules-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_settings')
        .select('key, value')
        .like('key', 'card_rules.%')
      if (error) throw error
      return data as { key: string; value: string }[]
    },
    staleTime: 60_000,
  })

  const settings: CardRulesSettings = {
    subcardRequiresPosVenda: true, // default conservador — bloqueia por padrão
  }

  if (data) {
    for (const row of data) {
      if (row.key === 'card_rules.subcard_requires_pos_venda') {
        settings.subcardRequiresPosVenda = row.value === 'true'
      }
    }
  }

  return { ...settings, isLoading }
}
