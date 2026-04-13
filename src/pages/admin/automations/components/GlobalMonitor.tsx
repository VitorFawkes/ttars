import { useCallback, useEffect, useState } from 'react';
import { Activity, CheckCircle2, Clock, RefreshCw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/Table';
import { supabase } from '@/lib/supabase';

interface MonitorInstance {
    id: string;
    card_id: string;
    status: string;
    started_at: string;
    completed_at: string | null;
    current_step_id: string | null;
    template_id: string;
}

interface MonitorRow extends MonitorInstance {
    card_titulo: string;
    dono_nome: string | null;
    stage_nome: string | null;
    template_name: string;
    step_key: string | null;
    block_index: number | null;
}

export function GlobalMonitor() {
    const [rows, setRows] = useState<MonitorRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'active' | 'completed' | 'cancelled' | 'all'>('active');

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);

            const statusFilter = filter === 'active'
                ? ['active', 'waiting_task']
                : filter === 'all'
                    ? ['active', 'waiting_task', 'completed', 'cancelled']
                    : [filter];

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: instances, error } = await (supabase as any)
                .from('cadence_instances')
                .select('id, card_id, status, started_at, completed_at, current_step_id, template_id')
                .in('status', statusFilter)
                .order('started_at', { ascending: false })
                .limit(200);

            if (error) throw error;
            if (!instances || instances.length === 0) {
                setRows([]);
                return;
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cardIds = [...new Set(instances.map((i: any) => i.card_id))];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const templateIds = [...new Set(instances.map((i: any) => i.template_id))];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const stepIds = [...new Set(instances.map((i: any) => i.current_step_id).filter(Boolean))];

            const [cardsRes, templatesRes, stepsRes] = await Promise.all([
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (supabase as any)
                    .from('cards')
                    .select('id, titulo, dono_atual_id, pipeline_stage_id')
                    .in('id', cardIds),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (supabase as any)
                    .from('cadence_templates')
                    .select('id, name')
                    .in('id', templateIds),
                stepIds.length > 0
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    ? (supabase as any)
                        .from('cadence_steps')
                        .select('id, step_key, block_index')
                        .in('id', stepIds)
                    : { data: [] },
            ]);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cardMap = new Map((cardsRes.data || []).map((c: any) => [c.id, c]));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const templateMap = new Map((templatesRes.data || []).map((t: any) => [t.id, t]));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const stepMap = new Map((stepsRes.data || []).map((s: any) => [s.id, s]));

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const profileIds = [...new Set([...cardMap.values()].map((c: any) => c.dono_atual_id).filter(Boolean))];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const stageIds = [...new Set([...cardMap.values()].map((c: any) => c.pipeline_stage_id).filter(Boolean))];

            const [profilesRes, stagesRes] = await Promise.all([
                profileIds.length > 0
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    ? (supabase as any).from('profiles').select('id, nome').in('id', profileIds)
                    : { data: [] },
                stageIds.length > 0
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    ? (supabase as any).from('pipeline_stages').select('id, nome').in('id', stageIds)
                    : { data: [] },
            ]);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p.nome]));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const stageMap = new Map((stagesRes.data || []).map((s: any) => [s.id, s.nome]));

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mapped: MonitorRow[] = instances.map((inst: any) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const card = cardMap.get(inst.card_id) as any;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const tpl = templateMap.get(inst.template_id) as any;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const step = stepMap.get(inst.current_step_id) as any;
                return {
                    ...inst,
                    card_titulo: card?.titulo || inst.card_id,
                    dono_nome: card?.dono_atual_id ? (profileMap.get(card.dono_atual_id) || null) : null,
                    stage_nome: card?.pipeline_stage_id ? (stageMap.get(card.pipeline_stage_id) || null) : null,
                    template_name: tpl?.name || 'Desconhecida',
                    step_key: step?.step_key || null,
                    block_index: step?.block_index ?? null,
                };
            });

            setRows(mapped);
        } catch (err) {
            console.error('GlobalMonitor fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const handleCancel = async (instanceId: string) => {
        if (!confirm('Cancelar esta automação?')) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
            .from('cadence_instances')
            .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_reason: 'manual' })
            .eq('id', instanceId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
            .from('cadence_queue')
            .update({ status: 'cancelled' })
            .eq('instance_id', instanceId)
            .eq('status', 'pending');
        fetchData();
    };

    const statusBadge = (status: string) => {
        switch (status) {
            case 'active': return <Badge className="bg-blue-100 text-blue-700">Ativa</Badge>;
            case 'waiting_task': return <Badge className="bg-amber-100 text-amber-700">Aguardando Tarefa</Badge>;
            case 'completed': return <Badge className="bg-emerald-100 text-emerald-700">Concluída</Badge>;
            case 'cancelled': return <Badge className="bg-red-100 text-red-700">Cancelada</Badge>;
            default: return <Badge variant="outline">{status}</Badge>;
        }
    };

    const templateGroups = rows.reduce<Record<string, { name: string; active: number; waiting: number; completed: number; cancelled: number }>>((acc, r) => {
        if (!acc[r.template_id]) acc[r.template_id] = { name: r.template_name, active: 0, waiting: 0, completed: 0, cancelled: 0 };
        if (r.status === 'active') acc[r.template_id].active++;
        else if (r.status === 'waiting_task') acc[r.template_id].waiting++;
        else if (r.status === 'completed') acc[r.template_id].completed++;
        else if (r.status === 'cancelled') acc[r.template_id].cancelled++;
        return acc;
    }, {});

    const activeCount = rows.filter(r => r.status === 'active' || r.status === 'waiting_task').length;
    const completedCount = rows.filter(r => r.status === 'completed').length;
    const cancelledCount = rows.filter(r => r.status === 'cancelled').length;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-4 gap-4">
                <Card className="bg-white border-slate-200 cursor-pointer hover:border-slate-300 transition-colors" onClick={() => setFilter('all')}>
                    <CardHeader className="pb-2">
                        <CardDescription>Total</CardDescription>
                        <CardTitle className="text-2xl">{rows.length}</CardTitle>
                    </CardHeader>
                </Card>
                <Card className={`bg-white border-slate-200 cursor-pointer hover:border-blue-300 transition-colors ${filter === 'active' ? 'ring-2 ring-blue-500' : ''}`} onClick={() => setFilter('active')}>
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-1"><Clock className="w-3 h-3" /> Em Andamento</CardDescription>
                        <CardTitle className="text-2xl text-blue-600">{activeCount}</CardTitle>
                    </CardHeader>
                </Card>
                <Card className={`bg-white border-slate-200 cursor-pointer hover:border-emerald-300 transition-colors ${filter === 'completed' ? 'ring-2 ring-emerald-500' : ''}`} onClick={() => setFilter('completed')}>
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Concluídas</CardDescription>
                        <CardTitle className="text-2xl text-emerald-600">{completedCount}</CardTitle>
                    </CardHeader>
                </Card>
                <Card className={`bg-white border-slate-200 cursor-pointer hover:border-red-300 transition-colors ${filter === 'cancelled' ? 'ring-2 ring-red-500' : ''}`} onClick={() => setFilter('cancelled')}>
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-1"><XCircle className="w-3 h-3" /> Canceladas</CardDescription>
                        <CardTitle className="text-2xl text-red-600">{cancelledCount}</CardTitle>
                    </CardHeader>
                </Card>
            </div>

            {Object.keys(templateGroups).length > 1 && (
                <Card className="bg-white border-slate-200">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-semibold">Por Automação</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <div className="space-y-2">
                            {Object.entries(templateGroups).map(([tid, g]) => (
                                <div key={tid} className="flex items-center justify-between text-sm">
                                    <span className="font-medium text-slate-900">{g.name}</span>
                                    <div className="flex items-center gap-3 text-xs">
                                        {(g.active + g.waiting) > 0 && <span className="text-blue-600">{g.active + g.waiting} ativas</span>}
                                        {g.completed > 0 && <span className="text-emerald-600">{g.completed} concluídas</span>}
                                        {g.cancelled > 0 && <span className="text-red-500">{g.cancelled} canceladas</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            <Card className="bg-white border-slate-200">
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                            <Activity className="w-4 h-4" />
                            Instâncias {filter !== 'all' ? `(${filter === 'active' ? 'em andamento' : filter === 'completed' ? 'concluídas' : 'canceladas'})` : ''}
                        </CardTitle>
                    </div>
                    <Button variant="ghost" size="sm" onClick={fetchData} disabled={loading}>
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                </CardHeader>
                <CardContent className="pt-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Card</TableHead>
                                <TableHead>Automação</TableHead>
                                <TableHead>Responsável</TableHead>
                                <TableHead>Etapa</TableHead>
                                <TableHead>Bloco</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Iniciada</TableHead>
                                <TableHead></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell>
                                        <a href={`/card/${row.card_id}`} className="text-blue-600 hover:underline font-medium text-sm" target="_blank">
                                            {row.card_titulo}
                                        </a>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-sm text-slate-700">{row.template_name}</span>
                                    </TableCell>
                                    <TableCell className="text-sm text-slate-600">{row.dono_nome || '-'}</TableCell>
                                    <TableCell>
                                        {row.stage_nome ? <Badge variant="outline" className="text-xs">{row.stage_nome}</Badge> : '-'}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {row.block_index !== null ? (
                                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold">
                                                {row.block_index + 1}
                                            </span>
                                        ) : '-'}
                                    </TableCell>
                                    <TableCell>{statusBadge(row.status)}</TableCell>
                                    <TableCell className="text-xs text-slate-500">
                                        {new Date(row.started_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                    </TableCell>
                                    <TableCell>
                                        {['active', 'waiting_task'].includes(row.status) && (
                                            <Button variant="ghost" size="sm" onClick={() => handleCancel(row.id)} className="text-red-500 hover:text-red-700">
                                                <XCircle className="w-4 h-4" />
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {rows.length === 0 && !loading && (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center py-12 text-slate-500">
                                        <Activity className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                                        Nenhuma instância {filter === 'active' ? 'em andamento' : filter === 'completed' ? 'concluída' : filter === 'cancelled' ? 'cancelada' : ''}.
                                    </TableCell>
                                </TableRow>
                            )}
                            {loading && rows.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center py-12 text-slate-500">
                                        <RefreshCw className="w-5 h-5 mx-auto mb-2 animate-spin text-slate-400" />
                                        Carregando...
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
