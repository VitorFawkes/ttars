/**
 * TriggerEditor — editor unificado pros 9 tipos de trigger.
 *
 * Renderiza campos diferentes conforme o `triggerType`:
 *  - card_created                 → applicable_pipeline_ids (opcional)
 *  - stage_enter                  → applicable_stage_ids (multi)
 *  - macro_stage_enter            → phase_id
 *  - field_changed                → field (whitelist) + opt: from/to
 *  - tag_added / tag_removed      → tag_id
 *  - inbound_message_pattern      → patterns[] (palavras-chave)
 *  - time_offset_from_date        → source (data) + days_offset (+/-)
 *  - time_in_stage                → stage_id + days
 */
import React from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Select as CustomSelect } from '@/components/ui/Select'
import { usePipelineStages } from '@/hooks/usePipelineStages'
import { usePipelinePhases } from '@/hooks/usePipelinePhases'
import { useCardTags } from '@/hooks/useCardTags'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import { useProductContext } from '@/hooks/useProductContext'
import { useFilterProfiles } from '@/hooks/analytics/useFilterOptions'
import type { TriggerNodeType } from '../types'

interface TriggerEditorProps {
    type: TriggerNodeType
    config: Record<string, unknown>
    onChange: (next: Record<string, unknown>) => void
}

const TIME_OFFSET_SOURCES = [
    { value: 'card.data_viagem_inicio', label: 'Data de início da viagem' },
    { value: 'card.data_viagem_fim',    label: 'Data de fim da viagem' },
    { value: 'card.data_reuniao',       label: 'Data da reunião (Calendly)' },
    { value: 'contato.data_nascimento', label: 'Aniversário do contato' },
    { value: 'proposal.expires_at',     label: 'Vencimento da proposta' },
]

const TASK_TIPO_OPTIONS = [
    { value: '',          label: 'Qualquer tarefa' },
    { value: 'reuniao',   label: 'Reunião' },
    { value: 'contato',   label: 'Contato' },
    { value: 'coleta_documentos', label: 'Coleta de documentos' },
    { value: 'enviar_proposta',   label: 'Enviar proposta' },
    { value: 'email',     label: 'E-mail' },
]

const TASK_OUTCOME_OPTIONS = [
    { value: 'qualquer',      label: 'Qualquer resultado' },
    { value: 'realizada',     label: 'Realizada' },
    { value: 'nao_compareceu', label: 'Não compareceu' },
]

const FIELD_WHITELIST = [
    { value: 'status_comercial',  label: 'Status comercial' },
    { value: 'prioridade',        label: 'Prioridade' },
    { value: 'valor_estimado',    label: 'Valor estimado' },
    { value: 'valor_final',       label: 'Valor final' },
    { value: 'condicoes_pagamento', label: 'Condições de pagamento' },
    { value: 'data_viagem_inicio', label: 'Data de início da viagem' },
    { value: 'data_viagem_fim',    label: 'Data de fim da viagem' },
    { value: 'destino',           label: 'Destino' },
    { value: 'data_reuniao',      label: 'Data da Reunião' },
]

export const TriggerEditor: React.FC<TriggerEditorProps> = ({ type, config, onChange }) => {
    const { pipelineId } = useCurrentProductMeta()
    const product = useProductContext((s) => s.currentProduct)
    const { data: stages = [] } = usePipelineStages(pipelineId)
    const { data: phases = [] } = usePipelinePhases(pipelineId)
    const { tags } = useCardTags(product || undefined)
    const { data: workspaceProfiles = [] } = useFilterProfiles()

    const set = (patch: Record<string, unknown>) => onChange({ ...config, ...patch })

    // Auto-heal de config legado de card_created: editor antigo (pré-PR#26)
    // gravava o filtro em event_config.initial_stage_id e deixava
    // applicable_stage_ids vazio. Se um template assim é aberto sem que o user
    // toque no select, o save reverte a coluna pra null e o bug volta. Aqui
    // migramos o config em memória logo no load — depois disso qualquer save
    // grava o formato canônico.
    const legacyInitial = config.initial_stage_id
    const hasApplicable = Array.isArray(config.applicable_stage_ids)
        && (config.applicable_stage_ids as unknown[]).length > 0
    React.useEffect(() => {
        if (type !== 'trigger.card_created') return
        if (hasApplicable) return
        if (typeof legacyInitial !== 'string' || !legacyInitial) return
        onChange({ ...config, applicable_stage_ids: [legacyInitial], initial_stage_id: null })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [type, hasApplicable, legacyInitial])

    switch (type) {
        case 'trigger.card_created': {
            // Save grava em applicable_stage_ids (array UUID[] — bate com a
            // coluna do banco que o dispatcher SQL filtra). Aceita
            // initial_stage_id como fallback no load pra retrocompat com
            // automacoes antigas (campo legado, era ignorado pelo backend).
            const stageIds = Array.isArray(config.applicable_stage_ids)
                ? (config.applicable_stage_ids as string[])
                : (config.initial_stage_id ? [config.initial_stage_id as string] : [])
            const selected = stageIds[0] || ''
            return (
                <div className="space-y-3">
                    <p className="text-sm text-slate-600">
                        Dispara quando um card é criado no pipeline. Não exige config adicional —
                        opcionalmente filtre por etapa inicial abaixo.
                    </p>
                    <div className="space-y-2">
                        <Label className="text-xs">Etapa inicial específica (opcional)</Label>
                        <CustomSelect
                            value={selected}
                            onChange={(v) => set({
                                applicable_stage_ids: v ? [v] : null,
                                initial_stage_id: null,
                            })}
                            options={[
                                { value: '', label: 'Qualquer etapa' },
                                ...stages.map((s) => ({ value: s.id, label: s.nome })),
                            ]}
                        />
                    </div>
                </div>
            )
        }

        case 'trigger.stage_enter': {
            const selected: string[] = Array.isArray(config.applicable_stage_ids) ? (config.applicable_stage_ids as string[]) : []
            return (
                <div className="space-y-3">
                    <Label className="text-xs">Etapa(s) que disparam</Label>
                    <div className="grid grid-cols-1 gap-1 max-h-72 overflow-y-auto border rounded-md p-2">
                        {stages.map((s) => {
                            const checked = selected.includes(s.id)
                            return (
                                <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 px-2 py-1 rounded">
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={(e) => {
                                            const next = e.target.checked
                                                ? [...selected, s.id]
                                                : selected.filter((id) => id !== s.id)
                                            set({ applicable_stage_ids: next })
                                        }}
                                    />
                                    <span>{s.nome}</span>
                                </label>
                            )
                        })}
                        {stages.length === 0 && <span className="text-xs text-slate-500 px-2">Nenhuma etapa carregada</span>}
                    </div>
                </div>
            )
        }

        case 'trigger.macro_stage_enter':
            return (
                <div className="space-y-2">
                    <Label className="text-xs">Fase do pipeline</Label>
                    <CustomSelect
                        value={(config.phase_id as string) || ''}
                        onChange={(v) => set({ phase_id: v || null })}
                        options={[
                            { value: '', label: 'Selecionar fase...' },
                            ...phases.map((p) => ({ value: p.id, label: p.name })),
                        ]}
                    />
                </div>
            )

        case 'trigger.field_changed':
            return (
                <div className="space-y-3">
                    <div className="space-y-2">
                        <Label className="text-xs">Campo do card</Label>
                        <CustomSelect
                            value={(config.field as string) || ''}
                            onChange={(v) => set({ field: v || null })}
                            options={[
                                { value: '', label: 'Selecionar campo...' },
                                ...FIELD_WHITELIST,
                            ]}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs">Fase do card (opcional)</Label>
                        <CustomSelect
                            value={(config.phase_id as string) || ''}
                            onChange={(v) => set({ phase_id: v || null })}
                            options={[
                                { value: '', label: 'Qualquer fase' },
                                ...phases.map((p) => ({ value: p.id, label: p.label })),
                            ]}
                        />
                        <p className="text-xs text-slate-400">
                            Quando setado, só dispara se o card estiver numa etapa dessa fase (ex: SDR, Planner, Pós-venda).
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-2">
                            <Label className="text-xs">De (opcional)</Label>
                            <Input
                                value={(config.from_value as string) || ''}
                                onChange={(e) => set({ from_value: e.target.value || null })}
                                placeholder="qualquer"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs">Para</Label>
                            <Input
                                value={(config.to_value as string) || ''}
                                onChange={(e) => set({ to_value: e.target.value || null })}
                                placeholder="ex: ganho"
                            />
                        </div>
                    </div>
                </div>
            )

        case 'trigger.tag_added':
        case 'trigger.tag_removed':
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

        case 'trigger.inbound_message_pattern':
            return (
                <div className="space-y-3">
                    <div className="space-y-2">
                        <Label className="text-xs">Palavras-chave (uma por linha)</Label>
                        <Textarea
                            value={(config.patterns as string) || ''}
                            onChange={(e) => set({ patterns: e.target.value })}
                            placeholder={'sim\nquero\nconfirmo'}
                            rows={4}
                        />
                        <p className="text-xs text-slate-500">
                            Dispara quando a mensagem do contato contém qualquer uma das palavras (case-insensitive).
                        </p>
                    </div>
                </div>
            )

        case 'trigger.time_offset_from_date': {
            const isMeeting = (config.source as string) === 'card.data_reuniao'
            // Para reunião: minutes_offset (negativo=antes, 0=exato, positivo=depois)
            const minutesOffset = (config.minutes_offset as number) ?? 0
            const meetingMode = minutesOffset < 0 ? 'antes' : minutesOffset > 0 ? 'depois' : 'exato'
            const absMin = Math.abs(minutesOffset)
            // Unidade amigável: horas se múltiplo de 60, senão minutos
            const meetingUnit = absMin > 0 && absMin % 60 === 0 ? 'horas' : 'minutos'
            const meetingQty = meetingUnit === 'horas' ? absMin / 60 : absMin
            const applyMeeting = (mode: string, qty: number, unit: string) => {
                if (mode === 'exato') { set({ minutes_offset: 0 }); return }
                const mins = unit === 'horas' ? qty * 60 : qty
                set({ minutes_offset: mode === 'antes' ? -Math.abs(mins) : Math.abs(mins) })
            }
            return (
                <div className="space-y-3">
                    <div className="space-y-2">
                        <Label className="text-xs">Data de referência</Label>
                        <CustomSelect
                            value={(config.source as string) || ''}
                            onChange={(v) => set({ source: v || null })}
                            options={[{ value: '', label: 'Selecionar data...' }, ...TIME_OFFSET_SOURCES]}
                        />
                    </div>

                    {isMeeting ? (
                        <div className="space-y-2">
                            <Label className="text-xs">Quando disparar</Label>
                            <CustomSelect
                                value={meetingMode}
                                onChange={(v) => applyMeeting(v, meetingQty || 1, meetingUnit)}
                                options={[
                                    { value: 'exato', label: 'Na data e hora exata da reunião' },
                                    { value: 'antes', label: 'Antes da reunião' },
                                    { value: 'depois', label: 'Depois da reunião' },
                                ]}
                            />
                            {meetingMode !== 'exato' && (
                                <div className="grid grid-cols-2 gap-2">
                                    <Input
                                        type="number"
                                        min={1}
                                        value={meetingQty || 1}
                                        onChange={(e) => applyMeeting(meetingMode, parseInt(e.target.value) || 1, meetingUnit)}
                                    />
                                    <CustomSelect
                                        value={meetingUnit}
                                        onChange={(u) => applyMeeting(meetingMode, meetingQty || 1, u)}
                                        options={[
                                            { value: 'minutos', label: 'minutos' },
                                            { value: 'horas', label: 'horas' },
                                        ]}
                                    />
                                </div>
                            )}
                            <p className="text-xs text-slate-400">
                                Dispara no horário exato (precisão de ~5 min). Ex: "30 minutos antes" lembra o lead antes da reunião.
                            </p>
                        </div>
                    ) : (() => {
                        const daysOffset = (config.days_offset as number) ?? 0
                        const dayMode = daysOffset < 0 ? 'antes' : daysOffset > 0 ? 'depois' : 'exato'
                        const dayQty = Math.abs(daysOffset)
                        const applyDay = (mode: string, qty: number) => {
                            if (mode === 'exato') { set({ days_offset: 0 }); return }
                            set({ days_offset: mode === 'antes' ? -Math.abs(qty) : Math.abs(qty) })
                        }
                        return (
                            <div className="space-y-2">
                                <Label className="text-xs">Quando disparar</Label>
                                <CustomSelect
                                    value={dayMode}
                                    onChange={(v) => applyDay(v, dayQty || 1)}
                                    options={[
                                        { value: 'exato', label: 'No dia da data' },
                                        { value: 'antes', label: 'Antes da data' },
                                        { value: 'depois', label: 'Depois da data' },
                                    ]}
                                />
                                {dayMode !== 'exato' && (
                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="number"
                                            min={1}
                                            value={dayQty || 1}
                                            onChange={(e) => applyDay(dayMode, parseInt(e.target.value) || 1)}
                                            className="w-24"
                                        />
                                        <span className="text-sm text-slate-500">dia(s)</span>
                                    </div>
                                )}
                                <p className="text-xs text-slate-400">
                                    Verificação diária às 6h. Dispara X dias antes/depois da data escolhida.
                                </p>
                            </div>
                        )
                    })()}
                </div>
            )
        }

        case 'trigger.time_in_stage':
            return (
                <div className="space-y-3">
                    <div className="space-y-2">
                        <Label className="text-xs">Etapa</Label>
                        <CustomSelect
                            value={(config.stage_id as string) || ''}
                            onChange={(v) => set({ stage_id: v || null })}
                            options={[
                                { value: '', label: 'Selecionar etapa...' },
                                ...stages.map((s) => ({ value: s.id, label: s.nome })),
                            ]}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs">Quantos dias parado</Label>
                        <Input
                            type="number"
                            min={1}
                            value={(config.days as number) ?? 1}
                            onChange={(e) => set({ days: parseInt(e.target.value) || 1 })}
                        />
                    </div>
                </div>
            )

        case 'trigger.calendly_invitee_created': {
            const createIfMissing = !!config.create_card_if_missing
            // Weddings trabalha com 2 agendas Calendly distintas (SDR e Closer). O
            // "direcionamento" só muda o roteamento (organizer + campos de data/link
            // por papel); os dados/variáveis do gatilho são os mesmos.
            const WW_DIRECTIONS: Record<string, { label: string; cfg: Record<string, unknown> }> = {
                ww_sdr: {
                    label: 'SDR — Welcome Weddings',
                    cfg: {
                        organizer_email: 'contato@welcomeweddings.com.br',
                        meeting_date_target: 'ww_sdr_data_reuniao',
                        meeting_link_target: 'ww_sdr_link_reuniao',
                        owner_role: 'sdr',
                        create_meeting_task: true,
                    },
                },
                ww_closer: {
                    label: 'Closer — Welcome Weddings',
                    cfg: {
                        organizer_email: 'weddingplanner@welcomeweddings.com.br',
                        meeting_date_target: 'ww_closer_data_reuniao',
                        meeting_link_target: 'ww_closer_link_reuniao',
                        owner_role: 'vendas',
                        create_meeting_task: true,
                    },
                },
            }
            const currentDirection =
                config.organizer_email === 'contato@welcomeweddings.com.br' ? 'ww_sdr'
                : config.organizer_email === 'weddingplanner@welcomeweddings.com.br' ? 'ww_closer'
                : 'custom'
            return (
                <div className="space-y-4">
                    <p className="text-xs text-slate-500">
                        Dispara quando uma reunião é agendada no Calendly. Os campos de filtro são opcionais.
                    </p>

                    {product === 'WEDDING' && (
                        <div className="space-y-2 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
                            <Label className="text-xs font-semibold">Agenda</Label>
                            <CustomSelect
                                value={currentDirection}
                                onChange={(v) => {
                                    if (v === 'custom') {
                                        set({ organizer_email: null, meeting_date_target: null, meeting_link_target: null, create_meeting_task: false })
                                    } else {
                                        set(WW_DIRECTIONS[v].cfg)
                                    }
                                }}
                                options={[
                                    { value: 'ww_sdr', label: WW_DIRECTIONS.ww_sdr.label },
                                    { value: 'ww_closer', label: WW_DIRECTIONS.ww_closer.label },
                                    { value: 'custom', label: 'Outra (personalizar)' },
                                ]}
                            />
                            <p className="text-xs text-slate-400">
                                Escolhe qual agenda do Calendly dispara este fluxo. A data e o link da reunião vão
                                pro campo do papel certo (SDR ou Closer), e a reunião vira tarefa no card.
                            </p>
                        </div>
                    )}

                    <details className="bg-indigo-50 border border-indigo-200 rounded-md px-3 py-2">
                        <summary className="text-xs font-medium text-indigo-900 cursor-pointer">
                            Variáveis disponíveis nos próximos passos
                        </summary>
                        <div className="mt-2 text-xs text-indigo-900 space-y-1 font-mono">
                            <div><code>{'{{trigger.invitee_name}}'}</code> — nome do convidado</div>
                            <div><code>{'{{trigger.invitee_email}}'}</code> — email do convidado</div>
                            <div><code>{'{{trigger.invitee_phone}}'}</code> — telefone (se houver)</div>
                            <div><code>{'{{trigger.event_start_time}}'}</code> — data/hora da reunião (formato BR)</div>
                            <div><code>{'{{trigger.event_end_time}}'}</code> — fim da reunião</div>
                            <div><code>{'{{trigger.event_name}}'}</code> — nome do tipo de evento</div>
                            <div><code>{'{{trigger.meeting_join_url}}'}</code> — link da chamada</div>
                            <div><code>{'{{trigger.organizer_email}}'}</code> — email do organizador</div>
                        </div>
                        <p className="mt-2 text-xs text-indigo-700">
                            Use em campos de texto das ações (criar tarefa, mandar mensagem, atualizar campo).
                            Em "criar tarefa" também tem opção "usar data da reunião como vencimento".
                        </p>
                    </details>

                    {(product !== 'WEDDING' || currentDirection === 'custom') && (
                        <div className="space-y-2">
                            <Label className="text-xs">Organizador (email — opcional)</Label>
                            <Input
                                type="email"
                                placeholder="ex: ana.carolina@welcometrips.com.br"
                                value={(config.organizer_email as string) || ''}
                                onChange={(e) => set({ organizer_email: e.target.value || null })}
                            />
                            <p className="text-xs text-slate-400">Só dispara se o organizador da reunião for esse email.</p>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label className="text-xs">Nome do evento contém (opcional)</Label>
                        <Input
                            placeholder="ex: Wedding Planner"
                            value={(config.event_name_pattern as string) || ''}
                            onChange={(e) => set({ event_name_pattern: e.target.value || null })}
                        />
                        <p className="text-xs text-slate-400">Filtra pelo nome do tipo de evento configurado no Calendly.</p>
                    </div>

                    <div className="pt-3 border-t border-slate-200">
                        <Label className="text-xs font-semibold">Quando não houver card existente</Label>
                        <label className="mt-2 flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={createIfMissing}
                                onChange={(e) => {
                                    const checked = e.target.checked
                                    set({
                                        create_card_if_missing: checked,
                                        create_card_pipeline_id: checked ? (config.create_card_pipeline_id ?? pipelineId ?? null) : null,
                                        create_card_stage_id: checked ? (config.create_card_stage_id ?? null) : null,
                                    })
                                }}
                                className="w-4 h-4"
                            />
                            <span className="text-sm">Criar card novo automaticamente</span>
                        </label>
                        <p className="text-xs text-slate-400 mt-1">
                            Desmarcado: reunião de lead desconhecido fica só no log e não dispara este fluxo.
                        </p>

                        {createIfMissing && (
                            <div className="mt-3 space-y-3 pl-3 border-l-2 border-indigo-200">
                                <div className="space-y-2">
                                    <Label className="text-xs">Pipeline</Label>
                                    <p className="text-xs text-slate-500">
                                        Usando o pipeline ativo deste workspace.
                                    </p>
                                    <Input
                                        value={pipelineId || ''}
                                        readOnly
                                        className="text-xs font-mono bg-slate-50"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs">Etapa inicial</Label>
                                    <CustomSelect
                                        value={(config.create_card_stage_id as string) || ''}
                                        onChange={(v) => set({ create_card_stage_id: v || null })}
                                        options={[
                                            { value: '', label: 'Selecionar etapa...' },
                                            ...stages.map((s) => ({ value: s.id, label: s.nome })),
                                        ]}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs">Dono do card</Label>
                                    <CustomSelect
                                        value={(config.owner_mode as string) || 'organizer'}
                                        onChange={(v) => set({ owner_mode: v, owner_user_id: v === 'fixed' ? config.owner_user_id : null })}
                                        options={[
                                            { value: 'organizer', label: 'Organizador da reunião (Calendly)' },
                                            { value: 'fixed', label: 'Usuário fixo' },
                                            { value: 'none', label: 'Sem dono (atribuir depois)' },
                                        ]}
                                    />
                                    {(config.owner_mode as string) === 'organizer' && (
                                        <p className="text-xs text-slate-400">
                                            Casa o email do organizador com um usuário do workspace. Se não achar, card fica sem dono.
                                        </p>
                                    )}
                                    {(config.owner_mode as string) === 'fixed' && (
                                        <CustomSelect
                                            value={(config.owner_user_id as string) || ''}
                                            onChange={(v) => set({ owner_user_id: v || null })}
                                            options={[
                                                { value: '', label: 'Selecionar usuário...' },
                                                ...workspaceProfiles.map((p) => ({ value: p.id, label: p.nome })),
                                            ]}
                                        />
                                    )}
                                </div>

                                {(config.owner_mode as string) !== 'none' && (
                                    <div className="space-y-2">
                                        <Label className="text-xs">Atribuir como</Label>
                                        <CustomSelect
                                            value={(config.owner_role as string) || 'sdr'}
                                            onChange={(v) => set({ owner_role: v })}
                                            options={[
                                                { value: 'sdr', label: 'SDR' },
                                                { value: 'vendas', label: 'Planner / Vendas' },
                                                { value: 'pos', label: 'Pós-venda' },
                                                { value: 'concierge', label: 'Concierge' },
                                            ]}
                                        />
                                        <p className="text-xs text-slate-400">
                                            Define em qual papel o usuário fica responsável pelo card.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )
        }

        case 'trigger.task_completed': {
            const taskTipo = (config.task_tipo as string) || ''
            const isMeeting = taskTipo === 'reuniao'
            return (
                <div className="space-y-4">
                    <p className="text-xs text-slate-500">
                        Dispara quando uma tarefa é marcada como concluída no card. Reagendar uma reunião não dispara.
                    </p>

                    <div className="space-y-2">
                        <Label className="text-xs">Tipo de tarefa</Label>
                        <CustomSelect
                            value={taskTipo}
                            onChange={(v) => set({ task_tipo: v || null, outcome: v === 'reuniao' ? config.outcome : null })}
                            options={TASK_TIPO_OPTIONS}
                        />
                        <p className="text-xs text-slate-400">Deixe em "Qualquer tarefa" pra disparar em qualquer conclusão.</p>
                    </div>

                    {isMeeting && (
                        <div className="space-y-2">
                            <Label className="text-xs">Resultado da reunião</Label>
                            <CustomSelect
                                value={(config.outcome as string) || 'qualquer'}
                                onChange={(v) => set({ outcome: v })}
                                options={TASK_OUTCOME_OPTIONS}
                            />
                            <p className="text-xs text-slate-400">Filtra pelo desfecho marcado ao concluir a reunião.</p>
                        </div>
                    )}

                    <details className="bg-indigo-50 border border-indigo-200 rounded-md px-3 py-2">
                        <summary className="text-xs font-medium text-indigo-900 cursor-pointer">
                            Variáveis disponíveis nos próximos passos
                        </summary>
                        <div className="mt-2 text-xs text-indigo-900 space-y-1 font-mono">
                            <div><code>{'{{trigger.data_reuniao}}'}</code> — data da reunião do card (ex: 10/06 às 14:00)</div>
                            <div><code>{'{{trigger.data_reuniao_completa}}'}</code> — data da reunião completa (ex: 10/06/2026 14:00)</div>
                            <div><code>{'{{trigger.task_titulo}}'}</code> — título da tarefa</div>
                            <div><code>{'{{trigger.task_resultado}}'}</code> — resultado (realizada, não compareceu...)</div>
                            <div><code>{'{{contact.primeiro_nome}}'}</code> — primeiro nome do contato</div>
                        </div>
                        <p className="mt-2 text-xs text-indigo-700">
                            Use em campos de texto das ações (criar tarefa, mandar mensagem, atualizar campo).
                        </p>
                    </details>
                </div>
            )
        }
    }
}

export default TriggerEditor
