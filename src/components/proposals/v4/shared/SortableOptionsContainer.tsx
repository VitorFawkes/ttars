/**
 * SortableOptionsContainer - Wrapper para lista de opcoes ordenavel
 *
 * Encapsula a logica do @dnd-kit para ordenacao
 */

import { useCallback } from 'react'
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core'
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import type { ReactNode } from 'react'

interface SortableOptionsContainerProps<T extends { id: string; ordem: number }> {
    items: T[]
    onReorder: (items: T[]) => void
    children: ReactNode
}

export function SortableOptionsContainer<T extends { id: string; ordem: number }>({
    items,
    onReorder,
    children,
}: SortableOptionsContainerProps<T>) {
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    )

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event

        if (over && active.id !== over.id) {
            const oldIndex = items.findIndex(item => item.id === active.id)
            const newIndex = items.findIndex(item => item.id === over.id)

            if (oldIndex !== -1 && newIndex !== -1) {
                const newItems = [...items]
                const [removed] = newItems.splice(oldIndex, 1)
                newItems.splice(newIndex, 0, removed)

                // Atualizar ordem de todos os itens
                const reorderedItems = newItems.map((item, index) => ({
                    ...item,
                    ordem: index,
                }))

                onReorder(reorderedItems)
            }
        }
    }, [items, onReorder])

    const itemIds = items.map(item => item.id)

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
        >
            <SortableContext
                items={itemIds}
                strategy={verticalListSortingStrategy}
            >
                {children}
            </SortableContext>
        </DndContext>
    )
}

export default SortableOptionsContainer
