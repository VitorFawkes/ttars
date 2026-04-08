import { useState, useCallback, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { ReactivationPattern } from './useReactivationPatterns'

const N8N_WEBHOOK_URL = 'https://n8n-n8n.ymnmx7.easypanel.host/webhook/reactivation-chat'

export interface ChatMessage {
    role: 'user' | 'assistant'
    content: string
}

function buildContext(patterns: ReactivationPattern[]): string {
    const top = patterns.slice(0, 30).map(p => {
        const ct = p.contato
        const parts = [
            `${ct?.nome || '?'} ${ct?.sobrenome || ''}`.trim(),
            `score=${p.reactivation_score}`,
            `${p.total_completed_trips} viagens`,
            p.avg_trip_value ? `ticket R$${Math.round(p.avg_trip_value)}` : null,
            p.travel_frequency_per_year ? `${p.travel_frequency_per_year.toFixed(1)}x/ano` : null,
            p.days_since_last_trip ? `última viagem ${p.days_since_last_trip}d atrás` : null,
            p.days_until_ideal_contact !== null ? `janela ${p.days_until_ideal_contact}d` : null,
            p.peak_months?.length ? `meses preferidos: ${p.peak_months.join(',')}` : null,
            p.last_destinations?.length ? `destinos: ${p.last_destinations.join(', ')}` : null,
            p.companion_count > 0 ? `${p.companion_count} acompanhantes` : null,
            p.days_until_birthday !== null && p.days_until_birthday <= 60 ? `aniversário em ${p.days_until_birthday}d` : null,
            p.referral_count > 0 ? `${p.referral_count} indicações` : null,
            p.gifts_sent_count === 0 ? 'nunca recebeu presente' : null,
            p.is_high_value ? 'alto valor' : null,
        ].filter(Boolean)
        return parts.join(' | ')
    })
    return top.join('\n')
}

export function useReactivationChat(patterns: ReactivationPattern[]) {
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const abortRef = useRef<AbortController | null>(null)
    const messagesRef = useRef<ChatMessage[]>([])
    messagesRef.current = messages

    useEffect(() => {
        return () => { abortRef.current?.abort() }
    }, [])

    const sendMessage = useCallback(async (question: string) => {
        if (!question.trim()) return

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
            if (!user) throw new Error('Não autenticado')

            const context = buildContext(patterns)

            const response = await fetch(N8N_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    question: question.trim(),
                    context,
                    chat_history: chatHistory,
                    total_contacts: patterns.length,
                    user_id: user.id,
                })
            })

            if (!response.ok) throw new Error(`Erro ${response.status}`)

            const raw = await response.json()
            const data = Array.isArray(raw) ? raw[0] : raw
            const answer = data?.answer || data?.output || data?.text || 'Não consegui gerar uma resposta.'

            setMessages(prev => [...prev, { role: 'assistant', content: answer }])
        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                if (timedOut) {
                    setMessages(prev => [...prev, { role: 'assistant', content: 'A consulta demorou demais. Tente uma pergunta mais específica.' }])
                }
                return
            }
            setMessages(prev => [...prev, { role: 'assistant', content: `Erro: ${(error as Error).message}` }])
        } finally {
            clearTimeout(timeoutId)
            setIsLoading(false)
        }
    }, [patterns])

    const reset = useCallback(() => {
        abortRef.current?.abort()
        setMessages([])
        setIsLoading(false)
    }, [])

    return { messages, isLoading, sendMessage, reset }
}
