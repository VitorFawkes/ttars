import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Trash2, MessageSquare } from 'lucide-react'
import { cn } from '../../../lib/utils'

interface FieldOption {
    label: string
    value: string
    color?: string
    requiresExplanation?: boolean
}

const COLORS = [
    { value: 'gray', bg: 'bg-gray-100', text: 'text-gray-800' },
    { value: 'blue', bg: 'bg-blue-100', text: 'text-blue-800' },
    { value: 'green', bg: 'bg-green-100', text: 'text-green-800' },
    { value: 'yellow', bg: 'bg-yellow-100', text: 'text-yellow-800' },
    { value: 'red', bg: 'bg-red-100', text: 'text-red-800' },
    { value: 'purple', bg: 'bg-purple-100', text: 'text-purple-800' },
    { value: 'pink', bg: 'bg-pink-100', text: 'text-pink-800' },
]

interface SortableOptionItemProps {
    option: FieldOption
    onRemove: () => void
    onColorChange: (color: string) => void
    onRequiresExplanationChange: (value: boolean) => void
}

function SortableOptionItem({
    option,
    onRemove,
    onColorChange,
    onRequiresExplanationChange
}: SortableOptionItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: option.value })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "flex flex-col gap-2 bg-card p-3 rounded-lg border border-border shadow-sm transition-shadow",
                isDragging && "shadow-lg ring-2 ring-indigo-500 z-10"
            )}
        >
            <div className="flex items-center gap-2">
                {/* Drag Handle */}
                <button
                    type="button"
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted transition-colors touch-manipulation"
                >
                    <GripVertical className="w-4 h-4 text-muted-foreground" />
                </button>

                {/* Color Picker */}
                <div className="relative group/color">
                    <div className={cn(
                        "w-4 h-4 rounded-full cursor-pointer border border-border transition-transform hover:scale-110",
                        COLORS.find(c => c.value === (option.color || 'gray'))?.bg || 'bg-gray-100'
                    )} />
                    <div className="absolute left-0 top-6 bg-card border border-border shadow-lg rounded-lg p-1.5 z-20 hidden group-hover/color:flex gap-1.5 animate-in fade-in zoom-in-95 duration-150">
                        {COLORS.map(c => (
                            <button
                                type="button"
                                key={c.value}
                                onClick={() => onColorChange(c.value)}
                                className={cn(
                                    "w-5 h-5 rounded-full hover:scale-110 transition-transform border-2",
                                    c.bg,
                                    option.color === c.value ? "border-gray-600" : "border-transparent"
                                )}
                            />
                        ))}
                    </div>
                </div>

                <span className="text-sm font-medium flex-1 text-foreground truncate">{option.label}</span>
                <span className="text-xs text-muted-foreground font-mono hidden sm:block">{option.value}</span>

                <button
                    type="button"
                    onClick={onRemove}
                    className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded hover:bg-destructive/10"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>

            {/* Requires Explanation Toggle */}
            <label className="flex items-center gap-2 ml-7 cursor-pointer select-none">
                <input
                    type="checkbox"
                    checked={option.requiresExplanation || false}
                    onChange={(e) => onRequiresExplanationChange(e.target.checked)}
                    className="h-3.5 w-3.5 text-amber-600 border-gray-300 rounded focus:ring-amber-500 cursor-pointer"
                />
                <MessageSquare className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-xs text-muted-foreground">Pedir justificativa ao selecionar</span>
            </label>
        </div>
    )
}

interface SortableOptionsListProps {
    options: FieldOption[]
    onChange: (options: FieldOption[]) => void
}

export default function SortableOptionsList({ options, onChange }: SortableOptionsListProps) {
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8, // Require 8px of movement before drag starts
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    )

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event

        if (over && active.id !== over.id) {
            const oldIndex = options.findIndex(opt => opt.value === active.id)
            const newIndex = options.findIndex(opt => opt.value === over.id)

            const newOptions = arrayMove(options, oldIndex, newIndex)
            onChange(newOptions)
        }
    }

    const handleRemove = (index: number) => {
        const newOptions = options.filter((_, i) => i !== index)
        onChange(newOptions)
    }

    const handleColorChange = (index: number, color: string) => {
        const newOptions = [...options]
        newOptions[index] = { ...newOptions[index], color }
        onChange(newOptions)
    }

    const handleRequiresExplanationChange = (index: number, requiresExplanation: boolean) => {
        const newOptions = [...options]
        newOptions[index] = { ...newOptions[index], requiresExplanation }
        onChange(newOptions)
    }

    if (options.length === 0) {
        return (
            <div className="bg-muted/50 p-6 rounded-lg border border-dashed border-border text-center">
                <p className="text-sm text-muted-foreground">
                    Nenhuma opção definida ainda.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                    Adicione opções usando o campo acima.
                </p>
            </div>
        )
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
        >
            <SortableContext
                items={options.map(opt => opt.value)}
                strategy={verticalListSortingStrategy}
            >
                <div className="space-y-2 bg-muted/30 p-3 rounded-lg">
                    {options.map((option, idx) => (
                        <SortableOptionItem
                            key={option.value}
                            option={option}
                            onRemove={() => handleRemove(idx)}
                            onColorChange={(color) => handleColorChange(idx, color)}
                            onRequiresExplanationChange={(val) => handleRequiresExplanationChange(idx, val)}
                        />
                    ))}
                </div>
            </SortableContext>
        </DndContext>
    )
}
