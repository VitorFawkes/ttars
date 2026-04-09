import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Edit, Trash2, Target, Clock, MoreHorizontal, Users, Zap, Activity, LayoutList, RefreshCw, XCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
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
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CadenceEntryRulesTab } from './CadenceEntryRulesTab';

interface CadenceTemplate {
    id: string;
    name: string;
    description: string | null;
    target_audience: string | null;
    respect_business_hours: boolean;
    soft_break_after_days: number;
    is_active: boolean;
    execution_mode?: 'linear' | 'blocks';
    created_at: string;
    updated_at: string;
    steps_count?: number;
    active_instances?: number;
    completed_instances?: number;
}

interface CadenceStats {
    total_templates: number;
    active_templates: number;
    total_instances: number;
    active_instances: number;
    completed_instances: number;
    queue_pending: number;
}

const CadenceListPage: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [templates, setTemplates] = useState<CadenceTemplate[]>([]);
    const [stats, setStats] = useState<CadenceStats | null>(null);
    const [loading, setLoading] = useState(true);

    const activeTab = searchParams.get('tab') || 'templates';
    const setActiveTab = (tab: string) => setSearchParams({ tab });

    const fetchTemplates = async () => {
        try {
            setLoading(true);

            /* eslint-disable @typescript-eslint/no-explicit-any -- cadence tables not in generated types */
            const { data: templatesData, error: templatesError } = await (supabase
                .from('cadence_templates' as any) as any)
                .select('*')
                .order('created_at', { ascending: false });

            if (templatesError) throw templatesError;

            const { data: stepsData } = await (supabase
                .from('cadence_steps' as any) as any)
                .select('template_id');

            const { data: instancesData } = await (supabase
                .from('cadence_instances' as any) as any)
                .select('template_id, status');
            /* eslint-enable @typescript-eslint/no-explicit-any */

            // Agregar dados
            const templatesWithCounts = (templatesData || []).map((template: { id: string; name: string; description: string | null; target_audience: string | null; respect_business_hours: boolean; soft_break_after_days: number; is_active: boolean; created_at: string; updated_at: string }) => {
                const stepsCount = stepsData?.filter((s: { template_id: string }) => s.template_id === template.id).length || 0;
                const templateInstances = instancesData?.filter((i: { template_id: string; status: string }) => i.template_id === template.id) || [];
                const activeInstances = templateInstances.filter((i: { status: string }) => ['active', 'waiting_task', 'paused'].includes(i.status)).length;
                const completedInstances = templateInstances.filter((i: { status: string }) => i.status === 'completed').length;

                return {
                    ...template,
                    steps_count: stepsCount,
                    active_instances: activeInstances,
                    completed_instances: completedInstances,
                };
            });

            setTemplates(templatesWithCounts);

            /* eslint-disable @typescript-eslint/no-explicit-any -- cadence tables not in generated types */
            const { data: queueData } = await (supabase
                .from('cadence_queue' as any) as any)
                .select('id')
                .eq('status', 'pending');
            /* eslint-enable @typescript-eslint/no-explicit-any */

            setStats({
                total_templates: templatesWithCounts.length,
                active_templates: templatesWithCounts.filter((t: CadenceTemplate) => t.is_active).length,
                total_instances: instancesData?.length || 0,
                active_instances: instancesData?.filter((i: { status: string }) => ['active', 'waiting_task', 'paused'].includes(i.status)).length || 0,
                completed_instances: instancesData?.filter((i: { status: string }) => i.status === 'completed').length || 0,
                queue_pending: queueData?.length || 0,
            });

        } catch (error) {
            console.error('Error fetching cadences:', error);
            toast.error('Erro ao carregar cadências.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTemplates();
    }, []);

    const handleDelete = async (id: string) => {
        if (!confirm('Tem certeza que deseja excluir esta cadência? Todas as instâncias ativas serão canceladas.')) return;

        try {
            /* eslint-disable @typescript-eslint/no-explicit-any -- cadence tables not in generated types */
            await (supabase
                .from('cadence_instances' as any) as any)
                .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
                .eq('template_id', id)
                .in('status', ['active', 'waiting_task', 'paused']);

            const { error } = await (supabase
                .from('cadence_templates' as any) as any)
                .delete()
                .eq('id', id);
            /* eslint-enable @typescript-eslint/no-explicit-any */

            if (error) throw error;

            toast.success('Cadência excluída com sucesso.');
            fetchTemplates();
        } catch (error) {
            console.error('Error deleting cadence:', error);
            toast.error('Erro ao excluir cadência.');
        }
    };

    const handleToggleActive = async (id: string, currentState: boolean) => {
        try {
            // Optimistic update
            setTemplates(prev => prev.map(t => t.id === id ? { ...t, is_active: !currentState } : t));

            /* eslint-disable @typescript-eslint/no-explicit-any -- cadence tables not in generated types */
            const { error } = await (supabase
                .from('cadence_templates' as any) as any)
                .update({ is_active: !currentState })
                .eq('id', id);
            /* eslint-enable @typescript-eslint/no-explicit-any */

            if (error) throw error;

            toast.success(`Cadência ${!currentState ? 'ativada' : 'desativada'}.`);
        } catch (error) {
            console.error('Error toggling cadence:', error);
            toast.error('Erro ao atualizar status.');
            // Revert on error
            setTemplates(prev => prev.map(t => t.id === id ? { ...t, is_active: currentState } : t));
        }
    };

    const getAudienceBadge = (audience: string | null) => {
        switch (audience) {
            case 'sdr':
                return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">SDR</Badge>;
            case 'planner':
                return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Planner</Badge>;
            case 'posvenda':
                return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Pós-venda</Badge>;
            default:
                return <Badge variant="outline" className="bg-slate-50 text-slate-600">Geral</Badge>;
        }
    };

    // Render templates table content
    const renderTemplatesContent = () => (
        <>
            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Templates Ativos</CardDescription>
                            <CardTitle className="text-3xl">{stats.active_templates}/{stats.total_templates}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-xs text-slate-500">cadências configuradas</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Instâncias Ativas</CardDescription>
                            <CardTitle className="text-3xl text-blue-600">{stats.active_instances}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-xs text-slate-500">cards em cadência agora</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Concluídas</CardDescription>
                            <CardTitle className="text-3xl text-green-600">{stats.completed_instances}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-xs text-slate-500">cadências finalizadas</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Na Fila</CardDescription>
                            <CardTitle className="text-3xl text-amber-600">{stats.queue_pending}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-xs text-slate-500">steps aguardando execução</p>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Templates Table */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200">
                {loading ? (
                    <div className="p-8 text-center text-slate-500">Carregando...</div>
                ) : templates.length === 0 ? (
                    <div className="p-8 text-center">
                        <Target className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-slate-900 mb-2">Nenhuma cadência criada</h3>
                        <p className="text-slate-500 mb-4">Crie sua primeira cadência de vendas para automatizar o contato com leads.</p>
                        <Button onClick={() => navigate('/settings/cadence/new')}>
                            <Plus className="w-4 h-4 mr-2" />
                            Criar Cadência
                        </Button>
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[40%]">Cadência</TableHead>
                                <TableHead>Público</TableHead>
                                <TableHead className="text-center">Steps</TableHead>
                                <TableHead className="text-center">Ativas</TableHead>
                                <TableHead className="text-center">Concluídas</TableHead>
                                <TableHead className="text-center">Status</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {templates.map((template) => (
                                <TableRow key={template.id}>
                                    <TableCell>
                                        <div>
                                            <div className="font-medium text-slate-900">{template.name}</div>
                                            {template.description && (
                                                <div className="text-sm text-slate-500 truncate max-w-md">
                                                    {template.description}
                                                </div>
                                            )}
                                            <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                                                {template.respect_business_hours && (
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        Horário comercial
                                                    </span>
                                                )}
                                                <span>• {template.soft_break_after_days} dias máx</span>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>{getAudienceBadge(template.target_audience)}</TableCell>
                                    <TableCell className="text-center">
                                        <Badge variant="secondary">{template.steps_count} steps</Badge>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {template.active_instances && template.active_instances > 0 ? (
                                            <Badge className="bg-blue-100 text-blue-700">{template.active_instances}</Badge>
                                        ) : (
                                            <span className="text-slate-400">-</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {template.completed_instances && template.completed_instances > 0 ? (
                                            <span className="text-green-600">{template.completed_instances}</span>
                                        ) : (
                                            <span className="text-slate-400">-</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Switch
                                            checked={template.is_active}
                                            onCheckedChange={() => handleToggleActive(template.id, template.is_active)}
                                        />
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="sm">
                                                    <MoreHorizontal className="w-4 h-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => navigate(
                                                    template.execution_mode === 'blocks'
                                                        ? `/settings/cadence/automacao/${template.id}`
                                                        : `/settings/cadence/${template.id}`
                                                )}>
                                                    <Edit className="w-4 h-4 mr-2" />
                                                    Editar
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => navigate(`/settings/cadence/${template.id}/monitor`)}>
                                                    <Users className="w-4 h-4 mr-2" />
                                                    Monitor
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={() => handleDelete(template.id)}
                                                    className="text-red-600"
                                                >
                                                    <Trash2 className="w-4 h-4 mr-2" />
                                                    Excluir
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </div>
        </>
    );

    return (
        <div className="h-full flex flex-col bg-slate-50/50">
            {/* Header */}
            <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-8 shadow-sm">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Cadências de Vendas</h1>
                    <p className="text-sm text-slate-500 mt-1">Gerencie sequências automáticas de contato com leads.</p>
                </div>
                {activeTab === 'templates' && (
                    <Button
                        onClick={() => navigate('/settings/cadence/automacao/new')}
                        className="bg-indigo-600 hover:bg-indigo-700"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Nova Automação
                    </Button>
                )}
            </header>

            {/* Content with Tabs */}
            <div className="flex-1 px-8 py-6 overflow-auto">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                    <TabsList className="bg-white border border-slate-200 p-1">
                        <TabsTrigger value="templates" className="gap-2">
                            <LayoutList className="w-4 h-4" />
                            Templates
                        </TabsTrigger>
                        <TabsTrigger value="entry-rules" className="gap-2">
                            <Zap className="w-4 h-4" />
                            Regras de Entrada
                        </TabsTrigger>
                        <TabsTrigger value="monitor" className="gap-2">
                            <Activity className="w-4 h-4" />
                            Monitor Global
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="templates" className="mt-6">
                        {renderTemplatesContent()}
                    </TabsContent>

                    <TabsContent value="entry-rules" className="mt-6">
                        <CadenceEntryRulesTab />
                    </TabsContent>

                    <TabsContent value="monitor" className="mt-6">
                        <GlobalMonitor />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
};

// =============================================================================
// Monitor Global — mostra todas instâncias ativas de todas automações
// =============================================================================

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

function GlobalMonitor() {
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

            // Buscar dados relacionados em batch
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

            // Buscar profiles e stages
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
        if (!confirm('Cancelar esta cadência?')) return;
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

    // Agrupar por template para stats
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
            {/* Stats Cards */}
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

            {/* Por Automação */}
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

            {/* Tabela */}
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

export default CadenceListPage;
