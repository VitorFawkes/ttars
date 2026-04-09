import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Plus, Zap, AlertCircle, BarChart3, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select } from '@/components/ui/Select';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useUsers } from '@/hooks/useUsers';
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta';
import { usePipelineStages } from '@/hooks/usePipelineStages';
import { BlockEditor, type Block, type BlockTask } from './components/BlockEditor';
import {
    encodeNaturalDue,
    decodeNaturalDue,
    formatDueOffset,
} from './lib/dueOffsetCodec';

type EventType = 'card_created' | 'stage_enter';

interface AutomationForm {
    name: string;
    description: string;
    is_active: boolean;
    event_type: EventType;
    stage_ids: string[];
    respect_business_hours: boolean;
}

const eventOptions: { value: EventType; label: string }[] = [
    { value: 'stage_enter', label: 'Card movido para uma etapa' },
    { value: 'card_created', label: 'Card criado' },
];

/**
 * Nova página unificada de Automações. Substitui conceitualmente o
 * CadenceBuilderPage + CadenceEntryRulesTab: uma Automação = gatilho + blocos
 * de tarefas encadeados. Salva como cadence_template (execution_mode='blocks')
 * + cadence_event_trigger (action_type='start_cadence').
 */
export default function AutomacaoBuilderPage() {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const isNew = !id || id === 'new';
    const { users } = useUsers();
    const { pipelineId } = useCurrentProductMeta();

    const [form, setForm] = useState<AutomationForm>({
        name: '',
        description: '',
        is_active: false,
        event_type: 'stage_enter',
        stage_ids: [],
        respect_business_hours: true,
    });
    const [blocks, setBlocks] = useState<Block[]>([
        {
            id: `block_${Date.now()}`,
            tasks: [],
        },
    ]);
    const { data: allStages } = usePipelineStages();
    const [triggerId, setTriggerId] = useState<string | null>(null);
    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);

    // Stats
    interface BlockStats {
        blockIndex: number;
        waiting: number;
        completed: number;
        total: number;
    }
    interface AutomationStats {
        totalActivations: number;
        activeInstances: number;
        completedInstances: number;
        cancelledInstances: number;
        perBlock: BlockStats[];
    }
    const [stats, setStats] = useState<AutomationStats | null>(null);

    const userOptions = useMemo(() => {
        const list = (users || [])
            .filter(u => u.active)
            .map(u => ({ value: u.id, label: u.nome || u.email }));
        return [{ value: '', label: 'Selecionar pessoa…' }, ...list];
    }, [users]);

    const stageOptions = useMemo(
        () => (allStages || []).map(s => ({ value: s.id, label: s.nome })),
        [allStages]
    );

    // Carregar automação existente
    useEffect(() => {
        if (isNew) return;
        (async () => {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { data: tpl, error: tplErr } = await (supabase as any)
                    .from('cadence_templates')
                    .select('*')
                    .eq('id', id)
                    .single();
                if (tplErr) throw tplErr;

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { data: stepsData } = await (supabase as any)
                    .from('cadence_steps')
                    .select('*')
                    .eq('template_id', id)
                    .order('block_index', { ascending: true })
                    .order('step_order', { ascending: true });

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { data: triggerRow } = await (supabase as any)
                    .from('cadence_event_triggers')
                    .select('*')
                    .eq('target_template_id', id)
                    .eq('action_type', 'start_cadence')
                    .maybeSingle();

                setForm({
                    name: tpl.name || '',
                    description: tpl.description || '',
                    is_active: !!tpl.is_active,
                    event_type: (triggerRow?.event_type as EventType) || 'stage_enter',
                    stage_ids: triggerRow?.applicable_stage_ids || [],
                    respect_business_hours: tpl.respect_business_hours ?? true,
                });
                setTriggerId(triggerRow?.id || null);

                // Agrupar steps por block_index em blocks[]
                const byBlock = new Map<number, BlockTask[]>();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (stepsData || []).forEach((s: any) => {
                    if (s.step_type !== 'task') return;
                    const bi = s.block_index ?? 0;
                    const arr = byBlock.get(bi) || [];
                    const cfg = s.task_config || {};
                    arr.push({
                        id: s.id,
                        tipo: cfg.tipo || 'contato',
                        titulo: cfg.titulo || '',
                        descricao: cfg.descricao || '',
                        prioridade: cfg.prioridade || 'high',
                        assign_to: cfg.assign_to || 'card_owner',
                        assign_to_user_id: cfg.assign_to_user_id || null,
                        due_offset: s.due_offset || decodeNaturalDue({
                            day_offset: s.day_offset,
                            wait_config: s.wait_config,
                            requires_previous_completed: s.requires_previous_completed,
                        }),
                    });
                    byBlock.set(bi, arr);
                });
                const loadedBlocks: Block[] = Array.from(byBlock.entries())
                    .sort(([a], [b]) => a - b)
                    .map(([bi, tasks]) => ({ id: `block_${bi}`, tasks }));
                setBlocks(loadedBlocks.length > 0 ? loadedBlocks : [{ id: `block_${Date.now()}`, tasks: [] }]);
            } catch (err) {
                console.error(err);
                toast.error('Erro ao carregar automação.');
                navigate('/settings/cadence');
            } finally {
                setLoading(false);
            }
        })();
    }, [id, isNew, navigate]);

    // Carregar stats para automação existente
    useEffect(() => {
        if (isNew || !id) return;
        (async () => {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { data: instances } = await (supabase as any)
                    .from('cadence_instances')
                    .select('id, status, current_step_id')
                    .eq('template_id', id);

                if (!instances || instances.length === 0) {
                    setStats({ totalActivations: 0, activeInstances: 0, completedInstances: 0, cancelledInstances: 0, perBlock: [] });
                    return;
                }

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { data: steps } = await (supabase as any)
                    .from('cadence_steps')
                    .select('id, block_index')
                    .eq('template_id', id);

                const stepToBlock = new Map<string, number>();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (steps || []).forEach((s: any) => stepToBlock.set(s.id, s.block_index ?? 0));

                const blockIndices = [...new Set(stepToBlock.values())].sort((a, b) => a - b);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const perBlock: BlockStats[] = blockIndices.map((bi: number) => {
                    const stepsInBlock = new Set(
                        [...stepToBlock.entries()].filter(([, b]) => b === bi).map(([sid]) => sid)
                    );
                    let waiting = 0;
                    let completed = 0;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    instances.forEach((inst: any) => {
                        const instBlock = stepToBlock.get(inst.current_step_id) ?? -1;
                        if (inst.status === 'completed') {
                            completed++;
                        } else if (inst.status === 'cancelled') {
                            // não conta
                        } else if (stepsInBlock.has(inst.current_step_id)) {
                            waiting++;
                        } else if (instBlock > bi) {
                            completed++;
                        }
                    });
                    return { blockIndex: bi, waiting, completed, total: waiting + completed };
                });

                setStats({
                    totalActivations: instances.length,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    activeInstances: instances.filter((i: any) => i.status === 'waiting_task' || i.status === 'active').length,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    completedInstances: instances.filter((i: any) => i.status === 'completed').length,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    cancelledInstances: instances.filter((i: any) => i.status === 'cancelled').length,
                    perBlock,
                });
            } catch (err) {
                console.error('Failed to load stats', err);
            }
        })();
    }, [id, isNew]);

    const addBlock = () => {
        setBlocks([...blocks, { id: `block_${Date.now()}`, tasks: [] }]);
    };

    const updateBlock = (idx: number, next: Block) => {
        setBlocks(blocks.map((b, i) => (i === idx ? next : b)));
    };

    const removeBlock = (idx: number) => {
        if (blocks.length === 1) {
            toast.error('A automação precisa ter pelo menos um bloco.');
            return;
        }
        setBlocks(blocks.filter((_, i) => i !== idx));
    };

    // Validação e save
    const validationError = useMemo(() => {
        if (!form.name.trim()) return 'Dê um nome para a automação.';
        if (form.event_type === 'stage_enter' && form.stage_ids.length === 0) {
            return 'Selecione ao menos uma etapa para o gatilho.';
        }
        const totalTasks = blocks.reduce((acc, b) => acc + b.tasks.length, 0);
        if (totalTasks === 0) return 'Adicione ao menos uma tarefa.';
        for (let i = 0; i < blocks.length; i++) {
            const b = blocks[i];
            if (b.tasks.length === 0) return `Bloco ${i + 1} está vazio.`;
            for (const t of b.tasks) {
                if (!t.titulo.trim()) return `Há tarefa sem título no Bloco ${i + 1}.`;
                if (t.assign_to === 'specific' && !t.assign_to_user_id) {
                    return `Selecione a pessoa responsável no Bloco ${i + 1}.`;
                }
            }
        }
        return null;
    }, [form, blocks]);

    const totalTasks = blocks.reduce((acc, b) => acc + b.tasks.length, 0);

    const handleSave = async () => {
        if (validationError) {
            toast.error(validationError);
            return;
        }

        try {
            setSaving(true);

            const templatePayload = {
                name: form.name,
                description: form.description || null,
                is_active: form.is_active,
                execution_mode: 'blocks',
                schedule_mode: 'interval', // placeholder — engine ignora no modo blocks
                respect_business_hours: form.respect_business_hours,
                target_audience: 'posvenda', // default; UI avançada virá depois
            };

            let templateId = id as string | undefined;

            if (isNew) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { data: created, error: createErr } = await (supabase as any)
                    .from('cadence_templates')
                    .insert(templatePayload)
                    .select()
                    .single();
                if (createErr) throw createErr;
                templateId = created.id;
            } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { error: updErr } = await (supabase as any)
                    .from('cadence_templates')
                    .update(templatePayload)
                    .eq('id', id);
                if (updErr) throw updErr;
            }

            // Montar steps a partir dos blocks
            const stepsPayload: Record<string, unknown>[] = [];
            let orderCounter = 1;
            blocks.forEach((block, blockIdx) => {
                block.tasks.forEach((task) => {
                    const currentOrder = orderCounter++;
                    const legacy = encodeNaturalDue(task.due_offset);
                    const stepKey = `b${blockIdx}_t${currentOrder}`;
                    const base: Record<string, unknown> = {
                        template_id: templateId,
                        step_order: currentOrder,
                        step_key: stepKey,
                        step_type: 'task',
                        block_index: blockIdx,
                        day_offset: legacy.day_offset,
                        wait_config: legacy.wait_config,
                        requires_previous_completed: legacy.requires_previous_completed,
                        due_offset: task.due_offset,
                        task_config: {
                            tipo: task.tipo,
                            titulo: task.titulo,
                            descricao: task.descricao || '',
                            prioridade: task.prioridade,
                            assign_to: task.assign_to,
                            assign_to_user_id: task.assign_to_user_id,
                            wait_for_outcome: true,
                        },
                        next_step_key: null,
                    };
                    // Se é step existente (id persistido do DB), incluir id para upsert
                    if (task.id && !task.id.startsWith('temp_')) {
                        base.id = task.id;
                    }
                    stepsPayload.push(base);
                });
            });

            if (!isNew) {
                // Upsert: atualizar existentes, inserir novos
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { error: upsertErr } = await (supabase as any)
                    .from('cadence_steps')
                    .upsert(stepsPayload, { onConflict: 'id' });
                if (upsertErr) throw upsertErr;

                // Remover steps órfãos (que não estão mais na lista) — apenas os que não são referenciados
                const keepIds = stepsPayload.map(s => s.id).filter(Boolean) as string[];
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { data: allOldSteps } = await (supabase as any)
                    .from('cadence_steps')
                    .select('id')
                    .eq('template_id', templateId);
                const orphanIds = (allOldSteps || [])
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .map((s: any) => s.id)
                    .filter((sid: string) => !keepIds.includes(sid) && !stepsPayload.some(sp => !sp.id && sp.step_key === sid));
                if (orphanIds.length > 0) {
                    // Tentar deletar — pode falhar silenciosamente se FK impede
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    await (supabase as any)
                        .from('cadence_steps')
                        .delete()
                        .in('id', orphanIds);
                }
            } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { error: stepsErr } = await (supabase as any)
                    .from('cadence_steps')
                    .insert(stepsPayload);
                if (stepsErr) throw stepsErr;
            }

            // Gravar trigger (start_cadence)
            const triggerPayload = {
                name: form.name,
                event_type: form.event_type,
                applicable_stage_ids: form.event_type === 'stage_enter' ? form.stage_ids : null,
                applicable_pipeline_ids: pipelineId ? [pipelineId] : null,
                action_type: 'start_cadence',
                target_template_id: templateId,
                is_active: form.is_active,
                delay_minutes: 0,
                delay_type: 'business',
            };

            if (triggerId) {
                /* eslint-disable @typescript-eslint/no-explicit-any -- cadence tables not in generated types */
                const { error: trigErr } = await (supabase as any)
                    .from('cadence_event_triggers')
                    .update(triggerPayload)
                    .eq('id', triggerId);
                /* eslint-enable @typescript-eslint/no-explicit-any */
                if (trigErr) throw trigErr;
            } else {
                /* eslint-disable @typescript-eslint/no-explicit-any -- cadence tables not in generated types */
                const { error: trigErr } = await (supabase as any)
                    .from('cadence_event_triggers')
                    .insert(triggerPayload);
                /* eslint-enable @typescript-eslint/no-explicit-any */
                if (trigErr) throw trigErr;
            }

            toast.success('Automação salva!');
            navigate('/settings/cadence');
        } catch (err) {
            console.error(err);
            toast.error('Erro ao salvar automação.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center text-slate-500">
                Carregando…
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-slate-50">
            {/* Header */}
            <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="sm" onClick={() => navigate('/settings/cadence')}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <div>
                        <h1 className="text-lg font-semibold text-slate-900 tracking-tight">
                            {isNew ? 'Nova Automação' : 'Editar Automação'}
                        </h1>
                        <p className="text-xs text-slate-500">
                            {totalTasks} {totalTasks === 1 ? 'tarefa' : 'tarefas'} em {blocks.length}{' '}
                            {blocks.length === 1 ? 'bloco' : 'blocos'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <Switch
                            checked={form.is_active}
                            onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                        />
                        <span className="text-xs text-slate-600">
                            {form.is_active ? 'Ativa' : 'Inativa'}
                        </span>
                    </div>
                    <Button
                        onClick={handleSave}
                        disabled={saving}
                        className="bg-indigo-600 hover:bg-indigo-700"
                    >
                        <Save className="w-4 h-4 mr-2" />
                        {saving ? 'Salvando…' : 'Salvar'}
                    </Button>
                </div>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-auto">
                <div className="max-w-4xl mx-auto p-6 space-y-6">
                    {/* Nome + descrição */}
                    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 space-y-3">
                        <div>
                            <Label>Nome da Automação</Label>
                            <Input
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                placeholder="Ex: Onboarding pós-venda"
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label>Descrição (opcional)</Label>
                            <Textarea
                                value={form.description}
                                onChange={(e) => setForm({ ...form, description: e.target.value })}
                                placeholder="O que esta automação faz e por quê…"
                                rows={2}
                                className="mt-1"
                            />
                        </div>
                    </div>

                    {/* Stats — só para automações existentes */}
                    {!isNew && stats && stats.totalActivations > 0 && (
                        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 space-y-4">
                            <div className="flex items-center gap-2">
                                <BarChart3 className="w-4 h-4 text-indigo-600" />
                                <h2 className="text-sm font-semibold text-slate-900">Desempenho</h2>
                            </div>
                            <div className="grid grid-cols-4 gap-3">
                                <div className="bg-slate-50 rounded-lg p-3 text-center">
                                    <div className="text-2xl font-bold text-slate-900">{stats.totalActivations}</div>
                                    <div className="text-xs text-slate-500 mt-0.5">Total ativações</div>
                                </div>
                                <div className="bg-blue-50 rounded-lg p-3 text-center">
                                    <div className="text-2xl font-bold text-blue-700 flex items-center justify-center gap-1">
                                        <Clock className="w-4 h-4" />
                                        {stats.activeInstances}
                                    </div>
                                    <div className="text-xs text-blue-600 mt-0.5">Em andamento</div>
                                </div>
                                <div className="bg-emerald-50 rounded-lg p-3 text-center">
                                    <div className="text-2xl font-bold text-emerald-700 flex items-center justify-center gap-1">
                                        <CheckCircle2 className="w-4 h-4" />
                                        {stats.completedInstances}
                                    </div>
                                    <div className="text-xs text-emerald-600 mt-0.5">Concluídas</div>
                                </div>
                                <div className="bg-red-50 rounded-lg p-3 text-center">
                                    <div className="text-2xl font-bold text-red-700 flex items-center justify-center gap-1">
                                        <XCircle className="w-4 h-4" />
                                        {stats.cancelledInstances}
                                    </div>
                                    <div className="text-xs text-red-600 mt-0.5">Canceladas</div>
                                </div>
                            </div>
                            {stats.perBlock.length > 0 && (
                                <div className="space-y-2">
                                    <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider">Por bloco</h3>
                                    {stats.perBlock.map((pb) => {
                                        const pct = stats.totalActivations > 0
                                            ? Math.round(((pb.completed) / (stats.totalActivations - stats.cancelledInstances)) * 100)
                                            : 0;
                                        return (
                                            <div key={pb.blockIndex} className="flex items-center gap-3">
                                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-semibold flex-shrink-0">
                                                    {pb.blockIndex + 1}
                                                </span>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 text-xs text-slate-600 mb-1">
                                                        <span>{pb.waiting} aguardando</span>
                                                        <span className="text-slate-300">|</span>
                                                        <span className="text-emerald-600">{pb.completed} concluíram</span>
                                                        <span className="text-slate-300">|</span>
                                                        <span className="font-medium">{isFinite(pct) ? pct : 0}% taxa de conclusão</span>
                                                    </div>
                                                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-indigo-600 rounded-full transition-all"
                                                            style={{ width: `${isFinite(pct) ? pct : 0}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Gatilho */}
                    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 space-y-3">
                        <div className="flex items-center gap-2">
                            <Zap className="w-4 h-4 text-indigo-600" />
                            <h2 className="text-sm font-semibold text-slate-900">Quando isso acontecer</h2>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label className="text-xs">Evento</Label>
                                <Select
                                    value={form.event_type}
                                    onChange={(v) =>
                                        setForm({ ...form, event_type: v as EventType })
                                    }
                                    options={eventOptions}
                                />
                            </div>
                            {form.event_type === 'stage_enter' && (
                                <div>
                                    <Label className="text-xs">
                                        Etapa de destino {form.stage_ids.length > 0 && `(${form.stage_ids.length})`}
                                    </Label>
                                    <Select
                                        value={form.stage_ids[0] || ''}
                                        onChange={(v) =>
                                            setForm({ ...form, stage_ids: v ? [v] : [] })
                                        }
                                        options={[{ value: '', label: 'Selecionar…' }, ...stageOptions]}
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Blocks */}
                    <div className="space-y-3">
                        <h2 className="text-sm font-semibold text-slate-900 px-1">Blocos de tarefas</h2>
                        {blocks.map((block, idx) => (
                            <div key={block.id}>
                                <BlockEditor
                                    block={block}
                                    index={idx}
                                    isFirst={idx === 0}
                                    userOptions={userOptions}
                                    onChange={(next) => updateBlock(idx, next)}
                                    onRemove={() => removeBlock(idx)}
                                />
                                {idx < blocks.length - 1 && (
                                    <div className="flex items-center gap-2 py-3 px-4 text-xs text-amber-600">
                                        <div className="flex-1 border-t border-dashed border-amber-300" />
                                        <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
                                            <Clock className="w-3 h-3" />
                                            <span className="font-medium">Aguarda todas as tarefas acima serem concluídas</span>
                                        </div>
                                        <div className="flex-1 border-t border-dashed border-amber-300" />
                                    </div>
                                )}
                            </div>
                        ))}
                        <Button variant="outline" onClick={addBlock} className="w-full">
                            <Plus className="w-4 h-4 mr-2" />
                            Adicionar bloco que aguarda a conclusão do anterior
                        </Button>
                    </div>

                    {/* Resumo */}
                    {totalTasks > 0 && (
                        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5">
                            <h2 className="text-sm font-semibold text-slate-900 mb-3">Resumo</h2>
                            <ol className="space-y-2 text-sm">
                                {blocks.map((block, idx) => (
                                    <li key={block.id} className="flex gap-2">
                                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold flex-shrink-0">
                                            {idx + 1}
                                        </span>
                                        <div className="flex-1">
                                            <div className="text-slate-900 text-sm">
                                                {block.tasks.length}{' '}
                                                {block.tasks.length === 1 ? 'tarefa' : 'tarefas'}
                                                <span className="text-xs text-amber-600 ml-2 font-normal">
                                                    {idx === 0
                                                        ? '(criadas imediatamente)'
                                                        : `(criadas quando Bloco ${idx} concluir)`}
                                                </span>
                                            </div>
                                            {block.tasks.map((t) => (
                                                <div key={t.id} className="text-xs text-slate-500 ml-0">
                                                    • {t.titulo || '(sem título)'} — concluir{' '}
                                                    {formatDueOffset(t.due_offset).toLowerCase()}
                                                </div>
                                            ))}
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    )}

                    {validationError && (
                        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {validationError}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
