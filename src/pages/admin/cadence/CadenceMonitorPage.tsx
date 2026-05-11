/* eslint-disable @typescript-eslint/no-explicit-any */
// Tables cadence_* não estão em database.types.ts — casts 'as any' mantêm
// consistência com outras pages (AutomacaoBuilderPage etc).
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Play, XCircle, CheckCircle2, Clock, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from '@/components/ui/Badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/Table";
import {
    Card,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";

interface CadenceInstance {
    id: string;
    card_id: string;
    status: string;
    total_contacts_attempted: number;
    successful_contacts: number;
    started_at: string;
    completed_at: string | null;
    card?: {
        id: string;
        titulo: string;
        dono?: {
            nome: string;
        };
        pipeline_stages?: {
            nome: string;
        };
    };
    current_step?: {
        step_key: string;
        step_type: string;
    };
}

interface EventLog {
    id: string;
    card_id: string;
    event_type: string;
    event_source: string;
    event_data: Record<string, unknown>;
    action_taken: string;
    action_result: Record<string, unknown>;
    created_at: string;
}

interface QueueItem {
    id: string;
    status: string;
    execute_at: string;
    attempts: number;
    last_error: string | null;
    instance?: {
        card?: {
            titulo: string;
        };
    };
    step?: {
        step_key: string;
        step_type: string;
    };
}

const CadenceMonitorPage: React.FC = () => {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();

    const [template, setTemplate] = useState<{ name: string } | null>(null);
    const [instances, setInstances] = useState<CadenceInstance[]>([]);
    const [events, setEvents] = useState<EventLog[]>([]);
    const [queue, setQueue] = useState<QueueItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('instances');

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);

            // Buscar template
            const { data: templateData } = await (supabase
                .from('cadence_templates' as any) as any)
                .select('name')
                .eq('id', id)
                .single();

            setTemplate(templateData as { name: string } | null);

            // Buscar instâncias
            const { data: instancesData } = await (supabase
                .from('cadence_instances' as any) as any)
                .select(`
                    *,
                    card:cards (
                        id,
                        titulo,
                        dono:profiles!cards_dono_atual_id_profiles_fkey (nome),
                        pipeline_stages (nome)
                    ),
                    current_step:cadence_steps (step_key, step_type)
                `)
                .eq('template_id', id)
                .order('started_at', { ascending: false })
                .limit(100);

            setInstances((instancesData || []) as CadenceInstance[]);

            // Buscar eventos recentes
            const { data: eventsData } = await (supabase
                .from('cadence_event_log' as any) as any)
                .select('*')
                .eq('instance_id', id)
                .order('created_at', { ascending: false })
                .limit(50);

            // Se não encontrou por instance_id, buscar por template (eventos gerais)
            if (!eventsData || eventsData.length === 0) {
                const instanceIds = (instancesData as any[] || []).map((i: { id: string }) => i.id);
                if (instanceIds.length > 0) {
                    const { data: instanceEvents } = await (supabase
                        .from('cadence_event_log' as any) as any)
                        .select('*')
                        .in('instance_id', instanceIds)
                        .order('created_at', { ascending: false })
                        .limit(50);
                    setEvents((instanceEvents || []) as EventLog[]);
                }
            } else {
                setEvents(eventsData as EventLog[]);
            }

            // Buscar fila
            const queueInstanceIds = (instancesData as any[] || []).map((i: { id: string }) => i.id);
            if (queueInstanceIds.length > 0) {
                const { data: queueData } = await (supabase
                    .from('cadence_queue' as any) as any)
                    .select(`
                        *,
                        instance:cadence_instances (
                            card:cards (titulo)
                        ),
                        step:cadence_steps (step_key, step_type)
                    `)
                    .in('instance_id', queueInstanceIds)
                    .in('status', ['pending', 'processing'])
                    .order('execute_at', { ascending: true })
                    .limit(50);

                setQueue((queueData || []) as QueueItem[]);
            }

        } catch (error) {
            console.error('Error fetching monitor data:', error);
            toast.error('Erro ao carregar dados.');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchData();

        // Auto-refresh a cada 30 segundos
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const handleCancelInstance = async (instanceId: string) => {
        if (!confirm('Tem certeza que deseja cancelar esta cadência?')) return;

        try {
            await (supabase
                .from('cadence_instances' as any) as any)
                .update({
                    status: 'cancelled',
                    cancelled_at: new Date().toISOString(),
                    cancelled_reason: 'manual'
                })
                .eq('id', instanceId);

            // Cancelar items na fila
            await (supabase
                .from('cadence_queue' as any) as any)
                .update({ status: 'cancelled' })
                .eq('instance_id', instanceId)
                .eq('status', 'pending');

            toast.success('Cadência cancelada.');
            fetchData();
        } catch (error) {
            console.error('Error cancelling instance:', error);
            toast.error('Erro ao cancelar cadência.');
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'active':
                return <Badge className="bg-blue-100 text-blue-700">Ativa</Badge>;
            case 'waiting_task':
                return <Badge className="bg-amber-100 text-amber-700">Aguardando Tarefa</Badge>;
            case 'paused':
                return <Badge className="bg-slate-100 text-slate-700">Pausada</Badge>;
            case 'completed':
                return <Badge className="bg-green-100 text-green-700">Concluída</Badge>;
            case 'cancelled':
                return <Badge className="bg-red-100 text-red-700">Cancelada</Badge>;
            case 'failed':
                return <Badge className="bg-red-100 text-red-700">Falhou</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    const getEventIcon = (eventType: string) => {
        switch (eventType) {
            case 'task_created': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
            case 'task_completed': return <CheckCircle2 className="w-4 h-4 text-blue-500" />;
            case 'whatsapp_inbound': return <MessageSquare className="w-4 h-4 text-green-500" />;
            case 'whatsapp_outbound': return <MessageSquare className="w-4 h-4 text-blue-500" />;
            case 'auto_stage_move': return <Play className="w-4 h-4 text-purple-500" />;
            case 'cadence_started': return <Play className="w-4 h-4 text-blue-500" />;
            case 'cadence_completed': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
            case 'wait_started': return <Clock className="w-4 h-4 text-amber-500" />;
            default: return <Clock className="w-4 h-4 text-slate-400" />;
        }
    };

    if (loading && !template) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-slate-500">Carregando...</div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-slate-50/50">
            {/* Header */}
            <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="sm" onClick={() => navigate('/settings/automations')}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <div>
                        <h1 className="text-lg font-semibold text-slate-900">
                            Monitor: {template?.name || 'Cadência'}
                        </h1>
                    </div>
                </div>
                <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Atualizar
                </Button>
            </header>

            {/* Stats */}
            <div className="px-6 py-4 grid grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Ativas</CardDescription>
                        <CardTitle className="text-2xl text-blue-600">
                            {instances.filter(i => ['active', 'waiting_task'].includes(i.status)).length}
                        </CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Concluídas</CardDescription>
                        <CardTitle className="text-2xl text-green-600">
                            {instances.filter(i => i.status === 'completed').length}
                        </CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Na Fila</CardDescription>
                        <CardTitle className="text-2xl text-amber-600">
                            {queue.length}
                        </CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Taxa de Sucesso</CardDescription>
                        <CardTitle className="text-2xl">
                            {instances.length > 0
                                ? Math.round((instances.filter(i => i.successful_contacts > 0).length / instances.length) * 100)
                                : 0}%
                        </CardTitle>
                    </CardHeader>
                </Card>
            </div>

            {/* Tabs */}
            <div className="flex-1 px-6 pb-6 overflow-hidden">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
                    <TabsList>
                        <TabsTrigger value="instances">Instâncias ({instances.length})</TabsTrigger>
                        <TabsTrigger value="queue">Fila ({queue.length})</TabsTrigger>
                        <TabsTrigger value="events">Eventos ({events.length})</TabsTrigger>
                    </TabsList>

                    <TabsContent value="instances" className="flex-1 overflow-auto">
                        <div className="bg-white rounded-lg shadow-sm border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Card</TableHead>
                                        <TableHead>Responsável</TableHead>
                                        <TableHead>Stage</TableHead>
                                        <TableHead>Step Atual</TableHead>
                                        <TableHead className="text-center">Contatos</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Iniciada</TableHead>
                                        <TableHead></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {instances.map((instance) => (
                                        <TableRow key={instance.id}>
                                            <TableCell>
                                                <a
                                                    href={`/card/${instance.card_id}`}
                                                    className="text-blue-600 hover:underline font-medium"
                                                    target="_blank"
                                                >
                                                    {instance.card?.titulo || instance.card_id}
                                                </a>
                                            </TableCell>
                                            <TableCell className="text-slate-600">
                                                {instance.card?.dono?.nome || '-'}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline">
                                                    {instance.card?.pipeline_stages?.nome || '-'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-slate-600">
                                                {instance.current_step?.step_key || '-'}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <span className="text-green-600">{instance.successful_contacts}</span>
                                                <span className="text-slate-400"> / </span>
                                                <span>{instance.total_contacts_attempted}</span>
                                            </TableCell>
                                            <TableCell>{getStatusBadge(instance.status)}</TableCell>
                                            <TableCell className="text-slate-500 text-sm">
                                                {formatDistanceToNow(new Date(instance.started_at), {
                                                    addSuffix: true,
                                                    locale: ptBR
                                                })}
                                            </TableCell>
                                            <TableCell>
                                                {['active', 'waiting_task', 'paused'].includes(instance.status) && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleCancelInstance(instance.id)}
                                                        className="text-red-500 hover:text-red-700"
                                                    >
                                                        <XCircle className="w-4 h-4" />
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {instances.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                                                Nenhuma instância encontrada.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </TabsContent>

                    <TabsContent value="queue" className="flex-1 overflow-auto">
                        <div className="bg-white rounded-lg shadow-sm border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Card</TableHead>
                                        <TableHead>Step</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Execução</TableHead>
                                        <TableHead>Tentativas</TableHead>
                                        <TableHead>Erro</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {queue.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-medium">
                                                {item.instance?.card?.titulo || '-'}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline">
                                                    {item.step?.step_key}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>{getStatusBadge(item.status)}</TableCell>
                                            <TableCell className="text-slate-600 text-sm">
                                                {format(new Date(item.execute_at), 'dd/MM HH:mm', { locale: ptBR })}
                                            </TableCell>
                                            <TableCell className="text-center">{item.attempts}</TableCell>
                                            <TableCell className="text-red-500 text-sm max-w-xs truncate">
                                                {item.last_error || '-'}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {queue.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                                                Fila vazia.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </TabsContent>

                    <TabsContent value="events" className="flex-1 overflow-auto">
                        <div className="bg-white rounded-lg shadow-sm border divide-y">
                            {events.map((event) => (
                                <div key={event.id} className="p-4 flex items-start gap-4">
                                    <div className="mt-1">{getEventIcon(event.event_type)}</div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-slate-900">
                                                {event.event_type.replace(/_/g, ' ')}
                                            </span>
                                            <Badge variant="outline" className="text-xs">
                                                {event.event_source}
                                            </Badge>
                                        </div>
                                        {event.action_taken && (
                                            <div className="text-sm text-slate-600 mt-1">
                                                Ação: {event.action_taken}
                                            </div>
                                        )}
                                        <div className="text-xs text-slate-400 mt-1">
                                            {formatDistanceToNow(new Date(event.created_at), {
                                                addSuffix: true,
                                                locale: ptBR
                                            })}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {events.length === 0 && (
                                <div className="p-8 text-center text-slate-500">
                                    Nenhum evento registrado.
                                </div>
                            )}
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
};

export default CadenceMonitorPage;
