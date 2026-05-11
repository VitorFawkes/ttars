import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { GitBranch, User, Check, Plus, Filter, AlertTriangle, X, Info } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface CatalogItem {
    id: string;
    integration_id: string;
    entity_type: 'pipeline' | 'stage' | 'user';
    external_id: string;
    external_name: string;
    parent_external_id?: string;
    metadata?: {
        source?: string;
        is_pending_id?: boolean;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [key: string]: any;
    };
    updated_at?: string;
}

interface RouterConfig {
    integration_id: string;
    external_pipeline_id: string;
    pipeline_id: string;
    business_unit?: string;
    is_active?: boolean;
}

interface StageMapping {
    id?: string;
    integration_id: string;
    pipeline_id: string;
    external_stage_id: string;
    external_stage_name: string;
    internal_stage_id: string;
}

interface UserMapping {
    id?: string;
    integration_id: string;
    external_user_id: string;
    internal_user_id: string;
}

export function IntegrationMapping({ integrationId: propId }: { integrationId?: string }) {
    const queryClient = useQueryClient();
    const { id: paramId } = useParams<{ id: string }>();
    const integrationId = propId || paramId;
    const [activeTab, setActiveTab] = useState<'pipelines' | 'stages' | 'users'>('pipelines');

    // --- State for Stages Tab ---
    const [selectedPipelineFilter, setSelectedPipelineFilter] = useState<string>('');

    // --- State for Manual Adds ---
    const [isAddingPipeline, setIsAddingPipeline] = useState(false);
    const [newPipeline, setNewPipeline] = useState({ name: '', id: '' });

    const [isAddingStage, setIsAddingStage] = useState(false);
    const [newStage, setNewStage] = useState({ name: '', id: '' });

    const [isAddingUser, setIsAddingUser] = useState(false);
    const [newUser, setNewUser] = useState({ name: '', id: '' });

    // --- Queries ---
    const { data: catalogPipelines } = useQuery({
        queryKey: ['integration-catalog-pipelines', integrationId],
        queryFn: async () => {
            if (!integrationId) return [];
            const { data } = await supabase
                .from('integration_catalog')
                .select('*')
                .eq('integration_id', integrationId)
                .eq('entity_type', 'pipeline')
                .order('external_name');
            return (data as CatalogItem[]) || [];
        },
        enabled: !!integrationId
    });

    const { data: catalogStages } = useQuery({
        queryKey: ['integration-catalog-stages', integrationId],
        queryFn: async () => {
            if (!integrationId) return [];
            const { data } = await supabase
                .from('integration_catalog')
                .select('*')
                .eq('integration_id', integrationId)
                .eq('entity_type', 'stage')
                .order('external_name');
            return (data as CatalogItem[]) || [];
        },
        enabled: !!integrationId
    });

    const { data: catalogUsers } = useQuery({
        queryKey: ['integration-catalog-users', integrationId],
        queryFn: async () => {
            if (!integrationId) return [];
            const { data } = await supabase
                .from('integration_catalog')
                .select('*')
                .eq('integration_id', integrationId)
                .eq('entity_type', 'user')
                .order('external_name');
            return (data as CatalogItem[]) || [];
        },
        enabled: !!integrationId
    });

    const { data: routerConfigs } = useQuery({
        queryKey: ['integration-router-config', integrationId],
        queryFn: async () => {
            if (!integrationId) return [];
            const { data } = await supabase
                .from('integration_router_config')
                .select('*')
                .eq('integration_id', integrationId);
            return (data as RouterConfig[]) || [];
        },
        enabled: !!integrationId
    });

    const { data: stageMappings } = useQuery({
        queryKey: ['integration-stage-map', integrationId],
        queryFn: async () => {
            if (!integrationId) return [];
            const { data } = await supabase
                .from('integration_stage_map')
                .select('*')
                .eq('integration_id', integrationId);
            return (data as StageMapping[]) || [];
        },
        enabled: !!integrationId
    });

    const { data: userMappings } = useQuery({
        queryKey: ['integration-user-map', integrationId],
        queryFn: async () => {
            if (!integrationId) return [];
            const { data } = await supabase
                .from('integration_user_map')
                .select('*')
                .eq('integration_id', integrationId);
            return (data as UserMapping[]) || [];
        },
        enabled: !!integrationId
    });

    // Internal Data
    const { data: internalPipelines } = useQuery({
        queryKey: ['pipelines'],
        queryFn: async () => {
            const { data } = await supabase.from('pipelines').select('*').order('nome');
            return data || [];
        }
    });

    const { data: internalStages } = useQuery({
        queryKey: ['pipeline-stages'],
        queryFn: async () => {
            const { data } = await supabase.from('pipeline_stages').select('*, pipeline_phases!pipeline_stages_phase_id_fkey(order_index)').order('ordem');
            // Sort by phase order_index then stage ordem
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (data || []).sort((a: any, b: any) => {
                const phaseA = a.pipeline_phases?.order_index ?? 999
                const phaseB = b.pipeline_phases?.order_index ?? 999
                if (phaseA !== phaseB) return phaseA - phaseB
                return a.ordem - b.ordem
            });
        }
    });

    const { data: internalUsers } = useQuery({
        queryKey: ['active-profiles-list'],
        queryFn: async () => {
            const { data } = await supabase.from('profiles').select('id, nome, email').eq('active', true).order('nome');
            return data?.map(u => ({ id: u.id, name: u.nome, email: u.email })) || [];
        }
    });

    // --- Stats Calculation ---
    const stats = {
        pipelines: {
            total: catalogPipelines?.length || 0,
            mapped: catalogPipelines?.filter(p => routerConfigs?.some(r => r.external_pipeline_id === p.external_id)).length || 0
        },
        stages: {
            total: catalogStages?.length || 0,
            mapped: catalogStages?.filter(s => stageMappings?.some(m => m.external_stage_id === s.external_id)).length || 0
        },
        users: {
            total: catalogUsers?.length || 0,
            mapped: catalogUsers?.filter(u => userMappings?.some(m => m.external_user_id === u.external_id)).length || 0
        }
    };

    const totalMapped = stats.pipelines.mapped + stats.stages.mapped + stats.users.mapped;
    const totalItems = stats.pipelines.total + stats.stages.total + stats.users.total;
    const healthPercentage = totalItems > 0 ? Math.round((totalMapped / totalItems) * 100) : 0;


    // --- Mutations ---

    // 1. Update Catalog Item (ID or Name)
    const updateCatalogItem = useMutation({
        mutationFn: async ({ id, external_id, external_name }: { id: string, external_id?: string, external_name?: string }) => {
            const updates: Partial<CatalogItem> = { updated_at: new Date().toISOString() };
            if (external_id !== undefined) {
                updates.external_id = external_id;
                // If we are updating the ID, we should remove the is_pending_id flag if it exists
                updates.metadata = { is_pending_id: false };
            }
            if (external_name !== undefined) updates.external_name = external_name;

            const { error } = await supabase
                .from('integration_catalog')
                .update(updates)
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            toast.success('Item atualizado!');
            queryClient.invalidateQueries({ queryKey: ['integration-catalog-pipelines'] });
            queryClient.invalidateQueries({ queryKey: ['integration-catalog-stages'] });
            queryClient.invalidateQueries({ queryKey: ['integration-catalog-users'] });
        },
        onError: (e) => toast.error('Erro ao atualizar: ' + e.message)
    });

    // 2. Add Catalog Item
    const addCatalogItem = useMutation({
        mutationFn: async (item: { entity_type: string, external_id: string, external_name: string, parent_external_id?: string }) => {
            if (!integrationId) return;
            const { error } = await supabase
                .from('integration_catalog')
                .insert({
                    integration_id: integrationId,
                    ...item,
                    metadata: { source: 'manual' },
                    updated_at: new Date().toISOString()
                });
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success('Item adicionado!');
            queryClient.invalidateQueries({ queryKey: ['integration-catalog-pipelines'] });
            queryClient.invalidateQueries({ queryKey: ['integration-catalog-stages'] });
            queryClient.invalidateQueries({ queryKey: ['integration-catalog-users'] });
        },
        onError: (e) => toast.error('Erro ao adicionar: ' + e.message)
    });

    // 3. Save Mappings
    const savePipelineMapping = useMutation({
        mutationFn: async ({ externalPipelineId, internalPipelineId }: { externalPipelineId: string, internalPipelineId: string }) => {
            if (!integrationId) return;

            const pipelineIdToSave = (internalPipelineId === 'ignore' || internalPipelineId === '') ? null : internalPipelineId;

            const { error } = await supabase
                .from('integration_router_config')
                .upsert({
                    integration_id: integrationId,
                    external_pipeline_id: externalPipelineId,
                    ac_pipeline_id: externalPipelineId, // Ensure PK is set
                    pipeline_id: pipelineIdToSave as string | null,
                    business_unit: 'TRIPS',
                    is_active: true
                }, { onConflict: 'ac_pipeline_id' }); // Use correct PK constraint
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success('Mapeamento salvo!');
            queryClient.invalidateQueries({ queryKey: ['integration-router-config'] });
        }
    });

    const saveStageMapping = useMutation({
        mutationFn: async ({ externalId, pipelineId, externalName, internalStageId }: { externalId: string, pipelineId: string, externalName: string, internalStageId: string }) => {
            if (!integrationId) return;

            if (internalStageId === 'ignore' || internalStageId === '') {
                const { error } = await supabase
                    .from('integration_stage_map')
                    .delete()
                    .eq('integration_id', integrationId)
                    .eq('pipeline_id', pipelineId)
                    .eq('external_stage_id', externalId);
                if (error) throw error;
                return;
            }

            const { error } = await supabase
                .from('integration_stage_map')
                .upsert({
                    integration_id: integrationId,
                    pipeline_id: pipelineId,
                    external_stage_id: externalId,
                    external_stage_name: externalName,
                    internal_stage_id: internalStageId,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'integration_id,pipeline_id,external_stage_id' });
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success('Mapeamento de estágio salvo!');
            queryClient.invalidateQueries({ queryKey: ['integration-stage-map'] });
        }
    });

    const saveUserMapping = useMutation({
        mutationFn: async ({ externalId, internalUserId }: { externalId: string, internalUserId: string }) => {
            if (!integrationId) return;

            if (internalUserId === 'ignore' || internalUserId === '') {
                const { error } = await supabase
                    .from('integration_user_map')
                    .delete()
                    .eq('integration_id', integrationId)
                    .eq('external_user_id', externalId);
                if (error) throw error;
                return;
            }

            const { error } = await supabase
                .from('integration_user_map')
                .upsert({
                    integration_id: integrationId,
                    external_user_id: externalId,
                    internal_user_id: internalUserId,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'integration_id,external_user_id' });
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success('Mapeamento de usuário salvo!');
            queryClient.invalidateQueries({ queryKey: ['integration-user-map'] });
        }
    });

    // --- Helper Components ---

    const EditableCell = ({ value, onSave, placeholder, className }: { value: string, onSave: (val: string) => void, placeholder?: string, className?: string }) => {
        const [isEditing, setIsEditing] = useState(false);
        const [tempValue, setTempValue] = useState(value);

        useEffect(() => { setTempValue(value); }, [value]);

        if (isEditing) {
            return (
                <div className="flex items-center gap-1">
                    <Input
                        value={tempValue}
                        onChange={(e) => setTempValue(e.target.value)}
                        className={cn("h-8 text-sm bg-background border-input text-foreground focus:ring-primary/50", className)}
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                onSave(tempValue);
                                setIsEditing(false);
                            } else if (e.key === 'Escape') {
                                setTempValue(value);
                                setIsEditing(false);
                            }
                        }}
                    />
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100" onClick={() => { onSave(tempValue); setIsEditing(false); }}>
                        <Check className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-100" onClick={() => { setTempValue(value); setIsEditing(false); }}>
                        <X className="w-4 h-4" />
                    </Button>
                </div>
            );
        }

        return (
            <div
                className={cn("cursor-pointer hover:bg-muted/50 px-2 py-1 rounded border border-transparent hover:border-input flex items-center gap-2 group min-h-[32px] transition-all duration-200", className)}
                onClick={() => setIsEditing(true)}
            >
                {value || <span className="text-muted-foreground italic text-xs">{placeholder || "Clique para editar"}</span>}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-3 h-3 text-muted-foreground" />
                </div>
            </div>
        );
    };

    // --- Render ---

    return (
        <div className="space-y-8 p-6 animate-in fade-in duration-500">

            {/* Stats Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-gradient-to-br from-primary/10 to-purple-500/10 border border-white/10 backdrop-blur-md">
                    <div className="text-sm text-muted-foreground mb-1">Saúde do Mapeamento</div>
                    <div className="text-2xl font-bold text-foreground flex items-baseline gap-2">
                        {healthPercentage}%
                        <span className="text-xs font-normal text-muted-foreground">Concluído</span>
                    </div>
                    <div className="w-full bg-white/10 h-1 mt-3 rounded-full overflow-hidden">
                        <div className="bg-gradient-to-r from-primary to-purple-500 h-full transition-all duration-500" style={{ width: `${healthPercentage}%` }} />
                    </div>
                </div>

                <div className="p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-md flex flex-col justify-between">
                    <div className="text-sm text-muted-foreground">Funis Mapeados</div>
                    <div className="text-2xl font-bold text-foreground">
                        {stats.pipelines.mapped} <span className="text-muted-foreground text-lg">/ {stats.pipelines.total}</span>
                    </div>
                </div>

                <div className="p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-md flex flex-col justify-between">
                    <div className="text-sm text-muted-foreground">Etapas Mapeadas</div>
                    <div className="text-2xl font-bold text-foreground">
                        {stats.stages.mapped} <span className="text-muted-foreground text-lg">/ {stats.stages.total}</span>
                    </div>
                </div>

                <div className="p-4 rounded-xl bg-surface-primary border border-border-subtle shadow-sm flex flex-col justify-between">
                    <div className="text-sm text-text-secondary">Pessoas Mapeadas</div>
                    <div className="text-2xl font-bold text-text-primary">
                        {stats.users.mapped} <span className="text-text-secondary text-lg">/ {stats.users.total}</span>
                    </div>
                </div>
            </div>

            {/* Header Tabs */}
            <div className="flex gap-2 border-b border-border-subtle pb-1">
                <Button
                    variant={activeTab === 'pipelines' ? 'secondary' : 'ghost'}
                    onClick={() => setActiveTab('pipelines')}
                    className={cn(
                        "gap-2 rounded-b-none border-b-2 border-transparent transition-all",
                        activeTab === 'pipelines' ? "border-primary bg-surface-primary shadow-sm text-primary" : "hover:bg-surface-secondary text-text-secondary"
                    )}
                >
                    <Filter className="w-4 h-4" />
                    Funis
                    <Badge variant="secondary" className="ml-1 bg-status-neutral-bg text-status-neutral-text hover:bg-surface-tertiary text-xs">{stats.pipelines.total}</Badge>
                </Button>
                <Button
                    variant={activeTab === 'stages' ? 'secondary' : 'ghost'}
                    onClick={() => setActiveTab('stages')}
                    className={cn(
                        "gap-2 rounded-b-none border-b-2 border-transparent transition-all",
                        activeTab === 'stages' ? "border-primary bg-surface-primary shadow-sm text-primary" : "hover:bg-surface-secondary text-text-secondary"
                    )}
                >
                    <GitBranch className="w-4 h-4" />
                    Etapas
                    <Badge variant="secondary" className="ml-1 bg-status-neutral-bg text-status-neutral-text hover:bg-surface-tertiary text-xs">{stats.stages.total}</Badge>
                </Button>
                <Button
                    variant={activeTab === 'users' ? 'secondary' : 'ghost'}
                    onClick={() => setActiveTab('users')}
                    className={cn(
                        "gap-2 rounded-b-none border-b-2 border-transparent transition-all",
                        activeTab === 'users' ? "border-primary bg-surface-primary shadow-sm text-primary" : "hover:bg-surface-secondary text-text-secondary"
                    )}
                >
                    <User className="w-4 h-4" />
                    Pessoas
                    <Badge variant="secondary" className="ml-1 bg-status-neutral-bg text-status-neutral-text hover:bg-surface-tertiary text-xs">{stats.users.total}</Badge>
                </Button>
            </div>

            {/* --- TAB: PIPELINES --- */}
            {activeTab === 'pipelines' && (
                <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-300">
                    <div className="flex justify-between items-center">
                        <div>
                            <h3 className="text-lg font-medium text-foreground">Mapeamento de Funis</h3>
                            <p className="text-sm text-muted-foreground">Conecte os funis do ActiveCampaign aos funis do Welcome CRM.</p>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => setIsAddingPipeline(true)}
                        >
                            <Plus className="w-4 h-4" /> Adicionar Pipeline
                        </Button>
                    </div>

                    <div className="rounded-xl border border-border-subtle overflow-hidden bg-surface-primary shadow-sm">
                        <Table>
                            <TableHeader className="bg-surface-secondary border-b border-border-subtle">
                                <TableRow className="border-border-subtle hover:bg-surface-secondary">
                                    <TableHead className="text-xs uppercase tracking-wider font-semibold text-text-secondary">Pipeline (AC)</TableHead>
                                    <TableHead className="text-xs uppercase tracking-wider font-semibold text-text-secondary">ID (AC)</TableHead>
                                    <TableHead className="text-xs uppercase tracking-wider font-semibold text-text-secondary">Pipeline (Welcome)</TableHead>
                                    <TableHead className="text-xs uppercase tracking-wider font-semibold text-text-secondary">UUID (Welcome)</TableHead>
                                    <TableHead className="w-[120px] text-xs uppercase tracking-wider font-semibold text-text-secondary">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isAddingPipeline && (
                                    <TableRow className="bg-muted/30 border-l-2 border-l-primary">
                                        <TableCell>
                                            <Input
                                                placeholder="Nome do Pipeline"
                                                value={newPipeline.name}
                                                onChange={e => setNewPipeline({ ...newPipeline, name: e.target.value })}
                                                className="h-8 bg-background border-input"
                                                autoFocus
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Input
                                                placeholder="ID Externo"
                                                value={newPipeline.id}
                                                onChange={e => setNewPipeline({ ...newPipeline, id: e.target.value })}
                                                className="h-8 bg-background border-input font-mono text-xs"
                                            />
                                        </TableCell>
                                        <TableCell colSpan={2} />
                                        <TableCell>
                                            <div className="flex items-center gap-1">
                                                <Button
                                                    size="sm"
                                                    className="h-8 w-8 p-0 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                                                    onClick={() => {
                                                        if (!newPipeline.name || !newPipeline.id) return toast.error('Preencha nome e ID');
                                                        addCatalogItem.mutate({ entity_type: 'pipeline', external_id: newPipeline.id, external_name: newPipeline.name });
                                                        setIsAddingPipeline(false);
                                                        setNewPipeline({ name: '', id: '' });
                                                    }}
                                                >
                                                    <Check className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-8 w-8 p-0 text-muted-foreground hover:bg-muted"
                                                    onClick={() => setIsAddingPipeline(false)}
                                                >
                                                    <X className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                                {catalogPipelines?.map((pipeline) => {
                                    const mapping = routerConfigs?.find(r => r.external_pipeline_id === pipeline.external_id);
                                    const internalPipeline = internalPipelines?.find(p => p.id === mapping?.pipeline_id);

                                    return (
                                        <TableRow key={pipeline.id} className="border-border-subtle hover:bg-surface-secondary transition-colors">
                                            <TableCell className="font-medium">
                                                <EditableCell
                                                    value={pipeline.external_name}
                                                    onSave={(val) => updateCatalogItem.mutate({ id: pipeline.id, external_name: val })}
                                                />
                                            </TableCell>
                                            <TableCell className="font-mono text-xs text-muted-foreground">
                                                <EditableCell
                                                    value={pipeline.external_id}
                                                    onSave={(val) => updateCatalogItem.mutate({ id: pipeline.id, external_id: val })}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Select
                                                    value={mapping?.pipeline_id || "ignore"}
                                                    onChange={(val) => savePipelineMapping.mutate({
                                                        externalPipelineId: pipeline.external_id,
                                                        internalPipelineId: val
                                                    })}
                                                    options={[
                                                        { value: 'ignore', label: 'Selecione...' },
                                                        ...(internalPipelines?.map(p => ({ value: p.id, label: p.nome })) || [])
                                                    ]}
                                                    className="w-[280px] bg-background border-input"
                                                />
                                            </TableCell>
                                            <TableCell className="font-mono text-xs text-muted-foreground">
                                                {internalPipeline?.id ? (
                                                    <span className="bg-muted px-2 py-1 rounded">{internalPipeline.id.slice(0, 8)}...</span>
                                                ) : '-'}
                                            </TableCell>
                                            <TableCell>
                                                {mapping ? (
                                                    <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100">
                                                        <Check className="w-3 h-3 mr-1" /> Mapeado
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-gray-500 border-gray-200 bg-gray-50">
                                                        <AlertTriangle className="w-3 h-3 mr-1" /> Faltando
                                                    </Badge>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                                {catalogPipelines?.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-32 text-center">
                                            <div className="flex flex-col items-center justify-center text-muted-foreground">
                                                <Filter className="w-8 h-8 mb-2 opacity-50" />
                                                <p>Nenhum pipeline encontrado.</p>
                                                <Button variant="link" onClick={() => addCatalogItem.mutate({ entity_type: 'pipeline', external_id: 'new', external_name: 'Novo Pipeline' })}>
                                                    Adicionar manualmente
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            )}

            {/* --- TAB: STAGES --- */}
            {activeTab === 'stages' && (
                <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-300">
                    <div className="flex justify-between items-center bg-card p-4 rounded-xl border border-border shadow-sm">
                        <div className="flex items-center gap-4 flex-1">
                            <div className="flex flex-col">
                                <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
                                    Mapeamento de Etapas
                                </h3>
                                <p className="text-sm text-muted-foreground">Selecione um funil para ver suas etapas.</p>
                            </div>
                            <div className="h-8 w-px bg-border mx-2" />
                            <Select
                                value={selectedPipelineFilter}
                                onChange={(val) => setSelectedPipelineFilter(val)}
                                options={[
                                    { value: '', label: 'Selecione um Pipeline (AC)...' },
                                    ...(catalogPipelines?.map(p => ({ value: p.external_id, label: p.external_name })) || [])
                                ]}
                                className="w-[300px] bg-background border-input"
                                placeholder="Selecione o Pipeline..."
                            />
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            disabled={!selectedPipelineFilter}
                            onClick={() => setIsAddingStage(true)}
                        >
                            <Plus className="w-4 h-4" /> Adicionar Stage
                        </Button>
                    </div>

                    {/* Regras automáticas de status (não dependem de mapeamento) */}
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                        <div className="flex items-start gap-3">
                            <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                            <div className="space-y-1.5">
                                <p className="text-sm font-medium text-blue-900">Regras automáticas de status (ActiveCampaign)</p>
                                <p className="text-xs text-blue-700">
                                    O status do deal no AC (campo <code className="bg-blue-100 px-1 rounded">status</code>) é processado automaticamente, independente do mapeamento de etapas:
                                </p>
                                <ul className="text-xs text-blue-800 space-y-1 mt-1">
                                    <li className="flex items-center gap-2">
                                        <span className="inline-block w-2 h-2 rounded-full bg-red-400 shrink-0" />
                                        <span><strong>Perdido</strong> (status=2) &rarr; Resolução &gt; Fechado - Perdido <span className="text-blue-600">(automático)</span></span>
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                                        <span><strong>Ganho</strong> (status=1) &rarr; Usa o mapeamento de etapas abaixo</span>
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <span className="inline-block w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                                        <span><strong>Aberto</strong> (status=0) &rarr; Usa o mapeamento de etapas abaixo</span>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {selectedPipelineFilter ? (
                        <div className="rounded-xl border border-border overflow-hidden bg-card shadow-sm">
                            <Table>
                                <TableHeader className="bg-muted/50 border-b border-border">
                                    <TableRow className="border-border hover:bg-muted/50">
                                        <TableHead className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Stage (AC)</TableHead>
                                        <TableHead className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">ID (AC)</TableHead>
                                        <TableHead className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Stage (Welcome)</TableHead>
                                        <TableHead className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">UUID (Welcome)</TableHead>
                                        <TableHead className="w-[120px] text-xs uppercase tracking-wider font-semibold text-muted-foreground">Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isAddingStage && (
                                        <TableRow className="bg-muted/30 border-l-2 border-l-primary">
                                            <TableCell>
                                                <Input
                                                    placeholder="Nome da Etapa"
                                                    value={newStage.name}
                                                    onChange={e => setNewStage({ ...newStage, name: e.target.value })}
                                                    className="h-8 bg-background border-input"
                                                    autoFocus
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Input
                                                    placeholder="ID (Opcional)"
                                                    value={newStage.id}
                                                    onChange={e => setNewStage({ ...newStage, id: e.target.value })}
                                                    className="h-8 bg-background border-input font-mono text-xs"
                                                />
                                            </TableCell>
                                            <TableCell colSpan={2} />
                                            <TableCell>
                                                <div className="flex items-center gap-1">
                                                    <Button
                                                        size="sm"
                                                        className="h-8 w-8 p-0 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                                                        onClick={() => {
                                                            if (!newStage.name) return toast.error('Preencha o nome');
                                                            const finalId = newStage.id || `seed_manual_${Date.now()}`;
                                                            addCatalogItem.mutate({
                                                                entity_type: 'stage',
                                                                external_id: finalId,
                                                                external_name: newStage.name,
                                                                parent_external_id: selectedPipelineFilter
                                                            });
                                                            setIsAddingStage(false);
                                                            setNewStage({ name: '', id: '' });
                                                        }}
                                                    >
                                                        <Check className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-8 w-8 p-0 text-muted-foreground hover:bg-muted"
                                                        onClick={() => setIsAddingStage(false)}
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    {catalogStages
                                        ?.filter(s => s.parent_external_id === selectedPipelineFilter)
                                        .map((stage) => {
                                            const mapping = stageMappings?.find(m => m.external_stage_id === stage.external_id);
                                            const pipelineMapping = routerConfigs?.find(r => r.external_pipeline_id === selectedPipelineFilter);
                                            const internalStage = internalStages?.find(s => s.id === mapping?.internal_stage_id);
                                            const isPendingId = stage.external_id.startsWith('seed_') || stage.metadata?.is_pending_id;

                                            return (
                                                <TableRow key={stage.id} className="border-border hover:bg-muted/30 transition-colors">
                                                    <TableCell className="font-medium">
                                                        <EditableCell
                                                            value={stage.external_name}
                                                            onSave={(val) => updateCatalogItem.mutate({ id: stage.id, external_name: val })}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="font-mono text-xs">
                                                        <EditableCell
                                                            value={isPendingId ? '' : stage.external_id}
                                                            placeholder="Preencher ID..."
                                                            onSave={(val) => {
                                                                if (val) updateCatalogItem.mutate({ id: stage.id, external_id: val });
                                                            }}
                                                            className={isPendingId ? "border-dashed border-gray-300 bg-gray-50 text-gray-700 placeholder:text-gray-400" : "text-muted-foreground"}
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        <Select
                                                            value={mapping?.internal_stage_id || "ignore"}
                                                            onChange={(val) => saveStageMapping.mutate({
                                                                externalId: stage.external_id,
                                                                externalName: stage.external_name,
                                                                internalStageId: val,
                                                                pipelineId: selectedPipelineFilter
                                                            })}
                                                            options={[
                                                                { value: 'ignore', label: 'Selecione...' },
                                                                ...(internalStages
                                                                    ?.filter(s => s.pipeline_id === pipelineMapping?.pipeline_id)
                                                                    .map(s => ({ value: s.id, label: s.nome })) || [])
                                                            ]}
                                                            disabled={!pipelineMapping?.pipeline_id}
                                                            className="w-[280px] bg-white/5 border-white/10"
                                                        />
                                                    </TableCell>
                                                    <TableCell className="font-mono text-xs text-muted-foreground">
                                                        {internalStage?.id ? (
                                                            <span className="bg-white/5 px-2 py-1 rounded">{internalStage.id.slice(0, 8)}...</span>
                                                        ) : '-'}
                                                    </TableCell>
                                                    <TableCell>
                                                        {mapping && !isPendingId ? (
                                                            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30">
                                                                <Check className="w-3 h-3 mr-1" /> OK
                                                            </Badge>
                                                        ) : (
                                                            <Badge variant="outline" className={cn(
                                                                "border-opacity-50",
                                                                isPendingId ? "text-gray-600 border-gray-200 bg-gray-100" : "text-gray-600 border-gray-200 bg-gray-100"
                                                            )}>
                                                                <AlertTriangle className="w-3 h-3 mr-1" /> {isPendingId ? 'Falta ID' : 'Mapear'}
                                                            </Badge>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    {catalogStages?.filter(s => s.parent_external_id === selectedPipelineFilter).length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-32 text-center">
                                                <div className="flex flex-col items-center justify-center text-muted-foreground">
                                                    <GitBranch className="w-8 h-8 mb-2 opacity-50" />
                                                    <p>Nenhuma etapa encontrada para este funil.</p>
                                                    <Button variant="link" onClick={() => {
                                                        const name = prompt("Nome da Etapa (AC):");
                                                        if (name) addCatalogItem.mutate({ entity_type: 'stage', external_id: `seed_manual_${Date.now()}`, external_name: name, parent_external_id: selectedPipelineFilter });
                                                    }}>
                                                        Adicionar manualmente
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <div className="h-64 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm flex flex-col items-center justify-center text-muted-foreground">
                            <Filter className="w-12 h-12 mb-4 opacity-20" />
                            <p className="text-lg font-medium">Selecione um Pipeline acima</p>
                            <p className="text-sm opacity-60">Para visualizar e mapear suas etapas.</p>
                        </div>
                    )}
                </div>
            )
            }

            {/* --- TAB: USERS --- */}
            {
                activeTab === 'users' && (
                    <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-300">
                        <div className="flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-medium text-foreground">Mapeamento de Pessoas</h3>
                                <p className="text-sm text-muted-foreground">Associe os usuários do ActiveCampaign aos usuários do Welcome CRM.</p>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                className="gap-2 border-white/10 hover:bg-white/10"
                                onClick={() => setIsAddingUser(true)}
                            >
                                <Plus className="w-4 h-4" /> Adicionar Pessoa
                            </Button>
                        </div>

                        <div className="rounded-xl border border-white/10 overflow-hidden bg-white/5 backdrop-blur-sm shadow-xl">
                            <Table>
                                <TableHeader className="bg-white/5 border-b border-white/10">
                                    <TableRow className="border-white/10 hover:bg-white/5">
                                        <TableHead className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">User (AC)</TableHead>
                                        <TableHead className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">ID (AC)</TableHead>
                                        <TableHead className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">User (Welcome)</TableHead>
                                        <TableHead className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">UUID (Welcome)</TableHead>
                                        <TableHead className="w-[120px] text-xs uppercase tracking-wider font-semibold text-muted-foreground">Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isAddingUser && (
                                        <TableRow className="bg-white/5 border-l-2 border-l-blue-500">
                                            <TableCell>
                                                <Input
                                                    placeholder="Nome do Usuário"
                                                    value={newUser.name}
                                                    onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                                                    className="h-8 bg-black/20 border-white/10"
                                                    autoFocus
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Input
                                                    placeholder="ID Externo"
                                                    value={newUser.id}
                                                    onChange={e => setNewUser({ ...newUser, id: e.target.value })}
                                                    className="h-8 bg-black/20 border-white/10 font-mono text-xs"
                                                />
                                            </TableCell>
                                            <TableCell colSpan={2} />
                                            <TableCell>
                                                <div className="flex items-center gap-1">
                                                    <Button
                                                        size="sm"
                                                        className="h-8 w-8 p-0 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                                                        onClick={() => {
                                                            if (!newUser.name || !newUser.id) return toast.error('Preencha nome e ID');
                                                            addCatalogItem.mutate({ entity_type: 'user', external_id: newUser.id, external_name: newUser.name });
                                                            setIsAddingUser(false);
                                                            setNewUser({ name: '', id: '' });
                                                        }}
                                                    >
                                                        <Check className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-8 w-8 p-0 text-muted-foreground hover:bg-white/10"
                                                        onClick={() => setIsAddingUser(false)}
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    {catalogUsers?.map((user) => {
                                        const mapping = userMappings?.find(m => m.external_user_id === user.external_id);
                                        const internalUser = internalUsers?.find(u => u.id === mapping?.internal_user_id);

                                        return (
                                            <TableRow key={user.id} className="border-white/10 hover:bg-white/5 transition-colors">
                                                <TableCell className="font-medium">
                                                    <EditableCell
                                                        value={user.external_name}
                                                        onSave={(val) => updateCatalogItem.mutate({ id: user.id, external_name: val })}
                                                    />
                                                </TableCell>
                                                <TableCell className="font-mono text-xs text-muted-foreground">
                                                    <EditableCell
                                                        value={user.external_id}
                                                        onSave={(val) => updateCatalogItem.mutate({ id: user.id, external_id: val })}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Select
                                                        value={mapping?.internal_user_id || "ignore"}
                                                        onChange={(val) => saveUserMapping.mutate({
                                                            externalId: user.external_id,
                                                            internalUserId: val
                                                        })}
                                                        options={[
                                                            { value: 'ignore', label: 'Selecione...' },
                                                            ...(internalUsers?.map(u => ({ value: u.id, label: u.name || u.email || 'Sem nome' })) || [])
                                                        ]}
                                                        className="w-[280px] bg-white/5 border-white/10"
                                                    />
                                                </TableCell>
                                                <TableCell className="font-mono text-xs text-muted-foreground">
                                                    {internalUser?.id ? (
                                                        <span className="bg-white/5 px-2 py-1 rounded">{internalUser.id.slice(0, 8)}...</span>
                                                    ) : '-'}
                                                </TableCell>
                                                <TableCell>
                                                    {mapping ? (
                                                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30">
                                                            <Check className="w-3 h-3 mr-1" /> Mapeado
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="text-yellow-500 border-yellow-500/50 bg-yellow-500/10">
                                                            <AlertTriangle className="w-3 h-3 mr-1" /> Faltando
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                    {catalogUsers?.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-32 text-center">
                                                <div className="flex flex-col items-center justify-center text-muted-foreground">
                                                    <User className="w-8 h-8 mb-2 opacity-50" />
                                                    <p>Nenhum usuário encontrado.</p>
                                                    <Button variant="link" onClick={() => addCatalogItem.mutate({ entity_type: 'user', external_id: 'new', external_name: 'Novo Usuário' })}>
                                                        Adicionar manualmente
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
