/**
 * TriggerEditor — editor unificado pros 9 tipos de trigger.
 *
 * Renderiza campos diferentes conforme o `triggerType`:
 *  - card_created                 → applicable_pipeline_ids (opcional)
 *  - stage_enter                  → applicable_stage_ids (multi)
 *  - macro_stage_enter            → phase_id
 *  - field_changed                → field_key (whitelist) + opt: from/to
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
import type { TriggerNodeType } from '../types'

interface TriggerEditorProps {
    type: TriggerNodeType
    config: Record<string, unknown>
    onChange: (next: Record<string, unknown>) => void
}

const TIME_OFFSET_SOURCES = [
    { value: 'card.data_viagem_inicio', label: 'Data de início da viagem' },
    { value: 'card.data_viagem_fim',    label: 'Data de fim da viagem' },
    { value: 'contato.data_nascimento', label: 'Aniversário do contato' },
    { value: 'proposal.expires_at',     label: 'Vencimento da proposta' },
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
]

export const TriggerEditor: React.FC<TriggerEditorProps> = ({ type, config, onChange }) => {
    const { pipelineId } = useCurrentProductMeta()
    const product = useProductContext((s) => s.currentProduct)
    const { data: stages = [] } = usePipelineStages(pipelineId)
    const { data: phases = [] } = usePipelinePhases(pipelineId)
    const { tags } = useCardTags(product || undefined)

    const set = (patch: Record<string, unknown>) => onChange({ ...config, ...patch })

    switch (type) {
        case 'trigger.card_created':
            return (
                <div className="space-y-3">
                    <p className="text-sm text-slate-600">
                        Dispara quando um card é criado no pipeline. Não exige config adicional —
                        opcionalmente filtre por etapa inicial abaixo.
                    </p>
                    <div className="space-y-2">
                        <Label className="text-xs">Etapa inicial específica (opcional)</Label>
                        <CustomSelect
                            value={(config.initial_stage_id as string) || ''}
                            onChange={(v) => set({ initial_stage_id: v || null })}
                            options={[
                                { value: '', label: 'Qualquer etapa' },
                                ...stages.map((s) => ({ value: s.id, label: s.nome })),
                            ]}
                        />
                    </div>
                </div>
            )

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
                            value={(config.field_key as string) || ''}
                            onChange={(v) => set({ field_key: v || null })}
                            options={[
                                { value: '', label: 'Selecionar campo...' },
                                ...FIELD_WHITELIST,
                            ]}
                        />
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

        case 'trigger.time_offset_from_date':
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
                    <div className="space-y-2">
                        <Label className="text-xs">Dias de defasagem (positivo = depois, negativo = antes)</Label>
                        <Input
                            type="number"
                            value={(config.days_offset as number) ?? 0}
                            onChange={(e) => set({ days_offset: parseInt(e.target.value) || 0 })}
                        />
                    </div>
                </div>
            )

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
    }
}

export default TriggerEditor
