import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

/**
 * Registra que o usuário abriu um card. Chamado no mount do CardDetail.
 * Se é a PRIMEIRA vez que o usuário abre esse card, o backend aciona
 * regras de alerta com trigger_mode='on_card_open'.
 *
 * Deduplicado localmente via ref pra evitar dupla chamada no StrictMode
 * e só chama uma vez por mount do componente.
 */
export function useRecordCardOpen(cardId: string | undefined) {
    const { user } = useAuth()
    const queryClient = useQueryClient()
    const calledRef = useRef<string | null>(null)

    useEffect(() => {
        if (!cardId || !user?.id) return
        if (calledRef.current === cardId) return
        calledRef.current = cardId

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova fora dos types gerados
        ;(supabase as any)
            .rpc('record_card_open', { p_card_id: cardId })
            .then(({ data, error }: { data: { is_first_open?: boolean; alerts_triggered?: number } | null; error: unknown }) => {
                if (error) {
                    console.warn('[useRecordCardOpen] falhou:', error)
                    return
                }
                // Se criou alertas novos, invalida notifications pra mostrar no sininho
                if (data?.alerts_triggered && data.alerts_triggered > 0) {
                    queryClient.invalidateQueries({ queryKey: ['notifications', user.id] })
                }
            })
    }, [cardId, user?.id, queryClient])
}
