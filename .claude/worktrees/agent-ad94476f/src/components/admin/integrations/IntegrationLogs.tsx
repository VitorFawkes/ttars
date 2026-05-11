import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCircle2, XCircle, Clock, RefreshCw, AlertTriangle, Eye, RotateCcw, Ban, Play, Search, Download } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

// --- Drawer Component ---
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetFooter,
} from "@/components/ui/sheet";

export type LogMode = 'inbox' | 'outbox';

interface IntegrationEvent {
    id: string;
    integration_id?: string; // Optional now
    row_key?: string; // Inbox specific
    destination?: string; // Outbox specific
    action?: string; // Outbox specific
    status: string;
    payload: any;
    response?: any; // Inbox specific
    error_log?: string; // Outbox specific
    processing_log?: string; // Inbox specific
    attempts?: number; // Inbox specific
    retry_count?: number; // Outbox specific
    created_at: string;
    entity_type?: string;
    external_id?: string;
    internal_id?: string;
}

interface IntegrationLogsProps {
    integrationId?: string; // Optional if showing global events
    mode?: LogMode;
}

const STATUS_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string; bg: string }> = {
    success: { icon: CheckCircle2, label: 'Sucesso', color: 'text-green-600', bg: 'bg-green-500/10 border-green-200' },
    processed: { icon: CheckCircle2, label: 'Processado', color: 'text-green-600', bg: 'bg-green-500/10 border-green-200' },
    processed_shadow: { icon: Eye, label: 'Shadow Mode', color: 'text-purple-600', bg: 'bg-purple-500/10 border-purple-200' },
    pending: { icon: Clock, label: 'Pendente', color: 'text-yellow-600', bg: 'bg-yellow-500/10 border-yellow-200' },
    failed: { icon: XCircle, label: 'Falhou', color: 'text-red-600', bg: 'bg-red-500/10 border-red-200' },
    unrouted: { icon: Ban, label: 'Não Roteado', color: 'text-gray-600', bg: 'bg-gray-500/10 border-gray-200' },
    ignored: { icon: Ban, label: 'Ignorado', color: 'text-gray-500', bg: 'bg-gray-400/10 border-gray-200' },
    retrying: { icon: RefreshCw, label: 'Tentando', color: 'text-blue-600', bg: 'bg-blue-500/10 border-blue-200' },
    blocked: { icon: Ban, label: 'Bloqueado', color: 'text-orange-600', bg: 'bg-orange-500/10 border-orange-200' },
};

export function IntegrationLogs({ integrationId, mode = 'inbox' }: IntegrationLogsProps) {
    const [selectedEvent, setSelectedEvent] = useState<IntegrationEvent | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');
    const [searchId, setSearchId] = useState<string>('');
    const [limit, setLimit] = useState<number>(50);
    const tableName = mode === 'inbox' ? 'integration_events' : 'integration_outbox';
    const queryClient = useQueryClient();

    const STATUS_FILTER_OPTIONS = [
        { value: 'all', label: 'Todos os Status' },
        { value: 'pending', label: 'Pendente' },
        { value: 'processed', label: 'Processado' },
        { value: 'processed_shadow', label: 'Shadow' },
        { value: 'failed', label: 'Falhou' },
        { value: 'blocked', label: 'Bloqueado' },
        { value: 'ignored', label: 'Ignorado' },
    ];

    const EVENT_TYPE_OPTIONS = [
        { value: 'all', label: 'Todos os Tipos' },
        { value: 'deal_add', label: 'Deal Add' },
        { value: 'deal_update', label: 'Deal Update' },
        { value: 'deal_state', label: 'Deal State' },
        { value: 'contact_tag_added', label: 'Tag Adicionada' },
        { value: 'contact_tag_removed', label: 'Tag Removida' },
        { value: 'deal_task_add', label: 'Task Add' },
        { value: 'deal_task_complete', label: 'Task Complete' },
        { value: 'deal_note_add', label: 'Note Add' },
        { value: 'contact_automation_state', label: 'Automation' },
    ];

    const updateStatusMutation = useMutation({
        mutationFn: async ({ id, status }: { id: string; status: string }) => {
            const updateData: any = { status, processing_log: null };
            if (tableName === 'integration_outbox') {
                updateData.error_log = null;
            }

            const { error } = await supabase
                .from(tableName as any)
                .update(updateData)
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['integration-logs'] });
            toast.success('Status atualizado com sucesso');
            setSelectedEvent(null);
        },
        onError: (error) => {
            toast.error('Erro ao atualizar status: ' + error.message);
        }
    });

    const processPendingMutation = useMutation({
        mutationFn: async () => {
            const { data, error } = await supabase.functions.invoke('integration-process', {
                body: { integration_id: integrationId }
            });
            if (error) throw error;
            return data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['integration-logs'] });
            toast.success(data.message || 'Processamento iniciado');
        },
        onError: (error) => {
            toast.error('Erro ao processar: ' + error.message);
        }
    });

    const syncDealsMutation = useMutation({
        mutationFn: async () => {
            const { data, error } = await supabase.functions.invoke('integration-sync-deals', {
                body: { pipeline_id: '8', limit: 100 }
            });
            if (error) throw error;
            return data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['integration-logs'] });
            toast.success(`Sincronizado! ${data.new_events_created} novos eventos criados.`);
        },
        onError: (error) => {
            toast.error('Erro ao sincronizar: ' + error.message);
        }
    });

    const handleReprocess = (id: string) => {
        updateStatusMutation.mutate({ id, status: 'pending' });
    };

    const handleIgnore = (id: string) => {
        updateStatusMutation.mutate({ id, status: 'ignored' });
    };

    // Bulk actions
    const bulkUpdateMutation = useMutation({
        mutationFn: async ({ ids, status }: { ids: string[]; status: string }) => {
            const updateData: any = { status, processing_log: null };
            if (tableName === 'integration_outbox') {
                updateData.error_log = null;
            }

            const { error } = await supabase
                .from(tableName as any)
                .update(updateData)
                .in('id', ids);
            if (error) throw error;
        },
        onSuccess: (_, { ids, status }) => {
            queryClient.invalidateQueries({ queryKey: ['integration-logs'] });
            queryClient.invalidateQueries({ queryKey: ['integration-blocked-count'] });
            queryClient.invalidateQueries({ queryKey: ['integration-stats'] });
            toast.success(`${ids.length} evento(s) ${status === 'ignored' ? 'ignorados' : 'reenfileirados'}`);
            setSelectedIds(new Set());
        },
        onError: (error) => {
            toast.error('Erro: ' + error.message);
        }
    });

    const handleBulkIgnore = () => {
        if (selectedIds.size === 0) return;
        bulkUpdateMutation.mutate({ ids: Array.from(selectedIds), status: 'ignored' });
    };

    const handleBulkReprocess = () => {
        if (selectedIds.size === 0) return;
        bulkUpdateMutation.mutate({ ids: Array.from(selectedIds), status: 'pending' });
    };

    // Process Selected Events
    const processSelectedMutation = useMutation({
        mutationFn: async (ids: string[]) => {
            const { data, error } = await supabase.functions.invoke('integration-process', {
                body: { event_ids: ids }
            });
            if (error) throw error;
            return data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['integration-logs'] });
            toast.success(data.message || `${data.stats?.updated || 0} evento(s) processado(s)`);
            setSelectedIds(new Set());
        },
        onError: (error) => {
            toast.error('Erro ao processar: ' + error.message);
        }
    });

    const handleProcessSelected = () => {
        if (selectedIds.size === 0) return;
        processSelectedMutation.mutate(Array.from(selectedIds));
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (!events) return;
        if (selectedIds.size === events.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(events.map(e => e.id)));
        }
    };

    const { data: events, isLoading, refetch, isFetching } = useQuery({
        queryKey: ['integration-logs', mode, integrationId, statusFilter, eventTypeFilter, searchId, limit],
        queryFn: async () => {
            let query = supabase
                .from(tableName as any)
                .select('*')
                .order('created_at', { ascending: false })
                .limit(limit);

            // Apply status filter
            if (statusFilter && statusFilter !== 'all') {
                query = query.eq('status', statusFilter);
            }

            // Apply ID search (searches both UUID 'id' and AC 'external_id')
            if (searchId.trim()) {
                const term = searchId.trim();
                query = query.or(`id.ilike.%${term}%,external_id.ilike.%${term}%`);
            }

            // Apply event_type filter
            if (eventTypeFilter && eventTypeFilter !== 'all') {
                query = query.eq('event_type', eventTypeFilter);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data as unknown as IntegrationEvent[];
        },
        refetchInterval: (statusFilter === 'pending' || statusFilter === 'all') ? 5000 : false,
    });

    // Fetch Catalog for Names (AC)
    const { data: catalogStages } = useQuery({
        queryKey: ['integration-catalog-logs-stages', integrationId],
        enabled: !!integrationId,
        queryFn: async () => {
            const { data } = await supabase
                .from('integration_catalog')
                .select('*')
                .eq('integration_id', integrationId!)
                .eq('entity_type', 'stage');
            return data || [];
        }
    });

    const { data: catalogFields } = useQuery({
        queryKey: ['integration-catalog-logs-fields', integrationId],
        enabled: !!integrationId,
        queryFn: async () => {
            const { data } = await supabase
                .from('integration_catalog')
                .select('*')
                .eq('integration_id', integrationId!)
                .eq('entity_type', 'field');
            return data || [];
        }
    });

    // Fetch Welcome Stages for Names
    const { data: welcomeStages } = useQuery({
        queryKey: ['pipeline-stages-logs'],
        queryFn: async () => {
            const { data } = await supabase
                .from('pipeline_stages')
                .select('id, nome');
            return data || [];
        }
    });

    // Fetch Mappings
    const { data: stageMappings } = useQuery({
        queryKey: ['integration-stage-map-logs', integrationId],
        enabled: !!integrationId,
        queryFn: async () => {
            const { data } = await supabase
                .from('integration_stage_map')
                .select('*')
                .eq('integration_id', integrationId!);
            return data || [];
        }
    });

    // --- Metrics ---
    const totalEvents = events?.length || 0;
    const successCount = events?.filter(e => ['success', 'processed', 'processed_shadow'].includes(e.status)).length || 0;
    const failedCount = events?.filter(e => e.status === 'failed').length || 0;
    const successRate = totalEvents > 0 ? Math.round((successCount / totalEvents) * 100) : 0;

    if (isLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* --- Health Overview --- */}
            <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-muted/50 rounded-lg border backdrop-blur-sm">
                    <p className="text-sm text-muted-foreground">Total ({mode === 'inbox' ? 'Entrada' : 'Saída'})</p>
                    <p className="text-2xl font-bold">{totalEvents}</p>
                </div>
                <div className="p-4 bg-green-500/10 rounded-lg border border-green-200 backdrop-blur-sm">
                    <p className="text-sm text-green-600">Taxa de Sucesso</p>
                    <p className="text-2xl font-bold text-green-600">{successRate}%</p>
                </div>
                <div className="p-4 bg-red-500/10 rounded-lg border border-red-200 backdrop-blur-sm">
                    <p className="text-sm text-red-600">Falhas / Erros</p>
                    <p className="text-2xl font-bold text-red-600">{failedCount}</p>
                </div>
            </div>

            {/* --- Logs Table --- */}
            <div className="border rounded-lg overflow-hidden bg-card backdrop-blur-sm">
                <div className="flex items-center justify-between p-3 bg-muted/50 border-b">
                    <h3 className="font-semibold text-sm">
                        {mode === 'inbox' ? 'Inbox (ActiveCampaign -> Welcome)' : 'Outbox (Welcome -> ActiveCampaign)'}
                    </h3>
                    <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
                        <RefreshCw className={cn("w-4 h-4 mr-2", isFetching && "animate-spin")} />
                        Atualizar
                    </Button>
                    {mode === 'inbox' && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="ml-2"
                            onClick={() => processPendingMutation.mutate()}
                            disabled={processPendingMutation.isPending}
                        >
                            <Play className={cn("w-4 h-4 mr-2", processPendingMutation.isPending && "animate-spin")} />
                            Processar Pendentes
                        </Button>
                    )}
                    {mode === 'inbox' && (
                        <Button
                            variant="secondary"
                            size="sm"
                            className="ml-2"
                            onClick={() => syncDealsMutation.mutate()}
                            disabled={syncDealsMutation.isPending}
                        >
                            <Download className={cn("w-4 h-4 mr-2", syncDealsMutation.isPending && "animate-spin")} />
                            Sincronizar do AC
                        </Button>
                    )}
                </div>

                {/* --- Filters Row --- */}
                <div className="flex items-center gap-3 p-3 bg-muted/30 border-b">
                    <div className="relative flex-1 max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar por ID..."
                            value={searchId}
                            onChange={(e) => setSearchId(e.target.value)}
                            className="pl-9 h-8 text-xs"
                        />
                    </div>
                    <Select
                        value={statusFilter}
                        onChange={setStatusFilter}
                        options={STATUS_FILTER_OPTIONS}
                        placeholder="Status"
                        className="w-40 h-8"
                    />
                    <Select
                        value={eventTypeFilter}
                        onChange={setEventTypeFilter}
                        options={EVENT_TYPE_OPTIONS}
                        placeholder="Tipo"
                        className="w-44 h-8"
                    />
                    <div className="flex gap-1 ml-auto">
                        <Button
                            size="sm"
                            variant={limit === 50 ? 'default' : 'outline'}
                            className="text-xs h-7 px-2"
                            onClick={() => setLimit(50)}
                        >
                            50
                        </Button>
                        <Button
                            size="sm"
                            variant={limit === 200 ? 'default' : 'outline'}
                            className="text-xs h-7 px-2"
                            onClick={() => setLimit(200)}
                        >
                            200
                        </Button>
                        <Button
                            size="sm"
                            variant={limit === 500 ? 'default' : 'outline'}
                            className="text-xs h-7 px-2"
                            onClick={() => setLimit(500)}
                        >
                            500
                        </Button>
                    </div>
                </div>

                {/* Bulk Actions Toolbar */}
                {selectedIds.size > 0 && (
                    <div className="flex items-center gap-3 p-3 bg-primary/5 border-b">
                        <span className="text-sm font-medium">
                            {selectedIds.size} selecionado(s)
                        </span>
                        <div className="flex gap-2 ml-auto">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleBulkIgnore}
                                disabled={bulkUpdateMutation.isPending}
                            >
                                <Ban className="w-4 h-4 mr-1" />
                                Ignorar
                            </Button>
                            <Button
                                size="sm"
                                onClick={handleBulkReprocess}
                                disabled={bulkUpdateMutation.isPending}
                            >
                                <RotateCcw className="w-4 h-4 mr-1" />
                                Reprocessar
                            </Button>
                            <Button
                                size="sm"
                                variant="default"
                                onClick={handleProcessSelected}
                                disabled={processSelectedMutation.isPending}
                                className="bg-green-600 hover:bg-green-700"
                            >
                                <Play className="w-4 h-4 mr-1" />
                                Processar Selecionados
                            </Button>
                        </div>
                    </div>
                )}

                {events && events.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                        <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>Nenhum evento registrado.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50 text-muted-foreground">
                                <tr>
                                    <th className="p-3 w-10">
                                        <input
                                            type="checkbox"
                                            checked={events && events.length > 0 && selectedIds.size === events.length}
                                            onChange={toggleSelectAll}
                                            className="w-4 h-4 rounded border-gray-300"
                                        />
                                    </th>
                                    <th className="text-left p-3 font-medium">Status</th>
                                    <th className="text-left p-3 font-medium">Entidade</th>
                                    <th className="text-left p-3 font-medium">Stage Info (AC &rarr; Welcome)</th>
                                    <th className="text-left p-3 font-medium">ID Externo</th>
                                    <th className="text-left p-3 font-medium">Quando</th>
                                    <th className="text-right p-3 font-medium">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {events?.map((event) => {
                                    const config = STATUS_CONFIG[event.status] || STATUS_CONFIG.pending;
                                    const Icon = config.icon;

                                    // Resolve Stage Info
                                    const payload = event.payload || {};
                                    // Support both flat format and bracket format from AC webhooks
                                    const acStageId = payload.stage || payload.stage_id || payload['deal[stageid]'];
                                    const acPipelineId = payload.pipeline || payload.pipeline_id || payload['deal[pipelineid]'];
                                    const entity = event.entity_type;
                                    const changeType = payload.change_type;

                                    // Determine if Stage Info is relevant
                                    const isStageRelevant =
                                        (entity === 'deal' && (!changeType || changeType === 'd_stageid')) || // Deal snapshot or stage change
                                        (entity === 'dealActivity' && changeType === 'd_stageid') || // Activity stage change
                                        (payload.import_mode === 'new_lead'); // New Lead always targets a stage

                                    let stageInfo = null;

                                    if (isStageRelevant && (acStageId || payload.default_stage_id)) {
                                        const acStageName = catalogStages?.find(s => s.external_id === acStageId && s.parent_external_id === acPipelineId)?.external_name || acStageId;

                                        // Determine Target Stage
                                        let targetStageId = null;
                                        if (payload.import_mode === 'new_lead' && payload.default_stage_id) {
                                            targetStageId = payload.default_stage_id;
                                        } else {
                                            const mapping = stageMappings?.find(m => m.external_stage_id === acStageId && m.pipeline_id === acPipelineId);
                                            targetStageId = mapping?.internal_stage_id;
                                        }

                                        const welcomeStageName = welcomeStages?.find(s => s.id === targetStageId)?.nome || (targetStageId ? targetStageId.slice(0, 8) + '...' : '?');

                                        stageInfo = (
                                            <div className="flex flex-col text-xs">
                                                <span className="text-muted-foreground" title={`AC ID: ${acStageId}`}>
                                                    AC: {acStageName} <span className="text-[10px] opacity-50">({acStageId})</span>
                                                </span>
                                                <span className={cn("flex items-center gap-1", targetStageId ? "text-green-600" : "text-red-400")} title={`Welcome ID: ${targetStageId}`}>
                                                    &rarr; {welcomeStageName}
                                                </span>
                                            </div>
                                        );
                                    } else if (!isStageRelevant) {
                                        // Show relevant info for other types if possible
                                        if (changeType === 'custom_field_data') {
                                            const fieldId = payload.field_id || payload.relid;
                                            const fieldName = catalogFields?.find(f => f.external_id === fieldId)?.external_name || fieldId;
                                            stageInfo = (
                                                <div className="flex flex-col text-xs">
                                                    <span className="text-muted-foreground">Field: {fieldName}</span>
                                                    <span className="text-[10px] opacity-50 truncate max-w-[150px]">{payload.value}</span>
                                                </div>
                                            );
                                        } else if (entity === 'contactAutomation') {
                                            stageInfo = <span className="text-xs text-muted-foreground">Automation</span>
                                        }
                                    }

                                    return (
                                        <tr key={event.id} className={cn(
                                            "hover:bg-muted/50 transition-colors",
                                            selectedIds.has(event.id) && "bg-primary/5"
                                        )}>
                                            <td className="p-3">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(event.id)}
                                                    onChange={() => toggleSelect(event.id)}
                                                    className="w-4 h-4 rounded border-gray-300"
                                                />
                                            </td>
                                            <td className="p-3">
                                                <Badge variant="outline" className={cn("gap-1", config.color, config.bg)}>
                                                    <Icon className="w-3 h-3" />
                                                    {config.label}
                                                </Badge>
                                            </td>
                                            <td className="p-3 font-mono text-xs">
                                                {event.entity_type || event.action || '-'}
                                            </td>
                                            <td className="p-3">
                                                {stageInfo || <span className="text-muted-foreground">-</span>}
                                            </td>
                                            <td className="p-3 font-mono text-xs text-muted-foreground">
                                                {event.external_id || event.internal_id || '-'}
                                            </td>
                                            <td className="p-3 text-muted-foreground">
                                                {formatDistanceToNow(new Date(event.created_at), { addSuffix: true, locale: ptBR })}
                                            </td>
                                            <td className="p-3 text-right">
                                                <Button variant="ghost" size="sm" onClick={() => setSelectedEvent(event)}>
                                                    <Eye className="w-4 h-4 mr-1" />
                                                    Ver
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* --- Detail Drawer --- */}
            <Sheet open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
                <SheetContent className="sm:max-w-2xl w-full overflow-hidden flex flex-col p-0">
                    <SheetHeader className="p-6 border-b">
                        <SheetTitle className="flex items-center gap-2">
                            {selectedEvent && STATUS_CONFIG[selectedEvent.status] && (
                                <>
                                    {(() => {
                                        const Icon = STATUS_CONFIG[selectedEvent.status].icon;
                                        return <Icon className={cn("w-5 h-5", STATUS_CONFIG[selectedEvent.status].color)} />;
                                    })()}
                                </>
                            )}
                            Detalhes do Evento
                        </SheetTitle>
                        <SheetDescription className="font-mono text-xs">
                            ID: {selectedEvent?.id} | Key: {selectedEvent?.row_key || '-'}
                        </SheetDescription>
                    </SheetHeader>

                    {selectedEvent && (
                        <ScrollArea className="flex-1 p-6">
                            <div className="space-y-8">
                                {/* --- Visual Diff (The "Would Apply" View) --- */}
                                {selectedEvent.processing_log && (
                                    <div className="space-y-2">
                                        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                                            {selectedEvent.status === 'blocked' ? <Ban className="w-4 h-4 text-orange-500" /> : <Eye className="w-4 h-4" />}
                                            {selectedEvent.status === 'blocked' ? 'Motivo do Bloqueio' : 'Análise (Diff)'}
                                        </h4>
                                        <div className={cn("p-4 rounded-lg border text-sm font-mono whitespace-pre-wrap",
                                            selectedEvent.status === 'blocked' ? "bg-orange-500/10 border-orange-200 text-orange-700" : "bg-muted/50"
                                        )}>
                                            {selectedEvent.processing_log}
                                        </div>
                                    </div>
                                )}

                                {selectedEvent.error_log && (
                                    <div className="space-y-2">
                                        <h4 className="text-sm font-semibold text-red-500 uppercase tracking-wide flex items-center gap-2">
                                            <AlertTriangle className="w-4 h-4" />
                                            Erro
                                        </h4>
                                        <div className="p-4 bg-red-500/10 border border-red-200 rounded-lg text-sm text-red-600 font-mono whitespace-pre-wrap">
                                            {selectedEvent.error_log}
                                        </div>
                                    </div>
                                )}

                                {/* --- Payload --- */}
                                <div className="space-y-2">
                                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Payload Original</h4>
                                    <div className="p-4 bg-muted/30 rounded-lg border text-xs font-mono overflow-x-auto">
                                        <pre>{JSON.stringify(selectedEvent.payload, null, 2)}</pre>
                                    </div>
                                </div>
                            </div>
                        </ScrollArea>
                    )}

                    <SheetFooter className="p-6 border-t bg-muted/10">
                        <div className="flex gap-2 w-full">
                            <Button variant="outline" className="flex-1" onClick={() => setSelectedEvent(null)}>
                                Fechar
                            </Button>
                            {/* Actions for Inbox */}
                            {mode === 'inbox' && (
                                <>
                                    <Button
                                        variant="secondary"
                                        className="flex-1"
                                        onClick={() => selectedEvent && handleIgnore(selectedEvent.id)}
                                        disabled={updateStatusMutation.isPending}
                                    >
                                        <Ban className="w-4 h-4 mr-2" />
                                        Ignorar
                                    </Button>
                                    <Button
                                        className="flex-1"
                                        onClick={() => selectedEvent && handleReprocess(selectedEvent.id)}
                                        disabled={updateStatusMutation.isPending}
                                    >
                                        <RotateCcw className="w-4 h-4 mr-2" />
                                        Reprocessar
                                    </Button>
                                </>
                            )}
                        </div>
                    </SheetFooter>
                </SheetContent>
            </Sheet>
        </div>
    );
}

