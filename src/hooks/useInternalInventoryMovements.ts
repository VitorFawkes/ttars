import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'

// Livro-razão do estoque interno (internal_inventory_movements). Isolado das
// movimentações de presente. Cada saída registra destino + quem solicitou + quem
// retirou. Ver migration 20260625a.

export type InternalMovementType = 'entrada' | 'saida' | 'ajuste' | 'devolucao'
export type InternalDestination = 'on_board' | 'acao_interna' | 'lojinha_aplause' | 'outro'

export const DESTINATION_LABELS: Record<InternalDestination, string> = {
    on_board: 'On Board',
    acao_interna: 'Ação Interna',
    lojinha_aplause: 'Lojinha Aplause',
    outro: 'Outro',
}

export interface InternalInventoryMovement {
    id: string
    org_id: string
    product_id: string
    quantity: number
    movement_type: InternalMovementType
    destination: InternalDestination | null
    requested_by_profile: string | null
    requested_by_name: string | null
    withdrawn_by_profile: string | null
    withdrawn_by_name: string | null
    reason: string | null
    reference_id: string | null
    performed_by: string | null
    created_at: string
    product?: { name: string; sku: string }
    performer?: { nome: string } | null
    requester?: { nome: string } | null
    withdrawer?: { nome: string } | null
}

export interface AddInternalMovementInput {
    product_id: string
    quantity: number
    movement_type: InternalMovementType
    destination?: InternalDestination | null
    requested_by_profile?: string | null
    requested_by_name?: string | null
    withdrawn_by_profile?: string | null
    withdrawn_by_name?: string | null
    reason?: string | null
}

const MOVEMENT_SELECT =
    '*, product:internal_inventory_products(name, sku),' +
    ' performer:profiles!internal_inventory_movements_performed_by_fkey(nome),' +
    ' requester:profiles!internal_inventory_movements_requested_by_profile_fkey(nome),' +
    ' withdrawer:profiles!internal_inventory_movements_withdrawn_by_profile_fkey(nome)'

export function useInternalInventoryMovements(productId?: string | null) {
    const { org } = useOrg()
    const activeOrgId = org?.id

    const { data: movements = [], isLoading } = useQuery({
        queryKey: ['internal-inventory-movements', activeOrgId, productId ?? 'all'],
        queryFn: async () => {
            if (!activeOrgId) return []
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let query = (supabase as any).from('internal_inventory_movements')
                .select(MOVEMENT_SELECT)
                .eq('org_id', activeOrgId)
                .order('created_at', { ascending: false })
                .limit(300)

            if (productId) {
                query = query.eq('product_id', productId)
            }

            const { data, error } = await query
            if (error) throw error
            return (data || []) as InternalInventoryMovement[]
        },
        enabled: !!activeOrgId,
    })

    return { movements, isLoading }
}

export function useAddInternalMovement() {
    const queryClient = useQueryClient()
    const { profile } = useAuth()

    return useMutation({
        // org_id é derivado do produto pai pelo trigger (não enviar do client).
        mutationFn: async (input: AddInternalMovementInput) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).from('internal_inventory_movements')
                .insert({ ...input, performed_by: profile?.id })
                .select()
                .single()
            if (error) throw error
            return data as InternalInventoryMovement
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['internal-inventory-movements'] })
            queryClient.invalidateQueries({ queryKey: ['internal-inventory-products'] })
            queryClient.invalidateQueries({ queryKey: ['internal-inventory-stats'] })
            queryClient.invalidateQueries({ queryKey: ['internal-inventory-low-stock'] })
        },
    })
}
