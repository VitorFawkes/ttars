import { useState } from 'react'
import { Code, MessageSquare, Send, Loader2, RefreshCw, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useAgentPromptPreview, type PreviewPlaybookConfig } from '@/hooks/playbook/useAgentPromptPreview'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  meta?: { moment_key: string | null }
}

interface Props {
  agentId: string
  previewConfig: PreviewPlaybookConfig
}

export function PlaybookPreviewPanel({ agentId, previewConfig }: Props) {
  const [tab, setTab] = useState<'chat' | 'prompt'>('chat')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [lastPrompt, setLastPrompt] = useState<string | null>(null)
  const [showFullPrompt, setShowFullPrompt] = useState(false)
  const mutation = useAgentPromptPreview()

  const send = async () => {
    const text = input.trim()
    if (!text) return
    const nextHistory: ChatMessage[] = [...messages, { role: 'user', content: text }]
    setMessages(nextHistory)
    setInput('')
    try {
      const res = await mutation.mutateAsync({
        agent_id: agentId,
        messages: nextHistory.map(m => ({ role: m.role, content: m.content })),
        preview_playbook_config: previewConfig,
      })
      setLastPrompt(res.prompt_used)
      setMessages([
        ...nextHistory,
        { role: 'assistant', content: res.response, meta: { moment_key: res.current_moment_key } },
      ])
    } catch (err) {
      console.error('[PlaybookPreviewPanel] send error:', err)
      toast.error('Não consegui testar agora. Tenta de novo.')
    }
  }

  const reset = () => {
    setMessages([])
    setLastPrompt(null)
  }

  return (
    <div className="bg-slate-50 border-l border-slate-200 h-full flex flex-col">
      <header className="flex items-center gap-1 px-3 py-2 border-b border-slate-200 bg-white">
        <TabButton active={tab === 'chat'} onClick={() => setTab('chat')} icon={MessageSquare} label="Testar" />
        <TabButton active={tab === 'prompt'} onClick={() => setTab('prompt')} icon={Code} label="Prompt" />
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={reset} className="gap-1.5 text-slate-500">
          <RefreshCw className="w-3.5 h-3.5" /> Resetar
        </Button>
      </header>

      {tab === 'chat' ? (
        <>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.length === 0 && (
              <p className="text-center text-xs text-slate-400 py-8">Digite "oi" pra começar o teste</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={cn('rounded-xl px-3 py-2 text-sm max-w-[85%]', m.role === 'user' ? 'ml-auto bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-900')}>
                <p className="whitespace-pre-wrap">{m.content}</p>
                {m.role === 'assistant' && m.meta?.moment_key && (
                  <div className="mt-1 text-[10px] text-slate-400">fase: {m.meta.moment_key}</div>
                )}
              </div>
            ))}
            {mutation.isPending && (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> pensando...
              </div>
            )}
          </div>

          <div className="p-3 border-t border-slate-200 bg-white flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Teste como o lead"
              className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <Button size="sm" onClick={send} disabled={mutation.isPending || !input.trim()} className="gap-1">
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-auto p-3">
          {!lastPrompt ? (
            <p className="text-center text-xs text-slate-400 py-8">Envie uma mensagem no teste pra ver o prompt</p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700">Prompt enviado ao modelo</span>
                <Button variant="outline" size="sm" onClick={() => setShowFullPrompt(!showFullPrompt)} className="gap-1 text-xs">
                  {showFullPrompt ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {showFullPrompt ? 'resumir' : 'expandir'}
                </Button>
              </div>
              <pre className={cn('bg-slate-900 text-slate-100 rounded-lg p-3 text-[11px] font-mono overflow-auto', showFullPrompt ? '' : 'max-h-[400px]')}>
                {lastPrompt}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof MessageSquare; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn('flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors', active ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-100')}
    >
      <Icon className="w-3.5 h-3.5" />{label}
    </button>
  )
}
