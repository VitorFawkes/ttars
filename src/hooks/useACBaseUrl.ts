import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'

/**
 * Retorna a URL base do ActiveCampaign (app) para a org atual, derivada do
 * ACTIVECAMPAIGN_API_URL armazenado em integration_settings.
 *
 * Ex.: 'https://welcometrips.api-us1.com' → 'https://welcometrips.activehosted.com'
 *
 * Usado para montar deep-link de contato: `${base}/app/contacts/${externalId}`.
 */
export function useACBaseUrl() {
  const { org } = useOrg()
  const orgId = org?.id
  return useQuery({
    queryKey: ['ac-base-url', orgId],
    queryFn: async (): Promise<string | null> => {
      if (!orgId) return null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('get_ac_app_url', { p_org_id: orgId })
      if (error) throw error
      return (data as string | null) ?? null
    },
    enabled: !!orgId,
    staleTime: 60 * 60_000,
  })
}

/** Deep-link para o DEAL do casal no Active (preferido — abre a card da venda) */
export function buildACDealUrl(baseUrl: string | null | undefined, dealId: string | null | undefined): string | null {
  if (!baseUrl || !dealId) return null
  const id = String(dealId).trim()
  if (!id) return null
  return `${baseUrl}/app/deals/${id}`
}

export function buildACContactUrl(baseUrl: string | null | undefined, externalId: string | null | undefined): string | null {
  if (!baseUrl || !externalId) return null
  const id = String(externalId).trim()
  if (!id) return null
  return `${baseUrl}/app/contacts/${id}`
}
