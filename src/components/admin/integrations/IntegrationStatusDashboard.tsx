import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/Button';
import {
    CheckCircle2,
    AlertTriangle,
    Clock,
    Send,
    XCircle,
    RefreshCw,
    ArrowRight,
    Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useState } from 'react';
import { toast } from 'sonner';

interface IntegrationStats {
    inbound: {
        total: number;
        pending: number;
        blocked: number;
        processed: number;
        failed: number;
    };
    outbound: {
        total: number;
        pending: number;
        sent: number;
        failed: number;
    };
    lastSync: string | null;
}

export function IntegrationStatusDashboard() {
    const [processing, setProcessing] = useState(false);
    const [syncing, setSyncing] = useState(false);

    // Fetch integration stats
    const { data: stats, isLoading, refetch } = useQuery({
        queryKey: ['integration-stats'],
        queryFn: async (): Promise<IntegrationStats> => {
            // Inbound events
            const { data: inboundData } = await supabase
                .from('integration_events')
                .select('status, created_at')
                .order('created_at', { ascending: false });

            // Outbound queue
            const { data: outboundData } = await supabase
                .from('integration_outbound_queue')
                .select('status, created_at')
                .order('created_at', { ascending: false });

            const inbound = {
                total: inboundData?.length || 0,
                pending: inboundData?.filter(e => e.status === 'pending').length || 0,
                blocked: inboundData?.filter(e => e.status === 'blocked').length || 0,
                processed: inboundData?.filter(e => e.status === 'processed').length || 0,
                failed: inboundData?.filter(e => e.status === 'failed').length || 0,
            };

            const outbound = {
                total: outboundData?.length || 0,
                pending: outboundData?.filter(e => e.status === 'pending').length || 0,
                sent: outboundData?.filter(e => e.status === 'sent').length || 0,
                failed: outboundData?.filter(e => e.status === 'failed').length || 0,
            };

            // Last sync time (most recent event)
            const lastEvent = inboundData?.[0] || outboundData?.[0];
            const lastSync = lastEvent?.created_at || null;

            return { inbound, outbound, lastSync };
        },
        refetchInterval: 30000 // Refresh every 30s
    });

    // Process pending events
    const handleProcess = async () => {
        setProcessing(true);
        try {
            const { error } = await supabase.functions.invoke('integration-process');
            if (error) throw error;
            toast.success('Eventos processados com sucesso');
            refetch();
        } catch (e: any) {
            toast.error(`Erro: ${e.message}`);
        } finally {
            setProcessing(false);
        }
    };

    // Sync catalog from AC
    const handleSync = async () => {
        setSyncing(true);
        try {
            const { data, error } = await supabase.functions.invoke('integration-sync-catalog');
            if (error) throw error;
            toast.success(`Sincronizado: ${data.fields_synced || 0} campos`);
            refetch();
        } catch (e: any) {
            toast.error(`Erro: ${e.message}`);
        } finally {
            setSyncing(false);
        }
    };

    // Determine overall health
    const getHealthStatus = () => {
        if (!stats) return { status: 'loading', label: 'Carregando...', color: 'text-muted-foreground' };

        if (stats.inbound.blocked > 10 || stats.outbound.failed > 5) {
            return { status: 'warning', label: 'Atenção Necessária', color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200' };
        }
        if (stats.inbound.failed > 0 || stats.outbound.failed > 0) {
            return { status: 'error', label: 'Problemas Detectados', color: 'text-red-600', bg: 'bg-red-50 border-red-200' };
        }
        if (stats.inbound.pending > 0) {
            return { status: 'pending', label: 'Processando...', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' };
        }
        return { status: 'healthy', label: 'Saudável', color: 'text-green-600', bg: 'bg-green-50 border-green-200' };
    };

    const health = getHealthStatus();

    if (isLoading) {
        return (
            <Card className="animate-pulse">
                <CardContent className="py-6">
                    <div className="h-20 bg-muted rounded" />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className={cn("border-2 transition-colors", health.bg)}>
            <CardContent className="py-4">
                <div className="flex items-center justify-between">
                    {/* Health Status */}
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            "w-3 h-3 rounded-full animate-pulse",
                            health.status === 'healthy' && "bg-green-500",
                            health.status === 'warning' && "bg-orange-500",
                            health.status === 'error' && "bg-red-500",
                            health.status === 'pending' && "bg-blue-500"
                        )} />
                        <div>
                            <h3 className={cn("font-semibold", health.color)}>
                                Integração: {health.label}
                            </h3>
                            {stats?.lastSync && (
                                <p className="text-xs text-muted-foreground">
                                    Última atividade: {formatDistanceToNow(new Date(stats.lastSync), { addSuffix: true, locale: ptBR })}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleSync}
                            disabled={syncing}
                        >
                            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleProcess}
                            disabled={processing || (stats?.inbound.pending === 0)}
                        >
                            {processing ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                                <ArrowRight className="w-4 h-4 mr-2" />
                            )}
                            Processar
                        </Button>
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-6 mt-4 pt-4 border-t">
                    {/* Inbound */}
                    <div>
                        <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                            Entrada (AC → Welcome)
                        </h4>
                        <div className="flex flex-wrap gap-3">
                            <div className="flex items-center gap-1.5">
                                <CheckCircle2 className="w-4 h-4 text-green-600" />
                                <span className="text-sm font-medium">{stats?.inbound.processed || 0}</span>
                                <span className="text-xs text-muted-foreground">OK</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Clock className="w-4 h-4 text-blue-600" />
                                <span className="text-sm font-medium">{stats?.inbound.pending || 0}</span>
                                <span className="text-xs text-muted-foreground">pendentes</span>
                            </div>
                            {(stats?.inbound.blocked || 0) > 0 && (
                                <div className="flex items-center gap-1.5">
                                    <AlertTriangle className="w-4 h-4 text-orange-600" />
                                    <span className="text-sm font-medium text-orange-600">{stats?.inbound.blocked}</span>
                                    <span className="text-xs text-orange-600">bloqueados</span>
                                </div>
                            )}
                            {(stats?.inbound.failed || 0) > 0 && (
                                <div className="flex items-center gap-1.5">
                                    <XCircle className="w-4 h-4 text-red-600" />
                                    <span className="text-sm font-medium text-red-600">{stats?.inbound.failed}</span>
                                    <span className="text-xs text-red-600">falharam</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Outbound */}
                    <div>
                        <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                            Saída (Welcome → AC)
                        </h4>
                        <div className="flex flex-wrap gap-3">
                            <div className="flex items-center gap-1.5">
                                <Send className="w-4 h-4 text-green-600" />
                                <span className="text-sm font-medium">{stats?.outbound.sent || 0}</span>
                                <span className="text-xs text-muted-foreground">enviados</span>
                            </div>
                            {(stats?.outbound.pending || 0) > 0 && (
                                <div className="flex items-center gap-1.5">
                                    <Clock className="w-4 h-4 text-blue-600" />
                                    <span className="text-sm font-medium">{stats?.outbound.pending}</span>
                                    <span className="text-xs text-muted-foreground">na fila</span>
                                </div>
                            )}
                            {(stats?.outbound.failed || 0) > 0 && (
                                <div className="flex items-center gap-1.5">
                                    <XCircle className="w-4 h-4 text-red-600" />
                                    <span className="text-sm font-medium text-red-600">{stats?.outbound.failed}</span>
                                    <span className="text-xs text-red-600">falharam</span>
                                </div>
                            )}
                            {stats?.outbound.total === 0 && (
                                <span className="text-xs text-muted-foreground">Nenhum envio ainda</span>
                            )}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
