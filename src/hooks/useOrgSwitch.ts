import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useOrgSwitch() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ orgId }: { orgId: string }) => {
            // RPC criada na Fase 1 do org split — types serão regenerados
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase.rpc as any)('switch_organization', {
                p_org_id: orgId,
            })
            if (error) throw error

            // Refresh JWT para trazer o novo org_id no app_metadata
            const { error: refreshError } = await supabase.auth.refreshSession()
            if (refreshError) throw refreshError
        },
        onSuccess: () => {
            // Nova org = novo escopo de dados. Produto é derivado da org via useProductContext.
            queryClient.clear()
        },
    })
}
