import { useEffect, useRef } from 'react'
import { Loader2, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SimMessage } from '@/hooks/useAgentSimulator'

interface ChatWindowProps {
  messages: SimMessage[]
  isProcessing: boolean
  agentName: string
  contactName?: string
}

export function ChatWindow({ messages, isProcessing, agentName, contactName }: ChatWindowProps) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, isProcessing])

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col h-full">
      {/* WhatsApp-style header */}
      <div className="bg-[#075e54] px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
          <MessageCircle className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-white font-medium text-sm truncate">{contactName || 'Cliente de teste'}</p>
          <p className="text-white/70 text-[11px]">Conversando com {agentName}</p>
        </div>
      </div>

      {/* Chat body */}
      <div
        className="flex-1 p-4 space-y-2 overflow-y-auto"
        style={{
          backgroundColor: '#e5ddd5',
          backgroundImage:
            'radial-gradient(rgba(255,255,255,0.35) 1px, transparent 1px), radial-gradient(rgba(255,255,255,0.2) 1px, transparent 1px)',
          backgroundSize: '20px 20px, 30px 30px',
          backgroundPosition: '0 0, 10px 10px',
        }}
      >
        {messages.length === 0 && !isProcessing && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center bg-white/90 px-4 py-3 rounded-lg max-w-[280px]">
              <p className="text-sm font-medium text-slate-700">Digite uma mensagem</p>
              <p className="text-xs text-slate-500 mt-1">
                Escolha um cenário pronto ou escreva à mão — o agente vai responder como responderia na vida real.
              </p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
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
              {msg.trace && msg.role === 'agent' && (
                <div className="mt-1.5 pt-1.5 border-t border-slate-100 flex items-center gap-2 text-[10px] text-slate-400">
                  <span>{msg.trace.total_tokens} tokens</span>
                  <span>·</span>
                  <span>{msg.trace.total_latency_ms}ms</span>
                  {!msg.trace.validator_passed && (
                    <>
                      <span>·</span>
                      <span className="text-red-500 font-medium">⚠ validator bloqueou</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {isProcessing && (
          <div className="flex justify-start">
            <div className="bg-white rounded-lg rounded-tl-sm px-3 py-2 shadow-sm">
              <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>
    </div>
  )
}
