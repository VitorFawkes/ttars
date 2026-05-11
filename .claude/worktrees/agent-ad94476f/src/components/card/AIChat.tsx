import { useState, useRef, useEffect } from 'react'
import { Send, Sparkles, RotateCcw, MessageSquare, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChatIA } from '@/hooks/useChatIA'
import { ScrollArea } from '@/components/ui/scroll-area'

interface AIChatProps {
    cardId: string
    contactId?: string | null
}

function TypingIndicator() {
    return (
        <div className="flex justify-start">
            <div className="bg-slate-100 rounded-2xl rounded-bl-sm px-4 py-3">
                <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
            </div>
        </div>
    )
}

export default function AIChat({ cardId, contactId }: AIChatProps) {
    const [input, setInput] = useState('')
    const { messages, isLoading, sendMessage, reset } = useChatIA(cardId, contactId || null)
    const bottomRef = useRef<HTMLDivElement>(null)

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, isLoading])

    const handleSend = () => {
        if (!input.trim() || isLoading) return
        sendMessage(input)
        setInput('')
    }

    // Chat needs a contact with WhatsApp history to work
    if (!contactId) {
        return (
            <div className="flex flex-col items-center justify-center h-[400px] text-slate-500 p-8">
                <AlertCircle className="h-10 w-10 mb-3 text-slate-300" />
                <p className="text-sm font-medium text-slate-700">Nenhum contato vinculado</p>
                <p className="text-xs text-center mt-1 max-w-[250px]">
                    Para usar o Chat com IA, este card precisa ter um contato principal com historico de WhatsApp.
                </p>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-[500px]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50">
                <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-indigo-600" />
                    <span className="text-sm font-medium text-slate-900">Chat com IA</span>
                    <span className="text-xs text-slate-500">Pergunte sobre as conversas</span>
                </div>
                {messages.length > 0 && (
                    <button
                        onClick={reset}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                        title="Nova conversa"
                    >
                        <RotateCcw className="h-3 w-3" />
                        Limpar
                    </button>
                )}
            </div>

            {/* Messages Area */}
            <ScrollArea className="flex-1 px-4">
                <div className="py-4 space-y-3">
                    {messages.length === 0 && !isLoading ? (
                        <div className="flex flex-col items-center pt-12">
                            <div className="w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center mb-4">
                                <MessageSquare className="h-7 w-7 text-indigo-400" />
                            </div>
                            <p className="text-sm font-medium text-slate-700 mb-1">
                                Pergunte sobre este cliente
                            </p>
                            <p className="text-xs text-slate-500 text-center max-w-[280px]">
                                A IA leu todo o historico de WhatsApp deste contato. Pergunte o que precisar — datas, valores, decisoes, pendencias.
                            </p>
                        </div>
                    ) : (
                        <>
                            {messages.map((msg, idx) => (
                                <div
                                    key={idx}
                                    className={cn(
                                        "flex",
                                        msg.role === 'user' ? "justify-end" : "justify-start"
                                    )}
                                >
                                    <div
                                        className={cn(
                                            "max-w-[85%] rounded-2xl px-4 py-2.5",
                                            msg.role === 'user'
                                                ? "bg-indigo-600 text-white rounded-br-sm"
                                                : "bg-slate-100 text-slate-900 rounded-bl-sm"
                                        )}
                                    >
                                        <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                                            {msg.content}
                                        </p>
                                    </div>
                                </div>
                            ))}
                            {isLoading && <TypingIndicator />}
                        </>
                    )}
                    <div ref={bottomRef} />
                </div>
            </ScrollArea>

            {/* Input Area */}
            <div className="border-t bg-white p-3">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                handleSend()
                            }
                        }}
                        placeholder={isLoading ? 'Aguardando resposta...' : 'Ex: Me atualiza sobre esse cliente...'}
                        disabled={isLoading}
                        aria-label="Pergunta para a IA"
                        className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isLoading}
                        aria-label="Enviar pergunta"
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                    >
                        <Send className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    )
}
