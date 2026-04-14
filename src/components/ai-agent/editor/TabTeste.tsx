import { useState } from 'react'
import { PlayCircle, Send, Loader2, Eye, EyeOff, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

interface Props {
  agentId?: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  meta?: { elapsed_ms: number; tokens: { input: number; output: number } }
}

interface SimulateResponse {
  success: boolean
  response?: string
  elapsed_ms?: number
  tokens?: { input: number; output: number }
  prompt_used?: string
  modelo?: string
  error?: string
  details?: string
}

export function TabTeste({ agentId }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)
  const [lastPrompt, setLastPrompt] = useState<string | null>(null)
  const [lastModel, setLastModel] = useState<string | null>(null)

  if (!agentId) {
    return (
      <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6">
        <p className="text-sm text-slate-500">Salve o agente antes de testar.</p>
      </section>
    )
  }

  const send = async () => {
    if (!input.trim() || loading) return
    const userMessage: Message = { role: 'user', content: input.trim() }
    const newHistory = [...messages, userMessage]
    setMessages(newHistory)
    setInput('')
    setLoading(true)

    try {
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-agent-simulate`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          agent_id: agentId,
          messages: newHistory.map(m => ({ role: m.role, content: m.content })),
        }),
      })
      const data = await res.json() as SimulateResponse

      if (!data.success || !data.response) {
        toast.error(data.error || 'Erro na simulação')
        if (data.details) console.error(data.details)
        setLoading(false)
        return
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response!,
        meta: { elapsed_ms: data.elapsed_ms || 0, tokens: data.tokens || { input: 0, output: 0 } },
      }])
      setLastPrompt(data.prompt_used || null)
      setLastModel(data.modelo || null)
    } catch (err) {
      toast.error('Erro ao chamar simulador')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setMessages([])
    setInput('')
    setLastPrompt(null)
  }

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-4">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PlayCircle className="w-5 h-5 text-emerald-500" />
            <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Teste ao vivo</h2>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowPrompt(v => !v)} className="gap-1.5">
              {showPrompt ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showPrompt ? 'Ocultar prompt' : 'Ver prompt'}
            </Button>
            <Button variant="outline" size="sm" onClick={reset} disabled={messages.length === 0} className="gap-1.5">
              <RotateCcw className="w-3.5 h-3.5" /> Resetar
            </Button>
          </div>
        </header>
        <p className="text-sm text-slate-500 -mt-2">
          Simulação contra a configuração atual deste agente. Nada é gravado nem enviado ao cliente. Use para iterar prompts antes de ativar.
        </p>

        <div className="border border-slate-200 rounded-lg bg-slate-50 p-4 min-h-[300px] max-h-[500px] overflow-auto space-y-3">
          {messages.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">
              Mande uma mensagem como se você fosse o cliente.
            </p>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  m.role === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white border border-slate-200 text-slate-900'
                }`}>
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  {m.meta && (
                    <p className="text-[10px] text-slate-400 mt-1">
                      {m.meta.elapsed_ms}ms · {m.meta.tokens.input}+{m.meta.tokens.output} tok
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200 rounded-2xl px-3 py-2 text-sm text-slate-500 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> pensando…
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
            placeholder="Mensagem como cliente…"
            disabled={loading}
          />
          <Button onClick={send} disabled={loading || !input.trim()} className="gap-1">
            <Send className="w-3.5 h-3.5" /> Enviar
          </Button>
        </div>
      </section>

      {showPrompt && lastPrompt && (
        <section className="bg-slate-900 text-slate-100 border border-slate-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Prompt enviado</p>
            <p className="text-xs text-slate-400">modelo: {lastModel}</p>
          </div>
          <pre className="text-xs whitespace-pre-wrap font-mono max-h-72 overflow-auto">
            {lastPrompt}
          </pre>
        </section>
      )}
    </div>
  )
}
