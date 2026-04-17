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
    AlertTriangle,
    Clock,
    RefreshCw,
    ExternalLink,
    ChevronDown,
    ChevronUp,
    ChevronRight,
    Loader2,
    User,
    Mail,
    Phone,
    DollarSign,
    Hash,
    FileText
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface TriggerEventHistoryProps {
    triggerId: string | null;
    triggerName: string;
    integrationId: string;
}

interface TriggerEvent {
    id: string;
    event_type: string | null;
    entity_type: string | null;
    status: string;
    processing_log: string | null;
    external_id: string | null;
    payload: Record<string, unknown> | null;
    created_at: string;
}

const PAGE_SIZE = 30;

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
    processed: { label: 'OK', color: 'bg-green-100 text-green-700', icon: CheckCircle },
    failed: { label: 'Erro', color: 'bg-red-100 text-red-700', icon: XCircle },
    ignored: { label: 'Ignorado', color: 'bg-amber-100 text-amber-700', icon: AlertTriangle },
    blocked: { label: 'Bloqueado', color: 'bg-slate-100 text-slate-700', icon: AlertTriangle },
    processed_shadow: { label: 'Shadow', color: 'bg-purple-100 text-purple-700', icon: CheckCircle },
};

function extractCardId(log: string | null): string | null {
    if (!log) return null;
    const match = log.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
    return match ? match[0] : null;
}

/** Extract structured AC data from the flat payload */
function extractACData(payload: Record<string, unknown>) {
    const get = (keys: string[]) => {
        for (const k of keys) {
            const v = payload[k];
            if (v !== undefined && v !== null && v !== '') return String(v);
        }
        return null;
    };

    // Deal fields (mapped from both webhook and sync payloads)
    const deal = {
        title: get(['deal[title]', 'title']),
        id: get(['deal[id]', 'id']),
        value: get(['deal[value]', 'value']),
        currency: get(['deal[currency]', 'currency']) || 'BRL',
        status: get(['deal[status]', 'status']),
        pipelineId: get(['deal[pipelineid]', 'pipeline_id', 'pipeline']),
        pipelineTitle: get(['deal[pipeline_title]']),
        stageId: get(['deal[stageid]', 'stage_id', 'stage']),
        stageTitle: get(['deal[stage_title]']),
        ownerFirstName: get(['deal[owner_firstname]']),
        ownerLastName: get(['deal[owner_lastname]']),
        ownerId: get(['deal[owner]', 'owner_id', 'owner']),
        createDate: get(['deal[create_date]', 'date_time']),
    };

    // Contact fields
    const contact = {
        id: get(['deal[contactid]', 'contact_id', 'contactid', 'contact[id]']),
        firstName: get(['deal[contact_firstname]', 'contact_name', 'contact[first_name]']),
        lastName: get(['deal[contact_lastname]', 'contact[last_name]']),
        email: get(['deal[contact_email]', 'contact_email', 'contact[email]']),
        phone: get(['contact[phone]', 'contact_phone']),
    };

    // Deal custom fields (only non-empty)
    const customFields: { key: string; value: string }[] = [];
    for (let i = 0; i <= 200; i++) {
        const key = payload[`deal[fields][${i}][key]`] as string;
        const value = payload[`deal[fields][${i}][value]`] as string;
        if (key && value) {
            customFields.push({ key, value });
        }
    }

    // Contact custom fields (from sync payload format)
    const contactFields: { key: string; value: string }[] = [];
    for (let i = 100; i <= 400; i++) {
        const value = payload[`contact[fields][${i}]`] as string;
        if (value) {
            contactFields.push({ key: `Campo ${i}`, value });
        }
    }

    // Sync metadata
    const syncedAt = get(['synced_at']);
    const importMode = get(['import_mode']);
    const forceUpdate = payload['force_update'] as boolean | undefined;

    return { deal, contact, customFields, contactFields, syncedAt, importMode, forceUpdate };
}

function EventDetailPanel({ payload, processingLog }: { payload: Record<string, unknown>; processingLog: string | null }) {
    const [showRaw, setShowRaw] = useState(false);
    const ac = extractACData(payload);

    const ownerName = [ac.deal.ownerFirstName, ac.deal.ownerLastName].filter(Boolean).join(' ');
    const contactName = [ac.contact.firstName, ac.contact.lastName].filter(Boolean).join(' ');

    return (
        <div className="mt-2 pt-2 border-t border-slate-200 space-y-3">
            {/* Deal + Contact Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Deal Info */}
                <div className="bg-slate-50 rounded-lg p-3 space-y-1.5">
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Deal ActiveCampaign</h4>
                    {ac.deal.title && (
                        <div className="flex items-center gap-2">
                            <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="text-sm font-medium text-slate-800">{ac.deal.title}</span>
                        </div>
                    )}
                    {ac.deal.id && (
                        <div className="flex items-center gap-2">
                            <Hash className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="text-sm text-slate-600">Deal ID: {ac.deal.id}</span>
                        </div>
                    )}
                    {ac.deal.value && ac.deal.value !== '0' && ac.deal.value !== '0.00' && (
                        <div className="flex items-center gap-2">
                            <DollarSign className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="text-sm text-slate-600">
                                {ac.deal.currency === 'brl' ? 'R$' : ac.deal.currency} {ac.deal.value}
                            </span>
                        </div>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                        {ac.deal.pipelineTitle ? (
                            <Badge variant="outline" className="text-xs">{ac.deal.pipelineTitle}</Badge>
                        ) : ac.deal.pipelineId ? (
                            <Badge variant="outline" className="text-xs">Pipeline {ac.deal.pipelineId}</Badge>
                        ) : null}
                        {ac.deal.stageTitle ? (
                            <Badge variant="outline" className="text-xs bg-blue-50">{ac.deal.stageTitle}</Badge>
                        ) : ac.deal.stageId ? (
                            <Badge variant="outline" className="text-xs bg-blue-50">Stage {ac.deal.stageId}</Badge>
                        ) : null}
                    </div>
                    {ownerName && (
                        <div className="flex items-center gap-2">
                            <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="text-sm text-slate-600">Owner: {ownerName}</span>
                            {ac.deal.ownerId && <span className="text-xs text-slate-400">(#{ac.deal.ownerId})</span>}
                        </div>
                    )}
                    {ac.deal.createDate && (
                        <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="text-sm text-slate-600">{ac.deal.createDate}</span>
                        </div>
                    )}
                </div>

                {/* Contact Info */}
                <div className="bg-slate-50 rounded-lg p-3 space-y-1.5">
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Contato</h4>
                    {contactName && (
                        <div className="flex items-center gap-2">
                            <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="text-sm font-medium text-slate-800">{contactName}</span>
                            {ac.contact.id && <span className="text-xs text-slate-400">(#{ac.contact.id})</span>}
                        </div>
                    )}
                    {ac.contact.email && (
                        <div className="flex items-center gap-2">
                            <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="text-sm text-slate-600">{ac.contact.email}</span>
                        </div>
                    )}
                    {ac.contact.phone && (
                        <div className="flex items-center gap-2">
                            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="text-sm text-slate-600">{ac.contact.phone}</span>
                        </div>
                    )}
                    {/* Contact custom fields (from sync payloads) */}
                    {ac.contactFields.length > 0 && (
                        <div className="mt-2 space-y-1">
                            {ac.contactFields.map((f, i) => (
                                <div key={i} className="text-xs text-slate-500">
                                    <span className="text-slate-400">{f.key}:</span> {f.value}
                                </div>
                            ))}
                        </div>
                    )}
                    {!contactName && !ac.contact.email && !ac.contact.phone && ac.contactFields.length === 0 && (
                        <p className="text-xs text-slate-400 italic">Sem dados de contato no payload</p>
                    )}
                </div>
            </div>

            {/* Deal Custom Fields (only non-empty) */}
            {ac.customFields.length > 0 && (
                <div className="bg-amber-50/50 rounded-lg p-3">
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        Campos do Deal ({ac.customFields.length})
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                        {ac.customFields.map((f, i) => (
                            <div key={i} className="text-xs">
                                <span className="text-slate-500">{f.key}:</span>{' '}
                                <span className="text-slate-800 font-medium">{f.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Processing Log */}
            {processingLog && (
                <div className="bg-slate-100 rounded-lg p-2 px-3">
                    <span className="text-xs text-slate-500 font-medium">Log: </span>
                    <span className="text-xs text-slate-700 font-mono">{processingLog}</span>
                </div>
            )}

            {/* Sync metadata */}
            {ac.importMode && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Badge variant="outline" className="text-xs">
                        {ac.importMode === 'sync' ? 'Sync Manual' : ac.importMode}
                    </Badge>
                    {ac.forceUpdate && <Badge variant="outline" className="text-xs bg-amber-50">Force Update</Badge>}
                    {ac.syncedAt && <span>Sincronizado: {format(new Date(ac.syncedAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</span>}
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

export function TriggerEventHistory({ triggerId, triggerName, integrationId }: TriggerEventHistoryProps) {
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [periodFilter, setPeriodFilter] = useState<string>('all');
    const [page, setPage] = useState(0);
    const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

    const { data, isLoading, refetch, isFetching } = useQuery({
        queryKey: ['trigger-event-history', triggerId, integrationId, statusFilter, periodFilter, page],
        queryFn: async () => {
            let query = supabase
                .from('integration_events')
                .select('id, event_type, entity_type, status, processing_log, external_id, payload, created_at')
                .eq('integration_id', integrationId)
                .order('created_at', { ascending: false })
                .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

            if (triggerId) {
                query = query.eq('matched_trigger_id', triggerId);
            } else {
                query = query.is('matched_trigger_id', null);
                query = query.in('status', ['processed', 'failed', 'blocked']);
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
            return data as TriggerEvent[];
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
                            { value: 'processed', label: 'Processados' },
                            { value: 'failed', label: 'Erros' },
                            { value: 'ignored', label: 'Ignorados' },
                            { value: 'blocked', label: 'Bloqueados' },
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
                            const dealTitle = (payload['deal[title]'] as string) || (payload.title as string) || 'Sem titulo';
                            const acDealId = event.external_id || (payload['deal[id]'] as string) || '';
                            const acPipeline = (payload['deal[pipelineid]'] as string) || (payload.pipeline_id as string) || (payload.pipeline as string) || '';
                            const acStage = (payload['deal[stageid]'] as string) || (payload.stage_id as string) || (payload.stage as string) || '';
                            const contactEmail = (payload['deal[contact_email]'] as string) || (payload.contact_email as string) || (payload['contact[email]'] as string) || '';
                            const cardId = extractCardId(event.processing_log);
                            const config = STATUS_CONFIG[event.status] || STATUS_CONFIG.failed;
                            const StatusIcon = config.icon;
                            const isError = event.status === 'failed' || event.status === 'blocked';
                            const isExpanded = expandedEventId === event.id;

                            return (
                                <div
                                    key={event.id}
                                    className={`rounded-lg border text-sm transition-colors ${
                                        isError
                                            ? 'bg-red-50 border-red-200'
                                            : event.status === 'ignored'
                                                ? 'bg-amber-50 border-amber-200'
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
                                                    <Badge variant="outline" className="text-xs">{event.event_type || 'unknown'}</Badge>
                                                    {acPipeline && <Badge variant="outline" className="text-xs bg-slate-50">P{acPipeline}/S{acStage}</Badge>}
                                                    <span className="font-medium truncate text-slate-800">{dealTitle}</span>
                                                    {acDealId && (
                                                        <span className="text-xs text-slate-400">#{acDealId}</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3 mt-1 ml-5">
                                                    {contactEmail && (
                                                        <span className="text-xs text-slate-500 flex items-center gap-0.5">
                                                            <Mail className="w-3 h-3" />
                                                            {contactEmail}
                                                        </span>
                                                    )}
                                                    {cardId && (
                                                        <a
                                                            href={`/cards/${cardId}`}
                                                            className="text-xs text-blue-600 hover:underline flex items-center gap-0.5"
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <ExternalLink className="w-3 h-3" />
                                                            Card {cardId.slice(0, 8)}...
                                                        </a>
                                                    )}
                                                    {isError && event.processing_log && (
                                                        <span className="text-xs text-red-600 font-mono bg-red-50 px-1.5 py-0.5 rounded">
                                                            {event.processing_log}
                                                        </span>
                                                    )}
                                                    {!isError && event.processing_log && event.processing_log.includes('Created') && (
                                                        <Badge className="bg-blue-100 text-blue-700 text-xs">Novo card</Badge>
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
