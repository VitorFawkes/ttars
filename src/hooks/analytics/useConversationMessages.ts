import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface WaMessage {
    id: string
    direction: 'inbound' | 'outbound'
    body: string | null
    type: string
    created_at: string
    sender_name: string | null
    sent_by_user_name: string | null
    sent_by_user_id: string | null
    media_url: string | null
    is_ai: boolean
}

export interface WaConversationContact {
    id: string
    name: string | null
    phone: string | null
}

export interface WaConversationCard {
    id: string
    titulo: string | null
    stage_name: string | null
    phase_slug: string | null
    phase_label: string | null
}

export interface WaConversationDetail {
    contact: WaConversationContact
    card: WaConversationCard | null
    messages: WaMessage[]
    total_count: number
}

export function useConversationMessages(contactId: string | null) {
    return useQuery({
        queryKey: ['whatsapp-conversation-messages', contactId],
        queryFn: async () => {
            if (!contactId) return null
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.rpc as any)('get_whatsapp_conversation_messages', {
                p_contact_id: contactId,
                p_limit: 200,
            })
            if (error) throw error
            return (data as unknown as WaConversationDetail) || null
        },
        enabled: !!contactId,
        staleTime: 60 * 1000,
    })
}
