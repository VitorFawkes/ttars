import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Edit, Trash2, Target, Clock, MoreHorizontal, Users, Zap, Activity, LayoutList } from 'lucide-react';
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
                        <Card className="bg-white border-slate-200">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Activity className="w-5 h-5" />
                                    Monitor Global de Cadências
                                </CardTitle>
                                <CardDescription>
                                    Visualize todas as instâncias de cadência ativas em tempo real.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="text-center py-8 text-slate-500">
                                    <Activity className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                                    <p>Monitor global em desenvolvimento.</p>
                                    <p className="text-sm mt-2">Use o monitor individual de cada template por enquanto.</p>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
};

export default CadenceListPage;
