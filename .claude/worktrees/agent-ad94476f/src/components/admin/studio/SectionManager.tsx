import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import { useAllSections, useSectionMutations, type Section } from '../../../hooks/useSections'
import { useProductContext } from '../../../hooks/useProductContext'
import { useFieldConfig } from '../../../hooks/useFieldConfig'
import { useSectionFieldConfig } from '../../../hooks/useSectionFieldConfig'
import PhaseFieldConfigPanel from './PhaseFieldConfigPanel'
import { Plus, Trash2, GripVertical, Edit2, Check, X, Lock, EyeOff, Eye, ToggleLeft, ToggleRight, Layers, CheckSquare, Square, ChevronsUpDown, Calendar } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/Input'
import { Select } from '../../ui/Select'
import { Badge } from '../../ui/Badge'
import { useToast } from '../../../contexts/ToastContext'
import { usePipelineStages } from '../../../hooks/usePipelineStages'
import { usePipelinePhases } from '../../../hooks/usePipelinePhases'
import { useStageSectionConfig } from '../../../hooks/useStageSectionConfig'
import { useCurrentProductMeta } from '../../../hooks/useCurrentProductMeta'
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent
} from '@dnd-kit/core'
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const POSITION_OPTIONS = [
    { value: 'left_column', label: '⬅️ Coluna Esquerda (Área de Trabalho)' },
    { value: 'right_column', label: '➡️ Coluna Direita (Contexto)' }
]

const COLOR_PRESETS = [
    { value: 'bg-blue-50 text-blue-700 border-blue-100', label: 'Azul', preview: 'bg-blue-500' },
    { value: 'bg-red-50 text-red-700 border-red-100', label: 'Vermelho', preview: 'bg-red-500' },
    { value: 'bg-green-50 text-green-700 border-green-100', label: 'Verde', preview: 'bg-green-500' },
    { value: 'bg-purple-50 text-purple-700 border-purple-100', label: 'Roxo', preview: 'bg-purple-500' },
    { value: 'bg-yellow-50 text-yellow-700 border-yellow-100', label: 'Amarelo', preview: 'bg-yellow-500' },
    { value: 'bg-orange-50 text-orange-700 border-orange-100', label: 'Laranja', preview: 'bg-orange-500' },
    { value: 'bg-gray-50 text-gray-700 border-gray-100', label: 'Cinza', preview: 'bg-gray-500' },
]

// Section keys with dedicated hardcoded components in CardDetail
// These sections cannot have their position/order changed via SectionManager
const HARDCODED_SECTION_KEYS = ['agenda_tarefas', 'historico_conversas', 'people']

// Widget components that render phase tabs — use PhaseFieldConfigPanel instead of SectionFieldDefaultsPicker
const TABBED_WIDGET_COMPONENTS = ['observacoes_criticas', 'trip_info', 'wedding_info']

const ICON_OPTIONS = [
    { value: 'layers', label: 'Layers' },
    { value: 'plane', label: 'Avião' },
    { value: 'alert-triangle', label: 'Alerta' },
    { value: 'users', label: 'Pessoas' },
    { value: 'credit-card', label: 'Cartão' },
    { value: 'settings', label: 'Configurações' },
    { value: 'file-text', label: 'Documento' },
    { value: 'calendar', label: 'Calendário' },
    { value: 'map-pin', label: 'Localização' },
    { value: 'star', label: 'Estrela' },
]

interface SectionFormData {
    key: string
    label: string
    color: string
    icon: string
    position: 'left_column' | 'right_column'
    is_governable: boolean
}

const defaultFormData: SectionFormData = {
    key: '',
    label: '',
    color: 'bg-blue-50 text-blue-700 border-blue-100',
    icon: 'layers',
    position: 'left_column',
    is_governable: true
}

function DateFeatureToggles() {
    const queryClient = useQueryClient()
    const { data: settings, isLoading } = useQuery({
        queryKey: ['date-feature-settings-admin'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('integration_settings')
                .select('key, value, description')
                .like('key', 'date_features.%')
            if (error) throw error
            return data as { key: string; value: string; description: string | null }[]
        },
    })

    const updateMutation = useMutation({
        mutationFn: async ({ key, value }: { key: string; value: string }) => {
            const { error } = await supabase
                .from('integration_settings')
                .update({ value, updated_at: new Date().toISOString() })
                .eq('key', key)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['date-feature-settings-admin'] })
            queryClient.invalidateQueries({ queryKey: ['date-feature-settings'] })
        },
    })

    if (isLoading || !settings || settings.length === 0) return null

    const toggles = [
        {
            key: 'date_features.pos_venda_alert_enabled',
            label: 'Alerta ao mover para Pós-Venda',
            description: 'Exibe confirmação de data de viagem ao mover card para a primeira etapa de pós-venda',
        },
        {
            key: 'date_features.auto_calc_from_products_enabled',
            label: 'Auto-calcular Data Viagem c/ Welcome',
            description: 'Calcula automaticamente a data a partir dos produtos financeiros (exceto seguro viagem)',
        },
    ]

    return (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-orange-500" />
                Regras de Data de Viagem
            </h3>
            <div className="space-y-3">
                {toggles.map(toggle => {
                    const setting = settings.find(s => s.key === toggle.key)
                    const isEnabled = setting?.value === 'true'
                    return (
                        <div key={toggle.key} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                            <div>
                                <p className="text-sm font-medium text-foreground">{toggle.label}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{toggle.description}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => updateMutation.mutate({ key: toggle.key, value: isEnabled ? 'false' : 'true' })}
                                disabled={updateMutation.isPending}
                                className="flex-shrink-0 ml-4"
                            >
                                {isEnabled ? (
                                    <ToggleRight className="w-8 h-8 text-green-600" />
                                ) : (
                                    <ToggleLeft className="w-8 h-8 text-gray-400" />
                                )}
                            </button>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

export default function SectionManager() {
    const { toast } = useToast()
    const { currentProduct } = useProductContext()
    const { pipelineId } = useCurrentProductMeta()
    // Fetch ALL sections (active + inactive) so admin can toggle visibility
    const { data: sections = [], isLoading } = useAllSections(currentProduct)
    const { createSection, updateSection, deleteSection, reorderSections } = useSectionMutations()
    const { data: stages = [] } = usePipelineStages(pipelineId)
    const { data: phases = [] } = usePipelinePhases(pipelineId)

    const [isAdding, setIsAdding] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [formData, setFormData] = useState<SectionFormData>(defaultFormData)

    // Separate sections by position, active first then inactive
    const leftSections = useMemo(() => {
        const active = sections.filter(s => s.position === 'left_column' && s.active).sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
        const inactive = sections.filter(s => s.position === 'left_column' && !s.active).sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
        return { active, inactive }
    }, [sections])
    const rightSections = useMemo(() => {
        const active = sections.filter(s => s.position === 'right_column' && s.active).sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
        const inactive = sections.filter(s => s.position === 'right_column' && !s.active).sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
        return { active, inactive }
    }, [sections])

    // DnD sensors
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )

    const handleDragEnd = async (event: DragEndEvent, position: 'left_column' | 'right_column') => {
        const { active, over } = event
        if (!over || active.id === over.id) return

        const group = position === 'left_column' ? leftSections : rightSections
        const sectionsToReorder = group.active
        const oldIndex = sectionsToReorder.findIndex(s => s.id === active.id)
        const newIndex = sectionsToReorder.findIndex(s => s.id === over.id)

        if (oldIndex !== -1 && newIndex !== -1) {
            const newOrder = arrayMove(sectionsToReorder, oldIndex, newIndex)
            const updates = newOrder.map((s, idx) => ({ id: s.id, order_index: (idx + 1) * 10 }))

            try {
                await reorderSections.mutateAsync(updates)
                toast({ title: 'Ordem atualizada', type: 'success' })
            } catch (err: unknown) {
                toast({ title: 'Erro ao reordenar', description: err instanceof Error ? err.message : 'Erro desconhecido', type: 'error' })
            }
        }
    }

    const handleCreate = async () => {
        if (!formData.label.trim()) {
            toast({ title: 'Nome é obrigatório', type: 'error' })
            return
        }

        const key = formData.key || formData.label.toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^a-z0-9_]/g, '')

        try {
            await createSection.mutateAsync({
                ...formData,
                key
            } as SectionFormData & { key: string })
            toast({ title: 'Seção criada com sucesso', type: 'success' })
            setIsAdding(false)
            setFormData(defaultFormData)
        } catch (err: unknown) {
            toast({ title: 'Erro ao criar seção', description: err instanceof Error ? err.message : 'Erro desconhecido', type: 'error' })
        }
    }

    const handleUpdate = async () => {
        if (!editingId) return

        try {
            await updateSection.mutateAsync({ id: editingId, ...formData })
            toast({ title: 'Seção atualizada', type: 'success' })
            setEditingId(null)
            setFormData(defaultFormData)
        } catch (err: unknown) {
            toast({ title: 'Erro ao atualizar seção', description: err instanceof Error ? err.message : 'Erro desconhecido', type: 'error' })
        }
    }

    const handleDelete = async (section: Section) => {
        if (section.is_system) {
            toast({ title: 'Seções do sistema não podem ser excluídas', type: 'error' })
            return
        }

        if (!confirm(`Excluir seção "${section.label}"? Campos associados serão desvinculados.`)) {
            return
        }

        try {
            await deleteSection.mutateAsync(section.id)
            toast({ title: 'Seção excluída', type: 'success' })
        } catch (err: unknown) {
            toast({ title: 'Erro ao excluir seção', description: err instanceof Error ? err.message : 'Erro desconhecido', type: 'error' })
        }
    }

    const handleToggleActive = async (section: Section) => {
        if (HARDCODED_SECTION_KEYS.includes(section.key)) return

        try {
            await updateSection.mutateAsync({ id: section.id, active: !section.active })
            toast({
                title: section.active ? 'Seção ocultada' : 'Seção reativada',
                type: 'success'
            })
        } catch (err: unknown) {
            toast({ title: 'Erro ao alterar visibilidade', description: err instanceof Error ? err.message : 'Erro desconhecido', type: 'error' })
        }
    }

    const handleToggleCollapsed = async (section: Section) => {
        try {
            await updateSection.mutateAsync({
                id: section.id,
                default_collapsed: !section.default_collapsed
            })
            toast({
                title: section.default_collapsed ? 'Seção inicia expandida' : 'Seção inicia retraída',
                type: 'success'
            })
        } catch (err: unknown) {
            toast({ title: 'Erro ao alterar estado inicial', description: err instanceof Error ? err.message : 'Erro desconhecido', type: 'error' })
        }
    }

    const startEdit = (section: Section) => {
        setEditingId(section.id)
        setFormData({
            key: section.key,
            label: section.label,
            color: section.color || defaultFormData.color,
            icon: section.icon || 'layers',
            position: (section.position as 'left_column' | 'right_column') || 'left_column',
            is_governable: section.is_governable ?? true
        })
        setIsAdding(false)
    }

    const cancelEdit = () => {
        setEditingId(null)
        setIsAdding(false)
        setFormData(defaultFormData)
    }

    if (isLoading) {
        return (
            <div className="p-8 text-center">
                <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto" />
            </div>
        )
    }

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-foreground">Gerenciador de Seções</h2>
                    <p className="text-muted-foreground mt-1">
                        Crie e organize seções personalizadas para o CardDetail
                    </p>
                </div>
                <Button
                    onClick={() => {
                        setIsAdding(true)
                        setEditingId(null)
                        setFormData(defaultFormData)
                    }}
                    disabled={isAdding || !!editingId}
                >
                    <Plus className="w-4 h-4 mr-2" />
                    Nova Seção
                </Button>
            </div>

            {/* Regras de Data */}
            <DateFeatureToggles />

            {/* Form (Add/Edit) */}
            {(isAdding || editingId) && (
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                    <h3 className="font-semibold text-foreground mb-4">
                        {isAdding ? '➕ Nova Seção' : '✏️ Editar Seção'}
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Nome da Seção</label>
                            <Input
                                value={formData.label}
                                onChange={e => setFormData({ ...formData, label: e.target.value })}
                                placeholder="Ex: Informações Extras"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Chave (ID)</label>
                            <Input
                                value={formData.key}
                                onChange={e => setFormData({ ...formData, key: e.target.value })}
                                placeholder="auto-gerado se vazio"
                                className="font-mono text-sm"
                                disabled={!!editingId}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Posição no CardDetail</label>
                            <Select
                                value={formData.position}
                                onChange={val => setFormData({ ...formData, position: val as SectionFormData['position'] })}
                                options={POSITION_OPTIONS}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Ícone</label>
                            <Select
                                value={formData.icon}
                                onChange={val => setFormData({ ...formData, icon: val })}
                                options={ICON_OPTIONS}
                            />
                        </div>

                        <div className="space-y-2 md:col-span-2">
                            <label className="text-sm font-medium text-foreground">Cor do Cabeçalho</label>
                            <div className="flex flex-wrap gap-2">
                                {COLOR_PRESETS.map(color => (
                                    <button
                                        key={color.value}
                                        type="button"
                                        onClick={() => setFormData({ ...formData, color: color.value })}
                                        className={cn(
                                            "w-8 h-8 rounded-full transition-all",
                                            color.preview,
                                            formData.color === color.value && "ring-2 ring-offset-2 ring-primary"
                                        )}
                                        title={color.label}
                                    />
                                ))}
                            </div>
                        </div>

                        <div className="md:col-span-2">
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={formData.is_governable}
                                    onChange={e => setFormData({ ...formData, is_governable: e.target.checked })}
                                    className="w-4 h-4 rounded border-border"
                                />
                                <span className="text-sm text-foreground">
                                    Governável (campos podem ter regras por etapa)
                                </span>
                            </label>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 mt-6">
                        <Button variant="outline" onClick={cancelEdit}>
                            <X className="w-4 h-4 mr-2" />
                            Cancelar
                        </Button>
                        <Button onClick={isAdding ? handleCreate : handleUpdate}>
                            <Check className="w-4 h-4 mr-2" />
                            {isAdding ? 'Criar Seção' : 'Salvar'}
                        </Button>
                    </div>
                </div>
            )}

            {/* Sections List - Two Columns with Drag & Drop */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column */}
                {/* Left Column */}
                <SectionColumn
                    label="⬅️ Coluna Esquerda"
                    position="left_column"
                    activeSections={leftSections.active}
                    inactiveSections={leftSections.inactive}
                    sensors={sensors}
                    editingId={editingId}
                    onDragEnd={handleDragEnd}
                    onEdit={startEdit}
                    onDelete={handleDelete}
                    onToggleActive={handleToggleActive}
                    onToggleCollapsed={handleToggleCollapsed}
                    stages={stages}
                    phases={phases}
                />

                {/* Right Column */}
                <SectionColumn
                    label="➡️ Coluna Direita"
                    position="right_column"
                    activeSections={rightSections.active}
                    inactiveSections={rightSections.inactive}
                    sensors={sensors}
                    editingId={editingId}
                    onDragEnd={handleDragEnd}
                    onEdit={startEdit}
                    onDelete={handleDelete}
                    onToggleActive={handleToggleActive}
                    onToggleCollapsed={handleToggleCollapsed}
                    stages={stages}
                    phases={phases}
                />
            </div>
        </div>
    )
}

// Column component with active + inactive sections
interface SectionColumnProps {
    label: string
    position: 'left_column' | 'right_column'
    activeSections: Section[]
    inactiveSections: Section[]
    sensors: ReturnType<typeof useSensors>
    editingId: string | null
    onDragEnd: (event: DragEndEvent, position: 'left_column' | 'right_column') => void
    onEdit: (section: Section) => void
    onDelete: (section: Section) => void
    onToggleActive: (section: Section) => void
    onToggleCollapsed: (section: Section) => void
    stages: { id: string; nome: string; phase_id: string | null; fase: string }[]
    phases: { id: string; slug: string | null; name: string; color?: string | null; visible_in_card?: boolean | null }[]
}

function SectionColumn({ label, position, activeSections, inactiveSections, sensors, editingId, onDragEnd, onEdit, onDelete, onToggleActive, onToggleCollapsed, stages, phases }: SectionColumnProps) {
    const totalCount = activeSections.length + inactiveSections.length

    return (
        <div className="space-y-3">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                {label}
                <Badge variant="outline" className="text-xs">{totalCount}</Badge>
            </h3>

            {totalCount === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center bg-muted/50 rounded-lg">
                    Nenhuma seção nesta coluna
                </p>
            ) : (
                <>
                    {activeSections.length > 0 && (
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={(e) => onDragEnd(e, position)}
                        >
                            <SortableContext items={activeSections.map(s => s.id)} strategy={verticalListSortingStrategy}>
                                <div className="space-y-2">
                                    {activeSections.map(section => (
                                        <SortableSectionCard
                                            key={section.id}
                                            section={section}
                                            isEditing={editingId === section.id}
                                            onEdit={() => onEdit(section)}
                                            onDelete={() => onDelete(section)}
                                            onToggleActive={() => onToggleActive(section)}
                                            onToggleCollapsed={() => onToggleCollapsed(section)}
                                            stages={stages}
                                            phases={phases}
                                        />
                                    ))}
                                </div>
                            </SortableContext>
                        </DndContext>
                    )}

                    {inactiveSections.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 pt-2">
                                <div className="h-px flex-1 bg-border" />
                                <span className="text-xs text-muted-foreground font-medium">Seções ocultas</span>
                                <div className="h-px flex-1 bg-border" />
                            </div>
                            {inactiveSections.map(section => (
                                <SortableSectionCard
                                    key={section.id}
                                    section={section}
                                    isEditing={editingId === section.id}
                                    onEdit={() => onEdit(section)}
                                    onDelete={() => onDelete(section)}
                                    onToggleActive={() => onToggleActive(section)}
                                    onToggleCollapsed={() => onToggleCollapsed(section)}
                                    stages={stages}
                                    phases={phases}
                                />
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

// ── Trip Info Phase Visibility Picker ─────────────────────────────────────
// For trip_info sections: shows each phase as a sub-section with visibility/collapse toggles per stage

interface TripInfoPhaseVisibilityPickerProps {
    sectionKey: string
    stages: { id: string; nome: string; phase_id: string | null; fase: string }[]
    phases: { id: string; slug: string | null; name: string; color?: string | null; visible_in_card?: boolean | null }[]
}

function TripInfoPhaseVisibilityPicker({ sectionKey, stages, phases }: TripInfoPhaseVisibilityPickerProps) {
    const { toast } = useToast()
    const { getHiddenSections, getCollapsedSections, toggleVisibility, toggleCollapsed } = useStageSectionConfig()
    const [open, setOpen] = useState(false)

    // All phases (including ones with visible_in_card=false)
    const allPhases = useMemo(() => {
        return phases.filter(p => p.slug !== 'resolucao')
    }, [phases])

    // Summary counts
    const summary = useMemo(() => {
        let hidden = 0
        let collapsed = 0
        for (const phase of allPhases) {
            const phaseKey = `${sectionKey}:${phase.slug}`
            const phaseStages = stages.filter(s => s.phase_id === phase.id)
            for (const stage of phaseStages) {
                if (getHiddenSections(stage.id).includes(phaseKey)) hidden++
                if (getCollapsedSections(stage.id).includes(phaseKey)) collapsed++
            }
        }
        return { hidden, collapsed }
    }, [allPhases, sectionKey, stages, getHiddenSections, getCollapsedSections])

    const hasRules = summary.hidden > 0 || summary.collapsed > 0

    const handleToggleVisibility = useCallback(async (phaseSlug: string, stageId: string) => {
        const phaseKey = `${sectionKey}:${phaseSlug}`
        const isCurrentlyHidden = getHiddenSections(stageId).includes(phaseKey)
        try {
            await toggleVisibility.mutateAsync({ stageId, sectionKey: phaseKey, visible: isCurrentlyHidden })
        } catch {
            toast({ title: 'Erro ao salvar', type: 'error' })
        }
    }, [sectionKey, getHiddenSections, toggleVisibility, toast])

    const handleToggleCollapse = useCallback(async (phaseSlug: string, stageId: string) => {
        const phaseKey = `${sectionKey}:${phaseSlug}`
        const isCurrentlyCollapsed = getCollapsedSections(stageId).includes(phaseKey)
        try {
            await toggleCollapsed.mutateAsync({ stageId, sectionKey: phaseKey, collapsed: !isCurrentlyCollapsed })
        } catch {
            toast({ title: 'Erro ao salvar', type: 'error' })
        }
    }, [sectionKey, getCollapsedSections, toggleCollapsed, toast])

    // Batch: hide/show a phase across ALL stages
    const handleTogglePhaseAll = useCallback(async (phaseSlug: string) => {
        const phaseKey = `${sectionKey}:${phaseSlug}`
        // Toggle across ALL stages (not just the phase's stages)
        // If ANY stage shows it, hide all. Otherwise show all.
        const anyVisible = stages.some(s => !getHiddenSections(s.id).includes(phaseKey))
        try {
            await Promise.all(
                stages.map(s =>
                    toggleVisibility.mutateAsync({ stageId: s.id, sectionKey: phaseKey, visible: !anyVisible })
                )
            )
            toast({ title: anyVisible ? `${phaseSlug.toUpperCase()} oculta em todas etapas` : `${phaseSlug.toUpperCase()} visível em todas etapas`, type: 'success' })
        } catch {
            toast({ title: 'Erro ao salvar', type: 'error' })
        }
    }, [sectionKey, stages, getHiddenSections, toggleVisibility, toast])

    return (
        <div>
            <button
                onClick={() => setOpen(prev => !prev)}
                className="flex items-center gap-2 w-full text-left"
            >
                <span className={cn("flex-shrink-0", hasRules ? "text-indigo-600" : "text-muted-foreground")}>
                    <Layers className="w-3.5 h-3.5" />
                </span>
                <span className={cn("text-xs font-medium", hasRules ? "text-indigo-700" : "text-muted-foreground")}>
                    Visibilidade por fase
                </span>
                <span className="text-[10px] text-muted-foreground/60 truncate">
                    — {hasRules
                        ? `${summary.hidden > 0 ? `${summary.hidden} oculta(s)` : ''}${summary.hidden > 0 && summary.collapsed > 0 ? ', ' : ''}${summary.collapsed > 0 ? `${summary.collapsed} retraída(s)` : ''}`
                        : 'todas visíveis e expandidas'}
                </span>
                <span className={cn("ml-auto text-[10px] font-medium", hasRules ? "text-indigo-700" : "text-muted-foreground/40")}>
                    {open ? '▲' : '▼'}
                </span>
            </button>

            {open && (
                <div className="mt-2 ml-4 space-y-4">
                    {allPhases.map(phase => {
                        const phaseKey = `${sectionKey}:${phase.slug}`
                        // Check if hidden across ALL stages (not just this phase's stages)
                        const allHidden = stages.length > 0 && stages.every(s => getHiddenSections(s.id).includes(phaseKey))

                        return (
                            <div key={phase.id} className="space-y-2">
                                {/* Phase header with global toggle */}
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleTogglePhaseAll(phase.slug!)}
                                        className={cn(
                                            "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider transition-colors",
                                            allHidden ? "text-red-600 line-through" : "text-foreground"
                                        )}
                                        title={allHidden ? "Oculta em todas etapas — clique para mostrar" : "Visível — clique para ocultar em todas etapas"}
                                    >
                                        {allHidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                        Info Viagem — {phase.name}
                                    </button>
                                    {allHidden && (
                                        <span className="text-[10px] text-red-500 font-medium">OCULTA EM TUDO</span>
                                    )}
                                </div>

                                {/* Per-stage controls: show ALL stages grouped by their phase */}
                                {!allHidden && (
                                    <div className="ml-5 space-y-1.5">
                                        {allPhases.map(groupPhase => {
                                            const groupStages = stages.filter(s => s.phase_id === groupPhase.id)
                                            if (groupStages.length === 0) return null
                                            return (
                                                <div key={groupPhase.id}>
                                                    <div className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-widest mb-0.5">
                                                        Quando em {groupPhase.name}:
                                                    </div>
                                                    <div className="flex flex-wrap gap-1">
                                                        {groupStages.map(stage => {
                                                            const isHidden = getHiddenSections(stage.id).includes(phaseKey)
                                                            const isCollapsed = getCollapsedSections(stage.id).includes(phaseKey)
                                                            return (
                                                                <div key={stage.id} className="flex items-center gap-0.5">
                                                                    <button
                                                                        onClick={() => handleToggleVisibility(phase.slug!, stage.id)}
                                                                        className={cn(
                                                                            "px-2 py-0.5 rounded-l-md text-[11px] font-medium border-y border-l transition-all",
                                                                            isHidden
                                                                                ? "bg-red-100 text-red-700 border-red-300"
                                                                                : "bg-muted/50 text-muted-foreground border-border hover:border-slate-400"
                                                                        )}
                                                                        title={isHidden ? "Oculta nesta etapa" : "Visível nesta etapa — clique para ocultar"}
                                                                    >
                                                                        {isHidden ? <EyeOff className="w-3 h-3 inline mr-0.5" /> : null}
                                                                        {stage.nome}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleToggleCollapse(phase.slug!, stage.id)}
                                                                        disabled={isHidden}
                                                                        className={cn(
                                                                            "px-1 py-0.5 rounded-r-md text-[11px] border-y border-r transition-all",
                                                                            isHidden
                                                                                ? "bg-muted/30 text-muted-foreground/30 border-border cursor-not-allowed"
                                                                                : isCollapsed
                                                                                    ? "bg-amber-100 text-amber-700 border-amber-300"
                                                                                    : "bg-muted/50 text-muted-foreground/50 border-border hover:text-amber-600"
                                                                        )}
                                                                        title={isCollapsed ? "Inicia retraída nesta etapa" : "Inicia expandida — clique para retrair"}
                                                                    >
                                                                        <ChevronsUpDown className="w-3 h-3" />
                                                                    </button>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

// ── People Sub-Section Picker ─────────────────────────────────────────────
// Controls visibility/collapse of sub-sections inside Pessoas (viajantes, travel_history)

const PEOPLE_SUB_SECTIONS = [
    { key: 'people:viajantes', label: 'Viajantes / Acompanhantes' },
    { key: 'people:travel_history', label: 'Histórico de Viagem' },
]

interface PeopleSubSectionPickerProps {
    stages: { id: string; nome: string; phase_id: string | null; fase: string }[]
    phases: { id: string; slug: string | null; name: string; color?: string | null }[]
}

function PeopleSubSectionPicker({ stages, phases }: PeopleSubSectionPickerProps) {
    const { toast } = useToast()
    const { getHiddenSections, getCollapsedSections, toggleVisibility, toggleCollapsed } = useStageSectionConfig()
    const [open, setOpen] = useState(false)

    const summary = useMemo(() => {
        let hidden = 0
        let collapsed = 0
        for (const sub of PEOPLE_SUB_SECTIONS) {
            for (const stage of stages) {
                if (getHiddenSections(stage.id).includes(sub.key)) hidden++
                if (getCollapsedSections(stage.id).includes(sub.key)) collapsed++
            }
        }
        return { hidden, collapsed }
    }, [stages, getHiddenSections, getCollapsedSections])

    const hasRules = summary.hidden > 0 || summary.collapsed > 0

    const handleToggleVisibility = useCallback(async (subKey: string, stageId: string) => {
        const isCurrentlyHidden = getHiddenSections(stageId).includes(subKey)
        try {
            await toggleVisibility.mutateAsync({ stageId, sectionKey: subKey, visible: isCurrentlyHidden })
        } catch {
            toast({ title: 'Erro ao salvar', type: 'error' })
        }
    }, [getHiddenSections, toggleVisibility, toast])

    const handleToggleCollapse = useCallback(async (subKey: string, stageId: string) => {
        const isCurrentlyCollapsed = getCollapsedSections(stageId).includes(subKey)
        try {
            await toggleCollapsed.mutateAsync({ stageId, sectionKey: subKey, collapsed: !isCurrentlyCollapsed })
        } catch {
            toast({ title: 'Erro ao salvar', type: 'error' })
        }
    }, [getCollapsedSections, toggleCollapsed, toast])

    const handleToggleSubAll = useCallback(async (subKey: string) => {
        const anyVisible = stages.some(s => !getHiddenSections(s.id).includes(subKey))
        try {
            await Promise.all(
                stages.map(s => toggleVisibility.mutateAsync({ stageId: s.id, sectionKey: subKey, visible: !anyVisible }))
            )
            toast({ title: anyVisible ? 'Oculta em todas etapas' : 'Visível em todas etapas', type: 'success' })
        } catch {
            toast({ title: 'Erro ao salvar', type: 'error' })
        }
    }, [stages, getHiddenSections, toggleVisibility, toast])

    return (
        <div>
            <button
                onClick={() => setOpen(prev => !prev)}
                className="flex items-center gap-2 w-full text-left"
            >
                <span className={cn("flex-shrink-0", hasRules ? "text-indigo-600" : "text-muted-foreground")}>
                    <Layers className="w-3.5 h-3.5" />
                </span>
                <span className={cn("text-xs font-medium", hasRules ? "text-indigo-700" : "text-muted-foreground")}>
                    Sub-seções
                </span>
                <span className="text-[10px] text-muted-foreground/60 truncate">
                    — {hasRules
                        ? `${summary.hidden > 0 ? `${summary.hidden} oculta(s)` : ''}${summary.hidden > 0 && summary.collapsed > 0 ? ', ' : ''}${summary.collapsed > 0 ? `${summary.collapsed} retraída(s)` : ''}`
                        : 'todas visíveis e expandidas'}
                </span>
                <span className={cn("ml-auto text-[10px] font-medium", hasRules ? "text-indigo-700" : "text-muted-foreground/40")}>
                    {open ? '▲' : '▼'}
                </span>
            </button>

            {open && (
                <div className="mt-2 ml-4 space-y-4">
                    {PEOPLE_SUB_SECTIONS.map(sub => {
                        const allHidden = stages.length > 0 && stages.every(s => getHiddenSections(s.id).includes(sub.key))

                        return (
                            <div key={sub.key} className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleToggleSubAll(sub.key)}
                                        className={cn(
                                            "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider transition-colors",
                                            allHidden ? "text-red-600 line-through" : "text-foreground"
                                        )}
                                        title={allHidden ? "Oculta — clique para mostrar" : "Visível — clique para ocultar em todas etapas"}
                                    >
                                        {allHidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                        {sub.label}
                                    </button>
                                    {allHidden && <span className="text-[10px] text-red-500 font-medium">OCULTA EM TUDO</span>}
                                </div>

                                {!allHidden && (
                                    <div className="ml-5 space-y-1.5">
                                        {phases.filter(p => p.slug !== 'resolucao').map(phase => {
                                            const phaseStages = stages.filter(s => s.phase_id === phase.id)
                                            if (phaseStages.length === 0) return null
                                            return (
                                                <div key={phase.id}>
                                                    <div className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-widest mb-0.5">
                                                        Quando em {phase.name}:
                                                    </div>
                                                    <div className="flex flex-wrap gap-1">
                                                        {phaseStages.map(stage => {
                                                            const isHidden = getHiddenSections(stage.id).includes(sub.key)
                                                            const isCollapsed = getCollapsedSections(stage.id).includes(sub.key)
                                                            return (
                                                                <div key={stage.id} className="flex items-center gap-0.5">
                                                                    <button
                                                                        onClick={() => handleToggleVisibility(sub.key, stage.id)}
                                                                        className={cn(
                                                                            "px-2 py-0.5 rounded-l-md text-[11px] font-medium border-y border-l transition-all",
                                                                            isHidden
                                                                                ? "bg-red-100 text-red-700 border-red-300"
                                                                                : "bg-muted/50 text-muted-foreground border-border hover:border-slate-400"
                                                                        )}
                                                                        title={isHidden ? "Oculta nesta etapa" : "Visível — clique para ocultar"}
                                                                    >
                                                                        {isHidden ? <EyeOff className="w-3 h-3 inline mr-0.5" /> : null}
                                                                        {stage.nome}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleToggleCollapse(sub.key, stage.id)}
                                                                        disabled={isHidden}
                                                                        className={cn(
                                                                            "px-1 py-0.5 rounded-r-md text-[11px] border-y border-r transition-all",
                                                                            isHidden
                                                                                ? "bg-muted/30 text-muted-foreground/30 border-border cursor-not-allowed"
                                                                                : isCollapsed
                                                                                    ? "bg-amber-100 text-amber-700 border-amber-300"
                                                                                    : "bg-muted/50 text-muted-foreground/50 border-border hover:text-amber-600"
                                                                        )}
                                                                        title={isCollapsed ? "Inicia retraída" : "Inicia expandida — clique para retrair"}
                                                                    >
                                                                        <ChevronsUpDown className="w-3 h-3" />
                                                                    </button>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

// ── Stage Visibility Picker ──────────────────────────────────────────────
// Controls which stages hide this section. Grouped by phase for readability.

interface StageVisibilityPickerProps {
    sectionKey: string
    stages: { id: string; nome: string; phase_id: string | null; fase: string }[]
    phases: { id: string; slug: string | null; name: string; color?: string | null; visible_in_card?: boolean | null }[]
}

function StageVisibilityPicker({ sectionKey, stages, phases }: StageVisibilityPickerProps) {
    const { toast } = useToast()
    const { getHiddenSections, getCollapsedSections, toggleVisibility, toggleCollapsed } = useStageSectionConfig()
    const [open, setOpen] = useState(false)

    // Group stages by phase
    const stagesByPhase = useMemo(() => {
        const groups: { phase: { id: string; name: string }; stages: { id: string; nome: string }[] }[] = []
        for (const phase of phases) {
            const phaseStages = stages.filter(s => s.phase_id === phase.id)
            if (phaseStages.length > 0) {
                groups.push({ phase: { id: phase.id, name: phase.name }, stages: phaseStages })
            }
        }
        return groups
    }, [stages, phases])

    // Count hidden and collapsed stages for this section
    const hiddenCount = useMemo(() => {
        return stages.filter(s => getHiddenSections(s.id).includes(sectionKey)).length
    }, [stages, sectionKey, getHiddenSections])

    const collapsedCount = useMemo(() => {
        return stages.filter(s => getCollapsedSections(s.id).includes(sectionKey)).length
    }, [stages, sectionKey, getCollapsedSections])

    const handleToggle = useCallback(async (stageId: string) => {
        const isCurrentlyHidden = getHiddenSections(stageId).includes(sectionKey)
        try {
            await toggleVisibility.mutateAsync({
                stageId,
                sectionKey,
                visible: isCurrentlyHidden // toggle: if hidden → make visible, if visible → hide
            })
        } catch {
            toast({ title: 'Erro ao salvar visibilidade', type: 'error' })
        }
    }, [sectionKey, getHiddenSections, toggleVisibility, toast])

    const handleToggleCollapse = useCallback(async (stageId: string) => {
        const isCurrentlyCollapsed = getCollapsedSections(stageId).includes(sectionKey)
        try {
            await toggleCollapsed.mutateAsync({
                stageId,
                sectionKey,
                collapsed: !isCurrentlyCollapsed
            })
        } catch {
            toast({ title: 'Erro ao salvar estado de colapso', type: 'error' })
        }
    }, [sectionKey, getCollapsedSections, toggleCollapsed, toast])

    const hasRules = hiddenCount > 0 || collapsedCount > 0

    return (
        <div>
            {/* Header row */}
            <button
                onClick={() => setOpen(prev => !prev)}
                className="flex items-center gap-2 w-full text-left"
            >
                <span className={cn("flex-shrink-0", hasRules ? "text-red-600" : "text-muted-foreground")}>
                    <EyeOff className="w-3.5 h-3.5" />
                </span>
                <span className={cn("text-xs font-medium", hasRules ? "text-red-700" : "text-muted-foreground")}>
                    Visibilidade por etapa
                </span>
                <span className="text-[10px] text-muted-foreground/60 truncate">
                    — {hiddenCount > 0 && collapsedCount > 0
                        ? `oculta em ${hiddenCount}, retraída em ${collapsedCount}`
                        : hiddenCount > 0
                            ? `oculta em ${hiddenCount} etapa(s)`
                            : collapsedCount > 0
                                ? `retraída em ${collapsedCount} etapa(s)`
                                : 'visível em todas as etapas'}
                </span>
                <span className={cn("ml-auto text-[10px] font-medium", hasRules ? "text-red-700" : "text-muted-foreground/40")}>
                    {open ? '▲' : '▼'}
                </span>
            </button>

            {/* Stage grid grouped by phase */}
            {open && (
                <div className="mt-2 ml-6 space-y-2">
                    {stagesByPhase.map(group => (
                        <div key={group.phase.id}>
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                {group.phase.name}
                            </span>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                                {group.stages.map(stage => {
                                    const isHidden = getHiddenSections(stage.id).includes(sectionKey)
                                    const isCollapsed = getCollapsedSections(stage.id).includes(sectionKey)
                                    return (
                                        <div key={stage.id} className="flex items-center gap-0.5">
                                            <button
                                                onClick={() => handleToggle(stage.id)}
                                                className={cn(
                                                    "px-2.5 py-1 rounded-l-md text-xs font-medium border-y border-l transition-all",
                                                    isHidden
                                                        ? "bg-red-100 text-red-700 border-red-300 shadow-sm"
                                                        : "bg-muted/50 text-muted-foreground border-border hover:border-slate-400"
                                                )}
                                                title={isHidden ? "Oculta (clique para mostrar)" : "Visível (clique para ocultar)"}
                                            >
                                                {isHidden ? <EyeOff className="w-3 h-3 inline mr-1" /> : null}
                                                {stage.nome}
                                            </button>
                                            <button
                                                onClick={() => handleToggleCollapse(stage.id)}
                                                disabled={isHidden}
                                                className={cn(
                                                    "px-1.5 py-1 rounded-r-md text-xs border-y border-r transition-all",
                                                    isHidden
                                                        ? "bg-muted/30 text-muted-foreground/30 border-border cursor-not-allowed"
                                                        : isCollapsed
                                                            ? "bg-amber-100 text-amber-700 border-amber-300 shadow-sm"
                                                            : "bg-muted/50 text-muted-foreground/50 border-border hover:text-amber-600 hover:border-amber-300"
                                                )}
                                                title={isCollapsed ? "Inicia retraída (clique para expandir)" : "Inicia expandida (clique para retrair)"}
                                            >
                                                <ChevronsUpDown className="w-3 h-3" />
                                            </button>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Summary badges when collapsed */}
            {!open && hasRules && (
                <div className="flex flex-wrap gap-1 mt-1 ml-6">
                    {stages
                        .filter(s => getHiddenSections(s.id).includes(sectionKey))
                        .map(stage => (
                            <span key={`hidden-${stage.id}`} className="px-2 py-0.5 rounded-md text-[11px] font-medium border bg-red-50 text-red-600 border-red-200">
                                {stage.nome}
                            </span>
                        ))
                    }
                    {stages
                        .filter(s => getCollapsedSections(s.id).includes(sectionKey) && !getHiddenSections(s.id).includes(sectionKey))
                        .map(stage => (
                            <span key={`collapsed-${stage.id}`} className="px-2 py-0.5 rounded-md text-[11px] font-medium border bg-amber-50 text-amber-600 border-amber-200">
                                {stage.nome} (retraída)
                            </span>
                        ))
                    }
                </div>
            )}
        </div>
    )
}

// ── Sortable Section Card ────────────────────────────────────────────────
interface SortableSectionCardProps {
    section: Section
    isEditing: boolean
    onEdit: () => void
    onDelete: () => void
    onToggleActive: () => void
    onToggleCollapsed: () => void
    stages: { id: string; nome: string; phase_id: string | null; fase: string }[]
    phases: { id: string; slug: string | null; name: string; color?: string | null; visible_in_card?: boolean | null }[]
}

function SortableSectionCard({ section, isEditing, onEdit, onDelete, onToggleActive, onToggleCollapsed, stages, phases }: SortableSectionCardProps) {
    const isHardcoded = HARDCODED_SECTION_KEYS.includes(section.key)
    const isInactive = !section.active

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: section.id, disabled: isHardcoded || isInactive })

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 100 : 'auto'
    }

    const colorClasses = section.color || 'bg-gray-50 text-gray-700 border-gray-100'
    const [bgClass] = colorClasses.split(' ')

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "flex flex-wrap items-center gap-3 p-3 rounded-lg border transition-all bg-card",
                isEditing ? "ring-2 ring-primary border-primary" : "border-border hover:shadow-sm",
                isDragging && "shadow-lg",
                isHardcoded && "opacity-60",
                isInactive && "opacity-50 bg-muted/30"
            )}
        >
            {/* Drag Handle or Lock */}
            {isHardcoded ? (
                <div className="p-1 text-muted-foreground/40" title="Posição fixa no CardDetail">
                    <Lock className="w-4 h-4" />
                </div>
            ) : isInactive ? (
                <div className="p-1 text-muted-foreground/30">
                    <GripVertical className="w-4 h-4" />
                </div>
            ) : (
                <button
                    {...attributes}
                    {...listeners}
                    className="p-1 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
                    title="Arrastar para reordenar"
                >
                    <GripVertical className="w-4 h-4" />
                </button>
            )}

            {/* Color dot */}
            <div className={cn("w-3 h-3 rounded-full flex-shrink-0", bgClass.replace('-50', '-500'), isInactive && "opacity-40")} />

            {/* Name + badges */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className={cn("font-medium truncate", isInactive ? "text-muted-foreground" : "text-foreground")}>{section.label}</span>
                    {isHardcoded && (
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-amber-300 text-amber-600 bg-amber-50">FIXA</Badge>
                    )}
                    {isInactive && (
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-slate-300 text-slate-500 bg-slate-50">OCULTA</Badge>
                    )}
                    {section.is_system && !isHardcoded && !isInactive && (
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5">SISTEMA</Badge>
                    )}
                    {section.default_collapsed && !isInactive && (
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-amber-300 text-amber-600 bg-amber-50">RETRAÍDA</Badge>
                    )}
                    {section.is_governable && !isInactive && (
                        <Badge variant="secondary" className="text-[10px] py-0 px-1.5">Governavel</Badge>
                    )}
                </div>
                <span className="text-xs text-muted-foreground font-mono">{section.key}</span>
            </div>

            {/* Actions: on/off, edit, delete */}
            <div className="flex items-center gap-1">
                {!isHardcoded && (
                    <button
                        onClick={onToggleActive}
                        className={cn(
                            "p-1.5 rounded transition-colors",
                            isInactive
                                ? "text-muted-foreground/50 hover:text-green-600 hover:bg-green-50"
                                : "text-green-600 hover:text-muted-foreground hover:bg-muted"
                        )}
                        title={isInactive ? "Ativar seção" : "Desativar seção (oculta para todos)"}
                    >
                        {isInactive ? <ToggleLeft className="w-4 h-4" /> : <ToggleRight className="w-4 h-4" />}
                    </button>
                )}
                {!isHardcoded && !isInactive && (
                    <button
                        onClick={onToggleCollapsed}
                        className={cn(
                            "p-1.5 rounded transition-colors",
                            section.default_collapsed
                                ? "text-amber-500 hover:text-amber-600 hover:bg-amber-50"
                                : "text-muted-foreground/50 hover:text-amber-500 hover:bg-amber-50"
                        )}
                        title={section.default_collapsed ? "Inicia retraída (clique para expandir por padrão)" : "Inicia expandida (clique para retrair por padrão)"}
                    >
                        <ChevronsUpDown className="w-4 h-4" />
                    </button>
                )}
                <button
                    onClick={onEdit}
                    className="p-1.5 text-muted-foreground hover:text-primary hover:bg-muted rounded transition-colors"
                    title="Editar"
                >
                    <Edit2 className="w-4 h-4" />
                </button>
                {!section.is_system && (
                    <button
                        onClick={onDelete}
                        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted rounded transition-colors"
                        title="Excluir"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Stage visibility rules — active non-hardcoded sections + people sub-sections */}
            {(!isHardcoded || section.key === 'people') && !isInactive && (
                <div className="w-full border-t border-border pt-3 mt-1 space-y-3">
                    {section.key === 'people' ? (
                        <PeopleSubSectionPicker
                            stages={stages}
                            phases={phases}
                        />
                    ) : section.widget_component === 'trip_info' ? (
                        <TripInfoPhaseVisibilityPicker
                            sectionKey={section.key}
                            stages={stages}
                            phases={phases}
                        />
                    ) : (
                        <StageVisibilityPicker
                            sectionKey={section.key}
                            stages={stages}
                            phases={phases}
                        />
                    )}
                    {section.is_governable && (
                        section.widget_component && TABBED_WIDGET_COMPONENTS.includes(section.widget_component)
                            ? <PhaseFieldConfigPanel sectionKey={section.key} stages={stages} phases={phases} />
                            : <SectionFieldDefaultsPicker sectionKey={section.key} />
                    )}
                </div>
            )}
        </div>
    )
}

// ── Section Field Defaults Picker ────────────────────────────────────────
// Configure default field visibility/required at section level (applies to all stages).
// Stage-level overrides in StageInspectorDrawer take precedence.

function SectionFieldDefaultsPicker({ sectionKey }: { sectionKey: string }) {
    const { toast } = useToast()
    const { systemFields } = useFieldConfig()
    const { getSectionDefaults, upsertDefault, deleteDefault } = useSectionFieldConfig()
    const [open, setOpen] = useState(false)

    const sectionFields = useMemo(() => {
        if (!systemFields) return []
        return systemFields.filter(f => (f.section || 'details') === sectionKey)
    }, [systemFields, sectionKey])

    const defaults = useMemo(() => getSectionDefaults(sectionKey), [getSectionDefaults, sectionKey])

    const hiddenCount = defaults.filter(d => !d.is_visible).length
    const requiredCount = defaults.filter(d => d.is_required).length

    const getDefault = useCallback((fieldKey: string) => {
        return defaults.find(d => d.field_key === fieldKey)
    }, [defaults])

    const handleToggleVisible = useCallback(async (fieldKey: string) => {
        const current = getDefault(fieldKey)
        const currentVisible = current?.is_visible ?? true
        const currentRequired = current?.is_required ?? false

        if (currentVisible && !current) {
            // Currently system default (visible) → set to hidden
            try {
                await upsertDefault.mutateAsync({ sectionKey, fieldKey, isVisible: false, isRequired: currentRequired })
            } catch {
                toast({ title: 'Erro ao salvar padrão', type: 'error' })
            }
        } else if (!currentVisible) {
            // Currently hidden → restore to visible
            if (!currentRequired) {
                // Both are default values → delete row
                try {
                    await deleteDefault.mutateAsync({ sectionKey, fieldKey })
                } catch {
                    toast({ title: 'Erro ao salvar padrão', type: 'error' })
                }
            } else {
                try {
                    await upsertDefault.mutateAsync({ sectionKey, fieldKey, isVisible: true, isRequired: currentRequired })
                } catch {
                    toast({ title: 'Erro ao salvar padrão', type: 'error' })
                }
            }
        } else {
            // Visible with explicit row (has required rule) → toggle to hidden
            try {
                await upsertDefault.mutateAsync({ sectionKey, fieldKey, isVisible: false, isRequired: currentRequired })
            } catch {
                toast({ title: 'Erro ao salvar padrão', type: 'error' })
            }
        }
    }, [sectionKey, getDefault, upsertDefault, deleteDefault, toast])

    const handleToggleRequired = useCallback(async (fieldKey: string) => {
        const current = getDefault(fieldKey)
        const currentVisible = current?.is_visible ?? true
        const currentRequired = current?.is_required ?? false

        if (!currentRequired && !current) {
            // No row, currently not required → set to required
            try {
                await upsertDefault.mutateAsync({ sectionKey, fieldKey, isVisible: currentVisible, isRequired: true })
            } catch {
                toast({ title: 'Erro ao salvar padrão', type: 'error' })
            }
        } else if (currentRequired) {
            // Currently required → unset
            if (currentVisible) {
                // Both will be default → delete row
                try {
                    await deleteDefault.mutateAsync({ sectionKey, fieldKey })
                } catch {
                    toast({ title: 'Erro ao salvar padrão', type: 'error' })
                }
            } else {
                try {
                    await upsertDefault.mutateAsync({ sectionKey, fieldKey, isVisible: currentVisible, isRequired: false })
                } catch {
                    toast({ title: 'Erro ao salvar padrão', type: 'error' })
                }
            }
        } else {
            // Explicit row, not required → set to required
            try {
                await upsertDefault.mutateAsync({ sectionKey, fieldKey, isVisible: currentVisible, isRequired: true })
            } catch {
                toast({ title: 'Erro ao salvar padrão', type: 'error' })
            }
        }
    }, [sectionKey, getDefault, upsertDefault, deleteDefault, toast])

    if (sectionFields.length === 0) return null

    const hasRules = hiddenCount > 0 || requiredCount > 0
    const summaryParts: string[] = []
    if (hiddenCount > 0) summaryParts.push(`${hiddenCount} oculto(s)`)
    if (requiredCount > 0) summaryParts.push(`${requiredCount} obrigatório(s)`)
    const summary = hasRules ? summaryParts.join(', ') : 'todos visíveis'

    return (
        <div>
            <button
                onClick={() => setOpen(prev => !prev)}
                className="flex items-center gap-2 w-full text-left"
            >
                <span className={cn("flex-shrink-0", hasRules ? "text-blue-600" : "text-muted-foreground")}>
                    <Layers className="w-3.5 h-3.5" />
                </span>
                <span className={cn("text-xs font-medium", hasRules ? "text-blue-700" : "text-muted-foreground")}>
                    Campos padrão
                </span>
                <span className="text-[10px] text-muted-foreground/60 truncate">
                    — {summary}
                </span>
                <span className={cn("ml-auto text-[10px] font-medium", hasRules ? "text-blue-700" : "text-muted-foreground/40")}>
                    {open ? '▲' : '▼'}
                </span>
            </button>

            {open && (
                <div className="mt-2 ml-6 space-y-1">
                    <p className="text-[10px] text-muted-foreground/60 mb-2">
                        Defaults para todos os stages. Override por stage no Inspector.
                    </p>
                    {sectionFields.map(field => {
                        const dflt = getDefault(field.key)
                        const isVisible = dflt?.is_visible ?? true
                        const isRequired = dflt?.is_required ?? false

                        return (
                            <div key={field.key} className="flex items-center gap-2 py-1">
                                <button
                                    onClick={() => handleToggleVisible(field.key)}
                                    className={cn(
                                        "p-1 rounded transition-colors",
                                        isVisible
                                            ? "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                                            : "text-red-500 hover:text-red-700 hover:bg-red-50"
                                    )}
                                    title={isVisible ? "Visível (clique para ocultar)" : "Oculto (clique para mostrar)"}
                                >
                                    {isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                                </button>
                                <button
                                    onClick={() => handleToggleRequired(field.key)}
                                    className={cn(
                                        "p-1 rounded transition-colors",
                                        isRequired
                                            ? "text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                            : "text-slate-300 hover:text-slate-500 hover:bg-slate-100"
                                    )}
                                    title={isRequired ? "Obrigatório (clique para remover)" : "Não obrigatório (clique para tornar)"}
                                >
                                    {isRequired ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                                </button>
                                <span className={cn(
                                    "text-xs truncate",
                                    !isVisible ? "text-muted-foreground line-through" : "text-foreground"
                                )}>
                                    {field.label}
                                </span>
                                <span className="text-[10px] text-muted-foreground/40 font-mono truncate">
                                    {field.key}
                                </span>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
