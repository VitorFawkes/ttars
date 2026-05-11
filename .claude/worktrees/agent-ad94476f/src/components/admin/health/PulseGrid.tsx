import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
    MessageSquare,
    Zap,
    Building2,
    Timer,
    Activity,
    LayoutGrid,
    Send,
    ArrowUpRight,
    X,
    Loader2,
    AlertCircle,
    ExternalLink,
    ChevronDown,
    Copy,
    Check,
} from 'lucide-react'
import { useHealthPulse, useChannelEvents, type HealthPulse, type ChannelEvent } from '@/hooks/useIntegrationHealth'
import { cn } from '@/lib/utils'

const CHANNEL_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
    whatsapp_inbound:  { icon: MessageSquare, color: 'text-green-600' },
    whatsapp_outbound: { icon: Send,          color: 'text-green-500' },
    active_inbound:    { icon: Zap,           color: 'text-blue-600' },
    active_outbound:   { icon: ArrowUpRight,  color: 'text-blue-500' },
    monde:             { icon: Building2,     color: 'text-purple-600' },
    cadence:           { icon: Timer,         color: 'text-orange-600' },
    activities:        { icon: Activity,      color: 'text-slate-600' },
    cards:             { icon: LayoutGrid,    color: 'text-indigo-600' },
}

function formatFullDate(dateStr: string): string {
    const d = new Date(dateStr)
    return d.toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    })
}

function getPulseStatus(pulse: HealthPulse): 'ok' | 'stale' | 'critical' | 'none' {
    if (!pulse.last_event_at) return 'none'
    const hoursSince = (Date.now() - new Date(pulse.last_event_at).getTime()) / 3_600_000
    if (pulse.error_count_24h > 5) return 'critical'
    if (hoursSince > 48) return 'critical'
    if (hoursSince > 24) return 'stale'
    return 'ok'
}

const STATUS_DOT: Record<string, string> = {
    ok: 'bg-emerald-500',
    stale: 'bg-amber-500',
    critical: 'bg-red-500',
    none: 'bg-slate-300',
}

const STATUS_LABEL: Record<string, string> = {
    ok: 'Funcionando',
    stale: 'Sem atividade recente',
    critical: 'Atencao necessaria',
    none: 'Sem dados',
}

const STATUS_BADGE: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    processing: 'bg-blue-100 text-blue-700',
    completed: 'bg-emerald-100 text-emerald-700',
    processed: 'bg-emerald-100 text-emerald-700',
    processed_shadow: 'bg-emerald-100 text-emerald-700',
    sent: 'bg-emerald-100 text-emerald-700',
    delivered: 'bg-emerald-100 text-emerald-700',
    read: 'bg-emerald-100 text-emerald-700',
    failed: 'bg-red-100 text-red-700',
    blocked: 'bg-red-100 text-red-700',
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false)
    return (
        <button
            onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                navigator.clipboard.writeText(text)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
            }}
            className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
            title="Copiar"
        >
            {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copiado' : 'Copiar'}
        </button>
    )
}

function formatLogEntry(entry: unknown, idx: number): React.ReactNode {
    if (typeof entry === 'string') {
        return (
            <div key={idx} className="text-[11px] text-slate-700 font-mono leading-relaxed py-0.5">
                {entry}
            </div>
        )
    }
    if (typeof entry === 'object' && entry !== null) {
        const obj = entry as Record<string, unknown>
        return (
            <div key={idx} className="text-[11px] font-mono leading-relaxed py-0.5 space-y-0.5">
                {Object.entries(obj).map(([k, v]) => (
                    <div key={k}>
                        <span className="text-slate-400">{k}:</span>{' '}
                        <span className={k === 'error' || k === 'message' ? 'text-red-600' : 'text-slate-700'}>
                            {typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')}
                        </span>
                    </div>
                ))}
            </div>
        )
    }
    return <div key={idx} className="text-[11px] text-slate-600 font-mono">{String(entry)}</div>
}

function EventRow({ event }: { event: ChannelEvent }) {
    const [expanded, setExpanded] = useState(false)
    const hasErrorDetails = !!(event.errorFull || event.processingLog?.length || event.rawData)

    const mainContent = (
        <>
            {/* Linha 1: Data + Status + Link */}
            <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] text-slate-400 font-mono shrink-0">
                    {formatFullDate(event.created_at)}
                </span>
                <span className={cn(
                    'text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0',
                    STATUS_BADGE[event.status] ?? 'bg-slate-100 text-slate-600'
                )}>
                    {event.status}
                </span>
                {event.link && (
                    <Link
                        to={event.link}
                        onClick={(e) => e.stopPropagation()}
                        className="ml-auto flex items-center gap-0.5 text-[11px] text-indigo-600 hover:text-indigo-800 font-medium shrink-0"
                    >
                        {event.linkLabel ?? 'Abrir'}
                        <ExternalLink className="w-3 h-3" />
                    </Link>
                )}
            </div>
            {/* Linha 2: Summary */}
            <p className="text-sm text-slate-900 font-medium leading-snug">
                {event.summary}
            </p>
            {/* Linha 3: Detail */}
            {event.detail && (
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                    {event.detail}
                </p>
            )}
            {/* Linha 4: Erro resumido + botao expandir */}
            {event.error && (
                <div className="flex items-start gap-1 mt-1">
                    <AlertCircle className="w-3 h-3 text-red-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-red-600 leading-snug flex-1">{event.error}</p>
                    {hasErrorDetails && (
                        <button
                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); setExpanded(!expanded) }}
                            className={cn(
                                'inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 transition-colors',
                                expanded
                                    ? 'text-red-700 bg-red-100'
                                    : 'text-red-500 hover:text-red-700 hover:bg-red-50'
                            )}
                        >
                            Detalhes
                            <ChevronDown className={cn('w-3 h-3 transition-transform', expanded && 'rotate-180')} />
                        </button>
                    )}
                </div>
            )}
        </>
    )

    const errorPanel = expanded && hasErrorDetails && (
        <div className="mt-2 bg-red-50/80 border border-red-100 rounded-lg p-3 space-y-3" onClick={(e) => e.stopPropagation()}>
            {/* Erro completo */}
            {event.errorFull && event.errorFull.length > 120 && (
                <div>
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-semibold text-red-700 uppercase tracking-wide">Erro Completo</span>
                        <CopyButton text={event.errorFull} />
                    </div>
                    <pre className="text-[11px] text-red-700 font-mono whitespace-pre-wrap break-all bg-red-100/50 rounded p-2 max-h-40 overflow-y-auto">
                        {event.errorFull}
                    </pre>
                </div>
            )}

            {/* Processing Log */}
            {event.processingLog && event.processingLog.length > 0 && (
                <div>
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide">
                            Processing Log ({event.processingLog.length} entrada{event.processingLog.length > 1 ? 's' : ''})
                        </span>
                        <CopyButton text={JSON.stringify(event.processingLog, null, 2)} />
                    </div>
                    <div className="bg-white/80 rounded p-2 max-h-48 overflow-y-auto border border-red-100">
                        {event.processingLog.map((entry, idx) => formatLogEntry(entry, idx))}
                    </div>
                </div>
            )}

            {/* Raw Data */}
            {event.rawData && Object.keys(event.rawData).length > 0 && (
                <div>
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide">Dados do Evento</span>
                        <CopyButton text={JSON.stringify(event.rawData, null, 2)} />
                    </div>
                    <div className="bg-white/80 rounded p-2 max-h-48 overflow-y-auto border border-slate-200">
                        {Object.entries(event.rawData).map(([key, value]) => (
                            <div key={key} className="text-[11px] font-mono py-0.5">
                                <span className="text-slate-400">{key}:</span>{' '}
                                <span className="text-slate-700">
                                    {typeof value === 'object' && value !== null
                                        ? JSON.stringify(value, null, 2)
                                        : String(value ?? 'null')}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )

    return (
        <div
            className={cn(
                'py-3 px-2 border-b border-slate-100 last:border-0 transition-colors',
                event.error && hasErrorDetails && 'cursor-pointer',
                !expanded && event.link && !event.error && 'hover:bg-indigo-50/50',
                expanded && 'bg-red-50/30',
            )}
            onClick={() => {
                if (hasErrorDetails && event.error) {
                    setExpanded(!expanded)
                }
            }}
        >
            {mainContent}
            {errorPanel}
        </div>
    )
}

function ChannelDrawer({ channel, label, pulse, onClose }: {
    channel: string
    label: string
    pulse: HealthPulse
    onClose: () => void
}) {
    const config = CHANNEL_CONFIG[channel] ?? { icon: Activity, color: 'text-slate-500' }
    const Icon = config.icon
    const { data: events, isLoading } = useChannelEvents(channel)
    const status = getPulseStatus(pulse)

    const errorEvents = events?.filter(e => e.error) ?? []
    const successEvents = events?.filter(e => !e.error) ?? []

    return (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            {/* Header com resumo */}
            <div className="px-4 py-3 border-b border-slate-100">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <Icon className={cn('w-4 h-4', config.color)} />
                        <span className="text-sm font-semibold text-slate-900">{label}</span>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                {/* Stats resumo do canal */}
                <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${STATUS_DOT[status]}`} />
                        <span className="text-slate-600">{STATUS_LABEL[status]}</span>
                    </div>
                    <span className="text-slate-300">|</span>
                    <span className="text-slate-500">
                        Ultimo: <span className="font-medium text-slate-700">{pulse.last_event_at ? formatFullDate(pulse.last_event_at) : 'Nunca'}</span>
                    </span>
                    <span className="text-slate-300">|</span>
                    <span className="text-slate-500">
                        24h: <span className="font-medium text-slate-700">{pulse.event_count_24h}</span>
                    </span>
                    <span className="text-slate-300">|</span>
                    <span className="text-slate-500">
                        7d: <span className="font-medium text-slate-700">{pulse.event_count_7d}</span>
                    </span>
                    {pulse.error_count_24h > 0 && (
                        <>
                            <span className="text-slate-300">|</span>
                            <span className="text-red-600 font-medium">
                                {pulse.error_count_24h} erro{pulse.error_count_24h > 1 ? 's' : ''} 24h
                            </span>
                        </>
                    )}
                </div>
            </div>

            {/* Lista de eventos */}
            <div className="max-h-[420px] overflow-y-auto">
                {isLoading ? (
                    <div className="flex items-center justify-center py-8 text-slate-400">
                        <Loader2 className="w-5 h-5 animate-spin" />
                    </div>
                ) : !events?.length ? (
                    <div className="py-8 text-center text-sm text-slate-400">
                        Nenhum evento encontrado neste canal.
                    </div>
                ) : (
                    <>
                        {/* Erros primeiro, se houver */}
                        {errorEvents.length > 0 && (
                            <div className="px-3 py-2 bg-red-50 border-b border-red-100">
                                <p className="text-[11px] font-semibold text-red-700 uppercase tracking-wide mb-1">
                                    {errorEvents.length} evento{errorEvents.length > 1 ? 's' : ''} com erro
                                </p>
                                {errorEvents.slice(0, 5).map(e => (
                                    <EventRow key={e.id} event={e} />
                                ))}
                                {errorEvents.length > 5 && (
                                    <p className="text-[11px] text-red-500 text-center py-1">
                                        + {errorEvents.length - 5} outros erros
                                    </p>
                                )}
                            </div>
                        )}
                        {/* Eventos normais */}
                        <div className="px-3">
                            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide pt-2 pb-1">
                                Ultimos {successEvents.length} eventos
                            </p>
                            {successEvents.map(e => (
                                <EventRow key={e.id} event={e} />
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

function PulseCard({ pulse, isSelected, onClick }: {
    pulse: HealthPulse
    isSelected: boolean
    onClick: () => void
}) {
    const config = CHANNEL_CONFIG[pulse.channel] ?? { icon: Activity, color: 'text-slate-500' }
    const Icon = config.icon
    const status = getPulseStatus(pulse)

    return (
        <button
            onClick={onClick}
            className={cn(
                'bg-white border rounded-xl p-4 shadow-sm text-left transition-all hover:shadow-md',
                isSelected ? 'border-indigo-400 ring-1 ring-indigo-200' : 'border-slate-200'
            )}
        >
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${config.color}`} />
                    <span className="text-sm font-medium text-slate-900">{pulse.label}</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[status]}`} />
                </div>
            </div>
            <div className="text-xs text-slate-500 space-y-1">
                <div className="flex justify-between">
                    <span>Ultimo evento</span>
                    <span className={cn(
                        'font-medium',
                        status === 'critical' ? 'text-red-600' :
                        status === 'stale' ? 'text-amber-600' : 'text-slate-700'
                    )}>
                        {pulse.last_event_at ? formatFullDate(pulse.last_event_at) : 'Nunca'}
                    </span>
                </div>
                <div className="flex justify-between">
                    <span>Eventos 24h / 7d</span>
                    <span className="font-medium text-slate-700">
                        {pulse.event_count_24h} / {pulse.event_count_7d}
                    </span>
                </div>
                {pulse.error_count_24h > 0 && (
                    <div className="flex justify-between">
                        <span>Erros 24h</span>
                        <span className="font-medium text-red-600">{pulse.error_count_24h}</span>
                    </div>
                )}
                {pulse.last_error_at && (
                    <div className="flex justify-between">
                        <span>Ultimo erro</span>
                        <span className="font-medium text-red-500 text-[11px]">{formatFullDate(pulse.last_error_at)}</span>
                    </div>
                )}
            </div>
            {/* Indicador de status legivel */}
            <div className={cn(
                'mt-3 text-[11px] font-medium px-2 py-1 rounded-md text-center',
                status === 'ok' && 'bg-emerald-50 text-emerald-700',
                status === 'stale' && 'bg-amber-50 text-amber-700',
                status === 'critical' && 'bg-red-50 text-red-700',
                status === 'none' && 'bg-slate-50 text-slate-500',
            )}>
                {STATUS_LABEL[status]}
            </div>
        </button>
    )
}

export default function PulseGrid() {
    const { data: pulses, isLoading } = useHealthPulse()
    const [selectedChannel, setSelectedChannel] = useState<string | null>(null)

    const selectedPulse = pulses?.find(p => p.channel === selectedChannel)

    if (isLoading) {
        return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 h-[140px] animate-pulse" />
                ))}
            </div>
        )
    }

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {pulses?.map(p => (
                    <PulseCard
                        key={p.channel}
                        pulse={p}
                        isSelected={selectedChannel === p.channel}
                        onClick={() => setSelectedChannel(prev => prev === p.channel ? null : p.channel)}
                    />
                ))}
            </div>

            {selectedChannel && selectedPulse && (
                <ChannelDrawer
                    channel={selectedChannel}
                    label={selectedPulse.label}
                    pulse={selectedPulse}
                    onClose={() => setSelectedChannel(null)}
                />
            )}
        </div>
    )
}
