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
import { useUpdatableCardFields } from '@/hooks/useUpdatableCardFields'
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

// Campos do CONTATO que a automação pode atualizar. Whitelist separada da do
// card — o motor (executeUpdateContactFieldAction) valida contra esta mesma lista.
const CONTACT_FIELD_WHITELIST = [
    { value: 'email',     label: 'E-mail' },
    { value: 'telefone',  label: 'Telefone' },
    { value: 'nome',      label: 'Nome' },
    { value: 'sobrenome', label: 'Sobrenome' },
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

            <div className="pt-2 border-t border-slate-200">
                <Label className="text-xs font-semibold">Vencimento</Label>
                <label className="mt-2 flex items-center gap-2 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={!!config.use_trigger_start_time}
                        onChange={(e) => set({
                            use_trigger_start_time: e.target.checked,
                            trigger_start_time_offset_minutes: e.target.checked
                                ? (config.trigger_start_time_offset_minutes ?? 0)
                                : null,
                        })}
                        className="w-4 h-4"
                    />
                    <span className="text-sm">Usar data/hora do gatilho como vencimento</span>
                </label>
                <p className="text-[11px] text-slate-500 mt-1 ml-6">
                    Útil pro gatilho Calendly: vencimento da tarefa = horário da reunião agendada.
                </p>

                {!!config.use_trigger_start_time && (
                    <div className="mt-2 ml-6 space-y-1">
                        <Label className="text-xs">Offset em minutos (opcional)</Label>
                        <Input
                            type="number"
                            value={(config.trigger_start_time_offset_minutes as number) ?? 0}
                            onChange={(e) => set({ trigger_start_time_offset_minutes: Number(e.target.value) || 0 })}
                            placeholder="0"
                            className="w-32"
                        />
                        <p className="text-[11px] text-slate-500">
                            Negativo = antes da reunião (ex: <code>-60</code> cria tarefa 1h antes). Positivo = depois.
                        </p>
                    </div>
                )}
            </div>
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
//
// Lista TODOS os campos do card atualizáveis (catálogo system_fields do produto),
// não mais uma whitelist curta fixa. O motor grava na coluna nativa ou em
// produto_data conforme a regra em src/lib/automationCardFields.ts.
const SEM_SECAO = 'Outros'

const optionLabel = (o: unknown): { value: string; label: string } => {
    if (typeof o === 'string') return { value: o, label: o }
    const obj = (o ?? {}) as Record<string, unknown>
    const value = String(obj.value ?? obj.key ?? '')
    return { value, label: String(obj.label ?? obj.value ?? value) }
}

export const UpdateFieldEditor: React.FC<ConfigEditorProps> = ({ config, onChange }) => {
    const set = (patch: Record<string, unknown>) => onChange({ ...config, ...patch })
    const { data: fields = [], isLoading } = useUpdatableCardFields()

    const selected = fields.find((f) => f.key === (config.field_key as string))
    const fieldType = selected?.type
    const selectOptions = Array.isArray(selected?.options)
        ? (selected!.options as unknown[]).map(optionLabel)
        : []

    // Passo 1: seção. Passo 2: campo dentro da seção. Evita um dropdown único
    // gigante com "campo · seção" concatenado (UX ruim).
    const sectionOf = (s: string | null) => s || SEM_SECAO
    // Nome de exibição já resolvido no hook (igual ao card; fallback amigável p/
    // chaves legadas sem linha em `sections`).
    const labelBySectionKey = new Map(fields.map((f) => [sectionOf(f.section), f.sectionLabel]))
    const sectionDisplay = (key: string) => labelBySectionKey.get(key) || key
    const sections = Array.from(new Set(fields.map((f) => sectionOf(f.section))))
        .sort((a, b) => sectionDisplay(a).localeCompare(sectionDisplay(b)))
    const [section, setSection] = React.useState<string>(() => sectionOf(selected?.section ?? null))
    // Ao abrir um nó já configurado, os campos chegam async — sincroniza a seção
    // com a do campo selecionado quando ele resolve. Não dispara em troca manual
    // de seção (que limpa field_key → selected fica undefined).
    React.useEffect(() => {
        if (selected) setSection(sectionOf(selected.section ?? null))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected?.key])
    const fieldsInSection = fields.filter((f) => sectionOf(f.section) === section)

    return (
        <div className="space-y-3">
            <div className="space-y-2">
                <Label className="text-xs">Seção</Label>
                <CustomSelect
                    value={section}
                    onChange={(v) => { setSection(v); set({ field_key: null, value: '' }) }}
                    options={[
                        ...(sections.length === 0 ? [{ value: section, label: isLoading ? 'Carregando...' : 'Sem campos' }] : []),
                        ...sections.map((s) => ({ value: s, label: sectionDisplay(s) })),
                    ]}
                />
            </div>
            <div className="space-y-2">
                <Label className="text-xs">Campo</Label>
                <CustomSelect
                    value={(config.field_key as string) || ''}
                    onChange={(v) => set({ field_key: v || null, value: '' })}
                    options={[
                        { value: '', label: 'Selecionar campo...' },
                        ...fieldsInSection.map((f) => ({ value: f.key, label: f.label })),
                    ]}
                />
            </div>
            <div className="space-y-2">
                <Label className="text-xs">Novo valor</Label>
                {fieldType === 'boolean' ? (
                    <CustomSelect
                        value={String(config.value ?? '')}
                        onChange={(v) => set({ value: v })}
                        options={[
                            { value: '', label: 'Selecionar...' },
                            { value: 'true', label: 'Sim' },
                            { value: 'false', label: 'Não' },
                        ]}
                    />
                ) : (fieldType === 'select' && selectOptions.length > 0) ? (
                    <CustomSelect
                        value={(config.value as string) ?? ''}
                        onChange={(v) => set({ value: v })}
                        options={[{ value: '', label: 'Selecionar...' }, ...selectOptions]}
                    />
                ) : (
                    <Input
                        value={(config.value as string) ?? ''}
                        onChange={(e) => set({ value: e.target.value })}
                        placeholder={fieldType === 'number' || fieldType === 'currency' ? 'Ex: 1500' : fieldType === 'date' ? 'AAAA-MM-DD' : 'Valor'}
                    />
                )}
                <p className="text-[11px] text-slate-500">
                    Suporta {`{{contact.nome}}`}, {`{{card.titulo}}`}. Campos de sistema (datas
                    automáticas, dono, FKs) não aparecem aqui — não são editáveis por automação.
                </p>
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
                <Label className="text-xs">Anotação adicionada à descrição (opcional)</Label>
                <Textarea
                    value={(config.feedback as string) || ''}
                    onChange={(e) => set({ feedback: e.target.value })}
                    rows={3}
                    placeholder="Ex: Mensagem enviada em {{now}}."
                />
                <p className="text-[11px] text-slate-500">
                    Esse texto é anexado ao final da descrição da tarefa quando a automação fechar (separado por uma linha em branco). Suporta {`{{contact.nome}}`}, {`{{card.titulo}}`} e {`{{now}}`} (data/hora de Brasília na hora da conclusão).
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

// ─── update_contact_field ────────────────────────────────────────────────────
export const UpdateContactFieldEditor: React.FC<ConfigEditorProps> = ({ config, onChange }) => {
    const set = (patch: Record<string, unknown>) => onChange({ ...config, ...patch })
    return (
        <div className="space-y-3">
            <div className="space-y-2">
                <Label className="text-xs">Campo do contato</Label>
                <CustomSelect
                    value={(config.field_key as string) || ''}
                    onChange={(v) => set({ field_key: v || null })}
                    options={[
                        { value: '', label: 'Selecionar campo...' },
                        ...CONTACT_FIELD_WHITELIST,
                    ]}
                />
            </div>
            <div className="space-y-2">
                <Label className="text-xs">Novo valor</Label>
                <Input
                    value={(config.value as string) ?? ''}
                    onChange={(e) => set({ value: e.target.value })}
                    placeholder="Ex: novo@email.com"
                />
                <p className="text-[11px] text-slate-500">
                    Atualiza o contato principal do card. Suporta {`{{contact.nome}}`}, {`{{card.titulo}}`}.
                </p>
            </div>
        </div>
    )
}

// ─── send_email ──────────────────────────────────────────────────────────────
//
// Envia e-mail via edge function `send-email` (Resend). Modo texto/HTML livre.
// O destinatário é resolvido em runtime: contato.email do card.
export const SendEmailEditor: React.FC<ConfigEditorProps> = ({ config, onChange }) => {
    const set = (patch: Record<string, unknown>) => onChange({ ...config, ...patch })
    const subject = (config.subject as string) || ''
    const corpo = (config.corpo as string) || ''
    return (
        <div className="space-y-3">
            {/* Modo teste: sem chave de envio (Resend) configurada, e-mails não
                saem de verdade — a automação registra como "teste" (dry-run). */}
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                <span className="font-medium">Envio em modo teste.</span> Ainda não há chave de
                envio (Resend) configurada — os e-mails não saem de verdade, mas o fluxo registra
                o disparo. Assim que a chave for ativada, passam a ser enviados normalmente.
            </div>

            <div className="space-y-2">
                <Label className="text-xs">Assunto</Label>
                <Input
                    value={subject}
                    onChange={(e) => set({ subject: e.target.value })}
                    placeholder="Ex: Sua viagem para {{card.destino}}"
                />
            </div>
            <div className="space-y-2">
                <Label className="text-xs">Corpo do e-mail</Label>
                <Textarea
                    value={corpo}
                    onChange={(e) => set({ corpo: e.target.value })}
                    rows={6}
                    placeholder={'Olá {{contact.nome}},\n\nTudo certo com sua viagem...'}
                />
                <p className="text-[11px] text-slate-500">
                    Aceita HTML simples. Suporta {`{{contact.nome}}`}, {`{{card.titulo}}`}, {`{{now}}`}.
                    O destinatário é o e-mail do contato principal do card.
                </p>
            </div>

            {/* Prévia do e-mail */}
            <div className="space-y-1.5">
                <Label className="text-xs">Prévia</Label>
                <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="border-b border-slate-100 bg-slate-50 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wide text-slate-400">Assunto</div>
                        <div className="text-sm font-medium text-slate-900">
                            {subject || <span className="text-slate-400 font-normal italic">(sem assunto)</span>}
                        </div>
                    </div>
                    <div className="px-3 py-2.5 text-sm text-slate-700 max-h-48 overflow-auto">
                        {corpo
                            ? <div style={{ whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: corpo }} />
                            : <span className="text-slate-400 italic">(corpo vazio)</span>}
                    </div>
                </div>
                <p className="text-[11px] text-slate-500">
                    Variáveis como {`{{contact.nome}}`} aparecem como texto aqui e são preenchidas no envio.
                </p>
            </div>
        </div>
    )
}

// ─── assign_owner ──────────────────────────────────────────────────────────────
//
// Define um dono fixo do card. O card tem vários donos por papel — SDR, Planner,
// Pós e Concierge. O nó escolhe QUAL papel preencher e com QUEM.
const OWNER_ROLES = [
    { value: 'sdr',       label: 'SDR' },
    { value: 'planner',   label: 'Planner' },
    { value: 'pos',       label: 'Pós' },
    { value: 'concierge', label: 'Concierge' },
] as const

export const AssignOwnerEditor: React.FC<ConfigEditorProps> = ({ config, onChange }) => {
    const set = (patch: Record<string, unknown>) => onChange({ ...config, ...patch })
    const { users } = useUsers()
    const role = (config.role as string) || 'sdr'
    const onlyIfEmpty = config.only_if_empty !== false // default: true
    const userOptions = (users || [])
        .filter((u) => u.active)
        .map((u) => ({ value: u.id, label: u.nome || u.email }))

    return (
        <div className="space-y-3">
            <div className="space-y-2">
                <Label className="text-xs">Qual dono</Label>
                <CustomSelect
                    value={role}
                    onChange={(v) => set({ role: v })}
                    options={[...OWNER_ROLES]}
                />
            </div>
            <div className="space-y-2">
                <Label className="text-xs">Pessoa</Label>
                <CustomSelect
                    value={(config.user_id as string) || ''}
                    onChange={(v) => set({ user_id: v || null })}
                    options={[{ value: '', label: 'Selecionar...' }, ...userOptions]}
                />
            </div>

            <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                    type="checkbox"
                    checked={onlyIfEmpty}
                    onChange={(e) => set({ only_if_empty: e.target.checked })}
                    className="w-4 h-4"
                />
                <span className="text-sm">Só atribuir se esse papel estiver vazio</span>
            </label>
            <p className="text-[11px] text-slate-500 -mt-1 ml-6">
                Desmarque para sobrescrever mesmo se já houver alguém nesse papel.
            </p>
        </div>
    )
}
