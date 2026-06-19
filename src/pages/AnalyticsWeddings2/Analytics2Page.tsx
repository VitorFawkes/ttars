import { AnalyticsVariantContext } from '@/hooks/analyticsWeddings/AnalyticsVariantContext'
import AnalyticsWeddingsPage from '../AnalyticsWeddings/AnalyticsWeddingsPage'

/**
 * Analytics 2 (WIP) — mesmo dashboard de Weddings, mas com a variante 'native':
 * as 4 visões que hoje vêm do ActiveCampaign (funil/onde-estão, conversão, agenda,
 * série temporal) passam a ler os RPCs *_native (dados do ttars: funil novo +
 * log de etapas). As outras 5 abas já são nativas e ficam idênticas ao Analytics 1.
 * Reusa a página inteira via contexto — sem duplicar abas/gráficos/filtros.
 */
export default function Analytics2Page() {
  return (
    <AnalyticsVariantContext.Provider value="native">
      <AnalyticsWeddingsPage />
    </AnalyticsVariantContext.Provider>
  )
}
