import { MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface PreviewMessage {
  role: 'user' | 'agent'
  content: string
}

interface AgentChatPreviewProps {
  title?: string
  subtitle?: string
  agentName?: string
  messages: PreviewMessage[]
  className?: string
}

/**
 * WhatsApp-style chat preview used across wizard steps.
 * Used as a read-only live preview of how the agent would behave.
 */
export function AgentChatPreview({
  title = 'Prévia',
  subtitle,
  agentName,
  messages,
  className,
}: AgentChatPreviewProps) {
  return (
    <div className={cn('bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col', className)}>
      {/* WhatsApp-style header */}
      <div className="bg-[#075e54] px-4 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
          <MessageCircle className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-white font-medium text-sm truncate">{agentName || title}</p>
          <p className="text-white/70 text-[11px] truncate">{subtitle || 'online'}</p>
        </div>
      </div>

      {/* Chat body with WhatsApp texture */}
      <div
        className="flex-1 p-4 space-y-2 overflow-y-auto min-h-[240px]"
        style={{
          backgroundColor: '#e5ddd5',
          backgroundImage:
            'radial-gradient(rgba(255,255,255,0.35) 1px, transparent 1px), radial-gradient(rgba(255,255,255,0.2) 1px, transparent 1px)',
          backgroundSize: '20px 20px, 30px 30px',
          backgroundPosition: '0 0, 10px 10px',
        }}
      >
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-slate-500 bg-white/80 px-3 py-2 rounded-lg">
              Preencha os campos para ver a prévia
            </p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={idx}
              className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-[80%] px-3 py-2 rounded-lg text-sm shadow-sm',
                  msg.role === 'user'
                    ? 'bg-[#dcf8c6] text-slate-900 rounded-tr-sm'
                    : 'bg-white text-slate-900 rounded-tl-sm'
                )}
              >
                <p className="whitespace-pre-wrap leading-snug">{msg.content}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
