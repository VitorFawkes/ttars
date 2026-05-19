import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { X, ExternalLink, MessageSquare } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { EngajamentoConversation } from '@/types/engagement'

interface Props {
  conversation: EngajamentoConversation | null
  onClose: () => void
}

interface ThreadMessage {
  message_id: string
  direction: 'inbound' | 'outbound'
  body: string | null
  sent_at: string
  attribution_mode: string
  sent_by_user_name: string | null
}

function useConversationThread(conversation: EngajamentoConversation | null) {
  return useQuery<ThreadMessage[]>({
    queryKey: ['engajamento-thread', conversation?.customer_phone, conversation?.phone_line_label],
    queryFn: async () => {
      if (!conversation) return []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- view não está em database.types.ts
      const { data, error } = await (supabase.from as any)('vw_weddings_messages_unified')
        .select('message_id, direction, body, sent_at, attribution_mode, sent_by_user_name')
        .eq('customer_phone', conversation.customer_phone)
        .eq('phone_line_label', conversation.phone_line_label)
        .order('sent_at', { ascending: false })
        .limit(100)

      if (error) throw error
      return ((data ?? []) as ThreadMessage[]).reverse()
    },
    enabled: !!conversation,
    staleTime: 30 * 1000,
  })
}

function formatPhone(phone: string): string {
  if (phone.length === 13 && phone.startsWith('55')) {
    return `+${phone.slice(0, 2)} (${phone.slice(2, 4)}) ${phone.slice(4, 9)}-${phone.slice(9)}`
  }
  if (phone.length === 12 && phone.startsWith('55')) {
    return `+${phone.slice(0, 2)} (${phone.slice(2, 4)}) ${phone.slice(4, 8)}-${phone.slice(8)}`
  }
  return phone
}

export default function EngajamentoConversaDrawer({ conversation, onClose }: Props) {
  const { data: messages = [], isLoading } = useConversationThread(conversation)

  if (!conversation) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40 transition-opacity" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-full sm:w-[480px] bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900 tracking-tight truncate">
              {conversation.contact_name || (
                <span className="italic text-slate-400">(sem cadastro)</span>
              )}
            </h3>
            <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
              <span>{formatPhone(conversation.customer_phone)}</span>
              <span>•</span>
              <span>{conversation.phone_line_label}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stats compactas */}
        <div className="px-5 py-3 border-b border-slate-100 grid grid-cols-3 gap-2 bg-slate-50/50">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-400">Recebidas</div>
            <div className="text-lg font-semibold text-slate-900">{conversation.inbound_count}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-400">Enviadas</div>
            <div className="text-lg font-semibold text-slate-900">
              {conversation.outbound_count}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-400">1ª resposta</div>
            <div className="text-lg font-semibold text-slate-900">
              {conversation.frt_hours !== null && conversation.frt_hours >= 0
                ? conversation.frt_hours < 1
                  ? `${Math.round(conversation.frt_hours * 60)}min`
                  : conversation.frt_hours < 24
                    ? `${conversation.frt_hours.toFixed(1)}h`
                    : `${(conversation.frt_hours / 24).toFixed(1)}d`
                : '—'}
            </div>
          </div>
        </div>

        {/* Card link */}
        {conversation.card_id && (
          <div className="px-5 py-2 border-b border-slate-100">
            <a
              href={`/cards/${conversation.card_id}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" />
              Abrir card desta pessoa
            </a>
          </div>
        )}

        {/* Thread */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-slate-50/30">
          {isLoading && (
            <div className="text-center text-sm text-slate-500 py-12">Carregando mensagens…</div>
          )}

          {!isLoading && messages.length === 0 && (
            <div className="text-center text-sm text-slate-500 py-12 flex flex-col items-center gap-2">
              <MessageSquare className="w-8 h-8 text-slate-300" />
              <span>Nenhuma mensagem encontrada.</span>
            </div>
          )}

          {!isLoading &&
            messages.map(m => (
              <div
                key={m.message_id}
                className={cn('flex', m.direction === 'outbound' ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words shadow-sm',
                    m.direction === 'outbound'
                      ? 'bg-indigo-600 text-white rounded-br-sm'
                      : 'bg-white border border-slate-200 text-slate-900 rounded-bl-sm'
                  )}
                >
                  <div>
                    {m.body || (
                      <span className="italic opacity-70">(mensagem sem texto)</span>
                    )}
                  </div>
                  <div
                    className={cn(
                      'text-[10px] mt-1 flex items-center gap-1.5',
                      m.direction === 'outbound' ? 'text-indigo-200' : 'text-slate-400'
                    )}
                  >
                    <span>{format(new Date(m.sent_at), 'dd/MM HH:mm', { locale: ptBR })}</span>
                    {m.direction === 'outbound' && (
                      <>
                        <span>•</span>
                        <span>
                          {m.sent_by_user_name
                            ? m.sent_by_user_name
                            : m.attribution_mode === 'ai_agent'
                              ? 'IA'
                              : m.attribution_mode === 'cadence'
                                ? 'Cadência'
                                : 'Sistema'}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </>
  )
}
