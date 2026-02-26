import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import type { Database } from '@/database.types'

type TarefaInsert = Database['public']['Tables']['tarefas']['Insert']
type TarefaUpdate = Database['public']['Tables']['tarefas']['Update']

interface CreateMeetingData {
    card_id: string
    titulo: string
    descricao?: string
    data_vencimento: string
    responsavel_id?: string
    participantes_externos?: string[]
    duration_minutes?: number
    status?: string
}

interface CompleteMeetingData {
    id: string
    card_id: string
    outcome: string
    resultado?: string
    feedback?: string
}

interface RescheduleMeetingData {
    id: string
    card_id: string
    titulo: string
    descricao?: string | null
    newDateTime: string
    responsavel_id?: string | null
    participantes_externos?: string[] | null
    duration_minutes?: number
}

export function useMeetingMutation() {
    const queryClient = useQueryClient()
    const { user } = useAuth()

    const invalidateAll = (cardId?: string) => {
        queryClient.invalidateQueries({ queryKey: ['calendar-meetings'] })
        queryClient.invalidateQueries({ queryKey: ['today-meeting-count'] })
        if (cardId) {
            queryClient.invalidateQueries({ queryKey: ['tasks', cardId] })
            queryClient.invalidateQueries({ queryKey: ['card-detail', cardId] })
            queryClient.invalidateQueries({ queryKey: ['card-tasks-completed', cardId] })
            queryClient.invalidateQueries({ queryKey: ['reunioes', cardId] })
        }
    }

    const createMeeting = useMutation({
        mutationFn: async (data: CreateMeetingData) => {
            const insert: TarefaInsert = {
                card_id: data.card_id,
                titulo: data.titulo,
                descricao: data.descricao || null,
                tipo: 'reuniao',
                data_vencimento: data.data_vencimento,
                responsavel_id: data.responsavel_id || user?.id || null,
                participantes_externos: data.participantes_externos || null,
                status: data.status || 'agendada',
                concluida: false,
                metadata: { duration_minutes: data.duration_minutes || 30 },
                created_by: user?.id || null,
            }

            const { data: result, error } = await supabase
                .from('tarefas')
                .insert(insert)
                .select('id')
                .single()

            if (error) throw error
            return result
        },
        onSuccess: (_, vars) => {
            invalidateAll(vars.card_id)
            toast.success('Reunião criada!')
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Erro ao criar reunião')
        },
    })

    const updateMeeting = useMutation({
        mutationFn: async ({ id, updates }: { id: string; cardId: string; updates: TarefaUpdate }) => {
            // Preserve created_at_stage_id in metadata
            if (updates.metadata && typeof updates.metadata === 'object') {
                const { data: current } = await supabase
                    .from('tarefas')
                    .select('metadata')
                    .eq('id', id)
                    .single()

                if (current?.metadata && typeof current.metadata === 'object') {
                    const existing = current.metadata as Record<string, unknown>
                    const incoming = updates.metadata as Record<string, unknown>
                    updates.metadata = {
                        ...existing,
                        ...incoming,
                        created_at_stage_id: existing.created_at_stage_id as string | undefined, // Never overwrite
                    } as TarefaUpdate['metadata']
                }
            }

            const { error } = await supabase
                .from('tarefas')
                .update(updates)
                .eq('id', id)

            if (error) throw error
        },
        onSuccess: (_, vars) => {
            invalidateAll(vars.cardId)
            toast.success('Reunião atualizada!')
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Erro ao atualizar reunião')
        },
    })

    const deleteMeeting = useMutation({
        mutationFn: async ({ id }: { id: string; cardId: string }) => {
            const { error } = await supabase
                .from('tarefas')
                .update({ deleted_at: new Date().toISOString() })
                .eq('id', id)

            if (error) throw error
        },
        onSuccess: (_, vars) => {
            invalidateAll(vars.cardId)
            toast.success('Reunião excluída')
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Erro ao excluir reunião')
        },
    })

    const completeMeeting = useMutation({
        mutationFn: async (data: CompleteMeetingData) => {
            const updates: TarefaUpdate = {
                concluida: true,
                concluida_em: new Date().toISOString(),
                outcome: data.outcome,
                status: data.outcome, // 'realizada', 'nao_compareceu', 'cancelada'
                resultado: data.resultado || null,
                feedback: data.feedback || null,
            }

            const { error } = await supabase
                .from('tarefas')
                .update(updates)
                .eq('id', data.id)

            if (error) throw error
        },
        onSuccess: (_, vars) => {
            invalidateAll(vars.card_id)
            toast.success('Reunião concluída!')
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Erro ao concluir reunião')
        },
    })

    const rescheduleMeeting = useMutation({
        mutationFn: async (data: RescheduleMeetingData) => {
            // 1. Create new meeting
            const { data: newMeeting, error: createError } = await supabase
                .from('tarefas')
                .insert({
                    card_id: data.card_id,
                    titulo: data.titulo,
                    descricao: data.descricao || null,
                    tipo: 'reuniao',
                    data_vencimento: data.newDateTime,
                    responsavel_id: data.responsavel_id || user?.id || null,
                    participantes_externos: data.participantes_externos || null,
                    status: 'agendada',
                    concluida: false,
                    metadata: { duration_minutes: data.duration_minutes || 30 },
                    created_by: user?.id || null,
                    rescheduled_from_id: data.id,
                } as TarefaInsert)
                .select('id')
                .single()

            if (createError) throw createError

            // 2. Mark original as rescheduled
            const { error: updateError } = await supabase
                .from('tarefas')
                .update({
                    status: 'reagendada',
                    concluida: true,
                    concluida_em: new Date().toISOString(),
                    outcome: 'reagendada',
                    rescheduled_to_id: newMeeting.id,
                })
                .eq('id', data.id)

            if (updateError) throw updateError
            return newMeeting
        },
        onSuccess: (_, vars) => {
            invalidateAll(vars.card_id)
            toast.success('Reunião reagendada!')
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Erro ao reagendar reunião')
        },
    })

    const quickUpdateTime = useMutation({
        mutationFn: async ({ id, newDateTime }: { id: string; cardId: string; newDateTime: string }) => {
            const { error } = await supabase
                .from('tarefas')
                .update({ data_vencimento: newDateTime })
                .eq('id', id)

            if (error) throw error
        },
        onSuccess: (_, vars) => {
            invalidateAll(vars.cardId)
            toast.success('Horário atualizado!')
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Erro ao mover reunião')
        },
    })

    return {
        createMeeting,
        updateMeeting,
        deleteMeeting,
        completeMeeting,
        rescheduleMeeting,
        quickUpdateTime,
    }
}
