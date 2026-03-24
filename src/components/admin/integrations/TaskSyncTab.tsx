import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { toast } from 'sonner';
import { Loader2, Info, ClipboardList, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ──

interface TaskSyncConfig {
    id: string;
    integration_id: string;
    pipeline_id: string;
    inbound_enabled: boolean;
    outbound_enabled: boolean;
}

interface TaskTypeMap {
    id: string;
    integration_id: string;
    pipeline_id: string;
    ac_task_type: number;
    crm_task_tipo: string;
    sync_direction: string;
    is_active: boolean;
}

interface Pipeline {
    id: string;
    nome: string;
    produto: string;
}

interface TaskSyncTabProps {
    integrationId: string;
}

const AC_TASK_TYPES = [
    { value: 1, label: 'Call (Ligacao)', icon: '📞' },
    { value: 2, label: 'Email', icon: '📧' },
    { value: 3, label: 'Todo (Tarefa)', icon: '✅' },
];

const CRM_TIPOS = [
    { value: 'contato', label: 'Contato' },
    { value: 'tarefa', label: 'Tarefa' },
    { value: 'reuniao', label: 'Reuniao' },
    { value: 'email', label: 'Email' },
    { value: 'outro', label: 'Outro' },
];

const SYNC_DIRECTIONS = [
    { value: 'both', label: 'Bidirecional' },
    { value: 'inbound', label: 'So Entrada' },
    { value: 'outbound', label: 'So Saida' },
];

// Supabase client typed cast for new tables not in database.types.ts yet
const db = supabase as any;

export function TaskSyncTab({ integrationId }: TaskSyncTabProps) {
    const queryClient = useQueryClient();
    const [selectedPipelineId, setSelectedPipelineId] = useState<string>('');

    // ── Load CRM pipelines ──
    const { data: pipelines, isLoading: loadingPipelines } = useQuery({
        queryKey: ['pipelines-for-task-sync'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('pipelines')
                .select('id, nome, produto')
                .in('produto', ['TRIPS', 'WEDDING'])
                .order('nome');
            if (error) throw error;
            return data as Pipeline[];
        }
    });

    // ── Load sync config per pipeline ──
    const { data: syncConfigs, isLoading: loadingConfigs } = useQuery({
        queryKey: ['task-sync-config', integrationId],
        queryFn: async () => {
            const { data, error } = await db
                .from('integration_task_sync_config')
                .select('*')
                .eq('integration_id', integrationId);
            if (error) throw error;
            return data as TaskSyncConfig[];
        }
    });

    // ── Load task type maps ──
    const { data: typeMaps, isLoading: loadingMaps } = useQuery({
        queryKey: ['task-type-maps', integrationId, selectedPipelineId],
        queryFn: async () => {
            let query = db
                .from('integration_task_type_map')
                .select('*')
                .eq('integration_id', integrationId);
            if (selectedPipelineId) {
                query = query.eq('pipeline_id', selectedPipelineId);
            }
            const { data, error } = await query;
            if (error) throw error;
            return data as TaskTypeMap[];
        },
        enabled: !!selectedPipelineId
    });

    // ── Toggle sync config ──
    const toggleConfig = useMutation({
        mutationFn: async ({ pipelineId, field, value }: {
            pipelineId: string; field: 'inbound_enabled' | 'outbound_enabled'; value: boolean;
        }) => {
            const { error } = await db
                .from('integration_task_sync_config')
                .upsert({
                    integration_id: integrationId,
                    pipeline_id: pipelineId,
                    [field]: value
                }, { onConflict: 'integration_id,pipeline_id' });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['task-sync-config'] });
            toast.success('Configuracao atualizada');
        },
        onError: (err: Error) => toast.error(`Erro: ${err.message}`)
    });

    // ── Update type map ──
    const updateTypeMap = useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: Partial<TaskTypeMap> }) => {
            const { error } = await db
                .from('integration_task_type_map')
                .update(updates)
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['task-type-maps'] });
            toast.success('Mapeamento atualizado');
        },
        onError: (err: Error) => toast.error(`Erro: ${err.message}`)
    });

    // ── Helpers ──
    const getConfigForPipeline = (pipelineId: string): TaskSyncConfig | undefined =>
        syncConfigs?.find(c => c.pipeline_id === pipelineId);

    const pipelineOptions = (pipelines || []).map(p => ({
        value: p.id,
        label: `${p.produto} — ${p.nome}`
    }));

    const isLoading = loadingPipelines || loadingConfigs;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 rounded-lg">
                            <ClipboardList className="w-5 h-5 text-purple-600" />
                        </div>
                        <div>
                            <CardTitle className="text-lg">Sync de Tarefas</CardTitle>
                            <CardDescription>
                                Sincronizacao bidirecional de tarefas entre ActiveCampaign e CRM
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            {/* Section A: Per-product toggles */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Ativar/Desativar por Produto</CardTitle>
                    <CardDescription>
                        Controle independente por produto. Ative um de cada vez para rollout gradual.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {pipelines?.map(pipeline => {
                        const config = getConfigForPipeline(pipeline.id);
                        return (
                            <div
                                key={pipeline.id}
                                className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-lg"
                            >
                                <div className="flex items-center gap-3">
                                    <Badge variant="outline" className={cn(
                                        'text-xs font-medium',
                                        pipeline.produto === 'TRIPS' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                        pipeline.produto === 'WEDDING' ? 'bg-pink-50 text-pink-700 border-pink-200' :
                                        'bg-slate-50 text-slate-700 border-slate-200'
                                    )}>
                                        {pipeline.produto}
                                    </Badge>
                                    <span className="text-sm font-medium text-slate-900">{pipeline.nome}</span>
                                </div>
                                <div className="flex items-center gap-6">
                                    <div className="flex items-center gap-2">
                                        <ArrowDownLeft className="w-3.5 h-3.5 text-green-600" />
                                        <span className="text-xs text-slate-500">Entrada</span>
                                        <Switch
                                            checked={config?.inbound_enabled ?? false}
                                            onCheckedChange={(checked) => toggleConfig.mutate({
                                                pipelineId: pipeline.id,
                                                field: 'inbound_enabled',
                                                value: checked
                                            })}
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <ArrowUpRight className="w-3.5 h-3.5 text-blue-600" />
                                        <span className="text-xs text-slate-500">Saida</span>
                                        <Switch
                                            checked={config?.outbound_enabled ?? false}
                                            onCheckedChange={(checked) => toggleConfig.mutate({
                                                pipelineId: pipeline.id,
                                                field: 'outbound_enabled',
                                                value: checked
                                            })}
                                        />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </CardContent>
            </Card>

            {/* Section B: Task type mapping */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Mapeamento de Tipos de Tarefa</CardTitle>
                    <CardDescription>
                        Como cada tipo de tarefa do AC se traduz no CRM (e vice-versa), por produto.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Pipeline selector */}
                    <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-slate-700">Produto:</span>
                        <Select
                            value={selectedPipelineId}
                            onChange={setSelectedPipelineId}
                            options={pipelineOptions}
                            placeholder="Selecione um produto..."
                            className="w-64"
                        />
                    </div>

                    {/* Type map table */}
                    {selectedPipelineId && (
                        loadingMaps ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <div className="border border-slate-200 rounded-lg overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-200">
                                            <th className="px-4 py-3 text-left font-medium text-slate-600">Tipo AC</th>
                                            <th className="px-4 py-3 text-left font-medium text-slate-600">Tipo CRM</th>
                                            <th className="px-4 py-3 text-left font-medium text-slate-600">Direcao</th>
                                            <th className="px-4 py-3 text-center font-medium text-slate-600">Ativo</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {AC_TASK_TYPES.map(acType => {
                                            const map = typeMaps?.find(m => m.ac_task_type === acType.value);
                                            return (
                                                <tr
                                                    key={acType.value}
                                                    className={cn(
                                                        'border-b border-slate-100 last:border-0',
                                                        map?.is_active ? 'bg-green-50/50' : ''
                                                    )}
                                                >
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-medium text-slate-900">{acType.label}</span>
                                                            <Badge variant="outline" className="text-[10px]">ID: {acType.value}</Badge>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <Select
                                                            value={map?.crm_task_tipo || 'tarefa'}
                                                            onChange={(val) => {
                                                                if (map) {
                                                                    updateTypeMap.mutate({
                                                                        id: map.id,
                                                                        updates: { crm_task_tipo: val }
                                                                    });
                                                                }
                                                            }}
                                                            options={CRM_TIPOS}
                                                            className="w-36"
                                                            disabled={!map}
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <Select
                                                            value={map?.sync_direction || 'both'}
                                                            onChange={(val) => {
                                                                if (map) {
                                                                    updateTypeMap.mutate({
                                                                        id: map.id,
                                                                        updates: { sync_direction: val }
                                                                    });
                                                                }
                                                            }}
                                                            options={SYNC_DIRECTIONS}
                                                            className="w-36"
                                                            disabled={!map}
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <Switch
                                                            checked={map?.is_active ?? false}
                                                            onCheckedChange={(checked) => {
                                                                if (map) {
                                                                    updateTypeMap.mutate({
                                                                        id: map.id,
                                                                        updates: { is_active: checked }
                                                                    });
                                                                }
                                                            }}
                                                            disabled={!map}
                                                        />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )
                    )}

                    {!selectedPipelineId && (
                        <div className="text-center py-8 text-sm text-muted-foreground">
                            Selecione um produto acima para ver/editar os mapeamentos de tipo.
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Section C: Info card */}
            <Card className="bg-blue-50/50 border-blue-200">
                <CardContent className="pt-6">
                    <div className="flex gap-3">
                        <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div className="space-y-2 text-sm text-blue-900">
                            <p className="font-medium">Como funciona o sync de tarefas</p>
                            <ul className="list-disc list-inside space-y-1 text-blue-800">
                                <li>
                                    <strong>Entrada (AC → CRM):</strong> Quando uma tarefa e criada ou completada no AC,
                                    ela e refletida automaticamente na lista de tarefas do card no CRM.
                                </li>
                                <li>
                                    <strong>Saida (CRM → AC):</strong> Quando uma tarefa e criada ou completada no CRM,
                                    ela aparece como Deal Task no AC vinculada ao deal correspondente.
                                </li>
                                <li>
                                    <strong>Responsaveis:</strong> O campo assignee/responsavel e mapeado bidirecionalmente
                                    usando o mapeamento de usuarios (tab Estrutura).
                                </li>
                                <li>
                                    Apenas tarefas de cards <strong>vinculados ao AC</strong> (com external_id) sao sincronizadas.
                                </li>
                                <li>
                                    Anti-loop: tarefas vindas do AC nao geram evento de saida, e vice-versa.
                                </li>
                            </ul>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
