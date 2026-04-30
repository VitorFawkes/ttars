import { useQuery } from '@tanstack/react-query'
import { Clock, MessageSquare, MessageCircleWarning, MessageCircleReply, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface CardCorpTimingPanelProps {
    cardId: string
    createdAt: string | null | undefined
}

interface LastMsg {
    direction: 'inbound' | 'outbound' | null
    created_at: string | null
}

function useLastMessage(cardId: string) {
    return useQuery<LastMsg | null>({
        queryKey: ['card-last-message', cardId],
        staleTime: 30 * 1000,
        refetchInterval: 60 * 1000, // atualiza a cada minuto
        queryFn: async () => {
            const { data, error } = await supabase
                .from('whatsapp_messages')
                .select('direction, created_at')
                .eq('card_id', cardId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()
            if (error) throw error
            return data as LastMsg | null
        },
    })
}

type TimingLevel = 'fresh' | 'warn' | 'late'

function formatRelative(iso: string | null | undefined): { label: string; level: TimingLevel; minutes: number } | null {
    if (!iso) return null
    const ms = Date.now() - new Date(iso).getTime()
    if (Number.isNaN(ms) || ms < 0) return null
    const minutes = Math.floor(ms / 60000)
    const hours = minutes / 60
    const level: TimingLevel = hours >= 24 ? 'late' : hours >= 4 ? 'warn' : 'fresh'
    let label: string
    if (minutes < 1) label = 'agora há pouco'
    else if (minutes < 60) label = minutes === 1 ? 'há 1 minuto' : `há ${minutes} minutos`
    else if (hours < 24) {
        const h = Math.floor(hours)
        label = h === 1 ? 'há 1 hora' : `há ${h} horas`
    } else {
        const days = Math.floor(hours / 24)
        label = days === 1 ? 'há 1 dia' : `há ${days} dias`
    }
    return { label, level, minutes }
}

function badgeColor(level: TimingLevel): string {
    return level === 'late'
        ? 'border-rose-200 bg-rose-50 text-rose-800'
        : level === 'warn'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-emerald-200 bg-emerald-50 text-emerald-800'
}

function iconColor(level: TimingLevel): string {
    return level === 'late' ? 'text-rose-500' : level === 'warn' ? 'text-amber-500' : 'text-emerald-500'
}

export default function CardCorpTimingPanel({ cardId, createdAt }: CardCorpTimingPanelProps) {
    const { data: lastMsg, isLoading } = useLastMessage(cardId)

    const tempoAberto = formatRelative(createdAt)

    // Status da última mensagem:
    //   - inbound (cliente mandou): a bola está na nossa quadra → "Aguardando resposta nossa"
    //   - outbound (nós mandamos): cliente que tem que responder → "Aguardando cliente"
    let mensagemBlock: React.ReactNode = null
    if (lastMsg?.direction && lastMsg.created_at) {
        const rel = formatRelative(lastMsg.created_at)
        if (rel) {
            if (lastMsg.direction === 'inbound') {
                // Cliente respondeu há X — nossa vez de responder. Quanto mais tempo, mais grave.
                const cls = badgeColor(rel.level)
                mensagemBlock = (
                    <div className={`flex items-start gap-2 px-2.5 py-2 rounded-lg border ${cls}`}>
                        <MessageCircleWarning className={`w-4 h-4 mt-0.5 shrink-0 ${iconColor(rel.level)}`} />
                        <div className="min-w-0">
                            <p className="text-xs font-semibold leading-tight">Aguardando resposta nossa</p>
                            <p className="text-[11px] opacity-80 mt-0.5">Cliente escreveu {rel.label}</p>
                        </div>
                    </div>
                )
            } else {
                // Nós que mandamos por último — aguardando cliente. É OK por algumas horas, depois é wake-up.
                // Inverte gravidade: se já passou X tempo sem cliente responder, vira amarelo/vermelho na perspectiva dele.
                const cls = rel.level === 'late' ? badgeColor('warn') : 'border-slate-200 bg-slate-50 text-slate-700'
                mensagemBlock = (
                    <div className={`flex items-start gap-2 px-2.5 py-2 rounded-lg border ${cls}`}>
                        <MessageCircleReply className={`w-4 h-4 mt-0.5 shrink-0 ${rel.level === 'late' ? 'text-amber-500' : 'text-slate-400'}`} />
                        <div className="min-w-0">
                            <p className="text-xs font-semibold leading-tight">Última mensagem foi nossa</p>
                            <p className="text-[11px] opacity-80 mt-0.5">Enviada {rel.label}{rel.level === 'late' ? ' · talvez seja hora de retomar' : ''}</p>
                        </div>
                    </div>
                )
            }
        }
    } else if (!isLoading) {
        mensagemBlock = (
            <div className="flex items-start gap-2 px-2.5 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-600">
                <MessageSquare className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
                <div className="min-w-0">
                    <p className="text-xs font-semibold leading-tight">Sem mensagens</p>
                    <p className="text-[11px] opacity-80 mt-0.5">Nenhuma conversa ainda neste atendimento</p>
                </div>
            </div>
        )
    }

    return (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-2.5">
            <h3 className="text-xs font-semibold text-gray-900 mb-2">Status do atendimento</h3>
            <div className="space-y-1.5">
                {tempoAberto && (
                    <div className={`flex items-start gap-2 px-2.5 py-2 rounded-lg border ${badgeColor(tempoAberto.level)}`}>
                        <Clock className={`w-4 h-4 mt-0.5 shrink-0 ${iconColor(tempoAberto.level)}`} />
                        <div className="min-w-0">
                            <p className="text-xs font-semibold leading-tight">Aberto {tempoAberto.label}</p>
                            <p className="text-[11px] opacity-80 mt-0.5">
                                {tempoAberto.level === 'late'
                                    ? 'Atendimento longe do ideal — priorize o fechamento'
                                    : tempoAberto.level === 'warn'
                                    ? 'Já passou algumas horas — atenção'
                                    : 'Atendimento dentro da janela ideal'}
                            </p>
                        </div>
                    </div>
                )}

                {isLoading ? (
                    <div className="flex items-center gap-2 px-2.5 py-2 text-xs text-slate-400">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Carregando última mensagem...
                    </div>
                ) : (
                    mensagemBlock
                )}
            </div>
        </div>
    )
}
