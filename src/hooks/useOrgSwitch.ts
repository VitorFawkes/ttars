import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useProductContext } from './useProductContext'

// Org slug → default product slug
const ORG_PRODUCT_MAP: Record<string, string> = {
    'welcome-trips': 'TRIPS',
    'welcome-weddings': 'WEDDING',
}

export function useOrgSwitch() {
    const queryClient = useQueryClient()
    const setProduct = useProductContext((s) => s.setProduct)

    return useMutation({
        mutationFn: async ({ orgId, orgSlug }: { orgId: string; orgSlug: string }) => {
            // RPC criada na Fase 1 do org split — types serão regenerados
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase.rpc as any)('switch_organization', {
                p_org_id: orgId,
            })
            if (error) throw error

            // Refresh JWT to get new org_id in app_metadata
            const { error: refreshError } = await supabase.auth.refreshSession()
            if (refreshError) throw refreshError

            return orgSlug
        },
        onSuccess: (orgSlug) => {
            // Sync product context to match the new org
            const product = ORG_PRODUCT_MAP[orgSlug]
            if (product) setProduct(product)

            // Clear all cached data — new org means different data scope
            queryClient.clear()
        },
    })
}
