import { createContext, useContext } from 'react'

/**
 * Variante de fonte de dados do dashboard Analytics Weddings.
 *  - 'ac'     → RPCs que leem o cache do ActiveCampaign (ww_funil_casal / ww_ac_deal_funnel_cache).
 *  - 'native' → RPCs *_native que leem só dados do ttars (cards + activities + funil novo).
 *
 * Default 'ac' = comportamento do dashboard /analytics-weddings (única página). Os hooks
 * em useWw2.ts leem isto e trocam o nome do RPC via rpcName(). Hoje só 'ac' é usado —
 * não há mais rota provendo 'native' (a antiga /analytics-weddings-2 foi removida); o
 * suporte a 'native' fica aqui apenas como ponto de extensão futuro.
 */
export type AnalyticsVariant = 'ac' | 'native'

export const AnalyticsVariantContext = createContext<AnalyticsVariant>('ac')

export function useAnalyticsVariant(): AnalyticsVariant {
  return useContext(AnalyticsVariantContext)
}

/** Sufixa o nome do RPC com _native quando a variante é nativa. */
export function rpcName(base: string, variant: AnalyticsVariant): string {
  return variant === 'native' ? `${base}_native` : base
}
