import { Plus, Trash2, Phone, Mail, Users, FileText, Clipboard, Package, GripVertical, Zap, Clock, ChevronUp, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { NaturalDueField } from './NaturalDueField';
import type { DueOffset } from '../lib/dueOffsetCodec';

export interface BlockTask {
    id: string; // temp/persistent
    tipo: string;
    titulo: string;
    descricao?: string;
    prioridade: 'high' | 'medium' | 'low';
    assign_to: 'card_owner' | 'specific';
    assign_to_user_id: string | null;
    due_offset: DueOffset;
}

export interface Block {
    id: string;
    tasks: BlockTask[];
}

interface BlockEditorProps {
    block: Block;
    index: number;
    isFirst: boolean;
    userOptions: { value: string; label: string }[];
    onChange: (next: Block) => void;
    onRemove: () => void;
    onMoveUp?: () => void;
    onMoveDown?: () => void;
}

const taskTypeOptions = [
    { value: 'contato', label: 'Contato' },
    { value: 'email', label: 'E-mail' },
    { value: 'reuniao', label: 'Reunião' },
    { value: 'enviar_proposta', label: 'Proposta' },
    { value: 'coleta_documentos', label: 'Coleta Docs' },
    { value: 'solicitacao_mudanca', label: 'Mudança' },
    { value: 'tarefa', label: 'Tarefa' },
];

const prioridadeOptions = [
    { value: 'high', label: 'Alta' },
    { value: 'medium', label: 'Média' },
    { value: 'low', label: 'Baixa' },
];

const assignOptions = [
    { value: 'card_owner', label: 'Responsável do card' },
    { value: 'specific', label: 'Pessoa específica' },
];

function getTaskIcon(tipo: string) {
    switch (tipo) {
        case 'contato': return <Phone className="w-4 h-4 text-indigo-600" />;
        case 'email': return <Mail className="w-4 h-4 text-indigo-600" />;
        case 'reuniao': return <Users className="w-4 h-4 text-indigo-600" />;
        case 'enviar_proposta': return <FileText className="w-4 h-4 text-indigo-600" />;
        case 'coleta_documentos': return <Clipboard className="w-4 h-4 text-indigo-600" />;
        default: return <Package className="w-4 h-4 text-indigo-600" />;
    }
}

/**
 * Editor de um bloco paralelo. Todas as tarefas dentro do bloco são criadas
 * de uma vez quando o bloco anterior é concluído. O bloco N+1 só inicia quando
 * TODAS as tarefas deste bloco estão concluídas.
 */
export function BlockEditor({
    block,
    index,
    isFirst,
    userOptions,
    onChange,
    onRemove,
    onMoveUp,
    onMoveDown,
}: BlockEditorProps) {
    const updateTask = (taskId: string, updates: Partial<BlockTask>) => {
        onChange({
            ...block,
            tasks: block.tasks.map(t => (t.id === taskId ? { ...t, ...updates } : t)),
        });
    };

    const addTask = () => {
        onChange({
            ...block,
            tasks: [
                ...block.tasks,
                {
                    id: `temp_${Date.now()}_${Math.random()}`,
                    tipo: 'contato',
                    titulo: '',
                    prioridade: 'high',
                    assign_to: 'card_owner',
                    assign_to_user_id: null,
                    due_offset: {
                        unit: 'business_days',
                        value: 1,
                        anchor: isFirst ? 'cadence_start' : 'previous_block_completed',
                    },
                },
            ],
        });
    };

    const removeTask = (taskId: string) => {
        onChange({ ...block, tasks: block.tasks.filter(t => t.id !== taskId) });
    };

    return (
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
            <header className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-3">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-semibold">
                        {index + 1}
                    </span>
                    <div>
                        <h3 className="text-sm font-semibold text-slate-900">
                            Bloco {index + 1}
                        </h3>
                    </div>
                    <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-md px-2 py-0.5">
                        <Zap className="w-3 h-3" />
                        <span className="text-xs font-medium">
                            {isFirst
                                ? 'Tarefas criadas imediatamente ao disparar'
                                : `Tarefas criadas quando o Bloco ${index} for concluído`}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onMoveUp}
                        disabled={!onMoveUp}
                        className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                        title="Mover para cima"
                    >
                        <ChevronUp className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onMoveDown}
                        disabled={!onMoveDown}
                        className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                        title="Mover para baixo"
                    >
                        <ChevronDown className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onRemove}
                        className="text-slate-400 hover:text-red-600"
                        title="Remover bloco"
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </div>
            </header>

            <div className="divide-y divide-slate-100">
                {block.tasks.length === 0 && (
                    <div className="px-4 py-6 text-center text-xs text-slate-400">
                        Nenhuma tarefa neste bloco. Adicione ao menos uma.
                    </div>
                )}
                {block.tasks.map((task) => (
                    <div key={task.id} className="px-4 py-3 flex gap-3 items-start">
                        <GripVertical className="w-4 h-4 text-slate-300 mt-2 flex-shrink-0" />
                        <div className="flex-shrink-0 mt-2">{getTaskIcon(task.tipo)}</div>
                        <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex gap-2">
                                <Input
                                    value={task.titulo}
                                    onChange={(e) => updateTask(task.id, { titulo: e.target.value })}
                                    placeholder="Título da tarefa…"
                                    className="h-8 text-sm flex-1"
                                />
                                <Select
                                    value={task.tipo}
                                    onChange={(v) => updateTask(task.id, { tipo: v })}
                                    options={taskTypeOptions}
                                    className="w-40"
                                />
                            </div>
                            <div className="flex gap-4 items-start flex-wrap bg-slate-50 rounded-lg px-3 py-2 -mx-1">
                                <div className="flex items-center gap-1.5 text-xs text-slate-500 pt-1 flex-shrink-0">
                                    <Zap className="w-3 h-3 text-amber-500" />
                                    <span>Criação:</span>
                                    <span className="font-medium text-slate-700">
                                        {isFirst ? 'Imediata' : `Após Bloco ${index}`}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <Clock className="w-3 h-3 text-indigo-500 flex-shrink-0" />
                                    <span className="text-xs text-slate-500">Concluir em:</span>
                                    <NaturalDueField
                                        value={task.due_offset}
                                        onChange={(v) => updateTask(task.id, { due_offset: v })}
                                        allowPreviousBlockAnchor={!isFirst}
                                    />
                                </div>
                            </div>
                            <div className="flex gap-2 items-center flex-wrap">
                                <span className="text-xs text-slate-500">Para:</span>
                                <Select
                                    value={task.assign_to}
                                    onChange={(v) =>
                                        updateTask(task.id, {
                                            assign_to: v as BlockTask['assign_to'],
                                            assign_to_user_id:
                                                v === 'card_owner' ? null : task.assign_to_user_id,
                                        })
                                    }
                                    options={assignOptions}
                                    className="w-56"
                                />
                                {task.assign_to === 'specific' && (
                                    <Select
                                        value={task.assign_to_user_id || ''}
                                        onChange={(v) =>
                                            updateTask(task.id, { assign_to_user_id: v || null })
                                        }
                                        options={userOptions}
                                        className="w-56"
                                    />
                                )}
                                <div className="flex-1" />
                                <Select
                                    value={task.prioridade}
                                    onChange={(v) =>
                                        updateTask(task.id, { prioridade: v as BlockTask['prioridade'] })
                                    }
                                    options={prioridadeOptions}
                                    className="w-28"
                                />
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeTask(task.id)}
                            className="text-slate-400 hover:text-red-600 flex-shrink-0"
                            title="Remover tarefa"
                        >
                            <Trash2 className="w-4 h-4" />
                        </Button>
                    </div>
                ))}
            </div>

            <footer className="px-4 py-2 border-t border-slate-100 bg-slate-50/50">
                <Button variant="ghost" size="sm" onClick={addTask} className="text-indigo-600">
                    <Plus className="w-4 h-4 mr-1" />
                    Adicionar tarefa a este bloco
                </Button>
            </footer>
        </div>
    );
}
