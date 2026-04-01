import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/Input';
import {
    Plus, Trash2, AlertTriangle, Zap, X, ArrowRight,
    Pencil, Clock, Play, ListTodo, CalendarDays,
    Search, ChevronDown, ChevronRight, Filter
} from 'lucide-react';
import { toast } from 'sonner';
import { usePipelineStages } from '@/hooks/usePipelineStages';
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta';

interface EntryRule {
    id: string;
    name: string | null;
    event_type: 'card_created' | 'stage_enter';
    applicable_stage_ids: string[] | null;
    applicable_pipeline_ids: string[] | null;
    action_type: 'create_task' | 'start_cadence';
    target_template_id: string | null;
    task_config: {
        tipo?: string;
        titulo?: string;
        prioridade?: string;
        assign_to?: string;
    } | null;
    delay_minutes: number;
    delay_type: 'business' | 'calendar';
    business_hours_start: number | null;
    business_hours_end: number | null;
    allowed_weekdays: number[] | null;
    is_active: boolean;
    created_at: string;
}

interface CadenceTemplate {
    id: string;
    name: string;
    description: string | null;
    target_audience: string | null;
    is_active: boolean;
}

interface Pipeline {
    id: string;
    nome: string;
    produto: string;
}

interface FormData {
    name: string;
    eventType: 'card_created' | 'stage_enter';
    pipelineIds: string[];
    stageIds: string[];
    actionType: 'create_task' | 'start_cadence';
    targetTemplateId: string;
    taskConfig: {
        tipo: string;
        titulo: string;
        prioridade: string;
    };
    delayMinutes: number;
    delayType: 'business' | 'calendar';
    businessHoursStart: number;
    businessHoursEnd: number;
    allowedWeekdays: number[];
}

const emptyFormData: FormData = {
    name: '',
    eventType: 'card_created',
    pipelineIds: [],
    stageIds: [],
    actionType: 'create_task',
    targetTemplateId: '',
    taskConfig: {
        tipo: 'contato',
        titulo: '',
        prioridade: 'high'
    },
    delayMinutes: 5,
    delayType: 'business',
    businessHoursStart: 9,
    businessHoursEnd: 18,
    allowedWeekdays: [1, 2, 3, 4, 5]
};

const eventTypeOptions = [
    { value: 'card_created', label: '🆕 Card Criado' },
    { value: 'stage_enter', label: '➡️ Card Movido para Stage' }
];

const actionTypeOptions = [
    { value: 'create_task', label: '📋 Criar Tarefa' },
    { value: 'start_cadence', label: '🔄 Iniciar Cadência' }
];

const taskTypeOptions = [
    { value: 'contato', label: 'Contato' },
    { value: 'email', label: 'E-mail' },
    { value: 'reuniao', label: 'Reunião' },
    { value: 'followup', label: 'Follow-up' }
];

const priorityOptions = [
    { value: 'high', label: 'Alta' },
    { value: 'medium', label: 'Média' },
    { value: 'low', label: 'Baixa' }
];

const delayTypeOptions = [
    { value: 'business', label: 'Horário Comercial' },
    { value: 'calendar', label: 'Calendário (corrido)' }
];

// Opções de horas (6h às 22h)
const hourOptions = Array.from({ length: 17 }, (_, i) => ({
    value: String(i + 6),
    label: `${i + 6}h`
}));

// Opções de dias da semana
const weekdayOptions = [
    { value: 1, label: 'Seg' },
    { value: 2, label: 'Ter' },
    { value: 3, label: 'Qua' },
    { value: 4, label: 'Qui' },
    { value: 5, label: 'Sex' },
    { value: 6, label: 'Sáb' },
    { value: 7, label: 'Dom' }
];

// Formatação de dias da semana
const formatWeekdays = (days: number[]) => {
    if (days.length === 5 && days.every((d, i) => d === i + 1)) return 'Segunda a Sexta';
    if (days.length === 7) return 'Todos os dias';
    return days.map(d => weekdayOptions.find(w => w.value === d)?.label).join(', ');
};

export function CadenceEntryRulesTab() {
    const queryClient = useQueryClient();
    const { pipelineId: pipelineIdFromMeta } = useCurrentProductMeta();
    const pipelineId = pipelineIdFromMeta ?? '';
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState<FormData>(emptyFormData);

    // Filter states
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
    const [actionFilter, setActionFilter] = useState<'all' | 'create_task' | 'start_cadence'>('all');
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
        card_created: true,
        stage_enter: true
    });

    // Fetch existing entry rules
    const { data: rules, isLoading: rulesLoading } = useQuery({
        queryKey: ['cadence-entry-rules'],
        queryFn: async () => {
            const { data, error } = await (supabase
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .from('cadence_event_triggers' as any) as any)
                .select('*')
                .in('event_type', ['card_created', 'stage_enter'])
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data as EntryRule[];
        }
    });

    // Fetch cadence templates
    const { data: templates } = useQuery({
        queryKey: ['cadence-templates-active'],
        queryFn: async () => {
            const { data, error } = await (supabase
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .from('cadence_templates' as any) as any)
                .select('id, name, description, target_audience, is_active')
                .eq('is_active', true)
                .order('name');
            if (error) throw error;
            return data as CadenceTemplate[];
        }
    });

    // Fetch pipelines
    const { data: pipelines } = useQuery({
        queryKey: ['pipelines'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('pipelines')
                .select('id, nome, produto')
                .order('nome');
            if (error) throw error;
            return data as Pipeline[];
        }
    });

    // Fetch stages
    const { data: allStages } = usePipelineStages(pipelineId);

    // Filter stages by selected pipelines
    const filteredStages = allStages?.filter(s =>
        formData.pipelineIds.length === 0 || formData.pipelineIds.includes(s.pipeline_id || '')
    ) || [];

    // Filter and group rules
    const filteredRules = useMemo(() => {
        return rules?.filter(rule => {
            if (statusFilter === 'active' && !rule.is_active) return false;
            if (statusFilter === 'inactive' && rule.is_active) return false;
            if (actionFilter !== 'all' && rule.action_type !== actionFilter) return false;
            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                const nameMatch = rule.name?.toLowerCase().includes(term);
                const templateName = rule.target_template_id
                    ? templates?.find(t => t.id === rule.target_template_id)?.name || ''
                    : '';
                const templateMatch = templateName.toLowerCase().includes(term);
                const taskMatch = rule.task_config?.titulo?.toLowerCase().includes(term);
                if (!nameMatch && !templateMatch && !taskMatch) return false;
            }
            return true;
        }) || [];
    }, [rules, statusFilter, actionFilter, searchTerm, templates]);

    const groupedRules = useMemo(() => ({
        card_created: filteredRules.filter(r => r.event_type === 'card_created'),
        stage_enter: filteredRules.filter(r => r.event_type === 'stage_enter')
    }), [filteredRules]);

    // Stats
    const stats = useMemo(() => ({
        total: rules?.length || 0,
        active: rules?.filter(r => r.is_active).length || 0,
        tasks: rules?.filter(r => r.action_type === 'create_task').length || 0,
        cadences: rules?.filter(r => r.action_type === 'start_cadence').length || 0,
        filteredTotal: filteredRules.length
    }), [rules, filteredRules]);

    const toggleSection = (section: string) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    // Create mutation
    const createMutation = useMutation({
        mutationFn: async () => {
            const insertData = {
                name: formData.name || null,
                event_type: formData.eventType,
                applicable_pipeline_ids: formData.pipelineIds.length > 0 ? formData.pipelineIds : null,
                applicable_stage_ids: formData.stageIds.length > 0 ? formData.stageIds : null,
                action_type: formData.actionType,
                target_template_id: formData.actionType === 'start_cadence' ? formData.targetTemplateId : null,
                task_config: formData.actionType === 'create_task' ? formData.taskConfig : null,
                delay_minutes: formData.delayMinutes,
                delay_type: formData.delayType,
                business_hours_start: formData.delayType === 'business' ? formData.businessHoursStart : null,
                business_hours_end: formData.delayType === 'business' ? formData.businessHoursEnd : null,
                allowed_weekdays: formData.delayType === 'business' ? formData.allowedWeekdays : null,
                is_active: true,
                conditions: [],
                event_config: {}
            };

            const { error } = await (supabase
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .from('cadence_event_triggers' as any) as any)
                .insert(insertData);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['cadence-entry-rules'] });
            toast.success('Regra criada com sucesso!');
            resetForm();
        },
        onError: (e: Error) => {
            toast.error(`Erro ao criar regra: ${e.message}`);
        }
    });

    // Update mutation
    const updateMutation = useMutation({
        mutationFn: async (id: string) => {
            const updateData = {
                name: formData.name || null,
                event_type: formData.eventType,
                applicable_pipeline_ids: formData.pipelineIds.length > 0 ? formData.pipelineIds : null,
                applicable_stage_ids: formData.stageIds.length > 0 ? formData.stageIds : null,
                action_type: formData.actionType,
                target_template_id: formData.actionType === 'start_cadence' ? formData.targetTemplateId : null,
                task_config: formData.actionType === 'create_task' ? formData.taskConfig : null,
                delay_minutes: formData.delayMinutes,
                delay_type: formData.delayType,
                business_hours_start: formData.delayType === 'business' ? formData.businessHoursStart : null,
                business_hours_end: formData.delayType === 'business' ? formData.businessHoursEnd : null,
                allowed_weekdays: formData.delayType === 'business' ? formData.allowedWeekdays : null
            };

            const { error } = await (supabase
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .from('cadence_event_triggers' as any) as any)
                .update(updateData)
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['cadence-entry-rules'] });
            toast.success('Regra atualizada!');
            resetForm();
        },
        onError: (e: Error) => {
            toast.error(`Erro ao atualizar: ${e.message}`);
        }
    });

    // Toggle mutation
    const toggleMutation = useMutation({
        mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
            const { error } = await (supabase
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .from('cadence_event_triggers' as any) as any)
                .update({ is_active: isActive })
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['cadence-entry-rules'] });
            toast.success('Status atualizado!');
        }
    });

    // Delete mutation
    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await (supabase
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .from('cadence_event_triggers' as any) as any)
                .delete()
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['cadence-entry-rules'] });
            toast.success('Regra removida!');
        }
    });

    // Helpers
    const getPipelineName = (id: string) => pipelines?.find(p => p.id === id)?.nome || id;
    const getStageName = (id: string) => allStages?.find(s => s.id === id)?.nome || id;
    const getTemplateName = (id: string) => templates?.find(t => t.id === id)?.name || id;

    const addToArray = (arr: string[], item: string) => [...arr, item];
    const removeFromArray = (arr: string[], item: string) => arr.filter(i => i !== item);

    const resetForm = () => {
        setIsAdding(false);
        setEditingId(null);
        setFormData(emptyFormData);
    };

    const startEditing = (rule: EntryRule) => {
        setEditingId(rule.id);
        setIsAdding(false);
        setFormData({
            name: rule.name || '',
            eventType: rule.event_type,
            pipelineIds: rule.applicable_pipeline_ids || [],
            stageIds: rule.applicable_stage_ids || [],
            actionType: rule.action_type,
            targetTemplateId: rule.target_template_id || '',
            taskConfig: {
                tipo: rule.task_config?.tipo || 'contato',
                titulo: rule.task_config?.titulo || '',
                prioridade: rule.task_config?.prioridade || 'high'
            },
            delayMinutes: rule.delay_minutes || 5,
            delayType: rule.delay_type || 'business',
            businessHoursStart: rule.business_hours_start ?? 9,
            businessHoursEnd: rule.business_hours_end ?? 18,
            allowedWeekdays: rule.allowed_weekdays || [1, 2, 3, 4, 5]
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

    const isFormOpen = isAdding || editingId !== null;
    const isSaving = createMutation.isPending || updateMutation.isPending;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const formatDelay = (minutes: number, _type: string) => {
        if (minutes < 60) return `${minutes} min`;
        if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
        return `${Math.round(minutes / 1440)} dia(s)`;
    };

    // Render individual rule card
    const renderRuleCard = (rule: EntryRule) => (
        <div
            key={rule.id}
            className={`p-4 rounded-lg border-l-4 transition-colors ${
                editingId === rule.id
                    ? 'bg-amber-50 border-amber-300 border-l-amber-500'
                    : rule.action_type === 'create_task'
                        ? rule.is_active
                            ? 'bg-white border border-slate-200 border-l-purple-400'
                            : 'bg-slate-50 border border-slate-100 border-l-purple-200 opacity-60'
                        : rule.is_active
                            ? 'bg-white border border-slate-200 border-l-indigo-400'
                            : 'bg-slate-50 border border-slate-100 border-l-indigo-200 opacity-60'
            }`}
        >
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4 flex-1">
                    <Switch
                        checked={rule.is_active}
                        onCheckedChange={(checked) => toggleMutation.mutate({ id: rule.id, isActive: checked })}
                        disabled={editingId === rule.id}
                    />
                    <div className="flex-1 min-w-0">
                        {/* Name */}
                        {rule.name && (
                            <p className="font-semibold text-slate-800 mb-2">{rule.name}</p>
                        )}

                        {/* Stages */}
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                            <span className="text-xs text-slate-500">Stages:</span>
                            <div className="flex flex-wrap gap-1">
                                {rule.applicable_stage_ids?.length ? (
                                    rule.applicable_stage_ids.map(id => (
                                        <Badge key={id} variant="secondary" className="text-xs">
                                            {getStageName(id)}
                                        </Badge>
                                    ))
                                ) : (
                                    <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                                        Qualquer Stage
                                    </Badge>
                                )}
                            </div>
                        </div>

                        {/* Action */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-slate-500">Ação:</span>
                            {rule.action_type === 'create_task' ? (
                                <>
                                    <Badge className="text-xs bg-purple-100 text-purple-700">
                                        <ListTodo className="w-3 h-3 mr-1" />
                                        Criar Tarefa
                                    </Badge>
                                    {rule.task_config?.titulo && (
                                        <span className="text-sm text-slate-600">"{rule.task_config.titulo}"</span>
                                    )}
                                </>
                            ) : (
                                <>
                                    <Badge className="text-xs bg-indigo-100 text-indigo-700">
                                        <CalendarDays className="w-3 h-3 mr-1" />
                                        Iniciar Cadência
                                    </Badge>
                                    {rule.target_template_id && (
                                        <span className="text-sm text-slate-600">"{getTemplateName(rule.target_template_id)}"</span>
                                    )}
                                </>
                            )}
                            <Badge variant="outline" className="text-xs">
                                <Clock className="w-3 h-3 mr-1" />
                                {formatDelay(rule.delay_minutes, rule.delay_type)}
                                {rule.delay_type === 'business' && ' (útil)'}
                            </Badge>
                        </div>

                        {/* Business Hours Details */}
                        {rule.delay_type === 'business' && (
                            <div className="flex items-center gap-2 mt-2">
                                <span className="text-xs text-slate-400">Horário:</span>
                                <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                                    {rule.business_hours_start ?? 9}h às {rule.business_hours_end ?? 18}h
                                </Badge>
                                <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                                    {formatWeekdays(rule.allowed_weekdays || [1, 2, 3, 4, 5])}
                                </Badge>
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                        onClick={() => startEditing(rule)}
                        disabled={isFormOpen && editingId !== rule.id}
                    >
                        <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => {
                            if (confirm('Remover esta regra?')) {
                                deleteMutation.mutate(rule.id);
                            }
                        }}
                        disabled={editingId === rule.id}
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </div>
            </div>
        </div>
    );

    // Render form
    const renderForm = () => (
        <Card className={`bg-white border-slate-200 shadow-sm border-l-4 ${editingId ? 'border-l-amber-500' : 'border-l-blue-500'}`}>
            <CardHeader className="pb-3">
                <CardTitle className="text-base">
                    {editingId ? 'Editar Regra' : 'Nova Regra de Entrada'}
                </CardTitle>
                <CardDescription>
                    Defina QUANDO o evento acontece e O QUE deve ser feito automaticamente.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Nome e Evento */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="text-sm font-medium mb-2 block">Nome da Regra</label>
                        <Input
                            value={formData.name}
                            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="Ex: Novo Lead → Tarefa em 5 min"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium mb-2 block">Tipo de Evento</label>
                        <Select
                            value={formData.eventType}
                            onChange={(v) => setFormData(prev => ({ ...prev, eventType: v as 'card_created' | 'stage_enter' }))}
                            options={eventTypeOptions}
                        />
                    </div>
                </div>

                {/* QUANDO */}
                <div className="space-y-4 p-4 bg-amber-50 rounded-lg">
                    <h4 className="font-medium text-amber-800 flex items-center gap-2">
                        <Zap className="w-4 h-4 text-amber-500" />
                        QUANDO
                    </h4>

                    <p className="text-sm text-amber-700">
                        {formData.eventType === 'card_created'
                            ? 'Quando um novo card for criado...'
                            : 'Quando um card for movido para um stage...'}
                    </p>

                    {/* Pipelines Multi-Select */}
                    <div>
                        <label className="text-sm font-medium mb-2 block">
                            Em Pipelines <span className="text-slate-400 font-normal">(vazio = qualquer)</span>
                        </label>
                        <div className="flex flex-wrap gap-2 mb-2">
                            {formData.pipelineIds.length === 0 ? (
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                                    ✓ Qualquer Pipeline
                                </Badge>
                            ) : (
                                formData.pipelineIds.map(id => (
                                    <Badge key={id} variant="secondary" className="gap-1">
                                        {getPipelineName(id)}
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
                                ...(pipelines?.filter(p => !formData.pipelineIds.includes(p.id))
                                    .map(p => ({ value: p.id, label: `${p.produto} - ${p.nome}` })) || [])
                            ]}
                        />
                    </div>

                    {/* Stages Multi-Select */}
                    <div>
                        <label className="text-sm font-medium mb-2 block">
                            Em Stages <span className="text-slate-400 font-normal">(vazio = qualquer)</span>
                        </label>
                        <div className="flex flex-wrap gap-2 mb-2">
                            {formData.stageIds.length === 0 ? (
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                                    ✓ Qualquer Stage
                                </Badge>
                            ) : (
                                formData.stageIds.map(id => (
                                    <Badge key={id} variant="secondary" className="gap-1">
                                        {getStageName(id)}
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
                                { value: '', label: 'Adicionar stage...' },
                                ...(filteredStages.filter(s => !formData.stageIds.includes(s.id))
                                    .map(s => ({ value: s.id, label: s.nome })) || [])
                            ]}
                        />
                    </div>
                </div>

                {/* Arrow */}
                <div className="flex justify-center">
                    <ArrowRight className="w-6 h-6 text-slate-400" />
                </div>

                {/* ENTÃO */}
                <div className="space-y-4 p-4 bg-blue-50 rounded-lg">
                    <h4 className="font-medium text-blue-800 flex items-center gap-2">
                        <Play className="w-4 h-4 text-blue-500" />
                        ENTÃO
                    </h4>

                    {/* Tipo de Ação */}
                    <div>
                        <label className="text-sm font-medium mb-2 block">Ação</label>
                        <Select
                            value={formData.actionType}
                            onChange={(v) => setFormData(prev => ({ ...prev, actionType: v as 'create_task' | 'start_cadence' }))}
                            options={actionTypeOptions}
                        />
                    </div>

                    {/* Config de Tarefa */}
                    {formData.actionType === 'create_task' && (
                        <div className="space-y-4 p-3 bg-white rounded-lg border border-blue-200">
                            <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
                                <ListTodo className="w-4 h-4" />
                                Configuração da Tarefa
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="text-sm font-medium mb-2 block">Tipo</label>
                                    <Select
                                        value={formData.taskConfig.tipo}
                                        onChange={(v) => setFormData(prev => ({
                                            ...prev,
                                            taskConfig: { ...prev.taskConfig, tipo: v }
                                        }))}
                                        options={taskTypeOptions}
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium mb-2 block">Título</label>
                                    <Input
                                        value={formData.taskConfig.titulo}
                                        onChange={(e) => setFormData(prev => ({
                                            ...prev,
                                            taskConfig: { ...prev.taskConfig, titulo: e.target.value }
                                        }))}
                                        placeholder="Ex: Primeiro Contato"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium mb-2 block">Prioridade</label>
                                    <Select
                                        value={formData.taskConfig.prioridade}
                                        onChange={(v) => setFormData(prev => ({
                                            ...prev,
                                            taskConfig: { ...prev.taskConfig, prioridade: v }
                                        }))}
                                        options={priorityOptions}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Config de Cadência */}
                    {formData.actionType === 'start_cadence' && (
                        <div className="space-y-4 p-3 bg-white rounded-lg border border-blue-200">
                            <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
                                <CalendarDays className="w-4 h-4" />
                                Cadência a Iniciar
                            </div>
                            <Select
                                value={formData.targetTemplateId}
                                onChange={(v) => setFormData(prev => ({ ...prev, targetTemplateId: v }))}
                                options={[
                                    { value: '', label: 'Selecione uma cadência...' },
                                    ...(templates?.map(t => ({
                                        value: t.id,
                                        label: `${t.name}${t.target_audience ? ` (${t.target_audience.toUpperCase()})` : ''}`
                                    })) || [])
                                ]}
                            />
                            {!templates?.length && (
                                <p className="text-xs text-amber-600">
                                    Nenhuma cadência ativa. Crie uma cadência primeiro na aba Templates.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Delay */}
                    <div className="space-y-4 p-3 bg-white rounded-lg border border-blue-200">
                        <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
                            <Clock className="w-4 h-4" />
                            Agendar Para
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-medium mb-2 block">Delay (minutos)</label>
                                <Input
                                    type="number"
                                    min={0}
                                    value={formData.delayMinutes}
                                    onChange={(e) => setFormData(prev => ({
                                        ...prev,
                                        delayMinutes: parseInt(e.target.value) || 0
                                    }))}
                                />
                                <p className="text-xs text-slate-500 mt-1">
                                    0 = imediatamente | 60 = 1h | 180 = 3h | 1440 = 1 dia
                                </p>
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-2 block">Tipo de Delay</label>
                                <Select
                                    value={formData.delayType}
                                    onChange={(v) => setFormData(prev => ({ ...prev, delayType: v as 'business' | 'calendar' }))}
                                    options={delayTypeOptions}
                                />
                            </div>
                        </div>

                        {/* Configuração de Horário Comercial */}
                        {formData.delayType === 'business' && (
                            <div className="mt-3 p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-4">
                                <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
                                    <Clock className="w-4 h-4 text-amber-600" />
                                    Configurar Horário Comercial
                                </div>

                                {/* Horário */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-medium text-amber-700 mb-1 block">Início</label>
                                        <Select
                                            value={String(formData.businessHoursStart)}
                                            onChange={(v) => setFormData(prev => ({
                                                ...prev,
                                                businessHoursStart: parseInt(v)
                                            }))}
                                            options={hourOptions}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-amber-700 mb-1 block">Fim</label>
                                        <Select
                                            value={String(formData.businessHoursEnd)}
                                            onChange={(v) => setFormData(prev => ({
                                                ...prev,
                                                businessHoursEnd: parseInt(v)
                                            }))}
                                            options={hourOptions}
                                        />
                                    </div>
                                </div>

                                {/* Dias da Semana */}
                                <div>
                                    <label className="text-xs font-medium text-amber-700 mb-2 block">Dias Permitidos</label>
                                    <div className="flex flex-wrap gap-2">
                                        {weekdayOptions.map(day => (
                                            <button
                                                key={day.value}
                                                type="button"
                                                onClick={() => {
                                                    const isSelected = formData.allowedWeekdays.includes(day.value);
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        allowedWeekdays: isSelected
                                                            ? prev.allowedWeekdays.filter(d => d !== day.value)
                                                            : [...prev.allowedWeekdays, day.value].sort((a, b) => a - b)
                                                    }));
                                                }}
                                                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                                                    formData.allowedWeekdays.includes(day.value)
                                                        ? 'bg-amber-600 text-white'
                                                        : 'bg-white text-amber-700 border border-amber-300 hover:bg-amber-100'
                                                }`}
                                            >
                                                {day.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Preview */}
                                <div className="text-xs text-amber-600 pt-2 border-t border-amber-200">
                                    <strong>Resumo:</strong> {formData.businessHoursStart}h às {formData.businessHoursEnd}h • {formatWeekdays(formData.allowedWeekdays)}
                                    <br />
                                    Se o delay cair fora desse horário, a ação será agendada para o próximo horário útil.
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-2 border-t">
                    <Button
                        onClick={handleSave}
                        disabled={
                            (formData.actionType === 'start_cadence' && !formData.targetTemplateId) ||
                            (formData.actionType === 'create_task' && !formData.taskConfig.titulo) ||
                            isSaving
                        }
                    >
                        {isSaving ? 'Salvando...' : (editingId ? 'Salvar Alterações' : 'Criar Regra')}
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
            <Card className="bg-amber-50 border-amber-200">
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-amber-800">
                        <AlertTriangle className="w-5 h-5" />
                        Regras de Entrada de Cadência
                    </CardTitle>
                    <CardDescription className="text-amber-700">
                        Configure ações automáticas quando cards são criados ou movidos para determinados stages.
                        <br />
                        <strong>Exemplos:</strong> "Card criado em Novo Lead → Criar tarefa em 5 min" ou "Card movido para Tentativa → Iniciar cadência SDR"
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div className="flex items-start gap-2 p-2 bg-white/60 rounded-lg">
                            <Clock className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                            <div>
                                <p className="font-medium text-amber-800">Horário Comercial</p>
                                <p className="text-amber-700 text-xs">
                                    Customizável por regra (padrão: 9h-18h, Seg-Sex)
                                </p>
                            </div>
                        </div>
                        <div className="flex items-start gap-2 p-2 bg-white/60 rounded-lg">
                            <Zap className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                            <div>
                                <p className="font-medium text-amber-800">Anti-Duplicata</p>
                                <p className="text-amber-700 text-xs">
                                    Não cria tarefa se já existir uma pendente do mesmo tipo
                                </p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Stats + Filters + Add Button */}
            <Card className="bg-white border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">Regras Configuradas</CardTitle>
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
                <CardContent className="space-y-4">
                    {rulesLoading ? (
                        <div className="text-muted-foreground text-sm">Carregando...</div>
                    ) : !rules?.length ? (
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center">
                            <Zap className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                            <p className="font-medium text-slate-700">Nenhuma regra configurada</p>
                            <p className="text-sm text-slate-500 mt-1">
                                Crie sua primeira regra para automatizar ações quando cards entrarem no pipeline.
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* Stats Bar */}
                            <div className="flex flex-wrap gap-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-500">Total:</span>
                                    <span className="font-semibold text-slate-700">{stats.total}</span>
                                </div>
                                <div className="w-px h-4 bg-slate-200 self-center" />
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-500">Ativas:</span>
                                    <span className="font-semibold text-emerald-600">{stats.active}</span>
                                </div>
                                <div className="w-px h-4 bg-slate-200 self-center" />
                                <div className="flex items-center gap-2">
                                    <ListTodo className="w-3 h-3 text-purple-500" />
                                    <span className="text-xs text-slate-500">Tarefas:</span>
                                    <span className="font-semibold text-purple-600">{stats.tasks}</span>
                                </div>
                                <div className="w-px h-4 bg-slate-200 self-center" />
                                <div className="flex items-center gap-2">
                                    <CalendarDays className="w-3 h-3 text-indigo-500" />
                                    <span className="text-xs text-slate-500">Cadências:</span>
                                    <span className="font-semibold text-indigo-600">{stats.cadences}</span>
                                </div>
                            </div>

                            {/* Filters Bar */}
                            <div className="flex flex-wrap items-center gap-3">
                                {/* Search */}
                                <div className="relative flex-1 min-w-[200px]">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <Input
                                        placeholder="Buscar por nome, título ou template..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-9 h-9"
                                    />
                                </div>

                                {/* Status Filter */}
                                <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                                    <button
                                        onClick={() => setStatusFilter('all')}
                                        className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                                            statusFilter === 'all'
                                                ? 'bg-white text-slate-800 shadow-sm'
                                                : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                    >
                                        Todas
                                    </button>
                                    <button
                                        onClick={() => setStatusFilter('active')}
                                        className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                                            statusFilter === 'active'
                                                ? 'bg-emerald-500 text-white shadow-sm'
                                                : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                    >
                                        Ativas
                                    </button>
                                    <button
                                        onClick={() => setStatusFilter('inactive')}
                                        className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                                            statusFilter === 'inactive'
                                                ? 'bg-slate-500 text-white shadow-sm'
                                                : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                    >
                                        Inativas
                                    </button>
                                </div>

                                {/* Action Type Filter */}
                                <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                                    <button
                                        onClick={() => setActionFilter('all')}
                                        className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                                            actionFilter === 'all'
                                                ? 'bg-white text-slate-800 shadow-sm'
                                                : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                    >
                                        Todas
                                    </button>
                                    <button
                                        onClick={() => setActionFilter('create_task')}
                                        className={`px-3 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1 ${
                                            actionFilter === 'create_task'
                                                ? 'bg-purple-500 text-white shadow-sm'
                                                : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                    >
                                        <ListTodo className="w-3 h-3" />
                                        Tarefas
                                    </button>
                                    <button
                                        onClick={() => setActionFilter('start_cadence')}
                                        className={`px-3 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1 ${
                                            actionFilter === 'start_cadence'
                                                ? 'bg-indigo-500 text-white shadow-sm'
                                                : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                    >
                                        <CalendarDays className="w-3 h-3" />
                                        Cadências
                                    </button>
                                </div>
                            </div>

                            {/* Filter indicator */}
                            {(searchTerm || statusFilter !== 'all' || actionFilter !== 'all') && (
                                <div className="flex items-center gap-2 text-sm text-slate-500">
                                    <Filter className="w-4 h-4" />
                                    <span>Mostrando {stats.filteredTotal} de {stats.total} regras</span>
                                    <button
                                        onClick={() => {
                                            setSearchTerm('');
                                            setStatusFilter('all');
                                            setActionFilter('all');
                                        }}
                                        className="text-blue-500 hover:text-blue-700 underline text-xs"
                                    >
                                        Limpar filtros
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Add/Edit Form */}
            {isFormOpen && renderForm()}

            {/* Grouped Rules List */}
            {rules && rules.length > 0 && (
                <div className="space-y-4">
                    {/* Card Created Section */}
                    {(groupedRules.card_created.length > 0 || !searchTerm && !statusFilter && !actionFilter) && (
                        <Card className="bg-white border-slate-200 shadow-sm border-l-4 border-l-green-400">
                            <CardHeader className="pb-2">
                                <button
                                    onClick={() => toggleSection('card_created')}
                                    className="flex items-center justify-between w-full text-left"
                                >
                                    <div className="flex items-center gap-3">
                                        {expandedSections.card_created ? (
                                            <ChevronDown className="w-5 h-5 text-slate-400" />
                                        ) : (
                                            <ChevronRight className="w-5 h-5 text-slate-400" />
                                        )}
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg">📥</span>
                                            <CardTitle className="text-base">Card Criado</CardTitle>
                                        </div>
                                        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                                            {groupedRules.card_created.length} regra(s)
                                        </Badge>
                                    </div>
                                </button>
                            </CardHeader>
                            {expandedSections.card_created && (
                                <CardContent className="pt-0">
                                    {groupedRules.card_created.length === 0 ? (
                                        <div className="text-sm text-slate-500 italic py-4 text-center">
                                            Nenhuma regra para "Card Criado" {searchTerm || statusFilter !== 'all' || actionFilter !== 'all' ? 'com os filtros atuais' : ''}
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {groupedRules.card_created.map(rule => renderRuleCard(rule))}
                                        </div>
                                    )}
                                </CardContent>
                            )}
                        </Card>
                    )}

                    {/* Stage Enter Section */}
                    {(groupedRules.stage_enter.length > 0 || !searchTerm && !statusFilter && !actionFilter) && (
                        <Card className="bg-white border-slate-200 shadow-sm border-l-4 border-l-blue-400">
                            <CardHeader className="pb-2">
                                <button
                                    onClick={() => toggleSection('stage_enter')}
                                    className="flex items-center justify-between w-full text-left"
                                >
                                    <div className="flex items-center gap-3">
                                        {expandedSections.stage_enter ? (
                                            <ChevronDown className="w-5 h-5 text-slate-400" />
                                        ) : (
                                            <ChevronRight className="w-5 h-5 text-slate-400" />
                                        )}
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg">➡️</span>
                                            <CardTitle className="text-base">Card Movido para Stage</CardTitle>
                                        </div>
                                        <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                            {groupedRules.stage_enter.length} regra(s)
                                        </Badge>
                                    </div>
                                </button>
                            </CardHeader>
                            {expandedSections.stage_enter && (
                                <CardContent className="pt-0">
                                    {groupedRules.stage_enter.length === 0 ? (
                                        <div className="text-sm text-slate-500 italic py-4 text-center">
                                            Nenhuma regra para "Card Movido" {searchTerm || statusFilter !== 'all' || actionFilter !== 'all' ? 'com os filtros atuais' : ''}
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {groupedRules.stage_enter.map(rule => renderRuleCard(rule))}
                                        </div>
                                    )}
                                </CardContent>
                            )}
                        </Card>
                    )}
                </div>
            )}
        </div>
    );
}

export default CadenceEntryRulesTab;
