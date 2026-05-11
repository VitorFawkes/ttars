import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export interface FinancialItemPassenger {
    id: string
    financial_item_id: string
    card_id: string
    nome: string
    status: 'pendente' | 'concluido'
    observacao: string | null
    concluido_em: string | null
    concluido_por: string | null
    created_at: string
    ordem: number
}

export function useFinancialItemPassengers(cardId: string) {
    const queryClient = useQueryClient()
    const { profile } = useAuth()
    const queryKey = ['financial-item-passengers', cardId]

    const { data: passengers = [], isLoading } = useQuery({
        queryKey,
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).from('financial_item_passengers')
                .select('*')
                .eq('card_id', cardId)
                .order('ordem')
                .order('created_at')
            if (error) throw error
            return (data || []) as FinancialItemPassenger[]
        },
        enabled: !!cardId,
    })

    const byProduct = (financialItemId: string) =>
        passengers.filter(p => p.financial_item_id === financialItemId)

    const progressByProduct = (financialItemId: string) => {
        const items = byProduct(financialItemId)
        const total = items.length
        const completed = items.filter(p => p.status === 'concluido').length
        return { total, completed }
    }

    const addPassenger = useMutation({
        mutationFn: async ({ financialItemId, nome }: { financialItemId: string; nome: string }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).from('financial_item_passengers')
                .insert({
                    financial_item_id: financialItemId,
                    card_id: cardId,
                    nome,
                    status: 'pendente',
                    ordem: passengers.filter(p => p.financial_item_id === financialItemId).length,
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
        mutationFn: async (passengerId: string) => {
            const pax = passengers.find(p => p.id === passengerId)
            if (!pax) throw new Error('Passenger not found')

            const newStatus = pax.status === 'pendente' ? 'concluido' : 'pendente'
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).from('financial_item_passengers')
                .update({
                    status: newStatus,
                    concluido_em: newStatus === 'concluido' ? new Date().toISOString() : null,
                    concluido_por: newStatus === 'concluido' ? profile?.id : null,
                })
                .eq('id', passengerId)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey })
        },
    })

    const updateObservation = useMutation({
        mutationFn: async ({ id, observacao }: { id: string; observacao: string }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).from('financial_item_passengers')
                .update({ observacao: observacao || null })
                .eq('id', id)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey })
        },
    })

    const deletePassenger = useMutation({
        mutationFn: async (passengerId: string) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).from('financial_item_passengers')
                .delete()
                .eq('id', passengerId)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey })
        },
    })

    return {
        passengers,
        isLoading,
        byProduct,
        progressByProduct,
        addPassenger,
        toggleStatus,
        updateObservation,
        deletePassenger,
    }
}
