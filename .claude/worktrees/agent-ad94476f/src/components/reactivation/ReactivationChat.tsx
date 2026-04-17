import { useState, useRef, useEffect } from 'react'
import { Send, Sparkles, X, Loader2, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useReactivationChat } from '@/hooks/useReactivationChat'
import type { ReactivationPattern } from '@/hooks/useReactivationPatterns'

interface Props {
    patterns: ReactivationPattern[]
}

const SUGGESTIONS = [
    'Quais clientes eu deveria ligar essa semana?',
    'Quem faz aniversário nos próximos 30 dias e viaja com frequência?',
    'Quais clientes de alto valor não receberam presente?',
    'Quem viajou mais de 3 vezes e está com janela atrasada?',
    'Sugira uma estratégia de reativação para os top 5 clientes.',
]

export default function ReactivationChat({ patterns }: Props) {
    const [isOpen, setIsOpen] = useState(false)
    const [input, setInput] = useState('')
    const { messages, isLoading, sendMessage, reset } = useReactivationChat(patterns)
    const scrollRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }, [messages])

    useEffect(() => {
        if (isOpen) inputRef.current?.focus()
    }, [isOpen])

    function handleSend() {
        if (!input.trim() || isLoading) return
        sendMessage(input)
        setInput('')
    }

    function handleSuggestion(s: string) {
        sendMessage(s)
    }

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 z-30 flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-medium rounded-2xl shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 transition-all hover:-translate-y-0.5"
            >
                <Sparkles className="w-4 h-4" />
                Assistente IA
            </button>
        )
    }

    return (
        <div className="fixed bottom-6 right-6 z-30 w-[400px] max-h-[600px] bg-white rounded-2xl shadow-2xl shadow-slate-900/10 border border-slate-200 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-purple-50">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                        <Sparkles className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-slate-800">Assistente de Reativação</p>
                        <p className="text-[10px] text-slate-400">{patterns.length} contatos analisados</p>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    {messages.length > 0 && (
                        <button onClick={reset} title="Limpar conversa"
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-white/80 hover:text-slate-600 text-xs">
                            Limpar
                        </button>
                    )}
                    <button onClick={() => setIsOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-white/80 hover:text-slate-600">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px] max-h-[400px]">
                {messages.length === 0 ? (
                    <div className="space-y-3">
                        <div className="flex items-start gap-2.5">
                            <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <Sparkles className="w-3 h-3 text-indigo-600" />
                            </div>
                            <p className="text-sm text-slate-600 leading-relaxed">
                                Olá! Posso te ajudar a identificar os melhores contatos para reativar, sugerir estratégias e responder perguntas sobre os padrões de viagem dos seus clientes.
                            </p>
                        </div>
                        <div className="space-y-1.5 pt-1">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-8">Experimente perguntar</p>
                            {SUGGESTIONS.map((s, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleSuggestion(s)}
                                    className="w-full text-left px-3 py-2 text-xs text-slate-600 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 rounded-lg transition-colors"
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    messages.map((msg, i) => (
                        <div key={i} className={cn('flex items-start gap-2.5', msg.role === 'user' && 'flex-row-reverse')}>
                            <div className={cn(
                                'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                                msg.role === 'assistant' ? 'bg-indigo-100' : 'bg-slate-200'
                            )}>
                                {msg.role === 'assistant'
                                    ? <Sparkles className="w-3 h-3 text-indigo-600" />
                                    : <MessageSquare className="w-3 h-3 text-slate-500" />}
                            </div>
                            <div className={cn(
                                'rounded-xl px-3 py-2 text-sm max-w-[85%]',
                                msg.role === 'assistant'
                                    ? 'bg-slate-50 text-slate-700'
                                    : 'bg-indigo-600 text-white'
                            )}>
                                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                            </div>
                        </div>
                    ))
                )}
                {isLoading && (
                    <div className="flex items-start gap-2.5">
                        <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                            <Loader2 className="w-3 h-3 text-indigo-600 animate-spin" />
                        </div>
                        <div className="bg-slate-50 rounded-xl px-3 py-2">
                            <div className="flex gap-1">
                                <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Input */}
            <div className="border-t border-slate-100 p-3">
                <div className="flex items-center gap-2">
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSend()}
                        placeholder="Pergunte sobre seus clientes..."
                        disabled={isLoading}
                        className="flex-1 text-sm bg-slate-50 border-0 rounded-lg px-3 py-2 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isLoading}
                        className="p-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    )
}
