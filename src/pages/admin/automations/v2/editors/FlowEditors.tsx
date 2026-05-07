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
export const WaitEditor: React.FC<ConfigEditorProps> = ({ config, onChange }) => {
    const set = (patch: Record<string, unknown>) => onChange({ ...config, ...patch })
    const minutes: number = (config.duration_minutes as number) ?? 60
    const type = (config.duration_type as string) ?? 'business'

    const formatDuration = (m: number) => {
        if (m < 60) return `${m} min`
        if (m < 1440) return `${Math.round(m / 60)}h`
        return `${Math.round(m / 1440)} dia(s)`
    }

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                    <Label className="text-xs">Quanto tempo esperar</Label>
                    <Input
                        type="number"
                        min={1}
                        value={minutes}
                        onChange={(e) => set({ duration_minutes: parseInt(e.target.value) || 60 })}
                    />
                </div>
                <div className="space-y-2">
                    <Label className="text-xs">Tipo</Label>
                    <CustomSelect
                        value={type}
                        onChange={(v) => set({ duration_type: v })}
                        options={[
                            { value: 'business', label: 'Horário comercial' },
                            { value: 'calendar', label: 'Calendário (24/7)' },
                        ]}
                    />
                </div>
            </div>
            <p className="text-xs text-slate-500">≈ {formatDuration(minutes)} antes de seguir pro próximo passo.</p>
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
                    <Label className="text-xs">ID da etapa</Label>
                    <Input
                        value={(config.stage_id as string) || ''}
                        onChange={(e) => set({ stage_id: e.target.value })}
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
