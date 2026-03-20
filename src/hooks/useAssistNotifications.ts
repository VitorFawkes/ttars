import { useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { useProductContext } from './useProductContext'
import { useAuth } from '../contexts/AuthContext'

interface CardSnapshot {
    pipeline_stage_id: string | null
    dono_atual_id: string | null
}

/**
 * Hook que notifica assistentes quando cards que eles assistem sofrem mudanças.
 * Mantém um cache local do state de cada card para detectar mudanças,
 * pois Supabase realtime sem REPLICA IDENTITY FULL não envia oldData completo.
 */
export function useAssistNotifications() {
    const queryClient = useQueryClient()
    const { session } = useAuth()
    const { currentProduct } = useProductContext()
    const currentProductRef = useRef(currentProduct)
    currentProductRef.current = currentProduct

    // Cache local: card_id → { pipeline_stage_id, dono_atual_id }
    const cardSnapshotsRef = useRef<Map<string, CardSnapshot>>(new Map())

    // Fetch card_ids where user is a team member
    const { data: assistCardIds } = useQuery({
        queryKey: ['assist-notification-cards', session?.user?.id],
        enabled: !!session?.user?.id,
        queryFn: async () => {
            if (!session?.user?.id) return []
            const { data, error } = await supabase
                .from('card_team_members')
                .select('card_id')
                .eq('profile_id', session.user.id)
            if (error) return []
            return (data || []).map(d => d.card_id)
        },
        staleTime: 1000 * 60,
    })

    const assistCardIdsRef = useRef<string[]>([])
    assistCardIdsRef.current = assistCardIds || []

    // Carregar snapshots iniciais quando assistCardIds mudam
    useEffect(() => {
        if (!assistCardIds?.length) return

        const loadSnapshots = async () => {
            const { data } = await supabase
                .from('cards')
                .select('id, pipeline_stage_id, dono_atual_id')
                .in('id', assistCardIds)

            if (data) {
                const map = new Map<string, CardSnapshot>()
                for (const card of data) {
                    map.set(card.id, {
                        pipeline_stage_id: card.pipeline_stage_id,
                        dono_atual_id: card.dono_atual_id,
                    })
                }
                cardSnapshotsRef.current = map
            }
        }
        loadSnapshots()
    }, [assistCardIds])

    const showNotification = useCallback((type: 'stage' | 'owner', cardTitle: string, detail: string) => {
        const config = {
            stage: { title: 'Card assistido mudou de etapa', icon: '📋' },
            owner: { title: 'Card assistido mudou de dono', icon: '👤' },
        }
        const c = config[type]
        toast.info(`${c.icon} ${c.title}`, {
            description: `"${cardTitle}" — ${detail}`,
            duration: 5000,
        })

        queryClient.invalidateQueries({ queryKey: ['cards'] })
        queryClient.invalidateQueries({ queryKey: ['pipeline-list'] })
        queryClient.invalidateQueries({ queryKey: ['my-assist-card-ids'] })
    }, [queryClient])

    useEffect(() => {
        if (!session?.user?.id) return

        const channel = supabase
            .channel('assist-card-notifications')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'cards',
                },
                async (payload) => {
                    const newData = payload.new as Record<string, unknown>
                    const cardId = newData.id as string

                    // Only process if this card is one I'm assisting
                    if (!assistCardIdsRef.current.includes(cardId)) return

                    // Product isolation
                    if (newData.produto && newData.produto !== currentProductRef.current) return

                    // Comparar com snapshot local (não depende de oldData do realtime)
                    const snapshot = cardSnapshotsRef.current.get(cardId)
                    if (!snapshot) {
                        // Primeiro update após login — salvar snapshot, não notificar
                        cardSnapshotsRef.current.set(cardId, {
                            pipeline_stage_id: newData.pipeline_stage_id as string | null,
                            dono_atual_id: newData.dono_atual_id as string | null,
                        })
                        return
                    }

                    const newStageId = newData.pipeline_stage_id as string | null
                    const newOwnerId = newData.dono_atual_id as string | null
                    let changed = false

                    // Stage change
                    if (newStageId && newStageId !== snapshot.pipeline_stage_id) {
                        changed = true
                        const { data: stageData } = await supabase
                            .from('pipeline_stages')
                            .select('nome')
                            .eq('id', newStageId)
                            .single()

                        showNotification(
                            'stage',
                            (newData.titulo as string) || 'Card',
                            `Movido para "${stageData?.nome || 'nova etapa'}"`
                        )
                    }

                    // Owner change
                    if (newOwnerId && newOwnerId !== snapshot.dono_atual_id) {
                        changed = true
                        const { data: ownerData } = await supabase
                            .from('profiles')
                            .select('nome')
                            .eq('id', newOwnerId)
                            .single()

                        showNotification(
                            'owner',
                            (newData.titulo as string) || 'Card',
                            `Novo dono: ${ownerData?.nome || 'Desconhecido'}`
                        )
                    }

                    // Atualizar snapshot
                    if (changed) {
                        cardSnapshotsRef.current.set(cardId, {
                            pipeline_stage_id: newStageId,
                            dono_atual_id: newOwnerId,
                        })
                    }
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [session?.user?.id, showNotification])
}
