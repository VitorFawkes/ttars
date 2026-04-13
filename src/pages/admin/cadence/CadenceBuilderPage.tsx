import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    ArrowLeft, Save, Trash2, Phone, Clock, Flag, Settings, AlertCircle,
    ChevronUp, ChevronDown, Calendar, Eye, ListOrdered, CheckCircle
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Select as CustomSelect } from '@/components/ui/Select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Badge } from '@/components/ui/Badge';
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta';
import { useUsers } from '@/hooks/useUsers';
import { DayPatternEditor } from './components/DayPatternEditor';
import { CadenceTimeline } from './components/CadenceTimeline';

interface DayPattern {
    days: number[];
    description?: string;
}

interface CadenceStep {
    id: string;
    step_order: number;
    step_key: string;
    step_type: 'task' | 'wait' | 'end';
    day_offset: number | null;
    requires_previous_completed: boolean;
    task_config: {
        tipo?: string;
        titulo?: string;
        descricao?: string;
        prioridade?: string;
        assign_to?: 'card_owner' | 'specific';
        assign_to_user_id?: string | null;
    } | null;
    wait_config: {
        duration_minutes?: number;
        duration_type?: 'business' | 'calendar';
    } | null;
    end_config: {
        result?: string;
        move_to_stage_id?: string;
        motivo_perda_id?: string;
    } | null;
    next_step_key: string | null;
}

interface CadenceTemplate {
    id?: string;
    name: string;
    description: string;
    target_audience: string;
    respect_business_hours: boolean;
    auto_cancel_on_stage_change: boolean;
    soft_break_after_days: number;
    is_active: boolean;
    schedule_mode: 'interval' | 'day_pattern';
    day_pattern: DayPattern | null;
    require_completion_for_next: boolean;
    business_hours_start: number;
    business_hours_end: number;
    allowed_weekdays: number[];
}

const defaultTemplate: CadenceTemplate = {
    name: '',
    description: '',
    target_audience: 'sdr',
    respect_business_hours: true,
    auto_cancel_on_stage_change: true,
    soft_break_after_days: 14,
    is_active: false,
    schedule_mode: 'day_pattern',
    day_pattern: null,
    require_completion_for_next: true,
    business_hours_start: 9,
    business_hours_end: 18,
    allowed_weekdays: [1, 2, 3, 4, 5],
};

const audienceOptions = [
    { value: 'sdr', label: 'SDR (Pré-venda)' },
    { value: 'planner', label: 'Planner (Venda)' },
    { value: 'posvenda', label: 'Pós-venda' },
];

const scheduleModeOptions = [
    { value: 'day_pattern', label: 'Padrão de Dias (recomendado)' },
    { value: 'interval', label: 'Intervalo entre Steps' },
];

const taskTypeOptions = [
    { value: 'tarefa', label: 'Tarefa' },
    { value: 'contato', label: 'Contato' },
    { value: 'email', label: 'E-mail' },
    { value: 'reuniao', label: 'Reunião' },
    { value: 'solicitacao_mudanca', label: 'Mudança' },
    { value: 'enviar_proposta', label: 'Proposta' },
    { value: 'coleta_documentos', label: 'Coleta Docs' },
];

const prioridadeOptions = [
    { value: 'high', label: 'Alta' },
    { value: 'medium', label: 'Média' },
    { value: 'low', label: 'Baixa' },
];

const durationTypeOptions = [
    { value: 'business', label: 'Horário comercial' },
    { value: 'calendar', label: 'Calendário' },
];

const assignToOptions = [
    { value: 'card_owner', label: 'Responsável do card' },
    { value: 'specific', label: 'Pessoa específica' },
];

const resultOptions = [
    { value: 'success', label: 'Sucesso' },
    { value: 'failure', label: 'Falha' },
    { value: 'ghosting', label: 'Ghosting' },
];

const CadenceBuilderPage: React.FC = () => {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const isNew = !id || id === 'new';
    const { pipelineId: pipelineIdFromMeta } = useCurrentProductMeta();
    const pipelineId = pipelineIdFromMeta ?? '';
    const { users } = useUsers();
    const userOptions = useMemo(() => {
        const list = (users || [])
            .filter(u => u.active)
            .map(u => ({ value: u.id, label: u.nome || u.email }));
        return [{ value: '', label: 'Selecionar pessoa...' }, ...list];
    }, [users]);

    const [template, setTemplate] = useState<CadenceTemplate>(defaultTemplate);
    const [steps, setSteps] = useState<CadenceStep[]>([]);
    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [stages, setStages] = useState<{ id: string; nome: string }[]>([]);
    const [motivosPerda, setMotivosPerda] = useState<{ id: string; nome: string }[]>([]);
    const [activeTab, setActiveTab] = useState('steps');

    // Memoize steps by day for the DayPatternEditor
    const stepsByDay = useMemo(() => {
        const map = new Map<number, { type: string; title: string }[]>();
        steps.forEach(step => {
            if (step.day_offset !== null && step.day_offset !== undefined) {
                const day = step.day_offset + 1;
                const existing = map.get(day) || [];
                existing.push({
                    type: step.step_type,
                    title: step.task_config?.titulo || step.step_type
                });
                map.set(day, existing);
            }
        });
        return map;
    }, [steps]);

    // Carregar dados auxiliares
    useEffect(() => {
        const fetchAuxData = async () => {
            const [stagesRes, motivosRes] = await Promise.all([
                supabase.from('pipeline_stages').select('id, nome, ordem, pipeline_phases!pipeline_stages_phase_id_fkey(order_index)').eq('pipeline_id', pipelineId).order('ordem'),
                supabase.from('motivos_perda').select('id, nome'),
            ]);

            // Sort by phase order_index then stage ordem
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sortedStages = (stagesRes.data || []).sort((a: any, b: any) => {
                const phaseA = a.pipeline_phases?.order_index ?? 999
                const phaseB = b.pipeline_phases?.order_index ?? 999
                if (phaseA !== phaseB) return phaseA - phaseB
                return a.ordem - b.ordem
            })
            setStages(sortedStages);
            setMotivosPerda(motivosRes.data || []);
        };
        fetchAuxData();
    }, [pipelineId]);

    // Carregar template existente
    useEffect(() => {
        if (isNew) return;

        const fetchTemplate = async () => {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cadence tables not in generated types
                const { data: templateData, error: templateError } = await (supabase as any)
                    .from('cadence_templates')
                    .select('*')
                    .eq('id', id)
                    .single();

                if (templateError) throw templateError;

                setTemplate({
                    ...defaultTemplate,
                    ...templateData,
                    day_pattern: templateData.day_pattern || null,
                    schedule_mode: templateData.schedule_mode || 'interval',
                    require_completion_for_next: templateData.require_completion_for_next ?? true,
                    business_hours_start: templateData.business_hours_start ?? 9,
                    business_hours_end: templateData.business_hours_end ?? 18,
                    allowed_weekdays: templateData.allowed_weekdays || [1, 2, 3, 4, 5],
                });

                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cadence tables not in generated types
                const { data: stepsData, error: stepsError } = await (supabase as any)
                    .from('cadence_steps')
                    .select('*')
                    .eq('template_id', id)
                    .order('step_order');

                if (stepsError) throw stepsError;

                setSteps((stepsData || []).map((s: Record<string, unknown>) => ({
                    ...s,
                    day_offset: s.day_offset ?? null,
                    requires_previous_completed: s.requires_previous_completed ?? true,
                })));
            } catch (error) {
                console.error('Error fetching cadence:', error);
                toast.error('Erro ao carregar cadência.');
                navigate('/settings/cadence');
            } finally {
                setLoading(false);
            }
        };

        fetchTemplate();
    }, [id, isNew, navigate]);

    const handleSave = async () => {
        if (!template.name.trim()) {
            toast.error('Nome da cadência é obrigatório.');
            return;
        }

        if (steps.length === 0) {
            toast.error('Adicione pelo menos um step à cadência.');
            return;
        }

        try {
            setSaving(true);

            let templateId = id;

            const templatePayload = {
                name: template.name,
                description: template.description || null,
                target_audience: template.target_audience,
                respect_business_hours: template.respect_business_hours,
                auto_cancel_on_stage_change: template.auto_cancel_on_stage_change,
                soft_break_after_days: template.soft_break_after_days,
                is_active: template.is_active,
                schedule_mode: template.schedule_mode,
                day_pattern: template.day_pattern,
                require_completion_for_next: template.require_completion_for_next,
                business_hours_start: template.business_hours_start,
                business_hours_end: template.business_hours_end,
                allowed_weekdays: template.allowed_weekdays,
                execution_mode: 'linear',
            };

            if (isNew) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cadence tables not in generated types
                const { data: newTemplate, error: createError } = await (supabase as any)
                    .from('cadence_templates')
                    .insert(templatePayload)
                    .select()
                    .single();

                if (createError) throw createError;
                templateId = newTemplate.id;
            } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cadence tables not in generated types
                const { error: updateError } = await (supabase as any)
                    .from('cadence_templates')
                    .update(templatePayload)
                    .eq('id', id);

                if (updateError) throw updateError;

                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cadence tables not in generated types
                await (supabase as any).from('cadence_steps').delete().eq('template_id', id);
            }

            const stepsToInsert = steps.map((step, index) => ({
                template_id: templateId,
                step_order: index + 1,
                step_key: step.step_key || `step_${index + 1}`,
                step_type: step.step_type,
                day_offset: step.day_offset,
                requires_previous_completed: step.requires_previous_completed,
                task_config: step.task_config,
                wait_config: step.wait_config,
                end_config: step.end_config,
                next_step_key: steps[index + 1]?.step_key || null,
            }));

            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cadence tables not in generated types
            const { error: stepsError } = await (supabase as any)
                .from('cadence_steps')
                .insert(stepsToInsert);

            if (stepsError) throw stepsError;

            toast.success('Cadência salva com sucesso!');
            navigate('/settings/cadence');

        } catch (error) {
            console.error('Error saving cadence:', error);
            toast.error('Erro ao salvar cadência.');
        } finally {
            setSaving(false);
        }
    };

    const addStep = (type: CadenceStep['step_type']) => {
        // Determinar o próximo dia disponível baseado no padrão
        let dayOffset: number | null = null;
        if (template.schedule_mode === 'day_pattern' && template.day_pattern) {
            const usedDays = new Set(steps.map(s => s.day_offset).filter(d => d !== null));
            const availableDay = template.day_pattern.days.find(d => !usedDays.has(d - 1));
            if (availableDay !== undefined) {
                dayOffset = availableDay - 1;
            }
        }

        const newStep: CadenceStep = {
            id: `temp_${Date.now()}`,
            step_order: steps.length + 1,
            step_key: `${type}_${steps.length + 1}`,
            step_type: type,
            day_offset: dayOffset,
            requires_previous_completed: template.require_completion_for_next,
            task_config: type === 'task' ? {
                tipo: 'contato',
                titulo: '',
                prioridade: 'high',
                assign_to: 'card_owner',
                assign_to_user_id: null,
            } : null,
            wait_config: type === 'wait' ? {
                duration_minutes: 120,
                duration_type: 'business',
            } : null,
            end_config: type === 'end' ? {
                result: 'success',
            } : null,
            next_step_key: null,
        };

        setSteps([...steps, newStep]);
    };

    const removeStep = (index: number) => {
        setSteps(steps.filter((_, i) => i !== index));
    };

    const updateStep = (index: number, updates: Partial<CadenceStep>) => {
        setSteps(steps.map((step, i) => i === index ? { ...step, ...updates } : step));
    };

    const moveStep = (index: number, direction: 'up' | 'down') => {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === steps.length - 1) return;

        const newSteps = [...steps];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        [newSteps[index], newSteps[targetIndex]] = [newSteps[targetIndex], newSteps[index]];

        const reorderedSteps = newSteps.map((step, i) => ({
            ...step,
            step_order: i + 1,
        }));

        setSteps(reorderedSteps);
    };

    const getStepIcon = (type: string) => {
        switch (type) {
            case 'task': return <Phone className="w-4 h-4" />;
            case 'wait': return <Clock className="w-4 h-4" />;
            case 'end': return <Flag className="w-4 h-4" />;
            default: return null;
        }
    };

    const formatDuration = (minutes: number) => {
        if (minutes < 60) return `${minutes} min`;
        if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
        return `${Math.round(minutes / 1440)} dia(s)`;
    };

    const stageOptions = [
        { value: '', label: 'Não mover' },
        ...stages.map(s => ({ value: s.id, label: s.nome }))
    ];

    const motivoPerdaOptions = motivosPerda.map(m => ({ value: m.id, label: m.nome }));

    // Day options for day_pattern mode
    const dayOptions = template.day_pattern
        ? template.day_pattern.days.map(d => ({ value: String(d - 1), label: `Dia ${d}` }))
        : Array.from({ length: 14 }, (_, i) => ({ value: String(i), label: `Dia ${i + 1}` }));

    if (loading) {
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
                    <Button variant="ghost" size="sm" onClick={() => navigate('/settings/cadence')}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <div>
                        <h1 className="text-lg font-semibold text-slate-900">
                            {isNew ? 'Nova Cadência' : 'Editar Cadência'}
                        </h1>
                    </div>
                </div>
                <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-indigo-600 hover:bg-indigo-700"
                >
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? 'Salvando...' : 'Salvar'}
                </Button>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
                <div className="max-w-5xl mx-auto space-y-6">

                    {/* Configurações Gerais */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Settings className="w-5 h-5" />
                                Configurações Gerais
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Nome da Cadência *</Label>
                                    <Input
                                        value={template.name}
                                        onChange={(e) => setTemplate({ ...template, name: e.target.value })}
                                        placeholder="Ex: SDR - Prospecção Intensiva"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Público-alvo</Label>
                                    <CustomSelect
                                        value={template.target_audience}
                                        onChange={(value) => setTemplate({ ...template, target_audience: value })}
                                        options={audienceOptions}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Descrição</Label>
                                <Textarea
                                    value={template.description}
                                    onChange={(e) => setTemplate({ ...template, description: e.target.value })}
                                    placeholder="Descreva o objetivo desta cadência..."
                                    rows={2}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Modo de Agendamento</Label>
                                    <CustomSelect
                                        value={template.schedule_mode}
                                        onChange={(value) => setTemplate({
                                            ...template,
                                            schedule_mode: value as 'interval' | 'day_pattern'
                                        })}
                                        options={scheduleModeOptions}
                                    />
                                    <p className="text-xs text-slate-500">
                                        {template.schedule_mode === 'day_pattern'
                                            ? 'Defina em quais dias as tarefas serão criadas'
                                            : 'Defina intervalos de tempo entre cada step'}
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <Label>Duração máxima (dias)</Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={90}
                                        value={template.soft_break_after_days}
                                        onChange={(e) => setTemplate({ ...template, soft_break_after_days: parseInt(e.target.value) || 14 })}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                    <div>
                                        <Label>Horário Comercial</Label>
                                        <p className="text-xs text-slate-500">Respeitar 9h-18h, dias úteis</p>
                                    </div>
                                    <Switch
                                        checked={template.respect_business_hours}
                                        onCheckedChange={(checked) => setTemplate({ ...template, respect_business_hours: checked })}
                                    />
                                </div>

                                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                    <div>
                                        <Label>Cancelar ao mudar stage</Label>
                                        <p className="text-xs text-slate-500">Cancela se card avançar</p>
                                    </div>
                                    <Switch
                                        checked={template.auto_cancel_on_stage_change}
                                        onCheckedChange={(checked) => setTemplate({ ...template, auto_cancel_on_stage_change: checked })}
                                    />
                                </div>

                                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                    <div>
                                        <Label>Requer conclusão anterior</Label>
                                        <p className="text-xs text-slate-500">Próxima só após concluir</p>
                                    </div>
                                    <Switch
                                        checked={template.require_completion_for_next}
                                        onCheckedChange={(checked) => setTemplate({ ...template, require_completion_for_next: checked })}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Tabs: Steps, Agendamento, Visualizar */}
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsList className="bg-white border border-slate-200 p-1">
                            <TabsTrigger value="steps" className="gap-2">
                                <ListOrdered className="w-4 h-4" />
                                Steps ({steps.length})
                            </TabsTrigger>
                            {template.schedule_mode === 'day_pattern' && (
                                <TabsTrigger value="schedule" className="gap-2">
                                    <Calendar className="w-4 h-4" />
                                    Agendamento
                                </TabsTrigger>
                            )}
                            <TabsTrigger value="preview" className="gap-2">
                                <Eye className="w-4 h-4" />
                                Visualizar
                            </TabsTrigger>
                        </TabsList>

                        {/* Tab: Steps */}
                        <TabsContent value="steps">
                            <Card>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <CardTitle>Steps da Cadência</CardTitle>
                                            <CardDescription>
                                                {template.schedule_mode === 'day_pattern'
                                                    ? 'Adicione tarefas e associe aos dias do padrão'
                                                    : 'Adicione steps em sequência com intervalos de espera'}
                                            </CardDescription>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button variant="outline" size="sm" onClick={() => addStep('task')}>
                                                <Phone className="w-4 h-4 mr-1" /> Tarefa
                                            </Button>
                                            {template.schedule_mode === 'interval' && (
                                                <Button variant="outline" size="sm" onClick={() => addStep('wait')}>
                                                    <Clock className="w-4 h-4 mr-1" /> Espera
                                                </Button>
                                            )}
                                            <Button variant="outline" size="sm" onClick={() => addStep('end')}>
                                                <Flag className="w-4 h-4 mr-1" /> Fim
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    {steps.length === 0 ? (
                                        <div className="text-center py-8 text-slate-500">
                                            <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                                            <p>Nenhum step adicionado.</p>
                                            <p className="text-sm">Clique nos botões acima para adicionar steps à cadência.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {steps.map((step, index) => (
                                                <div key={step.id} className="border rounded-lg bg-white">
                                                    <div className="flex items-start gap-3 p-4">
                                                        <div className="flex flex-col gap-1">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => moveStep(index, 'up')}
                                                                disabled={index === 0}
                                                                className="h-6 w-6 p-0"
                                                            >
                                                                <ChevronUp className="w-4 h-4" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => moveStep(index, 'down')}
                                                                disabled={index === steps.length - 1}
                                                                className="h-6 w-6 p-0"
                                                            >
                                                                <ChevronDown className="w-4 h-4" />
                                                            </Button>
                                                        </div>

                                                        <div className="flex items-center gap-2 min-w-[100px]">
                                                            <Badge variant="outline" className="flex items-center gap-1">
                                                                {getStepIcon(step.step_type)}
                                                                {step.step_type === 'task' && 'Tarefa'}
                                                                {step.step_type === 'wait' && 'Espera'}
                                                                {step.step_type === 'end' && 'Fim'}
                                                            </Badge>
                                                        </div>

                                                        {/* Config por tipo */}
                                                        <div className="flex-1 space-y-3">
                                                            {/* Day selector for day_pattern mode */}
                                                            {template.schedule_mode === 'day_pattern' && step.step_type === 'task' && (
                                                                <div className="flex items-center gap-4">
                                                                    <div className="flex items-center gap-2">
                                                                        <Label className="text-xs">Dia:</Label>
                                                                        <CustomSelect
                                                                            value={step.day_offset !== null ? String(step.day_offset) : ''}
                                                                            onChange={(value) => updateStep(index, {
                                                                                day_offset: value ? parseInt(value) : null
                                                                            })}
                                                                            options={[
                                                                                { value: '', label: 'Selecionar dia...' },
                                                                                ...dayOptions
                                                                            ]}
                                                                        />
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <Switch
                                                                            checked={step.requires_previous_completed}
                                                                            onCheckedChange={(checked) => updateStep(index, {
                                                                                requires_previous_completed: checked
                                                                            })}
                                                                        />
                                                                        <span className="text-xs text-slate-600 flex items-center gap-1">
                                                                            <CheckCircle className="w-3 h-3" />
                                                                            Requer anterior
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Task config */}
                                                            {step.step_type === 'task' && (
                                                                <div className="space-y-3">
                                                                    <div className="grid grid-cols-3 gap-3">
                                                                        <div>
                                                                            <Label className="text-xs">Tipo</Label>
                                                                            <CustomSelect
                                                                                value={step.task_config?.tipo || 'contato'}
                                                                                onChange={(value) => updateStep(index, {
                                                                                    task_config: { ...step.task_config, tipo: value }
                                                                                })}
                                                                                options={taskTypeOptions}
                                                                            />
                                                                        </div>
                                                                        <div>
                                                                            <Label className="text-xs">Título</Label>
                                                                            <Input
                                                                                placeholder="Ex: 1ª Tentativa"
                                                                                value={step.task_config?.titulo || ''}
                                                                                onChange={(e) => updateStep(index, {
                                                                                    task_config: { ...step.task_config, titulo: e.target.value }
                                                                                })}
                                                                            />
                                                                        </div>
                                                                        <div>
                                                                            <Label className="text-xs">Prioridade</Label>
                                                                            <CustomSelect
                                                                                value={step.task_config?.prioridade || 'high'}
                                                                                onChange={(value) => updateStep(index, {
                                                                                    task_config: { ...step.task_config, prioridade: value }
                                                                                })}
                                                                                options={prioridadeOptions}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    <div className="grid grid-cols-3 gap-3">
                                                                        <div>
                                                                            <Label className="text-xs">Atribuir a</Label>
                                                                            <CustomSelect
                                                                                value={step.task_config?.assign_to || 'card_owner'}
                                                                                onChange={(value) => updateStep(index, {
                                                                                    task_config: {
                                                                                        ...step.task_config,
                                                                                        assign_to: value as 'card_owner' | 'specific',
                                                                                        assign_to_user_id: value === 'card_owner' ? null : step.task_config?.assign_to_user_id ?? null,
                                                                                    }
                                                                                })}
                                                                                options={assignToOptions}
                                                                            />
                                                                        </div>
                                                                        {step.task_config?.assign_to === 'specific' && (
                                                                            <div className="col-span-2">
                                                                                <Label className="text-xs">Pessoa</Label>
                                                                                <CustomSelect
                                                                                    value={step.task_config?.assign_to_user_id || ''}
                                                                                    onChange={(value) => updateStep(index, {
                                                                                        task_config: { ...step.task_config, assign_to_user_id: value || null }
                                                                                    })}
                                                                                    options={userOptions}
                                                                                />
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Wait config */}
                                                            {step.step_type === 'wait' && (
                                                                <div className="grid grid-cols-3 gap-3">
                                                                    <div className="flex items-center gap-2">
                                                                        <Input
                                                                            type="number"
                                                                            min={1}
                                                                            value={step.wait_config?.duration_minutes || 120}
                                                                            onChange={(e) => updateStep(index, {
                                                                                wait_config: { ...step.wait_config, duration_minutes: parseInt(e.target.value) || 60 }
                                                                            })}
                                                                            className="w-24"
                                                                        />
                                                                        <span className="text-sm text-slate-600">minutos</span>
                                                                    </div>
                                                                    <CustomSelect
                                                                        value={step.wait_config?.duration_type || 'business'}
                                                                        onChange={(value) => updateStep(index, {
                                                                            wait_config: { ...step.wait_config, duration_type: value as 'business' | 'calendar' }
                                                                        })}
                                                                        options={durationTypeOptions}
                                                                    />
                                                                    <div className="text-sm text-slate-500 flex items-center">
                                                                        ≈ {formatDuration(step.wait_config?.duration_minutes || 120)}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* End config */}
                                                            {step.step_type === 'end' && (
                                                                <div className="grid grid-cols-3 gap-3">
                                                                    <CustomSelect
                                                                        value={step.end_config?.result || 'success'}
                                                                        onChange={(value) => updateStep(index, {
                                                                            end_config: { ...step.end_config, result: value }
                                                                        })}
                                                                        options={resultOptions}
                                                                    />
                                                                    <CustomSelect
                                                                        value={step.end_config?.move_to_stage_id || ''}
                                                                        onChange={(value) => updateStep(index, {
                                                                            end_config: { ...step.end_config, move_to_stage_id: value }
                                                                        })}
                                                                        options={stageOptions}
                                                                    />
                                                                    {step.end_config?.result === 'ghosting' && motivoPerdaOptions.length > 0 && (
                                                                        <CustomSelect
                                                                            value={step.end_config?.motivo_perda_id || ''}
                                                                            onChange={(value) => updateStep(index, {
                                                                                end_config: { ...step.end_config, motivo_perda_id: value }
                                                                            })}
                                                                            options={[{ value: '', label: 'Motivo de perda...' }, ...motivoPerdaOptions]}
                                                                        />
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>

                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => removeStep(index)}
                                                            className="text-red-500 hover:text-red-700"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* Tab: Agendamento (Day Pattern) */}
                        {template.schedule_mode === 'day_pattern' && (
                            <TabsContent value="schedule">
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            <Calendar className="w-5 h-5" />
                                            Padrão de Dias
                                        </CardTitle>
                                        <CardDescription>
                                            Selecione em quais dias da cadência as tarefas serão executadas.
                                            Os dias não selecionados serão dias de pausa.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <DayPatternEditor
                                            pattern={template.day_pattern}
                                            onChange={(pattern) => setTemplate({ ...template, day_pattern: pattern })}
                                            maxDays={template.soft_break_after_days}
                                            stepsByDay={stepsByDay}
                                        />
                                    </CardContent>
                                </Card>
                            </TabsContent>
                        )}

                        {/* Tab: Visualizar */}
                        <TabsContent value="preview">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Eye className="w-5 h-5" />
                                        Preview da Cadência
                                    </CardTitle>
                                    <CardDescription>
                                        Visualize como a cadência se desenrolará ao longo do tempo.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <CadenceTimeline
                                        steps={steps}
                                        dayPattern={template.day_pattern}
                                        scheduleMode={template.schedule_mode}
                                        respectBusinessHours={template.respect_business_hours}
                                    />
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>
        </div>
    );
};

export default CadenceBuilderPage;
