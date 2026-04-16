import { useState, useCallback, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useOrg } from '@/contexts/OrgContext'

const N8N_WEBHOOK_URL = 'https://n8n-n8n.ymnmx7.easypanel.host/webhook/chat-ia'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export function useChatIA(cardId: string, contactId: string | null) {
  const { org } = useOrg()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const abortRef = useRef<AbortController | null>(null)
  const conversationIdRef = useRef<string | null>(null)
  const messagesRef = useRef<ChatMessage[]>([])
  messagesRef.current = messages

  // Load existing conversation on mount
  useEffect(() => {
    let cancelled = false

    async function loadHistory() {
      setIsLoadingHistory(true)
      try {
        // Find active card_chat conversation for this card
        const { data: conv } = await supabase
          .from('ai_conversations')
          .select('id')
          .eq('card_id', cardId)
          .eq('intent', 'card_chat')
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (cancelled) return

        if (conv) {
          conversationIdRef.current = conv.id

          const { data: turns } = await supabase
            .from('ai_conversation_turns')
            .select('role, content')
            .eq('conversation_id', conv.id)
            .order('created_at', { ascending: true })

          if (cancelled) return

          if (turns && turns.length > 0) {
            const loaded = turns
              .filter((t): t is typeof t & { role: 'user' | 'assistant' } =>
                t.role === 'user' || t.role === 'assistant'
              )
              .map(t => ({ role: t.role, content: t.content }))
            setMessages(loaded)
          }
        }
      } catch (err) {
        console.error('[ChatIA] Erro ao carregar histórico:', err)
      } finally {
        if (!cancelled) setIsLoadingHistory(false)
      }
    }

    loadHistory()
    return () => { cancelled = true }
  }, [cardId])

  // Cleanup on unmount — abort any in-flight request
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const ensureConversation = useCallback(async (): Promise<string> => {
    if (conversationIdRef.current) return conversationIdRef.current

    const { data, error } = await supabase
      .from('ai_conversations')
      .insert({
        card_id: cardId,
        contact_id: contactId,
        org_id: org?.id,
        intent: 'card_chat',
        status: 'active',
        message_count: 0,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (error || !data) throw new Error('Falha ao criar conversa: ' + (error?.message || 'desconhecido'))
    conversationIdRef.current = data.id
    return data.id
  }, [cardId, contactId, org?.id])

  const sendMessage = useCallback(async (question: string) => {
    if (!question.trim() || (!contactId && !cardId)) return

    const userMsg: ChatMessage = { role: 'user', content: question.trim() }
    const chatHistory = messagesRef.current.map(m => ({ role: m.role, content: m.content }))

    setMessages(prev => [...prev, userMsg])
    setIsLoading(true)

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    let timedOut = false
    const timeoutId = setTimeout(() => { timedOut = true; controller.abort() }, 120_000)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Usuario nao autenticado')

      // Persist user message
      const convId = await ensureConversation()
      await supabase.from('ai_conversation_turns').insert({
        conversation_id: convId,
        role: 'user',
        content: question.trim(),
      })

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

      const raw = await response.json()
      const data = Array.isArray(raw) ? raw[0] : raw
      const answer = data?.answer || 'Nao consegui gerar uma resposta. Tente reformular a pergunta.'

      // Persist assistant message
      await supabase.from('ai_conversation_turns').insert({
        conversation_id: convId,
        role: 'assistant',
        content: answer,
      })

      // Update message count
      const newCount = messagesRef.current.length + 2 // +user +assistant
      await supabase
        .from('ai_conversations')
        .update({ message_count: newCount, updated_at: new Date().toISOString() })
        .eq('id', convId)

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
  }, [cardId, contactId, ensureConversation])

  const reset = useCallback(async () => {
    abortRef.current?.abort()

    // Mark current conversation as completed
    if (conversationIdRef.current) {
      await supabase
        .from('ai_conversations')
        .update({ status: 'completed', ended_at: new Date().toISOString() })
        .eq('id', conversationIdRef.current)
      conversationIdRef.current = null
    }

    setMessages([])
    setIsLoading(false)
  }, [])

  return { messages, isLoading, isLoadingHistory, sendMessage, reset }
}
