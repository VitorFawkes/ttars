import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import { Loader2, Plus, Trash2, Eye, EyeOff, CheckSquare, Square, LayoutTemplate, Shield, Edit2, Layers, Grid, ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useProductContext } from '../../../hooks/useProductContext'
import FieldInspectorDrawer from './FieldInspectorDrawer'
import type { Database } from '../../../database.types'

type SystemField = Database['public']['Tables']['system_fields']['Row'] & {
    section?: string
    is_system?: boolean | null
}
type PipelineStage = Database['public']['Tables']['pipeline_stages']['Row'] & {
    phase_id?: string
    fase?: string
    nome?: string
}
type StageFieldConfig = Database['public']['Tables']['stage_field_config']['Row']

import { usePipelinePhases } from '../../../hooks/usePipelinePhases'
import { useSections } from '../../../hooks/useSections'
import { Input } from '../../ui/Input'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuLabel
} from '../../ui/dropdown-menu'

const COLORS = [
    { label: 'Azul', value: 'bg-blue-500' },
    { label: 'Roxo', value: 'bg-purple-500' },
    { label: 'Verde', value: 'bg-green-500' },
    { label: 'Amarelo', value: 'bg-yellow-500' },
    { label: 'Vermelho', value: 'bg-red-500' },
    { label: 'Rosa', value: 'bg-pink-500' },
    { label: 'Indigo', value: 'bg-indigo-500' },
    { label: 'Cinza', value: 'bg-gray-500' },
]

import { PRODUCT_PIPELINE_MAP } from '../../../lib/constants'

export default function StudioUnified() {
    const queryClient = useQueryClient()
    const { currentProduct } = useProductContext()
    const pipelineId = PRODUCT_PIPELINE_MAP[currentProduct] || PRODUCT_PIPELINE_MAP.TRIPS

    const [isAdding, setIsAdding] = useState(false)
    const [editingField, setEditingField] = useState<SystemField | null>(null)
    const [viewMode, setViewMode] = useState<'matrix' | 'macro'>('macro')

    // --- Data Fetching ---
    // Fetch sections filtered by current product (product-specific + shared NULL sections)
    const { data: sectionsData = [], isLoading: loadingSections } = useSections(currentProduct)
    const governableSections = sectionsData.filter(s => s.is_governable)
    const defaultSection = governableSections[0]?.key || sectionsData[0]?.key || 'wedding_info'

    // New Field State (uses defaultSection from above)
    const [newField, setNewField] = useState<Partial<SystemField>>({
        key: '',
        label: '',
        type: 'text',
        section: defaultSection,
        active: true,
        is_system: false
    })

    const { data: stages } = useQuery({
        queryKey: ['pipeline-stages-unified', pipelineId],
        queryFn: async () => {
            // Filter stages by the current product's pipeline — users should never see stages from another product
            const { data } = await supabase
                .from('pipeline_stages')
                .select('*, pipeline_phases!pipeline_stages_phase_id_fkey(order_index)')
                .eq('pipeline_id', pipelineId)
                .order('ordem')
            // Sort by phase order_index then stage ordem
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sorted = (data || []).sort((a: any, b: any) => {
                const phaseA = a.pipeline_phases?.order_index ?? 999
                const phaseB = b.pipeline_phases?.order_index ?? 999
                if (phaseA !== phaseB) return phaseA - phaseB
                return a.ordem - b.ordem
            })
            return sorted as PipelineStage[]
        }
    })

    const { data: phasesData } = usePipelinePhases(pipelineId)
    const phases = useMemo(() => phasesData || [], [phasesData])

    const { data: fields, isLoading: loadingFields } = useQuery({
        queryKey: ['system-fields-unified'],
        queryFn: async () => {
            const { data } = await supabase.from('system_fields').select('*').order('section').order('order_index').order('label')
            return data as SystemField[]
        }
    })

    const { data: configs } = useQuery({
        queryKey: ['stage-field-configs-unified'],
        queryFn: async () => {
            const { data } = await supabase.from('stage_field_config').select('*')
            return data as StageFieldConfig[]
        }
    })

    // --- Optimistic State ---
    const [localConfigs, setLocalConfigs] = useState<Record<string, StageFieldConfig>>({})

    useEffect(() => {
        if (configs) {
            const map: Record<string, StageFieldConfig> = {}
            configs.forEach(c => {
                map[`${c.stage_id}-${c.field_key}`] = c
            })
            setLocalConfigs(map)
        }
    }, [configs])

    // --- Mutations ---
    const createFieldMutation = useMutation({
        mutationFn: async (field: Partial<SystemField>) => {
            // Auto-generate key if missing
            let key = (field.key || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')

            if (!key && field.label) {
                key = field.label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
            }

            if (!key) throw new Error("O campo 'Chave' é obrigatório.")

            // Ensure we don't send extra fields that might not exist in older DB versions if not needed
            // But we expect section and is_system to exist now.
            const payload = {
                key,
                label: field.label,
                type: field.type,
                section: field.section || defaultSection,
                active: field.active ?? true,
                is_system: field.is_system ?? false,
                options: field.options
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await supabase.from('system_fields').insert(payload as any)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['system-fields-unified'] })
            queryClient.invalidateQueries({ queryKey: ['system-fields-config'] }) // Sync with useFieldConfig
            setIsAdding(false)
            setNewField({ key: '', label: '', type: 'text', section: defaultSection, active: true, is_system: false })
        },
        onError: (err) => alert(`Erro ao criar campo: ${err.message}`)
    })

    const updateFieldMutation = useMutation({
        mutationFn: async (field: Partial<SystemField>) => {
            const { error } = await supabase
                .from('system_fields')
                .update({
                    label: field.label,
                    active: field.active,
                    section: field.section,
                    type: field.type,
                    options: field.options
                })
                .eq('key', field.key!)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['system-fields-unified'] })
            queryClient.invalidateQueries({ queryKey: ['system-fields-config'] }) // Sync with useFieldConfig
            setEditingField(null)
        }
    })

    const deleteFieldMutation = useMutation({
        mutationFn: async (key: string) => {
            const { error } = await supabase.from('system_fields').delete().eq('key', key)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['system-fields-unified'] })
            queryClient.invalidateQueries({ queryKey: ['system-fields-config'] }) // Sync with useFieldConfig
        }
    })

    const upsertConfigMutation = useMutation({
        mutationFn: async (newConfigs: Partial<StageFieldConfig>[]) => {
            const { error } = await supabase
                .from('stage_field_config')
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .upsert(newConfigs as any, { onConflict: 'stage_id, field_key' })
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['stage-field-configs-unified'] })
            queryClient.invalidateQueries({ queryKey: ['stage-field-configs-all'] }) // Sync with useFieldConfig
        }
    })

    const updatePhaseMutation = useMutation({
        mutationFn: async (phase: { id: string, color: string }) => {
            const { error } = await supabase.from('pipeline_phases').update({ color: phase.color }).eq('id', phase.id)
            if (error) throw error
        },
        onMutate: async (newPhase) => {
            await queryClient.cancelQueries({ queryKey: ['pipeline-phases'] })
            const previousPhases = queryClient.getQueryData(['pipeline-phases'])
            queryClient.setQueryData<Array<{ id: string; color: string }>>(['pipeline-phases'], (old) => {
                if (!old) return []
                return old.map((p) => p.id === newPhase.id ? { ...p, color: newPhase.color } : p)
            })
            return { previousPhases }
        },
        onError: (err, _newPhase, context) => {
            console.error('Error updating phase:', err)
            if (context?.previousPhases) {
                queryClient.setQueryData(['pipeline-phases'], context.previousPhases)
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['pipeline-phases'] })
        }
    })

    const reorderFieldMutation = useMutation({
        mutationFn: async (updates: { key: string; order_index: number }[]) => {
            for (const u of updates) {
                const { error } = await supabase.from('system_fields').update({ order_index: u.order_index }).eq('key', u.key)
                if (error) throw error
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['system-fields-unified'] })
            queryClient.invalidateQueries({ queryKey: ['system-fields-config'] })
        }
    })

    const handleMoveField = (sectionKey: string, fieldKey: string, direction: 'up' | 'down') => {
        const sectionFields = fieldsBySection[sectionKey] || []
        const idx = sectionFields.findIndex(f => f.key === fieldKey)
        if (idx < 0) return
        const targetIdx = direction === 'up' ? idx - 1 : idx + 1
        if (targetIdx < 0 || targetIdx >= sectionFields.length) return

        const currentField = sectionFields[idx]
        const targetField = sectionFields[targetIdx]
        const currentOrder = currentField.order_index ?? idx
        const targetOrder = targetField.order_index ?? targetIdx

        // Optimistic update
        queryClient.setQueryData(['system-fields-unified'], (old: SystemField[] | undefined) => {
            if (!old) return old
            return old.map(f => {
                if (f.key === currentField.key) return { ...f, order_index: targetOrder }
                if (f.key === targetField.key) return { ...f, order_index: currentOrder }
                return f
            }).sort((a, b) => {
                const secCmp = (a.section || '').localeCompare(b.section || '')
                if (secCmp !== 0) return secCmp
                const orderCmp = (a.order_index ?? 0) - (b.order_index ?? 0)
                if (orderCmp !== 0) return orderCmp
                return a.label.localeCompare(b.label)
            })
        })

        reorderFieldMutation.mutate([
            { key: currentField.key, order_index: targetOrder },
            { key: targetField.key, order_index: currentOrder }
        ])
    }

    // --- Helpers ---
    const getConfig = (stageId: string, fieldKey: string) => {
        return localConfigs[`${stageId}-${fieldKey}`]
    }

    const getPhaseStyles = (color: string) => {
        const isHex = color.startsWith('#') || color.startsWith('rgb')
        if (isHex) {
            return {
                header: { backgroundColor: `${color}1A`, borderTopColor: color }, // 10% opacity approx
                text: { color: color },
                badge: { backgroundColor: color }
            }
        }
        // Tailwind fallback
        const baseColor = color.replace('bg-', '')
        return {
            header: {}, // Let className handle it if possible, or use style
            headerClass: `${color}/10`,
            textClass: `text-${baseColor}`,
            badgeClass: color
        }
    }

    const handleConfigToggle = (stageId: string, fieldKey: string, type: 'visible' | 'required' | 'header') => {
        const current = getConfig(stageId, fieldKey)
        const nextValue = {
            stage_id: stageId,
            field_key: fieldKey,
            is_visible: current?.is_visible ?? true,
            is_required: current?.is_required ?? false,
            show_in_header: current?.show_in_header ?? false
        }

        if (type === 'visible') nextValue.is_visible = !nextValue.is_visible
        if (type === 'required') nextValue.is_required = !nextValue.is_required
        if (type === 'header') nextValue.show_in_header = !nextValue.show_in_header

        setLocalConfigs(prev => ({ ...prev, [`${stageId}-${fieldKey}`]: nextValue as StageFieldConfig }))
        upsertConfigMutation.mutate([nextValue])
    }

    const handleMacroToggle = (macroStageId: string, fieldKey: string, type: 'visible' | 'required' | 'header') => {
        // Filter stages by phase_id (new) or fase name (legacy)
        const phase = phases.find(p => p.id === macroStageId)
        const targetStages = stages?.filter(s =>
            s.phase_id === macroStageId ||
            (!s.phase_id && phase && s.fase === phase.name)
        ) || []

        if (targetStages.length === 0) return

        // Calculate current state (if ALL are true, toggle to false. Otherwise toggle to true)
        const allTrue = targetStages.every(s => {
            const c = getConfig(s.id, fieldKey)
            if (type === 'visible') return c?.is_visible !== false // default true
            if (type === 'required') return c?.is_required === true
            if (type === 'header') return c?.show_in_header === true
            return false
        })

        const newValue = !allTrue
        const updates: Partial<StageFieldConfig>[] = []

        targetStages.forEach(s => {
            const current = getConfig(s.id, fieldKey)
            const next = {
                stage_id: s.id,
                field_key: fieldKey,
                is_visible: current?.is_visible ?? true,
                is_required: current?.is_required ?? false,
                show_in_header: current?.show_in_header ?? false
            }

            if (type === 'visible') next.is_visible = newValue
            if (type === 'required') next.is_required = newValue
            if (type === 'header') next.show_in_header = newValue

            updates.push(next)

            // Optimistic update
            setLocalConfigs(prev => ({ ...prev, [`${s.id}-${fieldKey}`]: next as StageFieldConfig }))
        })

        upsertConfigMutation.mutate(updates)
    }

    const getMacroState = (macroStageId: string, fieldKey: string, type: 'visible' | 'required' | 'header') => {
        const phase = phases.find(p => p.id === macroStageId)
        const targetStages = stages?.filter(s =>
            s.phase_id === macroStageId ||
            (!s.phase_id && phase && s.fase === phase.name)
        ) || []

        if (targetStages.length === 0) return 'none'

        let trueCount = 0
        targetStages.forEach(s => {
            const c = getConfig(s.id, fieldKey)
            let val = false
            if (type === 'visible') val = c?.is_visible !== false
            if (type === 'required') val = c?.is_required === true
            if (type === 'header') val = c?.show_in_header === true
            if (val) trueCount++
        })

        if (trueCount === targetStages.length) return 'all'
        if (trueCount > 0) return 'some'
        return 'none'
    }

    // Filter fields to only those belonging to sections relevant to the current product.
    // This ensures TRIPS fields don't appear in the WEDDING matrix and vice-versa.
    const productFields = useMemo(() => {
        if (!fields) return []
        const validSectionKeys = new Set(sectionsData.map(s => s.key))
        return fields.filter(f => !f.section || validSectionKeys.has(f.section))
    }, [fields, sectionsData])

    const fieldsBySection = useMemo(() => {
        return productFields.reduce((acc, field) => {
            const section = field.section || 'details'
            if (!acc[section]) acc[section] = []
            acc[section].push(field)
            return acc
        }, {} as Record<string, SystemField[]>)
    }, [productFields])

    // DEFINITIVE FIX: Sort stages by Phase order first, then by Stage ordem
    // This ensures stages appear in Kanban order: SDR → PLANNER → PÓS-VENDA → RESOLUÇÃO
    const sortedStages = useMemo(() => {
        if (!stages || !phases.length) return []

        // Create a map of phase order_index for O(1) lookup
        const phaseOrderMap = new Map<string, number>()
        phases.forEach((phase, index) => {
            phaseOrderMap.set(phase.id, phase.order_index ?? index)
            // Also map by name for legacy stages without phase_id
            phaseOrderMap.set(phase.name, phase.order_index ?? index)
        })

        return [...stages].sort((a, b) => {
            // Get phase order for each stage
            const aPhaseOrder = phaseOrderMap.get(a.phase_id || '') ?? phaseOrderMap.get(a.fase || '') ?? 999
            const bPhaseOrder = phaseOrderMap.get(b.phase_id || '') ?? phaseOrderMap.get(b.fase || '') ?? 999

            // First compare by phase order
            if (aPhaseOrder !== bPhaseOrder) {
                return aPhaseOrder - bPhaseOrder
            }

            // Then by stage ordem within the phase
            return (a.ordem || 0) - (b.ordem || 0)
        })
    }, [stages, phases])


    if (loadingFields || loadingSections) return <div className="p-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600" /></div>

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-foreground">Matriz de Governança</h2>
                    <p className="text-muted-foreground mt-1">Configure a visibilidade e regras de campos por etapa.</p>
                </div>
                <div className="flex items-center gap-4">
                    {/* View Toggle */}
                    <div className="flex bg-muted p-1 rounded-lg border border-border">
                        <button
                            onClick={() => setViewMode('macro')}
                            className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                                viewMode === 'macro' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <Layers className="w-4 h-4" />
                            Visão Macro
                        </button>
                        <button
                            onClick={() => setViewMode('matrix')}
                            className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                                viewMode === 'matrix' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <Grid className="w-4 h-4" />
                            Matriz Detalhada
                        </button>
                    </div>

                    <button
                        onClick={() => setIsAdding(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 shadow-sm transition-all font-medium"
                    >
                        <Plus className="w-4 h-4" />
                        Novo Campo
                    </button>
                </div>
            </div>

            {/* INSPECTOR DRAWER */}
            <FieldInspectorDrawer
                isOpen={isAdding || !!editingField}
                onClose={() => { setIsAdding(false); setEditingField(null); }}
                field={editingField || newField}
                isCreating={isAdding}
                onSave={(field) => {
                    if (isAdding) {
                        createFieldMutation.mutate(field as Partial<SystemField>)
                    } else {
                        updateFieldMutation.mutate(field as Partial<SystemField>)
                    }
                }}
            />

            {/* MATRIX GRID */}
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-x-auto">
                <table className="w-full border-collapse">
                    <thead>
                        <tr>
                            {/* Sticky Corner */}
                            <th className="sticky left-0 top-0 z-30 bg-muted border-b border-r border-border p-4 min-w-[250px] text-left">
                                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Campos do Sistema</span>
                            </th>

                            {/* Headers based on View Mode */}
                            {viewMode === 'macro' ? (
                                phases.map(macro => {
                                    const styles = getPhaseStyles(macro.color)
                                    return (
                                        <th
                                            key={macro.id}
                                            className={cn("sticky top-0 z-20 border-b border-border p-3 min-w-[180px] text-center bg-muted", styles.headerClass)}
                                            style={styles.header}
                                        >
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <div className="flex flex-col items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity">
                                                        <span
                                                            className={cn("text-xs font-bold uppercase", styles.textClass)}
                                                            style={styles.text}
                                                        >
                                                            {macro.label}
                                                        </span>
                                                        <span className="text-[10px] text-muted-foreground font-normal">
                                                            {stages?.filter(s => s.phase_id === macro.id || (!s.phase_id && s.fase === macro.name)).length} etapas
                                                        </span>
                                                    </div>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent className="w-64">
                                                    <DropdownMenuLabel>Cor da Fase</DropdownMenuLabel>
                                                    <div className="grid grid-cols-4 gap-2 p-2">
                                                        {COLORS.map(c => (
                                                            <DropdownMenuItem
                                                                key={c.value}
                                                                onSelect={() => {
                                                                    console.log('Color selected via DropdownMenuItem:', c.value)
                                                                    updatePhaseMutation.mutate({ id: macro.id, color: c.value })
                                                                }}
                                                                className="p-0 w-8 h-8 rounded-full justify-center cursor-pointer focus:scale-110 transition-transform hover:bg-muted"
                                                            >
                                                                <div
                                                                    className={cn(
                                                                        "w-6 h-6 rounded-full",
                                                                        c.value,
                                                                        macro.color === c.value && "ring-2 ring-offset-1 ring-offset-background ring-primary"
                                                                    )}
                                                                    title={c.label}
                                                                />
                                                            </DropdownMenuItem>
                                                        ))}
                                                    </div>
                                                    <div className="p-2 border-t border-border mt-2">
                                                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Cor Personalizada (Hex)</label>
                                                        <div className="flex gap-2">
                                                            <div
                                                                className="w-9 h-9 rounded-md border border-border shadow-sm shrink-0"
                                                                style={{ backgroundColor: macro.color }}
                                                            />
                                                            <Input
                                                                placeholder="#000000"
                                                                defaultValue={macro.color.startsWith('#') ? macro.color : ''}
                                                                onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
                                                                    const val = e.target.value
                                                                    if (val.startsWith('#') && (val.length === 4 || val.length === 7)) {
                                                                        updatePhaseMutation.mutate({ id: macro.id, color: val })
                                                                    }
                                                                }}
                                                                className="h-9 text-xs"
                                                            />
                                                        </div>
                                                    </div>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </th>
                                    )
                                })
                            ) : (
                                sortedStages.map(stage => {
                                    const phase = phases.find(p => p.id === stage.phase_id) || phases.find(p => p.name === stage.fase)
                                    const styles = getPhaseStyles(phase?.color || 'bg-gray-500')

                                    return (
                                        <th key={stage.id} className="sticky top-0 z-20 bg-muted border-b border-border p-2 min-w-[140px] text-center">
                                            <div className="flex flex-col items-center gap-1">
                                                <div
                                                    className={cn("w-2 h-2 rounded-full mb-1", styles.badgeClass)}
                                                    style={styles.badge}
                                                />
                                                <span className="text-xs font-bold text-muted-foreground uppercase">{stage.nome}</span>
                                            </div>
                                        </th>
                                    )
                                })
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {governableSections.map(section => {
                            const sectionFields = fieldsBySection[section.key] || []

                            return (
                                <>
                                    {/* Section Header */}
                                    <tr key={section.key} className="bg-muted/50">
                                        <td className="sticky left-0 z-10 bg-muted border-y border-border px-4 py-2">
                                            <div className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide", section.color)}>
                                                {section.label}
                                            </div>
                                        </td>
                                        {viewMode === 'macro' ? (
                                            phases.map(phase => (
                                                <td key={phase.id} className="border-y border-border"></td>
                                            ))
                                        ) : (
                                            <td colSpan={stages?.length || 0} className="border-y border-border"></td>
                                        )}
                                    </tr>

                                    {/* Empty Section Message */}
                                    {sectionFields.length === 0 && (
                                        <tr key={`${section.key}-empty`} className="bg-muted/20">
                                            <td colSpan={(viewMode === 'macro' ? phases.length : (stages?.length || 0)) + 1} className="px-4 py-3 text-center">
                                                <span className="text-sm text-muted-foreground italic">
                                                    Nenhum campo nesta seção. Adicione campos em{' '}
                                                    <a href="/settings/customization/fields" className="text-primary hover:underline">
                                                        Cadastro de Campos
                                                    </a>
                                                </span>
                                            </td>
                                        </tr>
                                    )}

                                    {/* Field Rows */}
                                    {sectionFields.map((field, fieldIdx) => (
                                        <tr key={field.key} className="group hover:bg-muted/50 transition-colors">
                                            {/* Field Name Column (Sticky Left) */}
                                            <td className="sticky left-0 z-10 bg-card group-hover:bg-muted border-r border-border px-4 py-3 transition-colors">
                                                <div className="flex items-center justify-between group/cell">
                                                    <div className="flex items-center gap-2">
                                                        {/* Reorder Arrows */}
                                                        <div className="flex flex-col opacity-0 group-hover/cell:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={() => handleMoveField(section.key, field.key, 'up')}
                                                                disabled={fieldIdx === 0}
                                                                className={cn(
                                                                    "p-0.5 rounded transition-colors",
                                                                    fieldIdx === 0 ? "text-muted-foreground/30 cursor-not-allowed" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                                                )}
                                                                title="Mover para cima"
                                                            >
                                                                <ChevronUp className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleMoveField(section.key, field.key, 'down')}
                                                                disabled={fieldIdx === sectionFields.length - 1}
                                                                className={cn(
                                                                    "p-0.5 rounded transition-colors",
                                                                    fieldIdx === sectionFields.length - 1 ? "text-muted-foreground/30 cursor-not-allowed" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                                                )}
                                                                title="Mover para baixo"
                                                            >
                                                                <ChevronDown className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>

                                                        <div
                                                            className="cursor-pointer"
                                                            onClick={() => setEditingField(field)}
                                                        >
                                                            <div className="font-medium text-foreground text-sm flex items-center gap-2">
                                                                {field.label}
                                                                {field.is_system && <Shield className="w-3 h-3 text-muted-foreground" />}
                                                            </div>
                                                            <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{field.key}</div>
                                                        </div>
                                                    </div>

                                                    {/* Row Actions (Hover) */}
                                                    <div className="opacity-0 group-hover/cell:opacity-100 flex items-center gap-1">
                                                        <button
                                                            onClick={() => setEditingField(field)}
                                                            className="p-1.5 text-muted-foreground hover:text-primary rounded hover:bg-muted"
                                                            title="Editar Campo"
                                                        >
                                                            <Edit2 className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                const msg = field.is_system
                                                                    ? 'Este é um campo de sistema. Tem certeza que deseja excluir?'
                                                                    : 'Tem certeza?'
                                                                if (confirm(msg)) deleteFieldMutation.mutate(field.key)
                                                            }}
                                                            className="p-1.5 text-muted-foreground hover:text-destructive rounded hover:bg-muted"
                                                            title="Excluir Campo"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Config Cells */}
                                            {viewMode === 'macro' ? (
                                                phases.map(macro => {
                                                    const visibleState = getMacroState(macro.id, field.key, 'visible')
                                                    const requiredState = getMacroState(macro.id, field.key, 'required')
                                                    const headerState = getMacroState(macro.id, field.key, 'header')

                                                    return (
                                                        <td key={macro.id} className="px-2 py-3 text-center border-r border-border last:border-r-0">
                                                            <div className="flex items-center justify-center gap-1">
                                                                <button
                                                                    onClick={() => handleMacroToggle(macro.id, field.key, 'visible')}
                                                                    className={cn(
                                                                        "p-1.5 rounded-md transition-all",
                                                                        visibleState === 'all' ? "bg-blue-500/20 text-blue-600 ring-1 ring-blue-500/30" :
                                                                            visibleState === 'some' ? "bg-blue-500/10 text-blue-600/70 ring-1 ring-blue-500/20" :
                                                                                "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                                                                    )}
                                                                    title="Visível"
                                                                >
                                                                    {visibleState === 'some' ? <div className="w-3.5 h-3.5 flex items-center justify-center font-bold text-xs">-</div> :
                                                                        visibleState === 'all' ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                                                                </button>

                                                                <button
                                                                    onClick={() => handleMacroToggle(macro.id, field.key, 'required')}
                                                                    className={cn(
                                                                        "p-1.5 rounded-md transition-all",
                                                                        requiredState === 'all' ? "bg-red-500/20 text-red-600 ring-1 ring-red-500/30" :
                                                                            requiredState === 'some' ? "bg-red-500/10 text-red-600/70 ring-1 ring-red-500/20" :
                                                                                "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                                                                    )}
                                                                    title="Obrigatório"
                                                                >
                                                                    {requiredState === 'some' ? <div className="w-3.5 h-3.5 flex items-center justify-center font-bold text-xs">-</div> :
                                                                        requiredState === 'all' ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                                                                </button>

                                                                <button
                                                                    onClick={() => handleMacroToggle(macro.id, field.key, 'header')}
                                                                    className={cn(
                                                                        "p-1.5 rounded-md transition-all",
                                                                        headerState === 'all' ? "bg-purple-500/20 text-purple-600 ring-1 ring-purple-500/30" :
                                                                            headerState === 'some' ? "bg-purple-500/10 text-purple-600/70 ring-1 ring-purple-500/20" :
                                                                                "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                                                                    )}
                                                                    title="No Cabeçalho"
                                                                >
                                                                    {headerState === 'some' ? <div className="w-3.5 h-3.5 flex items-center justify-center font-bold text-xs">-</div> :
                                                                        <LayoutTemplate className="w-3.5 h-3.5" />}
                                                                </button>
                                                            </div>
                                                        </td>
                                                    )
                                                })
                                            ) : (
                                                sortedStages.map(stage => {
                                                    const config = getConfig(stage.id, field.key)
                                                    const isVisible = config?.is_visible ?? true
                                                    const isRequired = config?.is_required ?? false
                                                    const isHeader = config?.show_in_header ?? false

                                                    return (
                                                        <td key={stage.id} className="px-2 py-3 text-center border-r border-border last:border-r-0">
                                                            <div className="flex items-center justify-center gap-1">
                                                                <button
                                                                    onClick={() => handleConfigToggle(stage.id, field.key, 'visible')}
                                                                    className={cn(
                                                                        "p-1.5 rounded-md transition-all",
                                                                        isVisible
                                                                            ? "bg-blue-500/20 text-blue-600 hover:bg-blue-500/30 ring-1 ring-blue-500/30"
                                                                            : "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                                                                    )}
                                                                    title={isVisible ? "Visível" : "Oculto"}
                                                                >
                                                                    {isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                                                                </button>

                                                                <button
                                                                    onClick={() => handleConfigToggle(stage.id, field.key, 'required')}
                                                                    className={cn(
                                                                        "p-1.5 rounded-md transition-all",
                                                                        isRequired
                                                                            ? "bg-red-500/20 text-red-600 hover:bg-red-500/30 ring-1 ring-red-500/30"
                                                                            : "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                                                                    )}
                                                                    title={isRequired ? "Obrigatório" : "Opcional"}
                                                                >
                                                                    {isRequired ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                                                                </button>

                                                                <button
                                                                    onClick={() => handleConfigToggle(stage.id, field.key, 'header')}
                                                                    className={cn(
                                                                        "p-1.5 rounded-md transition-all",
                                                                        isHeader
                                                                            ? "bg-purple-500/20 text-purple-600 hover:bg-purple-500/30 ring-1 ring-purple-500/30"
                                                                            : "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                                                                    )}
                                                                    title={isHeader ? "No Cabeçalho" : "Fora do Cabeçalho"}
                                                                >
                                                                    <LayoutTemplate className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    )
                                                })
                                            )}
                                        </tr>
                                    ))}
                                </>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
