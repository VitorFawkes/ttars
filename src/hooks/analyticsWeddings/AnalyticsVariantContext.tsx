import { createContext, useContext } from 'react'

/**
 * Variante de fonte de dados do dashboard Analytics Weddings.
 *  - 'ac'     → RPCs que leem o cache do ActiveCampaign (ww_funil_casal / ww_ac_deal_funnel_cache).
 *  - 'native' → RPCs *_native que leem só dados do ttars (cards + activities + funil novo).
 *
 * Default 'ac' = comportamento do dashboard atual (/analytics-weddings) preservado.
 * A página Analytics 2 (/analytics-weddings-2) provê 'native'. Os hooks em useWw2.ts
 * das 4 visões derivadas do Active leem isto e trocam o nome do RPC (ver rpcName()).
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
