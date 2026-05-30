import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Send, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

interface ConversationTesterProps {
  configSaved: boolean
}

interface Message {
  type: 'user' | 'sofia'
  text: string
  timestamp: Date
}

export function ConversationTester({ configSaved }: ConversationTesterProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleTest = async () => {
    if (!input.trim()) return
    if (!configSaved) {
      setError('Salve a configuração antes de testar.')
      return
    }

    const userMessage = input.trim()
    setInput('')
    setError('')

    // Adicionar mensagem do usuário à conversa
    setMessages((prev) => [...prev, { type: 'user', text: userMessage, timestamp: new Date() }])

    setLoading(true)
    try {
      const response = await supabase.functions.invoke('wsdr-test', {
        body: { message: userMessage },
      })

      if (response.error) {
        setError(`Erro: ${response.error.message || 'Falha ao testar.'}`)
        return
      }

      const reply = response.data?.reply || 'Desculpe, não consegui processar sua mensagem.'
      setMessages((prev) => [...prev, { type: 'sofia', text: reply, timestamp: new Date() }])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro de conexão'
      setError(`Erro ao conectar: ${message}`)
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
      <div>
        <h3 className="text-lg font-semibold text-slate-900 tracking-tight">
          💬 Testar a Conversa
        </h3>
        <p className="text-sm text-slate-600 mt-1">
          Veja como a Sofia responde a seus testes. {!configSaved && <span className="text-orange-600">Salve a configuração antes de testar.</span>}
        </p>
      </div>

      {/* Histórico de mensagens */}
      <div className="bg-slate-50 rounded-lg p-4 h-80 overflow-y-auto space-y-3 border border-slate-200">
        {messages.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-12">
            Nenhuma mensagem ainda. Digite algo abaixo para começar.
          </p>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={cn(
                  'px-4 py-2.5 rounded-lg max-w-xs text-sm',
                  msg.type === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-none'
                    : 'bg-white border border-slate-200 text-slate-900 rounded-bl-none'
                )}
              >
                {msg.text}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex justify-start">
            <div className="px-4 py-2.5 rounded-lg bg-white border border-slate-200">
              <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
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
            disabled={loading || !configSaved}
            className="flex-1 min-h-[60px]"
            persistKey="sofia-test-input"
          />
          <Button
            type="button"
            onClick={handleTest}
            disabled={loading || !configSaved || !input.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white self-end h-fit"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      <p className="text-xs text-slate-500 italic">
        ℹ️ Recomendação: Salve antes de testar para que a Sofia use a versão mais recente da sua configuração.
      </p>
    </div>
  )
}
