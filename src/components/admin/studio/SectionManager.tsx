import { useState, useMemo } from 'react'
import { useAllSections, useSectionMutations, type Section } from '../../../hooks/useSections'
import { useProductContext } from '../../../hooks/useProductContext'
import { Plus, Trash2, GripVertical, Edit2, Check, X, Lock, Eye, EyeOff } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/Input'
import { Select } from '../../ui/Select'
import { Badge } from '../../ui/Badge'
import { useToast } from '../../../contexts/ToastContext'
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

export default function SectionManager() {
    const { toast } = useToast()
    const { currentProduct } = useProductContext()
    // Fetch ALL sections (active + inactive) so admin can toggle visibility
    const { data: sections = [], isLoading } = useAllSections(currentProduct)
    const { createSection, updateSection, deleteSection, reorderSections } = useSectionMutations()

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
}

function SectionColumn({ label, position, activeSections, inactiveSections, sensors, editingId, onDragEnd, onEdit, onDelete, onToggleActive }: SectionColumnProps) {
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
                    {/* Active sections with drag & drop */}
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
                                        />
                                    ))}
                                </div>
                            </SortableContext>
                        </DndContext>
                    )}

                    {/* Inactive sections */}
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
                                />
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

// Sortable SectionCard with drag handle and visibility toggle
interface SortableSectionCardProps {
    section: Section
    isEditing: boolean
    onEdit: () => void
    onDelete: () => void
    onToggleActive: () => void
}

function SortableSectionCard({ section, isEditing, onEdit, onDelete, onToggleActive }: SortableSectionCardProps) {
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
                "flex items-center gap-3 p-3 rounded-lg border transition-all bg-card",
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

            {/* Color Badge */}
            <div className={cn("w-3 h-3 rounded-full flex-shrink-0", bgClass.replace('-50', '-500'), isInactive && "opacity-40")} />

            {/* Info */}
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
                    {section.is_governable && !isInactive && (
                        <Badge variant="secondary" className="text-[10px] py-0 px-1.5">Governavel</Badge>
                    )}
                </div>
                <span className="text-xs text-muted-foreground font-mono">{section.key}</span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1">
                {/* Visibility Toggle */}
                {!isHardcoded && (
                    <button
                        onClick={onToggleActive}
                        className={cn(
                            "p-1.5 rounded transition-colors",
                            isInactive
                                ? "text-muted-foreground/50 hover:text-green-600 hover:bg-green-50"
                                : "text-muted-foreground hover:text-amber-600 hover:bg-amber-50"
                        )}
                        title={isInactive ? "Tornar visível" : "Ocultar seção"}
                    >
                        {isInactive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
        </div>
    )
}
