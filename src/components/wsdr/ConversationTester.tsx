import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Send, AlertCircle, RotateCcw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

interface Message {
  type: 'user' | 'sofia'
  text: string
}

export function ConversationTester() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  // Mantém a conversa rolada na última mensagem (sem mexer no scroll da página).
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, loading])

  const handleTest = async () => {
    const userMessage = input.trim()
    if (!userMessage || loading) return

    setInput('')
    setError('')

    // Histórico = turnos anteriores (antes desta mensagem). Sem ele a Sofia
    // trata todo envio como primeiro contato e repete a abertura.
    const history = messages.map((m) => ({
      role: m.type === 'sofia' ? 'assistant' : 'user',
      text: m.text,
    }))

    setMessages((prev) => [...prev, { type: 'user', text: userMessage }])
    setLoading(true)

    try {
      const response = await supabase.functions.invoke('wsdr-test', {
        body: { message: userMessage, history },
      })

      if (response.error) {
        setError(response.error.message || 'Não consegui falar com a Sofia agora.')
        return
      }

      const reply = response.data?.reply?.trim() || 'A Sofia não respondeu desta vez. Tente de novo.'
      setMessages((prev) => [...prev, { type: 'sofia', text: reply }])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro de conexão. Tente de novo.')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleTest()
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900 tracking-tight">Testar a conversa</h3>
          <p className="text-sm text-slate-500 mt-1">
            Converse como se fosse um noivo. A Sofia usa a configuração já salva.
          </p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setMessages([])
              setError('')
            }}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Recomeçar
          </button>
        )}
      </div>

      {/* Histórico de mensagens */}
      <div
        ref={scrollRef}
        className="bg-slate-50 rounded-lg p-4 h-80 overflow-y-auto space-y-3 border border-slate-200"
      >
        {messages.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-12">
            Mande a primeira mensagem para começar a conversa.
          </p>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} className={cn('flex', msg.type === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'px-4 py-2.5 rounded-2xl max-w-[80%] text-sm whitespace-pre-wrap leading-relaxed',
                  msg.type === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-sm'
                    : 'bg-white border border-slate-200 text-slate-900 rounded-bl-sm'
                )}
              >
                {msg.text}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex justify-start">
            <div className="px-4 py-2.5 rounded-2xl bg-white border border-slate-200">
              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
            </div>
          </div>
        )}
      </div>

      {/* Campo de entrada */}
      <div className="space-y-2">
        {error && (
          <div className="flex items-center gap-2 text-red-700 text-sm bg-red-50 p-3 rounded-lg border border-red-200">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite uma mensagem como se fosse um noivo..."
            disabled={loading}
            className="flex-1 min-h-[60px]"
            persistKey="sofia-test-input"
          />
          <Button
            type="button"
            onClick={handleTest}
            disabled={loading || !input.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white self-end h-fit"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
        <p className="text-xs text-slate-400">
          Salve a configuração antes de testar para ver suas últimas mudanças.
        </p>
      </div>
    </div>
  )
}
