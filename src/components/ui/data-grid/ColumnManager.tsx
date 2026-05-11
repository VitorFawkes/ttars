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
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Columns, GripVertical } from 'lucide-react'
import { Button } from '../Button'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '../popover'
import { cn } from '../../../lib/utils'
import { Checkbox } from '../checkbox'

export interface ColumnConfig {
    id: string
    label: string
    isVisible: boolean
}

interface ColumnManagerProps {
    columns: ColumnConfig[]
    onChange: (newColumns: ColumnConfig[]) => void
}

function SortableItem({ column, onToggle }: { column: ColumnConfig, onToggle: (id: string, checked: boolean) => void }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: column.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 1 : 0,
        position: 'relative' as const,
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "flex items-center gap-2 p-2 rounded-md bg-white border border-transparent hover:border-gray-100 group",
                isDragging && "shadow-lg border-gray-200 z-50 opacity-90"
            )}
        >
            <div
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
            >
                <GripVertical className="h-4 w-4" />
            </div>

            <Checkbox
                id={`col-${column.id}`}
                checked={column.isVisible}
                onCheckedChange={(checked) => onToggle(column.id, checked as boolean)}
            />

            <label
                htmlFor={`col-${column.id}`}
                className="flex-1 text-sm font-medium cursor-pointer select-none"
            >
                {column.label}
            </label>
        </div>
    )
}

export function ColumnManager({ columns, onChange }: ColumnManagerProps) {
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    )

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event

        if (over && active.id !== over.id) {
            const oldIndex = columns.findIndex((col) => col.id === active.id)
            const newIndex = columns.findIndex((col) => col.id === over.id)

            onChange(arrayMove(columns, oldIndex, newIndex))
        }
    }

    const handleToggle = (id: string, checked: boolean) => {
        const newColumns = columns.map(col =>
            col.id === id ? { ...col, isVisible: checked } : col
        )
        onChange(newColumns)
    }

    const visibleCount = columns.filter(c => c.isVisible).length
    const totalCount = columns.length

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto h-9 bg-white hover:bg-gray-50 text-gray-700 border-gray-200 shadow-sm transition-all duration-200"
                >
                    <Columns className="mr-2 h-4 w-4 text-gray-500" />
                    Colunas
                    <span className="ml-2 px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-600 rounded">
                        {visibleCount}/{totalCount}
                    </span>
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[280px] p-0">
                <div className="p-3 border-b border-gray-100 bg-gray-50/50">
                    <h4 className="font-medium text-sm text-gray-900">Gerenciar Colunas</h4>
                    <p className="text-xs text-gray-500 mt-0.5">Arraste para reordenar</p>
                </div>
                <div className="p-2 max-h-[400px] overflow-y-auto custom-scrollbar">
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={columns.map(c => c.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            <div className="space-y-1">
                                {columns.map((column) => (
                                    <SortableItem
                                        key={column.id}
                                        column={column}
                                        onToggle={handleToggle}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                </div>
            </PopoverContent>
        </Popover>
    )
}
