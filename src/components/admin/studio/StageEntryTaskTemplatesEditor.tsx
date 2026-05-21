import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface StageEntryTaskTemplate {
    id: string;
    stage_id: string;
    org_id: string;
    titulo: string;
    descricao: string | null;
    tipo: string;
    prioridade: string;
    dias_vencimento: number;
    ordem: number;
    ativo: boolean;
}

interface Props {
    stageId: string;
}

const TIPOS = [
    { value: 'tarefa', label: 'Tarefa' },
    { value: 'ligacao', label: 'Ligação' },
    { value: 'reuniao', label: 'Reunião' },
    { value: 'email', label: 'E-mail' },
    { value: 'whatsapp', label: 'WhatsApp' },
    { value: 'outro', label: 'Outro' },
];

const PRIORIDADES = [
    { value: 'baixa', label: 'Baixa' },
    { value: 'media', label: 'Média' },
    { value: 'alta', label: 'Alta' },
    { value: 'urgente', label: 'Urgente' },
];

export default function StageEntryTaskTemplatesEditor({ stageId }: Props) {
    const queryClient = useQueryClient();
    const [draft, setDraft] = useState<Partial<StageEntryTaskTemplate> | null>(null);

    const { data: templates, isLoading } = useQuery({
        queryKey: ['stage-entry-task-templates', stageId],
        queryFn: async () => {
            const { data, error } = await supabase
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabela nova, types não regenerados
                .from('stage_entry_task_templates' as any)
                .select('*')
                .eq('stage_id', stageId)
                .order('ordem', { ascending: true });
            if (error) throw error;
            return (data ?? []) as unknown as StageEntryTaskTemplate[];
        },
        enabled: !!stageId,
    });

    const upsertMutation = useMutation({
        mutationFn: async (payload: Partial<StageEntryTaskTemplate>) => {
            if (payload.id) {
                const { error } = await supabase
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .from('stage_entry_task_templates' as any)
                    .update({
                        titulo: payload.titulo,
                        descricao: payload.descricao,
                        tipo: payload.tipo,
                        prioridade: payload.prioridade,
                        dias_vencimento: payload.dias_vencimento,
                        ordem: payload.ordem,
                        ativo: payload.ativo,
                    })
                    .eq('id', payload.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .from('stage_entry_task_templates' as any)
                    .insert({
                        stage_id: stageId,
                        titulo: payload.titulo,
                        descricao: payload.descricao || null,
                        tipo: payload.tipo || 'tarefa',
                        prioridade: payload.prioridade || 'media',
                        dias_vencimento: payload.dias_vencimento ?? 1,
                        ordem: payload.ordem ?? (templates?.length ?? 0),
                        ativo: true,
                    });
                if (error) throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['stage-entry-task-templates', stageId] });
            setDraft(null);
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .from('stage_entry_task_templates' as any)
                .delete()
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['stage-entry-task-templates', stageId] });
        },
    });

    const toggleAtivoMutation = useMutation({
        mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
            const { error } = await supabase
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .from('stage_entry_task_templates' as any)
                .update({ ativo })
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['stage-entry-task-templates', stageId] });
        },
    });

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 text-sm text-slate-500 p-3">
                <Loader2 className="w-4 h-4 animate-spin" />
                Carregando templates...
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {(templates ?? []).map(t => (
                <div
                    key={t.id}
                    className={cn(
                        'flex items-start gap-2 p-3 rounded-lg border',
                        t.ativo ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-60'
                    )}
                >
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-900 truncate">{t.titulo}</span>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 flex-shrink-0">
                                {TIPOS.find(x => x.value === t.tipo)?.label ?? t.tipo}
                            </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                            Vence em {t.dias_vencimento}d · {PRIORIDADES.find(x => x.value === t.prioridade)?.label ?? t.prioridade}
                            {t.descricao && ` · ${t.descricao}`}
                        </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                            type="button"
                            onClick={() => toggleAtivoMutation.mutate({ id: t.id, ativo: !t.ativo })}
                            className={cn(
                                'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                                t.ativo ? 'bg-indigo-600' : 'bg-slate-300'
                            )}
                            title={t.ativo ? 'Desativar' : 'Ativar'}
                        >
                            <span
                                className={cn(
                                    'inline-block h-3 w-3 transform rounded-full bg-white transition-transform',
                                    t.ativo ? 'translate-x-5' : 'translate-x-1'
                                )}
                            />
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                if (confirm(`Remover template "${t.titulo}"?`)) {
                                    deleteMutation.mutate(t.id);
                                }
                            }}
                            className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                            title="Remover"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            ))}

            {draft ? (
                <div className="p-3 border border-indigo-200 rounded-lg bg-indigo-50/40 space-y-2">
                    <input
                        type="text"
                        autoFocus
                        placeholder="Título da tarefa (ex: Confirmar dados de embarque)"
                        value={draft.titulo ?? ''}
                        onChange={e => setDraft({ ...draft, titulo: e.target.value })}
                        className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <input
                        type="text"
                        placeholder="Descrição (opcional)"
                        value={draft.descricao ?? ''}
                        onChange={e => setDraft({ ...draft, descricao: e.target.value })}
                        className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <div className="grid grid-cols-3 gap-2">
                        <select
                            value={draft.tipo ?? 'tarefa'}
                            onChange={e => setDraft({ ...draft, tipo: e.target.value })}
                            className="px-2 py-1.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                            {TIPOS.map(t => (
                                <option key={t.value} value={t.value}>
                                    {t.label}
                                </option>
                            ))}
                        </select>
                        <select
                            value={draft.prioridade ?? 'media'}
                            onChange={e => setDraft({ ...draft, prioridade: e.target.value })}
                            className="px-2 py-1.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                            {PRIORIDADES.map(p => (
                                <option key={p.value} value={p.value}>
                                    {p.label}
                                </option>
                            ))}
                        </select>
                        <div className="flex items-center gap-1">
                            <input
                                type="number"
                                min={0}
                                max={365}
                                value={draft.dias_vencimento ?? 1}
                                onChange={e =>
                                    setDraft({ ...draft, dias_vencimento: Math.max(0, parseInt(e.target.value || '0', 10)) })
                                }
                                className="w-16 px-2 py-1.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                            <span className="text-xs text-slate-500">dias</span>
                        </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                        <button
                            type="button"
                            onClick={() => setDraft(null)}
                            className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            disabled={!draft.titulo?.trim() || upsertMutation.isPending}
                            onClick={() => upsertMutation.mutate(draft)}
                            className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {upsertMutation.isPending ? 'Salvando...' : 'Adicionar'}
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => setDraft({ titulo: '', tipo: 'tarefa', prioridade: 'media', dias_vencimento: 1 })}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-indigo-600 border border-dashed border-indigo-300 rounded-lg hover:bg-indigo-50 transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Adicionar tarefa
                </button>
            )}

            {(templates ?? []).length === 0 && !draft && (
                <p className="text-xs text-slate-500 text-center py-2">
                    Nenhum template configurado. As tarefas criadas aqui serão geradas automaticamente quando um card entrar nesta etapa, com responsável vazio (qualquer membro do time pode puxar pra si).
                </p>
            )}
        </div>
    );
}
