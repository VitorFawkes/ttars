import { useQuery } from '@tanstack/react-query'
import { useOrg } from '../../../contexts/OrgContext'
import { sbAny } from '../_supabaseUntyped'
import type { CasalAdminRow } from '../../../lib/convidados/types'

export function useCasais() {
  const { org } = useOrg()
  const orgId = org?.id ?? null
  return useQuery<CasalAdminRow[]>({
    queryKey: ['casais', 'admin', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await sbAny.rpc('wedding_casal_admin_list_v2')
      if (error) throw error
      return (data ?? []) as CasalAdminRow[]
    },
  })
}
