import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/Input';
import { Plus, Trash2, AlertTriangle, CheckCircle, Zap, X, User, Pencil, Ban, CheckCheck, History, ChevronDown, ChevronUp, FileWarning, XCircle, Eye, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { usePipelineStages } from '@/hooks/usePipelineStages';
import { OutboundTriggerEventHistory } from './OutboundTriggerEventHistory';

interface OutboundTriggerRulesTabProps {
    integrationId: string;
}

interface OutboundTrigger {
    id: string;
    integration_id: string;
    name: string;
    description: string | null;
    // Condicoes de origem (CRM)
    source_pipeline_ids: string[] | null;
    source_stage_ids: string[] | null;
    source_owner_ids: string[] | null;
    source_status: string[] | null;
    // Eventos
    event_types: string[];
    // Filtro de campos
    sync_field_mode: 'all' | 'selected' | 'exclude';
    sync_fields: string[] | null;
    // Controles
    action_type: 'create_only' | 'update_only' | 'all';
    action_mode: 'allow' | 'block';
    is_active: boolean;
    priority: number;
    created_at: string;
}

interface CRMPipeline {
    id: string;
    nome: string;
    produto: string;
}

interface Profile {
    id: string;
    nome: string;
    email: string;
}

interface TriggerFormData {
    name: string;
    pipelineIds: string[];
    stageIds: string[];
    ownerIds: string[];
    statusList: string[];
    eventTypes: string[];
    syncFieldMode: 'all' | 'selected' | 'exclude';
    syncFields: string[];
    actionType: 'create_only' | 'update_only' | 'all';
    actionMode: 'allow' | 'block';
    priority: number;
}

const emptyFormData: TriggerFormData = {
    name: '',
    pipelineIds: [],
    stageIds: [],
    ownerIds: [],
    statusList: [],
    eventTypes: ['stage_change', 'field_update', 'won', 'lost'],
    syncFieldMode: 'all',
    syncFields: [],
    actionType: 'update_only',
    actionMode: 'allow',
    priority: 100
};

const EVENT_TYPE_LABELS: Record<string, string> = {
    'card_created': 'Criacao de Card',
    'stage_change': 'Mudanca de Estagio',
    'field_update': 'Atualizacao de Campo',
    'won': 'Ganho',
    'lost': 'Perdido'
};

const STATUS_OPTIONS = [
    { value: 'ativo', label: 'Ativo' },
    { value: 'ganho', label: 'Ganho' },
    { value: 'perdido', label: 'Perdido' }
];

const SYNC_FIELD_OPTIONS = [
    { value: 'valor_estimado', label: 'Valor Estimado' },
    { value: 'valor_final', label: 'Valor Final' },
    { value: 'data_viagem_inicio', label: 'Data Viagem Inicio' },
    { value: 'data_viagem_fim', label: 'Data Viagem Fim' }
];

export function OutboundTriggerRulesTab({ integrationId }: OutboundTriggerRulesTabProps) {
    const queryClient = useQueryClient();
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState<TriggerFormData>(emptyFormData);
    const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
    const [showNoRuleLogs, setShowNoRuleLogs] = useState(false);

    // Fetch existing triggers
    const { data: triggers, isLoading: triggersLoading } = useQuery({
        queryKey: ['outbound-triggers', integrationId],
        queryFn: async () => {
            const { data, error } = await (supabase
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .from('integration_outbound_triggers' as any) as any)
                .select('*')
                .eq('integration_id', integrationId)
                .order('priority', { ascending: true });
            if (error) throw error;
            return data as OutboundTrigger[];
        }
    });

    // Fetch outbound trigger event stats (counts per trigger per status)
    const { data: triggerStats } = useQuery({
        queryKey: ['outbound-trigger-event-stats', integrationId],
        queryFn: async () => {
            const { data, error } = await supabase.rpc('get_outbound_trigger_event_stats', {
                p_integration_id: integrationId
            });
            if (error) {
                console.warn('get_outbound_trigger_event_stats error:', error.message);
                return new Map<string, { sent: number; failed: number; blocked: number; pending: number; shadow: number; total: number }>();
            }
            const stats = new Map<string, { sent: number; failed: number; blocked: number; pending: number; shadow: number; total: number }>();
            for (const row of (data || [])) {
                const key = row.trigger_id || 'null';
                if (!stats.has(key)) stats.set(key, { sent: 0, failed: 0, blocked: 0, pending: 0, shadow: 0, total: 0 });
                const s = stats.get(key)!;
                s.total += Number(row.cnt);
                if (row.status === 'sent') s.sent += Number(row.cnt);
                else if (row.status === 'failed') s.failed += Number(row.cnt);
                else if (row.status === 'blocked') s.blocked += Number(row.cnt);
                else if (row.status === 'pending') s.pending += Number(row.cnt);
                else if (row.status === 'shadow') s.shadow += Number(row.cnt);
            }
            return stats;
        },
        staleTime: 30000,
    });

    // Fetch CRM Pipelines
    const { data: crmPipelines } = useQuery({
        queryKey: ['crm-pipelines'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('pipelines')
                .select('id, nome, produto')
                .order('nome');
            if (error) throw error;
            return data as CRMPipeline[];
        }
    });

    // Fetch CRM Pipeline Stages
    const { data: crmStages } = usePipelineStages();

    // Fetch CRM Users (owners)
    const { data: crmOwners } = useQuery({
        queryKey: ['crm-owners'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, nome, email')
                .eq('active', true)
                .order('nome');
            if (error) throw error;
            return data as Profile[];
        }
    });

    // Filter CRM stages by selected pipelines
    const filteredCrmStages = crmStages?.filter(s =>
        formData.pipelineIds.length === 0 || formData.pipelineIds.includes(s.pipeline_id)
    ) || [];

    // Create trigger mutation
    const createMutation = useMutation({
        mutationFn: async () => {
            const insertData = {
                integration_id: integrationId,
                name: formData.name || 'Nova Regra',
                source_pipeline_ids: formData.pipelineIds.length > 0 ? formData.pipelineIds : null,
                source_stage_ids: formData.stageIds.length > 0 ? formData.stageIds : null,
                source_owner_ids: formData.ownerIds.length > 0 ? formData.ownerIds : null,
                source_status: formData.statusList.length > 0 ? formData.statusList : null,
                event_types: formData.eventTypes,
                sync_field_mode: formData.syncFieldMode,
                sync_fields: formData.syncFieldMode !== 'all' && formData.syncFields.length > 0 ? formData.syncFields : null,
                action_type: formData.actionType,
                action_mode: formData.actionMode,
                priority: formData.priority,
                is_active: true
            };

            const { error } = await (supabase
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .from('integration_outbound_triggers' as any) as any)
                .insert(insertData);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['outbound-triggers'] });
            toast.success('Regra criada com sucesso!');
            resetForm();
        },
        onError: (e: Error) => {
            toast.error(`Erro ao criar regra: ${e.message}`);
        }
    });

    // Update trigger mutation
    const updateMutation = useMutation({
        mutationFn: async (id: string) => {
            const updateData = {
                name: formData.name || 'Nova Regra',
                source_pipeline_ids: formData.pipelineIds.length > 0 ? formData.pipelineIds : null,
                source_stage_ids: formData.stageIds.length > 0 ? formData.stageIds : null,
                source_owner_ids: formData.ownerIds.length > 0 ? formData.ownerIds : null,
                source_status: formData.statusList.length > 0 ? formData.statusList : null,
                event_types: formData.eventTypes,
                sync_field_mode: formData.syncFieldMode,
                sync_fields: formData.syncFieldMode !== 'all' && formData.syncFields.length > 0 ? formData.syncFields : null,
                action_type: formData.actionType,
                action_mode: formData.actionMode,
                priority: formData.priority
            };

            const { error } = await (supabase
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .from('integration_outbound_triggers' as any) as any)
                .update(updateData)
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['outbound-triggers'] });
            toast.success('Regra atualizada com sucesso!');
            resetForm();
        },
        onError: (e: Error) => {
            toast.error(`Erro ao atualizar regra: ${e.message}`);
        }
    });

    // Toggle trigger mutation
    const toggleMutation = useMutation({
        mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
            const { error } = await (supabase
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .from('integration_outbound_triggers' as any) as any)
                .update({ is_active: isActive })
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['outbound-triggers'] });
            toast.success('Status atualizado!');
        }
    });

    // Delete trigger mutation
    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await (supabase
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .from('integration_outbound_triggers' as any) as any)
                .delete()
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['outbound-triggers'] });
            toast.success('Regra removida!');
        }
    });

    // Helper functions
    const getCrmPipelineName = (id: string) => crmPipelines?.find(p => p.id === id)?.nome || id;
    const getCrmStageName = (id: string) => crmStages?.find(s => s.id === id)?.nome || id;
    const getCrmOwnerName = (id: string) => crmOwners?.find(o => o.id === id)?.nome || id;

    // Multi-select handlers
    const addToArray = (arr: string[], item: string) => [...arr, item];
    const removeFromArray = (arr: string[], item: string) => arr.filter(i => i !== item);

    const hasNoTriggers = !triggers || triggers.length === 0;

    // Form helpers
    const resetForm = () => {
        setIsAdding(false);
        setEditingId(null);
        setFormData(emptyFormData);
    };

    const startEditing = (trigger: OutboundTrigger) => {
        setEditingId(trigger.id);
        setIsAdding(false);
        setFormData({
            name: trigger.name || '',
            pipelineIds: trigger.source_pipeline_ids || [],
            stageIds: trigger.source_stage_ids || [],
            ownerIds: trigger.source_owner_ids || [],
            statusList: trigger.source_status || [],
            eventTypes: trigger.event_types || ['stage_change', 'field_update', 'won', 'lost'],
            syncFieldMode: trigger.sync_field_mode || 'all',
            syncFields: trigger.sync_fields || [],
            actionType: trigger.action_type || 'update_only',
            actionMode: trigger.action_mode || 'allow',
            priority: trigger.priority || 100
        });
    };

    const startAdding = () => {
        setIsAdding(true);
        setEditingId(null);
        setFormData(emptyFormData);
    };

    const handleSave = () => {
        if (editingId) {
            updateMutation.mutate(editingId);
        } else {
            createMutation.mutate();
        }
    };

    const toggleEventType = (eventType: string) => {
        setFormData(prev => ({
            ...prev,
            eventTypes: prev.eventTypes.includes(eventType)
                ? prev.eventTypes.filter(e => e !== eventType)
                : [...prev.eventTypes, eventType]
        }));
    };

    const isFormOpen = isAdding || editingId !== null;
    const isSaving = createMutation.isPending || updateMutation.isPending;

    // Render form
    const renderForm = () => (
        <Card className={`bg-white border-slate-200 shadow-sm border-l-4 ${editingId ? 'border-l-amber-500' : 'border-l-blue-500'}`}>
            <CardHeader className="pb-3">
                <CardTitle className="text-base">
                    {editingId ? 'Editar Regra' : 'Nova Regra de Outbound'}
                </CardTitle>
                <CardDescription>
                    Defina QUANDO (condicoes no CRM) e O QUE FAZER (permitir ou bloquear sincronizacao para o AC).
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Nome e Prioridade */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2">
                        <label className="text-sm font-medium mb-2 block">Nome da Regra</label>
                        <Input
                            value={formData.name}
                            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="Ex: Bloquear sync de leads descartados"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium mb-2 block">Prioridade</label>
                        <Input
                            type="number"
                            value={formData.priority}
                            onChange={(e) => setFormData(prev => ({ ...prev, priority: parseInt(e.target.value) || 100 }))}
                            placeholder="100"
                        />
                        <p className="text-xs text-slate-500 mt-1">Menor = mais prioritario</p>
                    </div>
                </div>

                {/* Tipo de Operacao */}
                <div className="space-y-2 p-4 bg-indigo-50 rounded-lg">
                    <h4 className="font-medium text-indigo-700">Tipo de Operacao</h4>
                    <div className="flex gap-2 flex-wrap">
                        <Button
                            type="button"
                            variant={formData.actionType === 'update_only' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setFormData(prev => ({
                                ...prev,
                                actionType: 'update_only',
                                eventTypes: prev.eventTypes.filter(e => e !== 'card_created')
                            }))}
                            className={formData.actionType === 'update_only' ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
                        >
                            Apenas Atualizacao
                        </Button>
                        <Button
                            type="button"
                            variant={formData.actionType === 'create_only' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setFormData(prev => ({
                                ...prev,
                                actionType: 'create_only',
                                eventTypes: ['card_created']
                            }))}
                            className={formData.actionType === 'create_only' ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
                        >
                            Apenas Criacao
                        </Button>
                        <Button
                            type="button"
                            variant={formData.actionType === 'all' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setFormData(prev => ({
                                ...prev,
                                actionType: 'all',
                                eventTypes: prev.eventTypes.includes('card_created')
                                    ? prev.eventTypes
                                    : [...prev.eventTypes, 'card_created']
                            }))}
                            className={formData.actionType === 'all' ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
                        >
                            Criacao + Atualizacao
                        </Button>
                    </div>
                    <p className="text-xs text-indigo-600">
                        {formData.actionType === 'update_only'
                            ? 'Sincroniza apenas alteracoes em cards que ja existem no ActiveCampaign'
                            : formData.actionType === 'create_only'
                                ? 'Cria deal no ActiveCampaign quando card e criado no CRM (sem external_id)'
                                : 'Cria deal no AC para cards novos e sincroniza alteracoes dos existentes'
                        }
                    </p>
                </div>

                {/* Acao */}
                <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg">
                    <span className="text-sm font-medium">Acao:</span>
                    <div className="flex gap-2">
                        <Button
                            type="button"
                            variant={formData.actionMode === 'allow' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setFormData(prev => ({ ...prev, actionMode: 'allow' }))}
                            className={formData.actionMode === 'allow' ? 'bg-green-600 hover:bg-green-700' : ''}
                        >
                            <CheckCheck className="w-4 h-4 mr-1" />
                            Permitir
                        </Button>
                        <Button
                            type="button"
                            variant={formData.actionMode === 'block' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setFormData(prev => ({ ...prev, actionMode: 'block' }))}
                            className={formData.actionMode === 'block' ? 'bg-red-600 hover:bg-red-700' : ''}
                        >
                            <Ban className="w-4 h-4 mr-1" />
                            Bloquear
                        </Button>
                    </div>
                </div>

                {/* QUANDO (CRM) */}
                <div className="space-y-4 p-4 bg-blue-50 rounded-lg">
                    <h4 className="font-medium text-blue-700 flex items-center gap-2">
                        <Zap className="w-4 h-4 text-blue-500" />
                        QUANDO (Origem no CRM)
                    </h4>

                    {/* Pipelines Multi-Select */}
                    <div>
                        <label className="text-sm font-medium mb-2 block">
                            Pipelines <span className="text-slate-400 font-normal">(vazio = qualquer)</span>
                        </label>
                        <div className="flex flex-wrap gap-2 mb-2">
                            {formData.pipelineIds.length === 0 ? (
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                                    Qualquer Pipeline
                                </Badge>
                            ) : (
                                formData.pipelineIds.map(id => (
                                    <Badge key={id} variant="secondary" className="gap-1">
                                        {getCrmPipelineName(id)}
                                        <button
                                            type="button"
                                            onClick={() => setFormData(prev => ({
                                                ...prev,
                                                pipelineIds: removeFromArray(prev.pipelineIds, id),
                                                stageIds: []
                                            }))}
                                            className="ml-1 hover:bg-slate-300 rounded-full"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </Badge>
                                ))
                            )}
                        </div>
                        <Select
                            value=""
                            onChange={(v) => {
                                if (v && !formData.pipelineIds.includes(v)) {
                                    setFormData(prev => ({
                                        ...prev,
                                        pipelineIds: addToArray(prev.pipelineIds, v)
                                    }));
                                }
                            }}
                            options={[
                                { value: '', label: 'Adicionar pipeline...' },
                                ...(crmPipelines?.filter(p => !formData.pipelineIds.includes(p.id))
                                    .map(p => ({ value: p.id, label: `${p.produto} - ${p.nome}` })) || [])
                            ]}
                        />
                    </div>

                    {/* Stages Multi-Select */}
                    <div>
                        <label className="text-sm font-medium mb-2 block">
                            Estagios <span className="text-slate-400 font-normal">(vazio = qualquer)</span>
                        </label>
                        <div className="flex flex-wrap gap-2 mb-2">
                            {formData.stageIds.length === 0 ? (
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                                    Qualquer Estagio
                                </Badge>
                            ) : (
                                formData.stageIds.map(id => (
                                    <Badge key={id} variant="secondary" className="gap-1">
                                        {getCrmStageName(id)}
                                        <button
                                            type="button"
                                            onClick={() => setFormData(prev => ({
                                                ...prev,
                                                stageIds: removeFromArray(prev.stageIds, id)
                                            }))}
                                            className="ml-1 hover:bg-slate-300 rounded-full"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </Badge>
                                ))
                            )}
                        </div>
                        <Select
                            value=""
                            onChange={(v) => {
                                if (v && !formData.stageIds.includes(v)) {
                                    setFormData(prev => ({
                                        ...prev,
                                        stageIds: addToArray(prev.stageIds, v)
                                    }));
                                }
                            }}
                            options={[
                                { value: '', label: 'Adicionar estagio...' },
                                ...(filteredCrmStages.filter(s => !formData.stageIds.includes(s.id))
                                    .map(s => ({ value: s.id, label: s.nome })) || [])
                            ]}
                        />
                    </div>

                    {/* Owners Multi-Select */}
                    <div>
                        <label className="text-sm font-medium mb-2 block flex items-center gap-2">
                            <User className="w-4 h-4 text-slate-400" />
                            Responsaveis <span className="text-slate-400 font-normal">(vazio = qualquer)</span>
                        </label>
                        <div className="flex flex-wrap gap-2 mb-2">
                            {formData.ownerIds.length === 0 ? (
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                                    Qualquer Responsavel
                                </Badge>
                            ) : (
                                formData.ownerIds.map(id => (
                                    <Badge key={id} variant="outline" className="gap-1 bg-white">
                                        {getCrmOwnerName(id)}
                                        <button
                                            type="button"
                                            onClick={() => setFormData(prev => ({
                                                ...prev,
                                                ownerIds: removeFromArray(prev.ownerIds, id)
                                            }))}
                                            className="ml-1 hover:bg-slate-200 rounded-full"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </Badge>
                                ))
                            )}
                        </div>
                        <Select
                            value=""
                            onChange={(v) => {
                                if (v && !formData.ownerIds.includes(v)) {
                                    setFormData(prev => ({
                                        ...prev,
                                        ownerIds: addToArray(prev.ownerIds, v)
                                    }));
                                }
                            }}
                            options={[
                                { value: '', label: 'Adicionar responsavel...' },
                                ...(crmOwners?.filter(o => !formData.ownerIds.includes(o.id))
                                    .map(o => ({ value: o.id, label: o.nome })) || [])
                            ]}
                        />
                    </div>

                    {/* Status Multi-Select */}
                    <div>
                        <label className="text-sm font-medium mb-2 block">
                            Status Comercial <span className="text-slate-400 font-normal">(vazio = qualquer)</span>
                        </label>
                        <div className="flex flex-wrap gap-2 mb-2">
                            {formData.statusList.length === 0 ? (
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                                    Qualquer Status
                                </Badge>
                            ) : (
                                formData.statusList.map(status => (
                                    <Badge key={status} variant="secondary" className="gap-1">
                                        {STATUS_OPTIONS.find(s => s.value === status)?.label || status}
                                        <button
                                            type="button"
                                            onClick={() => setFormData(prev => ({
                                                ...prev,
                                                statusList: removeFromArray(prev.statusList, status)
                                            }))}
                                            className="ml-1 hover:bg-slate-300 rounded-full"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </Badge>
                                ))
                            )}
                        </div>
                        <Select
                            value=""
                            onChange={(v) => {
                                if (v && !formData.statusList.includes(v)) {
                                    setFormData(prev => ({
                                        ...prev,
                                        statusList: addToArray(prev.statusList, v)
                                    }));
                                }
                            }}
                            options={[
                                { value: '', label: 'Adicionar status...' },
                                ...STATUS_OPTIONS.filter(s => !formData.statusList.includes(s.value))
                            ]}
                        />
                    </div>
                </div>

                {/* Tipos de Evento */}
                <div className="space-y-3 p-4 bg-amber-50 rounded-lg">
                    <h4 className="font-medium text-amber-700">Tipos de Evento</h4>
                    {formData.actionType === 'create_only' ? (
                        <p className="text-sm text-amber-700">
                            Evento fixo: <strong>Criacao de Card</strong> (apenas criacao de novos deals no AC)
                        </p>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {Object.entries(EVENT_TYPE_LABELS)
                                .filter(([key]) => formData.actionType === 'update_only' ? key !== 'card_created' : true)
                                .map(([key, label]) => (
                                <Button
                                    key={key}
                                    type="button"
                                    variant={formData.eventTypes.includes(key) ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => toggleEventType(key)}
                                    className={formData.eventTypes.includes(key) ? 'bg-amber-600 hover:bg-amber-700' : ''}
                                >
                                    {formData.eventTypes.includes(key) ? '✓ ' : ''}{label}
                                </Button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Filtro de Campos (apenas para field_update) */}
                {formData.eventTypes.includes('field_update') && (
                    <div className="space-y-3 p-4 bg-slate-50 rounded-lg">
                        <h4 className="font-medium text-slate-700">Filtro de Campos (para atualizacoes)</h4>
                        <div className="flex gap-2 flex-wrap">
                            <Button
                                type="button"
                                variant={formData.syncFieldMode === 'all' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setFormData(prev => ({ ...prev, syncFieldMode: 'all' }))}
                            >
                                Todos os campos
                            </Button>
                            <Button
                                type="button"
                                variant={formData.syncFieldMode === 'selected' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setFormData(prev => ({ ...prev, syncFieldMode: 'selected' }))}
                            >
                                Apenas selecionados
                            </Button>
                            <Button
                                type="button"
                                variant={formData.syncFieldMode === 'exclude' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setFormData(prev => ({ ...prev, syncFieldMode: 'exclude' }))}
                            >
                                Excluir selecionados
                            </Button>
                        </div>

                        {formData.syncFieldMode !== 'all' && (
                            <div className="mt-3">
                                <label className="text-sm font-medium mb-2 block">
                                    {formData.syncFieldMode === 'selected' ? 'Campos permitidos:' : 'Campos excluidos:'}
                                </label>
                                <div className="flex flex-wrap gap-2 mb-2">
                                    {formData.syncFields.map(field => (
                                        <Badge key={field} variant="secondary" className="gap-1">
                                            {SYNC_FIELD_OPTIONS.find(f => f.value === field)?.label || field}
                                            <button
                                                type="button"
                                                onClick={() => setFormData(prev => ({
                                                    ...prev,
                                                    syncFields: removeFromArray(prev.syncFields, field)
                                                }))}
                                                className="ml-1 hover:bg-slate-300 rounded-full"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </Badge>
                                    ))}
                                </div>
                                <Select
                                    value=""
                                    onChange={(v) => {
                                        if (v && !formData.syncFields.includes(v)) {
                                            setFormData(prev => ({
                                                ...prev,
                                                syncFields: addToArray(prev.syncFields, v)
                                            }));
                                        }
                                    }}
                                    options={[
                                        { value: '', label: 'Adicionar campo...' },
                                        ...SYNC_FIELD_OPTIONS.filter(f => !formData.syncFields.includes(f.value))
                                    ]}
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-3 pt-2 border-t">
                    <Button
                        onClick={handleSave}
                        disabled={!formData.name || formData.eventTypes.length === 0 || isSaving}
                    >
                        {isSaving ? 'Salvando...' : (editingId ? 'Salvar Alteracoes' : 'Criar Regra')}
                    </Button>
                    <Button variant="ghost" onClick={resetForm}>
                        Cancelar
                    </Button>
                </div>
            </CardContent>
        </Card>
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <Card className="bg-blue-50 border-blue-200">
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-blue-800">
                        <AlertTriangle className="w-5 h-5" />
                        Regras de Sincronizacao Outbound (CRM para AC)
                    </CardTitle>
                    <CardDescription className="text-blue-700">
                        Configure <strong>quando</strong> os dados do CRM devem ser sincronizados para o ActiveCampaign.
                        <br />
                        Use regras para <strong>permitir</strong> ou <strong>bloquear</strong> sincronizacao baseado em Pipeline, Estagio, Responsavel ou Status.
                    </CardDescription>
                </CardHeader>
            </Card>

            {/* Status Atual */}
            <Card className="bg-white border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">Status Atual</CardTitle>
                        <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={startAdding}
                            disabled={isFormOpen}
                        >
                            <Plus className="w-4 h-4" />
                            Nova Regra
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {triggersLoading ? (
                        <div className="text-muted-foreground text-sm">Carregando...</div>
                    ) : hasNoTriggers ? (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                            <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                            <div>
                                <p className="font-medium text-green-800">Modo Padrao Ativo</p>
                                <p className="text-sm text-green-700">
                                    Nenhuma regra configurada. <strong>Todos os eventos</strong> de outbound estao sendo sincronizados normalmente.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                            <Zap className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                            <div>
                                <p className="font-medium text-blue-800">Filtragem Ativa</p>
                                <p className="text-sm text-blue-700">
                                    <strong>{triggers.filter(t => t.is_active).length}</strong> regra(s) ativa(s). Eventos serao filtrados de acordo com as regras.
                                </p>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Add/Edit Form */}
            {isFormOpen && renderForm()}

            {/* List of Triggers */}
            {triggers && triggers.length > 0 && (
                <Card className="bg-white border-slate-200 shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg">Regras Configuradas</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {triggers.map(trigger => {
                                const stats = triggerStats?.get(trigger.id);
                                return (
                                    <div
                                        key={trigger.id}
                                        className={`p-4 rounded-lg border transition-colors ${
                                            editingId === trigger.id
                                                ? 'bg-amber-50 border-amber-300'
                                                : trigger.is_active
                                                    ? 'bg-white border-slate-200'
                                                    : 'bg-slate-50 border-slate-100 opacity-60'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex items-start gap-4 flex-1">
                                                <Switch
                                                    checked={trigger.is_active}
                                                    onCheckedChange={(checked) => toggleMutation.mutate({ id: trigger.id, isActive: checked })}
                                                    disabled={editingId === trigger.id}
                                                />
                                                <div className="flex-1 min-w-0">
                                                    {/* Nome e Acao */}
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <p className="font-semibold text-slate-800">{trigger.name}</p>
                                                        <Badge
                                                            className={
                                                                trigger.action_type === 'create_only'
                                                                    ? 'bg-blue-100 text-blue-700'
                                                                    : trigger.action_type === 'all'
                                                                        ? 'bg-purple-100 text-purple-700'
                                                                        : 'bg-amber-100 text-amber-700'
                                                            }
                                                        >
                                                            {trigger.action_type === 'create_only' ? 'Criacao'
                                                                : trigger.action_type === 'all' ? 'Criacao + Atualizacao'
                                                                : 'Atualizacao'}
                                                        </Badge>
                                                        <Badge
                                                            className={trigger.action_mode === 'allow'
                                                                ? 'bg-green-100 text-green-700'
                                                                : 'bg-red-100 text-red-700'
                                                            }
                                                        >
                                                            {trigger.action_mode === 'allow' ? 'Permitir' : 'Bloquear'}
                                                        </Badge>
                                                        <Badge variant="outline" className="text-xs">
                                                            Prioridade: {trigger.priority}
                                                        </Badge>
                                                    </div>

                                                    {/* Condicoes */}
                                                    <div className="space-y-2">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="text-xs font-medium text-blue-600 uppercase">QUANDO:</span>
                                                            <div className="flex flex-wrap gap-1">
                                                                {(trigger.source_pipeline_ids?.length ?? 0) > 0 ? (
                                                                    trigger.source_pipeline_ids?.map(id => (
                                                                        <Badge key={id} variant="secondary" className="text-xs">
                                                                            {getCrmPipelineName(id)}
                                                                        </Badge>
                                                                    ))
                                                                ) : (
                                                                    <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                                                                        Qualquer Pipeline
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            <span className="text-slate-400">+</span>
                                                            <div className="flex flex-wrap gap-1">
                                                                {(trigger.source_stage_ids?.length ?? 0) > 0 ? (
                                                                    trigger.source_stage_ids?.map(id => (
                                                                        <Badge key={id} variant="outline" className="text-xs">
                                                                            {getCrmStageName(id)}
                                                                        </Badge>
                                                                    ))
                                                                ) : (
                                                                    <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                                                                        Qualquer Estagio
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Eventos */}
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="text-xs font-medium text-amber-600 uppercase">EVENTOS:</span>
                                                            {trigger.event_types?.map(et => (
                                                                <Badge key={et} variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                                                                    {EVENT_TYPE_LABELS[et] || et}
                                                                </Badge>
                                                            ))}
                                                        </div>

                                                        {/* Acao */}
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="text-xs font-medium text-slate-600 uppercase">ACAO:</span>
                                                            {trigger.action_mode === 'allow' ? (
                                                                <Badge className="text-xs bg-green-100 text-green-700">
                                                                    <CheckCheck className="w-3 h-3 mr-1" />
                                                                    Sincronizar para AC
                                                                </Badge>
                                                            ) : (
                                                                <Badge className="text-xs bg-red-100 text-red-700">
                                                                    <Ban className="w-3 h-3 mr-1" />
                                                                    Nao sincronizar
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Stats + History Button */}
                                                    <div className="text-xs text-muted-foreground mt-2 flex items-center gap-2 flex-wrap">
                                                        {stats && (
                                                            <>
                                                                {stats.sent > 0 && (
                                                                    <Badge className="bg-green-100 text-green-700 text-xs">
                                                                        <CheckCircle className="w-3 h-3 mr-0.5" />{stats.sent}
                                                                    </Badge>
                                                                )}
                                                                {stats.failed > 0 && (
                                                                    <Badge className="bg-red-100 text-red-700 text-xs">
                                                                        <XCircle className="w-3 h-3 mr-0.5" />{stats.failed}
                                                                    </Badge>
                                                                )}
                                                                {stats.blocked > 0 && (
                                                                    <Badge className="bg-slate-100 text-slate-700 text-xs">
                                                                        <Ban className="w-3 h-3 mr-0.5" />{stats.blocked}
                                                                    </Badge>
                                                                )}
                                                                {stats.pending > 0 && (
                                                                    <Badge className="bg-yellow-100 text-yellow-700 text-xs">
                                                                        <Clock className="w-3 h-3 mr-0.5" />{stats.pending}
                                                                    </Badge>
                                                                )}
                                                                {stats.shadow > 0 && (
                                                                    <Badge className="bg-purple-100 text-purple-700 text-xs">
                                                                        <Eye className="w-3 h-3 mr-0.5" />{stats.shadow}
                                                                    </Badge>
                                                                )}
                                                                <span className="text-slate-300">|</span>
                                                            </>
                                                        )}
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-6 px-2 text-xs text-slate-500 hover:text-slate-700 gap-1"
                                                            onClick={() => setExpandedHistoryId(
                                                                expandedHistoryId === trigger.id ? null : trigger.id
                                                            )}
                                                        >
                                                            <History className="w-3.5 h-3.5" />
                                                            {expandedHistoryId === trigger.id ? 'Fechar' : 'Historico'}
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                                                    onClick={() => startEditing(trigger)}
                                                    disabled={isFormOpen && editingId !== trigger.id}
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                                    onClick={() => {
                                                        if (confirm('Remover esta regra?')) {
                                                            deleteMutation.mutate(trigger.id);
                                                        }
                                                    }}
                                                    disabled={editingId === trigger.id}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </div>
                                        {expandedHistoryId === trigger.id && (
                                            <div className="mt-3">
                                                <OutboundTriggerEventHistory
                                                    triggerId={trigger.id}
                                                    triggerName={trigger.name || 'Regra sem nome'}
                                                    integrationId={integrationId}
                                                />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Eventos sem regra */}
            <Card className="bg-white border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2 cursor-pointer" onClick={() => setShowNoRuleLogs(!showNoRuleLogs)}>
                        {showNoRuleLogs ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        <CardTitle className="text-lg flex items-center gap-2">
                            <FileWarning className="w-5 h-5 text-slate-500" />
                            Eventos sem Regra
                        </CardTitle>
                        {triggerStats?.has('null') && (
                            <Badge variant="outline" className="ml-2">
                                {triggerStats.get('null')!.total} eventos
                            </Badge>
                        )}
                    </div>
                    <CardDescription>
                        Eventos processados sem match com nenhuma regra (allow by default ou eventos antigos)
                    </CardDescription>
                </CardHeader>
                {showNoRuleLogs && (
                    <CardContent>
                        <OutboundTriggerEventHistory
                            triggerId={null}
                            triggerName="Sem Regra"
                            integrationId={integrationId}
                        />
                    </CardContent>
                )}
            </Card>

            {/* Help Card */}
            <Card className="bg-slate-50 border-slate-200">
                <CardContent className="pt-4">
                    <h4 className="font-medium text-slate-700 mb-2">Como funciona?</h4>
                    <ul className="text-sm text-slate-600 space-y-1 list-disc list-inside">
                        <li><strong>Sem regras:</strong> Todos os eventos de outbound sao sincronizados normalmente</li>
                        <li><strong>Com regras:</strong> Apenas eventos que correspondem a uma regra "Permitir" sao sincronizados</li>
                        <li><strong>Tipo de Operacao:</strong> "Atualizacao" sincroniza cards existentes no AC, "Criacao" cria deals novos, "Ambos" faz os dois</li>
                        <li><strong>Prioridade:</strong> Regras com menor numero sao avaliadas primeiro</li>
                        <li><strong>Primeira regra vence:</strong> A primeira regra que faz match determina a acao</li>
                        <li><strong>Nenhuma regra match:</strong> Evento e bloqueado por padrao</li>
                    </ul>
                </CardContent>
            </Card>
        </div>
    );
}
