import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export interface Organization {
  id: string
  name: string
  slug: string
  active: boolean
  created_at: string
  user_count: number
  active_card_count: number
}

export interface ProvisionOrgInput {
  name: string
  slug: string
  adminEmail: string
  template: 'generic_3phase' | 'simple_2phase'
  productName: string
  productSlug: string
}

export interface ProvisionOrgResult {
  success: boolean
  orgId: string
  inviteToken: string | null
  inviteUrl: string | null
}

export function useOrganizations() {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isProvisioning, setIsProvisioning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchOrganizations = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('provision-org', {
        method: 'GET',
      })
      if (fnError) throw fnError
      setOrganizations(data.organizations ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar organizações')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const provisionOrganization = useCallback(async (
    input: ProvisionOrgInput
  ): Promise<ProvisionOrgResult> => {
    setIsProvisioning(true)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('provision-org', {
        method: 'POST',
        body: input,
      })
      if (fnError) throw fnError
      if (data.error) throw new Error(data.error)
      // Atualizar lista local
      await fetchOrganizations()
      return data as ProvisionOrgResult
    } finally {
      setIsProvisioning(false)
    }
  }, [fetchOrganizations])

  return {
    organizations,
    isLoading,
    isProvisioning,
    error,
    fetchOrganizations,
    provisionOrganization,
  }
}
