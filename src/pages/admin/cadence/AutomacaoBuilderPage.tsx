import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Plus, Zap, AlertCircle } from 'lucide-react';
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

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (supabase as any).from('cadence_steps').delete().eq('template_id', id);
            }

            // Inserir steps gerados a partir dos blocks
            const stepsToInsert: Record<string, unknown>[] = [];
            let orderCounter = 1;
            blocks.forEach((block, blockIdx) => {
                block.tasks.forEach((task) => {
                    const currentOrder = orderCounter++;
                    const legacy = encodeNaturalDue(task.due_offset);
                    stepsToInsert.push({
                        template_id: templateId,
                        step_order: currentOrder,
                        step_key: `b${blockIdx}_t${currentOrder}`,
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
                        wait_for_outcome: true,
                        next_step_key: null,
                    });
                });
            });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error: stepsErr } = await (supabase as any)
                .from('cadence_steps')
                .insert(stepsToInsert);
            if (stepsErr) throw stepsErr;

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
                                    <div className="flex items-center gap-2 py-2 px-4 text-xs text-slate-400">
                                        <div className="flex-1 border-t border-dashed border-slate-300" />
                                        <span>aguarda conclusão do bloco acima</span>
                                        <div className="flex-1 border-t border-dashed border-slate-300" />
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
                                            <div className="text-slate-900">
                                                {block.tasks.length}{' '}
                                                {block.tasks.length === 1 ? 'tarefa' : 'tarefas'}
                                            </div>
                                            {block.tasks.map((t) => (
                                                <div key={t.id} className="text-xs text-slate-500 ml-0">
                                                    • {t.titulo || '(sem título)'} —{' '}
                                                    {formatDueOffset(t.due_offset)}
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
