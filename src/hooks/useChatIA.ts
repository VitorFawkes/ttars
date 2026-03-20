import { useState, useCallback, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

const N8N_WEBHOOK_URL = 'https://n8n-n8n.ymnmx7.easypanel.host/webhook/chat-ia'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export function useChatIA(cardId: string, contactId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  // Ref mirror to avoid stale closure in sendMessage
  const messagesRef = useRef<ChatMessage[]>([])
  messagesRef.current = messages

  // Cleanup on unmount — abort any in-flight request
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const sendMessage = useCallback(async (question: string) => {
    if (!question.trim() || (!contactId && !cardId)) return

    const userMsg: ChatMessage = { role: 'user', content: question.trim() }

    // Capture chat history BEFORE adding the new message
    // (current question goes in the `question` field, not in history)
    const chatHistory = messagesRef.current.map(m => ({ role: m.role, content: m.content }))

    // Add user message to UI immediately
    setMessages(prev => [...prev, userMsg])
    setIsLoading(true)

    // Abort any previous request
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    // Timeout after 2 minutes (AI processing can be slow for large conversations)
    let timedOut = false
    const timeoutId = setTimeout(() => { timedOut = true; controller.abort() }, 120_000)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Usuario nao autenticado')

      const response = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          card_id: cardId,
          contact_id: contactId,
          question: question.trim(),
          chat_history: chatHistory
        })
      })

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Erro ${response.status}: ${errText}`)
      }

      // n8n responseMode 'lastNode' may return array or object
      const raw = await response.json()
      const data = Array.isArray(raw) ? raw[0] : raw
      const answer = data?.answer || 'Nao consegui gerar uma resposta. Tente reformular a pergunta.'

      setMessages(prev => [...prev, { role: 'assistant', content: answer }])
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        if (timedOut) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: 'A consulta demorou mais que o esperado. Tente uma pergunta mais especifica.'
          }])
          setIsLoading(false)
        }
        return
      }

      console.error('[ChatIA] Erro:', error)
      const errorMsg = (error as Error).message || 'Erro desconhecido'
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Desculpe, ocorreu um erro ao processar sua pergunta: ${errorMsg}`
      }])
      toast.error('Erro ao consultar IA')
    } finally {
      clearTimeout(timeoutId)
      setIsLoading(false)
    }
  }, [cardId, contactId])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
    setIsLoading(false)
  }, [])

  return { messages, isLoading, sendMessage, reset }
}
