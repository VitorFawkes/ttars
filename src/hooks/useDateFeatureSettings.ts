import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

interface DateFeatureSettings {
  posVendaAlertEnabled: boolean
  autoCalcEnabled: boolean
}

/**
 * Lê configurações de features de data de viagem do integration_settings.
 * Keys: date_features.pos_venda_alert_enabled, date_features.auto_calc_from_products_enabled
 */
export function useDateFeatureSettings() {
  const { data, isLoading } = useQuery({
    queryKey: ['date-feature-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_settings')
        .select('key, value')
        .like('key', 'date_features.%')

      if (error) throw error
      return data as { key: string; value: string }[]
    },
    staleTime: 60_000,
  })

  const settings: DateFeatureSettings = {
    posVendaAlertEnabled: true,
    autoCalcEnabled: true,
  }

  if (data) {
    for (const row of data) {
      if (row.key === 'date_features.pos_venda_alert_enabled') {
        settings.posVendaAlertEnabled = row.value === 'true'
      }
      if (row.key === 'date_features.auto_calc_from_products_enabled') {
        settings.autoCalcEnabled = row.value === 'true'
      }
    }
  }

  return { ...settings, isLoading }
}
