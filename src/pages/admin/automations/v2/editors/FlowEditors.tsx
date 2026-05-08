/**
 * FlowEditors — wait, end, branch, start_cadence.
 */
import React, { useEffect, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/Input'
import { Select as CustomSelect } from '@/components/ui/Select'
import { Switch } from '@/components/ui/switch'
import { usePipelineStages } from '@/hooks/usePipelineStages'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import { supabase } from '@/lib/supabase'

interface ConfigEditorProps {
    config: Record<string, unknown>
    onChange: (next: Record<string, unknown>) => void
}

// ─── Wait ────────────────────────────────────────────────────────────────────
//
// UI mantém quantidade + unidade (segundos / minutos / horas / dias).
// Persistência: sempre em duration_minutes (engine usa addMinutes),
// com fração quando a unidade é segundos. duration_unit guarda a
// unidade só pra UI re-hidratar do mesmo jeito.
const UNIT_TO_MINUTES = {
    seconds: 1 / 60,
    minutes: 1,
    hours: 60,
    days: 1440,
}
type WaitUnit = keyof typeof UNIT_TO_MINUTES

const inferUnit = (config: Record<string, unknown>): WaitUnit => {
    const stored = config.duration_unit as WaitUnit | undefined
    if (stored && stored in UNIT_TO_MINUTES) return stored
    const m = (config.duration_minutes as number) ?? 60
    if (m < 1) return 'seconds'
    if (m < 60) return 'minutes'
    if (m < 1440) return 'hours'
    return 'days'
}

const inferAmount = (config: Record<string, unknown>): number => {
    const stored = config.duration_amount as number | undefined
    if (typeof stored === 'number' && stored > 0) return stored
    const unit = inferUnit(config)
    const m = (config.duration_minutes as number) ?? 60
    const factor = UNIT_TO_MINUTES[unit]
    return Math.max(1, Math.round(m / factor))
}

export const WaitEditor: React.FC<ConfigEditorProps> = ({ config, onChange }) => {
    const amount = inferAmount(config)
    const unit = inferUnit(config)
    const businessHours = (config.duration_type as string) === 'business'

    const apply = (newAmount: number, newUnit: WaitUnit, newBusiness: boolean) => {
        onChange({
            ...config,
            duration_amount: newAmount,
            duration_unit: newUnit,
            duration_minutes: newAmount * UNIT_TO_MINUTES[newUnit],
            duration_type: newBusiness ? 'business' : 'calendar',
        })
    }

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                    <Label className="text-xs">Quantidade</Label>
                    <Input
                        type="number"
                        min={1}
                        value={amount}
                        onChange={(e) => apply(parseInt(e.target.value) || 1, unit, businessHours)}
                    />
                </div>
                <div className="space-y-2">
                    <Label className="text-xs">Unidade</Label>
                    <CustomSelect
                        value={unit}
                        onChange={(v) => apply(amount, v as WaitUnit, businessHours)}
                        options={[
                            { value: 'seconds', label: 'Segundos' },
                            { value: 'minutes', label: 'Minutos' },
                            { value: 'hours',   label: 'Horas' },
                            { value: 'days',    label: 'Dias' },
                        ]}
                    />
                </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                <input
                    type="checkbox"
                    checked={businessHours}
                    onChange={(e) => apply(amount, unit, e.target.checked)}
                />
                Contar só em horário comercial
            </label>
        </div>
    )
}

// ─── End ─────────────────────────────────────────────────────────────────────
export const EndEditor: React.FC<ConfigEditorProps> = ({ config, onChange }) => {
    const { pipelineId } = useCurrentProductMeta()
    const { data: stages = [] } = usePipelineStages(pipelineId)
    const set = (patch: Record<string, unknown>) => onChange({ ...config, ...patch })

    return (
        <div className="space-y-3">
            <div className="space-y-2">
                <Label className="text-xs">Resultado</Label>
                <CustomSelect
                    value={(config.result as string) || 'success'}
                    onChange={(v) => set({ result: v })}
                    options={[
                        { value: 'success',  label: 'Sucesso' },
                        { value: 'failure',  label: 'Falha' },
                        { value: 'ghosting', label: 'Ghosting' },
                    ]}
                />
            </div>
            <div className="space-y-2">
                <Label className="text-xs">Mover card pra etapa (opcional)</Label>
                <CustomSelect
                    value={(config.move_to_stage_id as string) || ''}
                    onChange={(v) => set({ move_to_stage_id: v || null })}
                    options={[
                        { value: '', label: 'Não mover' },
                        ...stages.map((s) => ({ value: s.id, label: s.nome })),
                    ]}
                />
            </div>
        </div>
    )
}

// ─── Branch ──────────────────────────────────────────────────────────────────
export const BranchEditor: React.FC<ConfigEditorProps> = ({ config, onChange }) => {
    const { pipelineId } = useCurrentProductMeta()
    const { data: branchStages = [] } = usePipelineStages(pipelineId)
    const set = (patch: Record<string, unknown>) => onChange({ ...config, ...patch })
    const conditionType = (config.condition_type as string) || 'task_outcome'

    return (
        <div className="space-y-3">
            <div className="space-y-2">
                <Label className="text-xs">Bifurca o fluxo conforme</Label>
                <CustomSelect
                    value={conditionType}
                    onChange={(v) => set({ condition_type: v })}
                    options={[
                        { value: 'task_outcome',          label: 'Resultado da tarefa anterior' },
                        { value: 'card_in_stage',         label: 'Card está na etapa X' },
                        { value: 'successful_contacts_gte', label: 'Contatos com sucesso ≥ N' },
                    ]}
                />
            </div>

            {conditionType === 'card_in_stage' && (
                <div className="space-y-2">
                    <Label className="text-xs">Etapa</Label>
                    <CustomSelect
                        value={(config.stage_id as string) || ''}
                        onChange={(v) => set({ stage_id: v || null })}
                        options={[
                            { value: '', label: 'Selecionar etapa...' },
                            ...branchStages.map((s) => ({ value: s.id, label: s.nome })),
                        ]}
                    />
                </div>
            )}
            {conditionType === 'successful_contacts_gte' && (
                <div className="space-y-2">
                    <Label className="text-xs">Contatos mínimos</Label>
                    <Input
                        type="number"
                        min={1}
                        value={(config.min_contacts as number) ?? 1}
                        onChange={(e) => set({ min_contacts: parseInt(e.target.value) || 1 })}
                    />
                </div>
            )}

            <p className="text-xs text-slate-500">
                A saída <strong className="text-emerald-700">verde (true)</strong> dispara quando a condição é satisfeita.
                A <strong className="text-rose-700">vermelha (false)</strong> dispara caso contrário.
            </p>
        </div>
    )
}

// ─── Start cadence ───────────────────────────────────────────────────────────
interface CadenceTemplateRow { id: string; name: string }

export const StartCadenceEditor: React.FC<ConfigEditorProps> = ({ config, onChange }) => {
    const [templates, setTemplates] = useState<CadenceTemplateRow[]>([])
    const set = (patch: Record<string, unknown>) => onChange({ ...config, ...patch })

    useEffect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(supabase as any)
            .from('cadence_templates')
            .select('id, name')
            .eq('is_active', true)
            .order('name')
            .then(({ data }: { data: CadenceTemplateRow[] | null }) => setTemplates(data || []))
    }, [])

    return (
        <div className="space-y-2">
            <Label className="text-xs">Cadência a iniciar</Label>
            <CustomSelect
                value={(config.target_template_id as string) || ''}
                onChange={(v) => set({ target_template_id: v || null })}
                options={[
                    { value: '', label: 'Selecionar cadência...' },
                    ...templates.map((t) => ({ value: t.id, label: t.name })),
                ]}
            />
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg mt-3">
                <div>
                    <Label className="text-xs">Cancelar duplicatas</Label>
                    <p className="text-[11px] text-slate-500">Se já existe cadência ativa pro card, cancela e reinicia</p>
                </div>
                <Switch
                    checked={(config.cancel_existing as boolean) ?? false}
                    onCheckedChange={(checked) => set({ cancel_existing: checked })}
                />
            </div>
        </div>
    )
}
