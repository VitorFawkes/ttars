import { AnalyticsVariantContext } from '@/hooks/analyticsWeddings/AnalyticsVariantContext'
import AnalyticsWeddingsPage from '../AnalyticsWeddings/AnalyticsWeddingsPage'

/**
 * Analytics 2 (OCULTO — sem item na sidebar, acessível só pela URL /analytics-weddings-2):
 * mesmo dashboard de Weddings, mas com a variante 'native' — as visões derivadas leem os
 * RPCs *_native (dados do ttars: funil novo + log de etapas) em vez do cache do ActiveCampaign.
 * Mantido escondido a pedido do usuário para validação interna, sem expor no menu.
 * Reusa a página inteira via contexto — sem duplicar abas/gráficos/filtros.
 */
export default function Analytics2Page() {
  return (
    <AnalyticsVariantContext.Provider value="native">
      <AnalyticsWeddingsPage />
    </AnalyticsVariantContext.Provider>
  )
}
