import { Bot, User, ExternalLink, MessageCircle, Image, FileText, Mic } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { useConversationMessages, type WaMessage } from '@/hooks/analytics/useConversationMessages'
import { cn } from '@/lib/utils'
import { formatPhone } from '@/utils/whatsappFormatters'

// ── Helpers ──

function formatMsgTime(iso: string): string {
    const d = new Date(iso)
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatMsgDate(iso: string): string {
    const d = new Date(iso)
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function isSameDay(a: string, b: string): boolean {
    return a.slice(0, 10) === b.slice(0, 10)
}

function msgTypeIcon(type: string) {
    switch (type) {
        case 'image': return <Image className="w-3.5 h-3.5" />
        case 'audio': return <Mic className="w-3.5 h-3.5" />
        case 'document': return <FileText className="w-3.5 h-3.5" />
        default: return null
    }
}

const PHASE_COLORS: Record<string, string> = {
    sdr: 'bg-blue-100 text-blue-700',
    planner: 'bg-violet-100 text-violet-700',
    pos_venda: 'bg-green-100 text-green-700',
    resolucao: 'bg-slate-100 text-slate-600',
}

// ── Component ──

interface ConversationDrawerProps {
    contactId: string | null
    contactName?: string | null
    onClose: () => void
}

export default function ConversationDrawer({ contactId, contactName, onClose }: ConversationDrawerProps) {
    const { data, isLoading } = useConversationMessages(contactId)

    const contact = data?.contact
    const card = data?.card
    const messages = data?.messages || []
    const totalCount = data?.total_count ?? 0

    return (
        <Sheet open={!!contactId} onOpenChange={(open) => { if (!open) onClose() }}>
            <SheetContent side="right" className="w-full sm:max-w-lg md:max-w-xl p-0 flex flex-col">
                {/* Header */}
                <SheetHeader className="px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
                    <SheetTitle className="text-base font-semibold text-slate-800">
                        {contact?.name || contactName || 'Conversa'}
                    </SheetTitle>
                    <SheetDescription asChild>
                        <div className="space-y-1.5">
                            {contact?.phone && (
                                <p className="text-xs text-slate-500 tabular-nums">{formatPhone(contact.phone)}</p>
                            )}
                            {card && (
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Link
                                        to={`/cards/${card.id}`}
                                        className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                                    >
                                        <ExternalLink className="w-3 h-3" />
                                        {card.titulo || 'Ver Card'}
                                    </Link>
                                    {card.stage_name && (
                                        <span className={cn(
                                            'text-[10px] px-2 py-0.5 rounded-full font-medium',
                                            PHASE_COLORS[card.phase_slug || ''] || 'bg-slate-100 text-slate-600'
                                        )}>
                                            {card.stage_name}
                                        </span>
                                    )}
                                </div>
                            )}
                            {!card && !isLoading && (
                                <p className="text-[11px] text-slate-400">Sem card vinculado no CRM</p>
                            )}
                        </div>
                    </SheetDescription>
                </SheetHeader>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1 bg-slate-50/50">
                    {isLoading ? (
                        <div className="h-full flex items-center justify-center">
                            <div className="w-8 h-8 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-sm text-slate-400 gap-2">
                            <MessageCircle className="w-8 h-8 text-slate-300" />
                            <p>Nenhuma mensagem encontrada</p>
                        </div>
                    ) : (
                        <>
                            {totalCount > messages.length && (
                                <div className="text-center py-2">
                                    <span className="text-[11px] text-slate-400 bg-white px-3 py-1 rounded-full border border-slate-200">
                                        Mostrando últimas {messages.length} de {totalCount} mensagens
                                    </span>
                                </div>
                            )}
                            {messages.map((msg, i) => {
                                const showDate = i === 0 || !isSameDay(messages[i - 1].created_at, msg.created_at)
                                return (
                                    <div key={msg.id}>
                                        {showDate && (
                                            <div className="flex justify-center py-2">
                                                <span className="text-[10px] text-slate-400 bg-white px-3 py-1 rounded-full border border-slate-200">
                                                    {formatMsgDate(msg.created_at)}
                                                </span>
                                            </div>
                                        )}
                                        <MessageBubble msg={msg} />
                                    </div>
                                )
                            })}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-3 border-t border-slate-100 shrink-0 bg-white">
                    <p className="text-xs text-slate-400 text-center">
                        {totalCount > 0 ? (
                            <>
                                {totalCount.toLocaleString('pt-BR')} mensagens no total
                                {messages.length > 0 && (() => {
                                    const first = new Date(messages[0].created_at)
                                    const last = new Date(messages[messages.length - 1].created_at)
                                    const days = Math.max(1, Math.round((last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24)))
                                    return ` · Conversa de ${days} dia${days > 1 ? 's' : ''}`
                                })()}
                            </>
                        ) : 'Sem mensagens'}
                    </p>
                </div>
            </SheetContent>
        </Sheet>
    )
}

// ── Message Bubble ──

function MessageBubble({ msg }: { msg: WaMessage }) {
    const isInbound = msg.direction === 'inbound'
    const isAi = !isInbound && msg.is_ai
    const senderLabel = isInbound
        ? null
        : isAi
            ? 'Julia IA'
            : msg.sent_by_user_name || 'Consultor'

    const typeIcon = msgTypeIcon(msg.type)
    const hasContent = msg.body && msg.body.trim().length > 0
    const isMediaOnly = !hasContent && (msg.type === 'image' || msg.type === 'audio' || msg.type === 'document')

    return (
        <div className={cn('flex mb-1', isInbound ? 'justify-start' : 'justify-end')}>
            <div className={cn(
                'max-w-[80%] rounded-2xl px-3.5 py-2 text-sm relative',
                isInbound
                    ? 'bg-white border border-slate-200 text-slate-800 rounded-bl-md'
                    : isAi
                        ? 'bg-violet-100 text-violet-900 rounded-br-md'
                        : 'bg-indigo-600 text-white rounded-br-md'
            )}>
                {/* Sender label for outbound */}
                {senderLabel && (
                    <div className={cn(
                        'flex items-center gap-1 mb-0.5 text-[10px] font-semibold',
                        isAi ? 'text-violet-600' : 'text-indigo-200'
                    )}>
                        {isAi ? <Bot className="w-3 h-3" /> : <User className="w-3 h-3" />}
                        {senderLabel}
                    </div>
                )}
                {/* Media indicator */}
                {isMediaOnly && (
                    <div className={cn(
                        'flex items-center gap-1.5 text-xs italic',
                        isInbound ? 'text-slate-500' : isAi ? 'text-violet-600' : 'text-indigo-200'
                    )}>
                        {typeIcon}
                        {msg.type === 'image' ? 'Imagem' : msg.type === 'audio' ? 'Áudio' : 'Documento'}
                    </div>
                )}
                {/* Body */}
                {hasContent && (
                    <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">
                        {typeIcon && <span className="inline-flex mr-1 align-text-bottom">{typeIcon}</span>}
                        {msg.body}
                    </p>
                )}
                {/* Time */}
                <p className={cn(
                    'text-[10px] mt-0.5 text-right',
                    isInbound ? 'text-slate-400' : isAi ? 'text-violet-400' : 'text-indigo-300'
                )}>
                    {formatMsgTime(msg.created_at)}
                </p>
            </div>
        </div>
    )
}
