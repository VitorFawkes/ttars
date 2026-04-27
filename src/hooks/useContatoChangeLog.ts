import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type ContatoChangeEventType = 'created' | 'updated' | 'deleted' | 'restored'
export type ContatoChangeSource = 'manual' | 'monde_import' | 'system' | string

export interface ContatoFieldChange {
    from: unknown
    to: unknown
}

export interface ContatoChangeLogEntry {
    id: string
    event_type: ContatoChangeEventType
    changed_fields: Record<string, ContatoFieldChange> | null
    source: ContatoChangeSource
    changed_by: string | null
    changed_by_name: string | null
    created_at: string
}

export function useContatoChangeLog(contatoId: string | undefined) {
    return useQuery({
        queryKey: ['contato-change-log', contatoId],
        queryFn: async () => {
            if (!contatoId) return [] as ContatoChangeLogEntry[]
            const { data, error } = await supabase.rpc('get_contato_change_log', {
                p_contato_id: contatoId,
                p_limit: 100,
            })
            if (error) throw error
            return (data || []) as ContatoChangeLogEntry[]
        },
        enabled: !!contatoId,
    })
}
