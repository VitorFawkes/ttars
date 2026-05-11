import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/Badge';
import { IntegrationMapping } from './IntegrationMapping';
import { InboundFieldMappingTab } from './InboundFieldMappingTab';
import { OutboundFieldMappingTab } from './OutboundFieldMappingTab';
import { OutboundStageMappingTab } from './OutboundStageMappingTab';
import { ACFieldManager } from './ACFieldManager';
import { TaskSyncTab } from './TaskSyncTab';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
    GitBranch,
    FileText,
    Users,
    Layers,
    Check,
    AlertTriangle,
    Map,
    ArrowDownLeft,
    ArrowUpRight,
    ArrowRightLeft,
    ClipboardList
} from 'lucide-react';

interface UnifiedMappingTabProps {
    integrationId: string;
}

interface MappingStats {
    pipelines: { total: number; mapped: number };
    stages: { total: number; mapped: number };
    users: { total: number; mapped: number };
    fields: { inbound: number; outbound: number };
}

type MappingTabValue = 'structure' | 'stages-out' | 'fields-in' | 'fields-out' | 'catalog' | 'tasks';

export function UnifiedMappingTab({ integrationId }: UnifiedMappingTabProps) {
    const [activeTab, setActiveTab] = useState<MappingTabValue>('structure');

    // Fetch mapping stats for visual feedback
    const { data: stats } = useQuery({
        queryKey: ['mapping-stats', integrationId],
        queryFn: async (): Promise<MappingStats> => {
            const [
                pipelinesRes,
                routerRes,
                stagesRes,
                stageMappingsRes,
                usersRes,
                userMappingsRes,
                inboundFieldsRes,
                outboundFieldsRes
            ] = await Promise.all([
                supabase.from('integration_catalog').select('id').eq('integration_id', integrationId).eq('entity_type', 'pipeline'),
                supabase.from('integration_router_config').select('id').eq('integration_id', integrationId),
                supabase.from('integration_catalog').select('id').eq('integration_id', integrationId).eq('entity_type', 'stage'),
                supabase.from('integration_stage_map').select('id').eq('integration_id', integrationId),
                supabase.from('integration_catalog').select('id').eq('integration_id', integrationId).eq('entity_type', 'user'),
                supabase.from('integration_user_map').select('id').eq('integration_id', integrationId),
                supabase.from('integration_field_map').select('id').eq('integration_id', integrationId).eq('direction', 'inbound'),
                supabase.from('integration_field_map').select('id').eq('integration_id', integrationId).eq('direction', 'outbound')
            ]);

            return {
                pipelines: {
                    total: pipelinesRes.data?.length || 0,
                    mapped: routerRes.data?.length || 0
                },
                stages: {
                    total: stagesRes.data?.length || 0,
                    mapped: stageMappingsRes.data?.length || 0
                },
                users: {
                    total: usersRes.data?.length || 0,
                    mapped: userMappingsRes.data?.length || 0
                },
                fields: {
                    inbound: inboundFieldsRes.data?.length || 0,
                    outbound: outboundFieldsRes.data?.length || 0
                }
            };
        }
    });

    // Calculate overall health
    const totalMapped = (stats?.pipelines.mapped || 0) + (stats?.stages.mapped || 0) + (stats?.users.mapped || 0);
    const totalItems = (stats?.pipelines.total || 0) + (stats?.stages.total || 0) + (stats?.users.total || 0);
    const structureHealth = totalItems > 0 ? Math.round((totalMapped / totalItems) * 100) : 0;

    return (
        <div className="space-y-6">
            {/* Header com visão geral */}
            <Card className="bg-gradient-to-r from-slate-50 to-blue-50 border-slate-200">
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-slate-800">
                        <Map className="w-5 h-5 text-blue-600" />
                        Mapeamentos
                    </CardTitle>
                    <CardDescription className="text-slate-600">
                        Configure como os dados do ActiveCampaign se conectam com o WelcomeCRM.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {/* Stats Overview */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        {/* Pipelines */}
                        <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-sm">
                            <div className="flex items-center gap-2 mb-1">
                                <GitBranch className="w-4 h-4 text-slate-400" />
                                <span className="text-xs font-medium text-slate-500 uppercase">Pipelines</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xl font-bold text-slate-800">
                                    {stats?.pipelines.mapped || 0}/{stats?.pipelines.total || 0}
                                </span>
                                {stats?.pipelines.mapped === stats?.pipelines.total && (stats?.pipelines.total || 0) > 0 ? (
                                    <Check className="w-4 h-4 text-green-500" />
                                ) : (
                                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                                )}
                            </div>
                        </div>

                        {/* Stages */}
                        <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-sm">
                            <div className="flex items-center gap-2 mb-1">
                                <ArrowRightLeft className="w-4 h-4 text-slate-400" />
                                <span className="text-xs font-medium text-slate-500 uppercase">Etapas</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xl font-bold text-slate-800">
                                    {stats?.stages.mapped || 0}/{stats?.stages.total || 0}
                                </span>
                                {stats?.stages.mapped === stats?.stages.total && (stats?.stages.total || 0) > 0 ? (
                                    <Check className="w-4 h-4 text-green-500" />
                                ) : (
                                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                                )}
                            </div>
                        </div>

                        {/* Users */}
                        <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-sm">
                            <div className="flex items-center gap-2 mb-1">
                                <Users className="w-4 h-4 text-slate-400" />
                                <span className="text-xs font-medium text-slate-500 uppercase">Pessoas</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xl font-bold text-slate-800">
                                    {stats?.users.mapped || 0}/{stats?.users.total || 0}
                                </span>
                                {stats?.users.mapped === stats?.users.total && (stats?.users.total || 0) > 0 ? (
                                    <Check className="w-4 h-4 text-green-500" />
                                ) : (
                                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                                )}
                            </div>
                        </div>

                        {/* Inbound Fields */}
                        <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-sm">
                            <div className="flex items-center gap-2 mb-1">
                                <ArrowDownLeft className="w-4 h-4 text-green-500" />
                                <span className="text-xs font-medium text-slate-500 uppercase">Campos Entrada</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xl font-bold text-slate-800">
                                    {stats?.fields.inbound || 0}
                                </span>
                                <FileText className="w-4 h-4 text-slate-300" />
                            </div>
                        </div>

                        {/* Outbound Fields */}
                        <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-sm">
                            <div className="flex items-center gap-2 mb-1">
                                <ArrowUpRight className="w-4 h-4 text-blue-500" />
                                <span className="text-xs font-medium text-slate-500 uppercase">Campos Saída</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xl font-bold text-slate-800">
                                    {stats?.fields.outbound || 0}
                                </span>
                                <FileText className="w-4 h-4 text-slate-300" />
                            </div>
                        </div>
                    </div>

                    {/* Health Bar */}
                    <div className="mt-4 pt-4 border-t border-slate-200">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-slate-700">
                                Saúde Estrutural: {structureHealth}%
                            </span>
                            <Badge
                                variant="secondary"
                                className={
                                    structureHealth >= 80
                                        ? 'bg-green-100 text-green-700'
                                        : structureHealth >= 50
                                            ? 'bg-amber-100 text-amber-700'
                                            : 'bg-red-100 text-red-700'
                                }
                            >
                                {structureHealth >= 80 ? 'Bom' : structureHealth >= 50 ? 'Parcial' : 'Incompleto'}
                            </Badge>
                        </div>
                        <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                            <div
                                className={`h-full transition-all duration-500 ${structureHealth >= 80
                                        ? 'bg-green-500'
                                        : structureHealth >= 50
                                            ? 'bg-amber-500'
                                            : 'bg-red-500'
                                    }`}
                                style={{ width: `${structureHealth}%` }}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Tabs de Mapeamento */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as MappingTabValue)} className="space-y-4">
                <TabsList className="bg-slate-100 p-1 rounded-lg h-auto flex-wrap">
                    <TabsTrigger
                        value="structure"
                        className="gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md px-4 py-2"
                    >
                        <GitBranch className="w-4 h-4" />
                        Estrutura (Entrada)
                        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                            AC → CRM
                        </Badge>
                    </TabsTrigger>
                    <TabsTrigger
                        value="stages-out"
                        className="gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md px-4 py-2"
                    >
                        <Layers className="w-4 h-4 text-blue-600" />
                        Etapas (Saída)
                        <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                            CRM → AC
                        </Badge>
                    </TabsTrigger>
                    <TabsTrigger
                        value="fields-in"
                        className="gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md px-4 py-2"
                    >
                        <ArrowDownLeft className="w-4 h-4 text-green-600" />
                        Campos (Entrada)
                        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                            AC → CRM
                        </Badge>
                    </TabsTrigger>
                    <TabsTrigger
                        value="fields-out"
                        className="gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md px-4 py-2"
                    >
                        <ArrowUpRight className="w-4 h-4 text-blue-600" />
                        Campos (Saída)
                        <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                            CRM → AC
                        </Badge>
                    </TabsTrigger>
                    <TabsTrigger
                        value="tasks"
                        className="gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md px-4 py-2"
                    >
                        <ClipboardList className="w-4 h-4 text-purple-600" />
                        Tarefas
                        <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                            Bidirecional
                        </Badge>
                    </TabsTrigger>
                    <TabsTrigger
                        value="catalog"
                        className="gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md px-4 py-2"
                    >
                        <FileText className="w-4 h-4" />
                        Catálogo AC
                    </TabsTrigger>
                </TabsList>

                {/* Estrutura (Pipelines, Stages, Users) - Entrada */}
                <TabsContent value="structure" className="mt-6">
                    <IntegrationMapping integrationId={integrationId} />
                </TabsContent>

                {/* Etapas de Saída (Welcome → AC) */}
                <TabsContent value="stages-out" className="mt-6">
                    <OutboundStageMappingTab integrationId={integrationId} />
                </TabsContent>

                {/* Campos de Entrada */}
                <TabsContent value="fields-in" className="mt-6">
                    <InboundFieldMappingTab integrationId={integrationId} />
                </TabsContent>

                {/* Campos de Saída */}
                <TabsContent value="fields-out" className="mt-6">
                    <OutboundFieldMappingTab integrationId={integrationId} />
                </TabsContent>

                {/* Tarefas (Bidirecional) */}
                <TabsContent value="tasks" className="mt-6">
                    <TaskSyncTab integrationId={integrationId} />
                </TabsContent>

                {/* Catálogo AC */}
                <TabsContent value="catalog" className="mt-6">
                    <ACFieldManager integrationId={integrationId} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
