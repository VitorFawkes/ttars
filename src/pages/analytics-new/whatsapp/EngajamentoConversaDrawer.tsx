import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { X, ExternalLink, MessageSquare, Phone, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEngajamentoThread } from '@/hooks/analytics/useEngajamentoConversas'
import type { EngajamentoConversation } from '@/types/engagement'

interface Props {
  conversation: EngajamentoConversation | null
  onClose: () => void
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

function formatHoursValue(hours: number | null): string {
  if (hours === null || hours === undefined || hours < 0) return '—'
  if (hours < 1) return `${Math.round(hours * 60)}min`
  if (hours < 24) return `${hours.toFixed(1)}h`
  return `${(hours / 24).toFixed(1)}d`
}

export default function EngajamentoConversaDrawer({ conversation, onClose }: Props) {
  const { data, isLoading } = useEngajamentoThread(
    conversation?.customer_phone ?? null,
    conversation?.phone_line_label ?? null
  )

  if (!conversation) return null

  const messages = data?.thread ?? []
  const stats = data?.stats

  return (
    <>
      <div
        className="fixed inset-0 bg-slate-900/40 z-40 transition-opacity duration-200"
        onClick={onClose}
        style={{ animation: 'fadeIn 200ms ease-out' }}
      />

      <div
        className="fixed right-0 top-0 bottom-0 w-full sm:w-[520px] bg-white shadow-2xl z-50 flex flex-col"
        style={{ animation: 'slideInRight 280ms cubic-bezier(0.23, 1, 0.32, 1)' }}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-slate-900 tracking-tight truncate">
              {conversation.contact_name || (
                <span className="italic text-slate-400 font-normal">Sem cadastro</span>
              )}
            </h3>
            <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="flex items-center gap-1">
                <Phone className="w-3 h-3" />
                {formatPhone(conversation.customer_phone)}
              </span>
              <span className="text-slate-300">•</span>
              <span>{conversation.phone_line_label}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition-colors active:scale-95"
            style={{ transition: 'transform 120ms ease-out, background-color 150ms ease' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-slate-100 grid grid-cols-3 gap-3 bg-gradient-to-br from-slate-50/80 to-white">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">
              Recebidas
            </div>
            <div className="text-xl font-semibold text-slate-900 tabular-nums tracking-tight">
              {stats?.inbound ?? conversation.inbound_count}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">
              Enviadas
            </div>
            <div className="text-xl font-semibold text-slate-900 tabular-nums tracking-tight">
              {stats?.outbound ?? conversation.outbound_count}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">
              1ª resposta
            </div>
            <div className="text-xl font-semibold text-slate-900 tabular-nums tracking-tight">
              {formatHoursValue(conversation.frt_hours)}
            </div>
          </div>
        </div>

        {conversation.card_id && (
          <div className="px-5 py-2.5 border-b border-slate-100 bg-indigo-50/40 flex items-center justify-between gap-3">
            <a
              href={`/cards/${conversation.card_id}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-indigo-700 hover:text-indigo-900 flex items-center gap-1.5 font-medium"
            >
              <ExternalLink className="w-3 h-3" />
              Abrir card no CRM
            </a>
            {conversation.stage_nome && (
              <span
                className={cn(
                  'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border',
                  conversation.meeting_state === 'meeting_done'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : conversation.meeting_state === 'meeting_scheduled'
                      ? 'bg-violet-50 text-violet-700 border-violet-200'
                      : 'bg-sky-50 text-sky-700 border-sky-200'
                )}
              >
                {conversation.stage_nome}
              </span>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5 bg-slate-50/60">
          {isLoading && (
            <div className="text-center text-sm text-slate-500 py-12">
              Carregando mensagens…
            </div>
          )}

          {!isLoading && messages.length === 0 && (
            <div className="text-center text-sm text-slate-500 py-12 flex flex-col items-center gap-2">
              <MessageSquare className="w-8 h-8 text-slate-300" />
              <span>Nenhuma mensagem encontrada nas fontes verificadas.</span>
              {stats?.sources_used && stats.sources_used.length > 0 && (
                <span className="text-xs text-slate-400">
                  Fontes consultadas: {stats.sources_used.join(', ')}
                </span>
              )}
            </div>
          )}

          {!isLoading &&
            messages.map((m, idx) => {
              const prevDate = idx > 0 ? new Date(messages[idx - 1].sent_at) : null
              const currDate = new Date(m.sent_at)
              const showDay =
                !prevDate || prevDate.toDateString() !== currDate.toDateString()

              return (
                <div key={m.message_id}>
                  {showDay && (
                    <div className="flex items-center justify-center my-3">
                      <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium bg-white border border-slate-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Calendar className="w-2.5 h-2.5" />
                        {format(currDate, "dd 'de' MMMM", { locale: ptBR })}
                      </span>
                    </div>
                  )}
                  <div
                    className={cn(
                      'flex',
                      m.direction === 'outbound' ? 'justify-end' : 'justify-start'
                    )}
                  >
                    <div
                      className={cn(
                        'max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words shadow-sm',
                        m.direction === 'outbound'
                          ? 'bg-indigo-600 text-white rounded-br-md'
                          : 'bg-white border border-slate-200 text-slate-900 rounded-bl-md'
                      )}
                    >
                      <div className="leading-relaxed">
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
                        <span className="tabular-nums">
                          {format(currDate, 'HH:mm', { locale: ptBR })}
                        </span>
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
                </div>
              )
            })}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  )
}
