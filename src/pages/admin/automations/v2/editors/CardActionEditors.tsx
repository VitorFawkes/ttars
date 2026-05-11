/**
 * CardActionEditors — ações que tocam o card:
 *   create_task, change_stage, add_tag, remove_tag, update_field, notify_internal
 *
 * Reusa pickers que já existem (stages, tags, users, fields).
 */
import React from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Select as CustomSelect } from '@/components/ui/Select'
import { usePipelineStages } from '@/hooks/usePipelineStages'
import { useCardTags } from '@/hooks/useCardTags'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import { useProductContext } from '@/hooks/useProductContext'
import { useUsers } from '@/hooks/useUsers'
import { useWorkflowStore } from '../store/useWorkflowStore'
import { OUTCOME_LABELS } from '@/components/tasks/taskTypeConfig'

interface ConfigEditorProps {
    config: Record<string, unknown>
    onChange: (next: Record<string, unknown>) => void
}

const TASK_TYPES = [
    { value: 'tarefa',                label: 'Tarefa' },
    { value: 'contato',               label: 'Contato' },
    { value: 'email',                 label: 'E-mail' },
    { value: 'reuniao',               label: 'Reunião' },
    { value: 'solicitacao_mudanca',   label: 'Mudança' },
    { value: 'enviar_proposta',       label: 'Proposta' },
    { value: 'coleta_documentos',     label: 'Coleta Docs' },
]

const PRIORITIES = [
    { value: 'high',   label: 'Alta' },
    { value: 'medium', label: 'Média' },
    { value: 'low',    label: 'Baixa' },
]

const FIELD_WHITELIST = [
    { value: 'status_comercial',    label: 'Status comercial' },
    { value: 'prioridade',          label: 'Prioridade' },
    { value: 'valor_estimado',      label: 'Valor estimado' },
    { value: 'valor_final',         label: 'Valor final' },
    { value: 'condicoes_pagamento', label: 'Condições de pagamento' },
    { value: 'data_viagem_inicio',  label: 'Data de início da viagem' },
    { value: 'data_viagem_fim',     label: 'Data de fim da viagem' },
    { value: 'destino',             label: 'Destino' },
]

// ─── create_task ─────────────────────────────────────────────────────────────
export const CreateTaskEditor: React.FC<ConfigEditorProps> = ({ config, onChange }) => {
    const { users } = useUsers()
    const set = (patch: Record<string, unknown>) => onChange({ ...config, ...patch })
    const userOptions = (users || [])
        .filter((u) => u.active)
        .map((u) => ({ value: u.id, label: u.nome || u.email }))

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                    <Label className="text-xs">Tipo</Label>
                    <CustomSelect
                        value={(config.tipo as string) || 'contato'}
                        onChange={(v) => set({ tipo: v })}
                        options={TASK_TYPES}
                    />
                </div>
                <div className="space-y-2">
                    <Label className="text-xs">Prioridade</Label>
                    <CustomSelect
                        value={(config.prioridade as string) || 'high'}
                        onChange={(v) => set({ prioridade: v })}
                        options={PRIORITIES}
                    />
                </div>
            </div>
            {((config.tipo as string) || 'contato') === 'contato' && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 space-y-1">
                    <div className="font-medium">Atenção: tarefa do tipo "Contato"</div>
                    <p>
                        Quando uma mensagem WhatsApp sai do card (manual ou por outro passo do fluxo), o sistema fecha automaticamente toda tarefa de contato pendente desse card. Se o seu fluxo tem "Enviar mensagem" depois, o "Concluir tarefa" pode virar redundante.
                    </p>
                    <p>
                        Pra controlar a conclusão pelo fluxo, escolha outro tipo (ex: "Tarefa").
                    </p>
                </div>
            )}
            <div className="space-y-2">
                <Label className="text-xs">Título</Label>
                <Input
                    value={(config.titulo as string) || ''}
                    onChange={(e) => set({ titulo: e.target.value })}
                    placeholder="Ex: 1ª tentativa de contato"
                />
            </div>
            <div className="space-y-2">
                <Label className="text-xs">Descrição (opcional)</Label>
                <Textarea
                    value={(config.descricao as string) || ''}
                    onChange={(e) => set({ descricao: e.target.value })}
                    rows={2}
                />
            </div>
            <div className="space-y-2">
                <Label className="text-xs">Responsável</Label>
                <CustomSelect
                    value={(config.assign_to as string) || 'card_owner'}
                    onChange={(v) => set({ assign_to: v })}
                    options={[
                        { value: 'card_owner', label: 'Responsável do card' },
                        { value: 'specific',   label: 'Pessoa específica' },
                        { value: 'system',     label: 'Sistema (automação)' },
                    ]}
                />
                {config.assign_to === 'system' && (
                    <p className="text-[11px] text-slate-500">
                        A tarefa fica sem dono humano e aparece com chip "Sistema". Use quando a automação cuida do passo do começo ao fim e não precisa de ninguém olhando.
                    </p>
                )}
            </div>
            {config.assign_to === 'specific' && (
                <div className="space-y-2">
                    <Label className="text-xs">Pessoa</Label>
                    <CustomSelect
                        value={(config.assign_to_user_id as string) || ''}
                        onChange={(v) => set({ assign_to_user_id: v || null })}
                        options={[{ value: '', label: 'Selecionar...' }, ...userOptions]}
                    />
                </div>
            )}
        </div>
    )
}

// ─── change_stage ────────────────────────────────────────────────────────────
export const ChangeStageEditor: React.FC<ConfigEditorProps> = ({ config, onChange }) => {
    const { pipelineId } = useCurrentProductMeta()
    const { data: stages = [] } = usePipelineStages(pipelineId)
    const set = (patch: Record<string, unknown>) => onChange({ ...config, ...patch })

    return (
        <div className="space-y-2">
            <Label className="text-xs">Mover card para</Label>
            <CustomSelect
                value={(config.target_stage_id as string) || ''}
                onChange={(v) => set({ target_stage_id: v || null })}
                options={[
                    { value: '', label: 'Selecionar etapa...' },
                    ...stages.map((s) => ({ value: s.id, label: s.nome })),
                ]}
            />
        </div>
    )
}

// ─── add_tag / remove_tag (no card, não na conversa Echo) ────────────────────
export const CardTagEditor: React.FC<ConfigEditorProps> = ({ config, onChange }) => {
    const product = useProductContext((s) => s.currentProduct)
    const { tags } = useCardTags(product || undefined)
    const set = (patch: Record<string, unknown>) => onChange({ ...config, ...patch })

    return (
        <div className="space-y-2">
            <Label className="text-xs">Tag</Label>
            <CustomSelect
                value={(config.tag_id as string) || ''}
                onChange={(v) => set({ tag_id: v || null })}
                options={[
                    { value: '', label: 'Selecionar tag...' },
                    ...tags.map((t) => ({ value: t.id, label: t.name })),
                ]}
            />
        </div>
    )
}

// ─── update_field ────────────────────────────────────────────────────────────
export const UpdateFieldEditor: React.FC<ConfigEditorProps> = ({ config, onChange }) => {
    const set = (patch: Record<string, unknown>) => onChange({ ...config, ...patch })
    return (
        <div className="space-y-3">
            <div className="space-y-2">
                <Label className="text-xs">Campo</Label>
                <CustomSelect
                    value={(config.field_key as string) || ''}
                    onChange={(v) => set({ field_key: v || null })}
                    options={[
                        { value: '', label: 'Selecionar campo...' },
                        ...FIELD_WHITELIST,
                    ]}
                />
            </div>
            <div className="space-y-2">
                <Label className="text-xs">Novo valor</Label>
                <Input
                    value={(config.value as string) ?? ''}
                    onChange={(e) => set({ value: e.target.value })}
                    placeholder="Ex: ganho"
                />
            </div>
        </div>
    )
}

// ─── notify_internal ─────────────────────────────────────────────────────────
export const NotifyInternalEditor: React.FC<ConfigEditorProps> = ({ config, onChange }) => {
    const { users } = useUsers()
    const set = (patch: Record<string, unknown>) => onChange({ ...config, ...patch })
    const mode = (config.recipient_mode as string) || 'card_owner'
    const userOptions = (users || [])
        .filter((u) => u.active)
        .map((u) => ({ value: u.id, label: u.nome || u.email }))

    return (
        <div className="space-y-3">
            <div className="space-y-2">
                <Label className="text-xs">Para quem</Label>
                <CustomSelect
                    value={mode}
                    onChange={(v) => set({ recipient_mode: v })}
                    options={[
                        { value: 'card_owner', label: 'Responsável do card' },
                        { value: 'specific',   label: 'Pessoa específica' },
                    ]}
                />
            </div>
            {mode === 'specific' && (
                <div className="space-y-2">
                    <Label className="text-xs">Pessoa</Label>
                    <CustomSelect
                        value={(config.user_id as string) || ''}
                        onChange={(v) => set({ user_id: v || null })}
                        options={[{ value: '', label: 'Selecionar...' }, ...userOptions]}
                    />
                </div>
            )}
            <div className="space-y-2">
                <Label className="text-xs">Título</Label>
                <Input
                    value={(config.title as string) || ''}
                    onChange={(e) => set({ title: e.target.value })}
                    placeholder="Ex: Card precisa de atenção"
                />
            </div>
            <div className="space-y-2">
                <Label className="text-xs">Mensagem</Label>
                <Textarea
                    value={(config.body as string) || ''}
                    onChange={(e) => set({ body: e.target.value })}
                    rows={3}
                    placeholder="Conteúdo da notificação. Suporta {{contact.nome}}, {{card.titulo}}."
                />
            </div>
        </div>
    )
}

// ─── complete_task ───────────────────────────────────────────────────────────
//
// Marca uma tarefa criada em algum outro passo do mesmo fluxo como concluída.
// O dropdown lista TODOS os nodes `action.create_task` do canvas (exceto o
// próprio node). Não restringe a upstream porque com branches/ciclos a noção
// de "antes/depois" pode ser ambígua durante a edição. Em runtime, o engine
// só fecha a tarefa se ela tiver sido criada na mesma cadence_instance — se
// não tiver, devolve `{ skipped: true, reason: 'target_task_not_found' }`.
//
// O id do node alvo vai em `target_node_id`; o save em persistence.ts
// converte pra `n_<nodeId>` (step_key) que casa com o `cadence_step_key`
// gravado em `metadata` pela criação da tarefa.
export const CompleteTaskEditor: React.FC<ConfigEditorProps> = ({ config, onChange }) => {
    const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId)
    const nodes = useWorkflowStore((s) => s.nodes)
    const set = (patch: Record<string, unknown>) => onChange({ ...config, ...patch })

    const createTaskNodes = nodes.filter(
        (n) => n.type === 'action.create_task' && n.id !== selectedNodeId,
    )

    const targetNodeId = (config.target_node_id as string) || ''
    const selectedStillExists = createTaskNodes.some((n) => n.id === targetNodeId)

    return (
        <div className="space-y-3">
            <div className="space-y-2">
                <Label className="text-xs">Tarefa a concluir</Label>
                <CustomSelect
                    value={targetNodeId}
                    onChange={(v) => set({ target_node_id: v || null })}
                    options={[
                        { value: '', label: createTaskNodes.length === 0 ? 'Adicione um "Criar tarefa" no fluxo' : 'Selecionar...' },
                        ...createTaskNodes.map((n) => {
                            const cfg = (n.data.config as Record<string, unknown>) || {}
                            const titulo = (cfg.titulo as string) || ''
                            const tipo = (cfg.tipo as string) || ''
                            const label = titulo
                                ? (tipo ? `${titulo} (${tipo})` : titulo)
                                : (n.data.label || 'Criar tarefa — sem título')
                            return { value: n.id, label }
                        }),
                    ]}
                />
                {!!targetNodeId && !selectedStillExists && (
                    <p className="text-[11px] text-amber-700">
                        O passo referenciado foi removido. Escolha outra tarefa.
                    </p>
                )}
            </div>
            <div className="space-y-2">
                <Label className="text-xs">Resultado registrado (opcional)</Label>
                <CustomSelect
                    value={(config.outcome as string) || ''}
                    onChange={(v) => set({ outcome: v || null })}
                    options={[
                        { value: '', label: 'Sem resultado' },
                        ...Object.entries(OUTCOME_LABELS).map(([value, label]) => ({ value, label })),
                    ]}
                />
                <p className="text-[11px] text-slate-500">
                    Usado como o "como foi" da tarefa concluída. Útil para diferenciar quando a automação fecha (ex: "enviado") de quando uma pessoa fecha.
                </p>
            </div>
            <div className="space-y-2">
                <Label className="text-xs">Anotação registrada na tarefa (opcional)</Label>
                <Textarea
                    value={(config.feedback as string) || ''}
                    onChange={(e) => set({ feedback: e.target.value })}
                    rows={3}
                    placeholder="Ex: Mensagem de boas-vindas enviada via wt_primeiro_contato001."
                />
                <p className="text-[11px] text-slate-500">
                    Texto livre que vai pro "feedback" da tarefa quando a automação fechar. Suporta {`{{contact.nome}}`}, {`{{card.titulo}}`} e {`{{now}}`} (data/hora de Brasília na hora da conclusão).
                </p>
            </div>
        </div>
    )
}

// ─── trigger_n8n_webhook ─────────────────────────────────────────────────────
export const N8nWebhookEditor: React.FC<ConfigEditorProps> = ({ config, onChange }) => {
    const set = (patch: Record<string, unknown>) => onChange({ ...config, ...patch })
    return (
        <div className="space-y-3">
            <div className="space-y-2">
                <Label className="text-xs">URL do webhook</Label>
                <Input
                    value={(config.url as string) || ''}
                    onChange={(e) => set({ url: e.target.value })}
                    placeholder="https://n8n.exemplo.com/webhook/..."
                />
            </div>
            <p className="text-xs text-slate-500">
                Faz POST com payload <code className="bg-slate-100 px-1 rounded">{`{ card, contact }`}</code>.
            </p>
        </div>
    )
}
