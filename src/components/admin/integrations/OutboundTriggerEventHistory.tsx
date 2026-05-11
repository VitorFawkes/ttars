import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import {
    CheckCircle,
    XCircle,
    Clock,
    RefreshCw,
    ExternalLink,
    ChevronDown,
    ChevronUp,
    ChevronRight,
    Loader2,
    Eye,
    ArrowUpRight,
    Ban,
    Hash,
    DollarSign,
    MapPin
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface OutboundTriggerEventHistoryProps {
    triggerId: string | null;
    triggerName: string;
    integrationId: string;
}

interface OutboundEvent {
    id: string;
    card_id: string;
    external_id: string | null;
    event_type: string | null;
    status: string;
    processing_log: string | null;
    payload: Record<string, unknown> | null;
    attempts: number;
    created_at: string;
    processed_at: string | null;
    cards?: {
        titulo: string;
        pessoa_principal?: {
            nome: string;
        };
    };
}

const PAGE_SIZE = 30;

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
    pending: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
    processing: { label: 'Processando', color: 'bg-blue-100 text-blue-700', icon: Loader2 },
    sent: { label: 'Enviado', color: 'bg-green-100 text-green-700', icon: CheckCircle },
    failed: { label: 'Erro', color: 'bg-red-100 text-red-700', icon: XCircle },
    blocked: { label: 'Bloqueado', color: 'bg-slate-100 text-slate-700', icon: Ban },
    shadow: { label: 'Shadow', color: 'bg-purple-100 text-purple-700', icon: Eye },
};

const EVENT_TYPE_LABELS: Record<string, string> = {
    card_created: 'Criacao',
    stage_change: 'Mudanca de Etapa',
    won: 'Ganho',
    lost: 'Perdido',
    field_update: 'Campo',
};

function formatFieldValue(value: unknown): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return value.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(', ');
    if (typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        // Objects with display property (orcamento, epoca_viagem, duracao_viagem)
        if (typeof obj.display === 'string' && obj.display) return obj.display;
        // Observacoes-like nested objects: show key=value pairs
        const entries = Object.entries(obj).filter(([, v]) => v !== null && v !== undefined);
        if (entries.length <= 3) return entries.map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join('; ');
        return JSON.stringify(obj);
    }
    return String(value);
}

function EventDetailPanel({
    payload,
    processingLog,
    eventType
}: {
    payload: Record<string, unknown>;
    processingLog: string | null;
    eventType: string | null;
}) {
    const [showRaw, setShowRaw] = useState(false);

    // Extract relevant data based on event type
    const shadowMode = payload['shadow_mode'] as boolean;
    const matchedRule = payload['matched_rule'] as string;
    const blockedReason = payload['blocked_reason'] as string;

    return (
        <div className="mt-2 pt-2 border-t border-slate-200 space-y-3">
            {/* Event details by type */}
            <div className="bg-slate-50 rounded-lg p-3 space-y-2">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Dados do Evento
                </h4>

                {eventType === 'card_created' && (
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                            <ArrowUpRight className="w-3.5 h-3.5 text-blue-500" />
                            <span className="text-sm text-blue-700 font-medium">Card Criado no CRM</span>
                        </div>
                        {!!payload['titulo'] && (
                            <div className="text-xs text-slate-600">
                                Titulo: <strong>{String(payload['titulo'])}</strong>
                            </div>
                        )}
                        {!!payload['valor_estimado'] && (
                            <div className="flex items-center gap-2">
                                <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                                <span className="text-sm text-slate-600">
                                    Valor Estimado: R$ {Number(payload['valor_estimado']).toLocaleString('pt-BR')}
                                </span>
                            </div>
                        )}
                        {!!payload['target_external_stage_name'] && (
                            <div className="flex items-center gap-2">
                                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                <span className="text-sm text-slate-600">
                                    Destino AC: <strong>{String(payload['target_external_stage_name'])}</strong>
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {eventType === 'stage_change' && (
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-sm text-slate-600">
                                Stage destino: <strong>{String(payload['target_external_stage_name'] || payload['target_external_stage_id'] || '')}</strong>
                            </span>
                        </div>
                        {!!payload['old_stage_id'] && (
                            <div className="text-xs text-slate-500">
                                De: {String(payload['old_stage_id']).slice(0, 8)}... → Para: {String(payload['new_stage_id']).slice(0, 8)}...
                            </div>
                        )}
                    </div>
                )}

                {eventType === 'won' && (
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                            <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                            <span className="text-sm text-green-700 font-medium">Card Ganho</span>
                        </div>
                        {!!payload['valor_final'] && (
                            <div className="flex items-center gap-2">
                                <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                                <span className="text-sm text-slate-600">
                                    Valor Final: R$ {Number(payload['valor_final']).toLocaleString('pt-BR')}
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {eventType === 'lost' && (
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                            <XCircle className="w-3.5 h-3.5 text-red-500" />
                            <span className="text-sm text-red-700 font-medium">Card Perdido</span>
                        </div>
                        {!!payload['motivo_perda'] && (
                            <div className="text-xs text-slate-500">
                                Motivo: {String(payload['motivo_perda'])}
                            </div>
                        )}
                    </div>
                )}

                {eventType === 'field_update' && (
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                            <ArrowUpRight className="w-3.5 h-3.5 text-blue-500" />
                            <span className="text-sm text-blue-700 font-medium">Atualizacao de Campo</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                            {Object.entries(payload)
                                .filter(([k]) => !['shadow_mode', 'matched_rule', 'blocked_reason'].includes(k))
                                .map(([key, value]) => (
                                    <div key={key} className="text-xs">
                                        <span className="text-slate-500">{key}:</span>{' '}
                                        <span className="text-slate-800 font-medium">{formatFieldValue(value)}</span>
                                    </div>
                                ))
                            }
                        </div>
                    </div>
                )}
            </div>

            {/* Metadata */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
                {matchedRule && (
                    <Badge variant="outline" className="text-xs">
                        Regra: {matchedRule}
                    </Badge>
                )}
                {shadowMode && (
                    <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700">
                        Shadow Mode
                    </Badge>
                )}
                {blockedReason && (
                    <span className="text-red-600 font-mono bg-red-50 px-1.5 py-0.5 rounded">
                        {blockedReason}
                    </span>
                )}
            </div>

            {/* Processing Log */}
            {processingLog && (
                <div className="bg-slate-100 rounded-lg p-2 px-3">
                    <span className="text-xs text-slate-500 font-medium">Log: </span>
                    <span className="text-xs text-slate-700 font-mono">{processingLog}</span>
                </div>
            )}

            {/* Raw Payload Toggle */}
            <div>
                <button
                    onClick={() => setShowRaw(!showRaw)}
                    className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
                >
                    {showRaw ? <ChevronUp className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    Payload completo
                </button>
                {showRaw && (
                    <pre className="mt-1 text-[10px] text-slate-500 bg-slate-100 rounded p-2 max-h-[200px] overflow-auto font-mono whitespace-pre-wrap break-all">
                        {JSON.stringify(payload, null, 2)}
                    </pre>
                )}
            </div>
        </div>
    );
}

export function OutboundTriggerEventHistory({ triggerId, triggerName, integrationId }: OutboundTriggerEventHistoryProps) {
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [periodFilter, setPeriodFilter] = useState<string>('all');
    const [page, setPage] = useState(0);
    const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

    const { data, isLoading, refetch, isFetching } = useQuery({
        queryKey: ['outbound-trigger-event-history', triggerId, integrationId, statusFilter, periodFilter, page],
        queryFn: async () => {
            let query = supabase
                .from('integration_outbound_queue')
                .select(`
                    id, card_id, external_id, event_type, status, processing_log, payload, attempts, created_at, processed_at,
                    cards:card_id(titulo, pessoa_principal:pessoa_principal_id(nome))
                `)
                .eq('integration_id', integrationId)
                .order('created_at', { ascending: false })
                .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

            if (triggerId) {
                query = query.eq('matched_trigger_id', triggerId);
            } else {
                query = query.is('matched_trigger_id', null);
            }

            if (statusFilter !== 'all') {
                query = query.eq('status', statusFilter);
            }

            if (periodFilter !== 'all') {
                const now = new Date();
                let from: Date;
                if (periodFilter === 'today') {
                    from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                } else if (periodFilter === 'week') {
                    from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                } else {
                    from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                }
                query = query.gte('created_at', from.toISOString());
            }

            const { data, error } = await query;
            if (error) throw error;
            return data as unknown as OutboundEvent[];
        },
    });

    const events = data || [];

    return (
        <Card className="border-slate-200 bg-slate-50/50">
            <CardContent className="pt-4 space-y-3">
                {/* Filters */}
                <div className="flex items-center gap-3 flex-wrap">
                    <Select
                        value={statusFilter}
                        onChange={(v) => { setStatusFilter(v); setPage(0); }}
                        options={[
                            { value: 'all', label: 'Todos Status' },
                            { value: 'pending', label: 'Pendentes' },
                            { value: 'sent', label: 'Enviados' },
                            { value: 'failed', label: 'Erros' },
                            { value: 'blocked', label: 'Bloqueados' },
                            { value: 'shadow', label: 'Shadow' },
                        ]}
                    />
                    <Select
                        value={periodFilter}
                        onChange={(v) => { setPeriodFilter(v); setPage(0); }}
                        options={[
                            { value: 'all', label: 'Todos Periodos' },
                            { value: 'today', label: 'Hoje' },
                            { value: 'week', label: 'Esta semana' },
                            { value: 'month', label: 'Este mes' },
                        ]}
                    />
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => refetch()}
                        disabled={isFetching}
                        className="gap-1 ml-auto"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
                        Atualizar
                    </Button>
                </div>

                {/* Event List */}
                {isLoading ? (
                    <div className="flex items-center justify-center py-8 text-slate-500 gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Carregando eventos...
                    </div>
                ) : events.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-sm">
                        Nenhum evento encontrado para "{triggerName}"
                    </div>
                ) : (
                    <div className="space-y-1.5 max-h-[600px] overflow-y-auto">
                        {events.map(event => {
                            const payload = event.payload || {};
                            const cardTitle = event.cards?.titulo || 'Card nao encontrado';
                            const contactName = event.cards?.pessoa_principal?.nome || '';
                            const config = STATUS_CONFIG[event.status] || STATUS_CONFIG.failed;
                            const StatusIcon = config.icon;
                            const isError = event.status === 'failed' || event.status === 'blocked';
                            const isExpanded = expandedEventId === event.id;
                            const eventTypeLabel = EVENT_TYPE_LABELS[event.event_type || ''] || event.event_type || 'unknown';

                            return (
                                <div
                                    key={event.id}
                                    className={`rounded-lg border text-sm transition-colors ${
                                        isError
                                            ? 'bg-red-50 border-red-200'
                                            : event.status === 'blocked'
                                                ? 'bg-slate-50 border-slate-300'
                                                : event.status === 'shadow'
                                                    ? 'bg-purple-50 border-purple-200'
                                                    : event.status === 'sent'
                                                        ? 'bg-green-50 border-green-200'
                                                        : 'bg-white border-slate-200'
                                    }`}
                                >
                                    {/* Main row - clickable */}
                                    <div
                                        className="p-2.5 cursor-pointer hover:bg-slate-50/50 transition-colors"
                                        onClick={() => setExpandedEventId(isExpanded ? null : event.id)}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <ChevronRight className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                                    <Badge className={`${config.color} text-xs gap-0.5 px-1.5`}>
                                                        <StatusIcon className="w-3 h-3" />
                                                        {config.label}
                                                    </Badge>
                                                    <Badge variant="outline" className="text-xs">{eventTypeLabel}</Badge>
                                                    <span className="font-medium truncate text-slate-800">{cardTitle}</span>
                                                    {contactName && (
                                                        <span className="text-xs text-slate-500">• {contactName}</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3 mt-1 ml-5">
                                                    {event.external_id && (
                                                        <span className="text-xs text-slate-500 flex items-center gap-0.5">
                                                            <Hash className="w-3 h-3" />
                                                            AC #{event.external_id}
                                                        </span>
                                                    )}
                                                    {event.card_id && (
                                                        <a
                                                            href={`/cards/${event.card_id}`}
                                                            className="text-xs text-blue-600 hover:underline flex items-center gap-0.5"
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <ExternalLink className="w-3 h-3" />
                                                            Ver Card
                                                        </a>
                                                    )}
                                                    {event.attempts > 0 && (
                                                        <Badge variant="outline" className="text-xs">
                                                            Tentativa {event.attempts}
                                                        </Badge>
                                                    )}
                                                    {isError && event.processing_log && (
                                                        <span className="text-xs text-red-600 font-mono bg-red-50 px-1.5 py-0.5 rounded">
                                                            {event.processing_log.slice(0, 50)}...
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="text-xs text-slate-400 flex items-center gap-1 shrink-0">
                                                <Clock className="w-3 h-3" />
                                                {formatDistanceToNow(new Date(event.created_at), { addSuffix: true, locale: ptBR })}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Expanded detail panel */}
                                    {isExpanded && (
                                        <div className="px-2.5 pb-2.5">
                                            <EventDetailPanel
                                                payload={payload}
                                                processingLog={event.processing_log}
                                                eventType={event.event_type}
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Pagination */}
                {events.length > 0 && (
                    <div className="flex items-center justify-between pt-2">
                        <div className="text-xs text-slate-400">
                            Mostrando {page * PAGE_SIZE + 1}-{page * PAGE_SIZE + events.length}
                        </div>
                        <div className="flex gap-2">
                            {page > 0 && (
                                <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)}>
                                    Anterior
                                </Button>
                            )}
                            {events.length === PAGE_SIZE && (
                                <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} className="gap-1">
                                    Mais
                                    <ChevronDown className="w-3.5 h-3.5" />
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
