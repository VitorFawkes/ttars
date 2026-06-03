import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Send, AlertCircle, RotateCcw, MessageCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

interface Message {
  type: 'user' | 'sofia'
  text: string
}

// Sugestões pra tirar o testador do "vazio": viram a primeira mensagem ao clicar.
const EXAMPLES = [
  'Oi! Vi vocês no Instagram, queria saber sobre casamento.',
  'Quanto custa pra organizar meu casamento?',
  'Vocês fazem casamento na praia?',
]

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
    <div className="bg-white border border-ww-sand rounded-2xl shadow-ww-lift p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex items-center justify-center w-9 h-9 rounded-full bg-ww-cream border border-ww-gold/30 text-ww-gold-ink shrink-0">
            <MessageCircle className="w-[18px] h-[18px]" />
          </span>
          <div>
            <h3 className="font-ww-serif text-lg text-ww-n700 tracking-tight leading-tight">Testar a conversa</h3>
            <p className="font-ww-display text-sm text-ww-n500 mt-0.5">
              Escreva como se fosse um noivo. A Sofia usa a configuração já salva.
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setMessages([])
              setError('')
            }}
            className="flex items-center gap-1.5 text-sm text-ww-n500 hover:text-ww-n700 transition-colors duration-150 ease-out shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Recomeçar
          </button>
        )}
      </div>

      {/* Histórico de mensagens */}
      <div
        ref={scrollRef}
        className="bg-ww-cream/60 rounded-xl p-4 h-80 xl:h-[24rem] overflow-y-auto space-y-3 border border-ww-sand"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center h-full px-4">
            <span className="flex items-center justify-center w-12 h-12 rounded-full bg-white border border-ww-gold/30 text-ww-gold-ink mb-3 shadow-ww-lift">
              <MessageCircle className="w-5 h-5" />
            </span>
            <p className="font-ww-serif text-base text-ww-n700">Converse com a Sofia</p>
            <p className="font-ww-display text-xs text-ww-n500 mt-1 leading-relaxed max-w-[15rem]">
              Toque num exemplo pra começar — ou escreva à vontade.
            </p>
            <div className="flex flex-col gap-2 mt-4 w-full max-w-[18rem]">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setInput(ex)}
                  className="text-left text-xs font-ww-display text-ww-n700 bg-white border border-ww-sand rounded-full px-3.5 py-2 hover:border-ww-gold hover:bg-ww-gold-soft transition-[background-color,border-color] duration-150 ease-out active:scale-[0.98]"
                >
                  “{ex}”
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} className={cn('flex', msg.type === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'px-4 py-2.5 rounded-2xl max-w-[80%] text-sm whitespace-pre-wrap leading-relaxed font-ww-display',
                  msg.type === 'user'
                    ? 'bg-ww-gold text-white rounded-br-sm'
                    : 'bg-white border border-ww-sand text-ww-n700 rounded-bl-sm'
                )}
              >
                {msg.text}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex justify-start">
            <div className="px-4 py-2.5 rounded-2xl bg-white border border-ww-sand">
              <Loader2 className="w-4 h-4 animate-spin text-ww-gold" />
            </div>
          </div>
        )}
      </div>

      {/* Campo de entrada */}
      <div className="space-y-2">
        {error && (
          <div className="flex items-center gap-2 text-ww-error text-sm bg-ww-error/5 p-3 rounded-lg border border-ww-error/20">
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
            className="bg-ww-gold hover:bg-ww-gold-ink text-white self-end h-fit transition-colors duration-150 ease-out active:scale-[0.97]"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
        <p className="font-ww-display text-xs text-ww-n400">
          Salve a configuração antes de testar para ver suas últimas mudanças.
        </p>
      </div>
    </div>
  )
}
