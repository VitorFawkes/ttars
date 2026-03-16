import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export interface ProductRequirement {
    id: string
    financial_item_id: string
    card_id: string
    titulo: string
    status: 'pendente' | 'concluido'
    data_value: string | null
    arquivo_id: string | null
    notas: string | null
    concluido_em: string | null
    concluido_por: string | null
    created_at: string
    ordem: number
}

export function useProductRequirements(cardId: string) {
    const queryClient = useQueryClient()
    const { profile } = useAuth()
    const queryKey = ['product-requirements', cardId]

    const { data: requirements = [], isLoading } = useQuery({
        queryKey,
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.from('product_requirements') as any)
                .select('*')
                .eq('card_id', cardId)
                .order('ordem')
                .order('created_at')
            if (error) throw error
            return (data || []) as ProductRequirement[]
        },
        enabled: !!cardId,
    })

    const byProduct = (financialItemId: string) =>
        requirements.filter(r => r.financial_item_id === financialItemId)

    const progressByProduct = (financialItemId: string) => {
        const items = byProduct(financialItemId)
        const total = items.length
        const completed = items.filter(r => r.status === 'concluido').length
        return { total, completed }
    }

    const addRequirement = useMutation({
        mutationFn: async ({ financialItemId, titulo }: { financialItemId: string; titulo: string }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.from('product_requirements') as any)
                .insert({
                    financial_item_id: financialItemId,
                    card_id: cardId,
                    titulo,
                    status: 'pendente',
                    ordem: requirements.filter(r => r.financial_item_id === financialItemId).length,
                })
                .select()
                .single()
            if (error) throw error
            return data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey })
        },
    })

    const toggleStatus = useMutation({
        mutationFn: async (requirementId: string) => {
            const req = requirements.find(r => r.id === requirementId)
            if (!req) throw new Error('Requirement not found')

            const newStatus = req.status === 'pendente' ? 'concluido' : 'pendente'
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase.from('product_requirements') as any)
                .update({
                    status: newStatus,
                    concluido_em: newStatus === 'concluido' ? new Date().toISOString() : null,
                    concluido_por: newStatus === 'concluido' ? profile?.id : null,
                })
                .eq('id', requirementId)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey })
        },
    })

    const updateRequirement = useMutation({
        mutationFn: async ({ id, ...updates }: { id: string; titulo?: string; data_value?: string | null; notas?: string | null }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase.from('product_requirements') as any)
                .update(updates)
                .eq('id', id)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey })
        },
    })

    const deleteRequirement = useMutation({
        mutationFn: async (requirementId: string) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase.from('product_requirements') as any)
                .delete()
                .eq('id', requirementId)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey })
        },
    })

    const uploadFile = useMutation({
        mutationFn: async ({ requirementId, financialItemId, file }: { requirementId: string; financialItemId: string; file: File }) => {
            const ext = file.name.split('.').pop() || 'bin'
            const path = `${cardId}/products/${financialItemId}/${requirementId}_${Date.now()}.${ext}`

            const { error: uploadError } = await supabase.storage
                .from('card-documents')
                .upload(path, file)
            if (uploadError) throw uploadError

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase.from('product_requirements') as any)
                .update({ arquivo_id: path })
                .eq('id', requirementId)
            if (error) throw error

            return path
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey })
        },
    })

    return {
        requirements,
        isLoading,
        byProduct,
        progressByProduct,
        addRequirement,
        toggleStatus,
        updateRequirement,
        deleteRequirement,
        uploadFile,
    }
}
