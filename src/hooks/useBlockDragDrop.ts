import { useState, useCallback } from 'react'
import type { DragEndEvent, DragStartEvent, DragOverEvent } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { useProposalBuilder } from '@/hooks/useProposalBuilder'
import type { ProposalSectionType } from '@/types/proposals'

/**
 * useBlockDragDrop - Hook for managing drag & drop operations in the builder
 * 
 * Features:
 * - Handles new blocks from toolbar
 * - Handles section reordering
 * - Handles item reordering within sections
 * - Provides visual feedback state
 */
export interface DragState {
    activeId: string | null
    activeType: 'new-block' | 'section' | 'item' | null
    overId: string | null
    dropPosition: 'before' | 'after' | 'inside' | null
}

export function useBlockDragDrop() {
    const {
        sections,
        addSection,
        reorderSections,
        reorderItems,
    } = useProposalBuilder()

    const [dragState, setDragState] = useState<DragState>({
        activeId: null,
        activeType: null,
        overId: null,
        dropPosition: null,
    })

    // Get block type label for drag overlay
    const getBlockLabel = useCallback((blockType: string) => {
        const labels: Record<string, string> = {
            flights: 'Voos',
            hotels: 'Hospedagem',
            experiences: 'Experiências',
            transfers: 'Transfers',
            text: 'Texto',
            image: 'Imagem',
            divider: 'Divisor',
            table: 'Tabela',
        }
        return labels[blockType] || 'Bloco'
    }, [])

    // Handle drag start
    const handleDragStart = useCallback((event: DragStartEvent) => {
        const { active } = event
        const data = active.data.current

        let activeType: DragState['activeType'] = null

        if (data?.type === 'new-block') {
            activeType = 'new-block'
        } else if (data?.type === 'section') {
            activeType = 'section'
        } else if (data?.type === 'item') {
            activeType = 'item'
        }

        setDragState({
            activeId: active.id as string,
            activeType,
            overId: null,
            dropPosition: null,
        })
    }, [])

    // Handle drag over (for visual feedback)
    const handleDragOver = useCallback((event: DragOverEvent) => {
        const { over } = event

        if (!over) {
            setDragState(prev => ({
                ...prev,
                overId: null,
                dropPosition: null,
            }))
            return
        }

        setDragState(prev => ({
            ...prev,
            overId: over.id as string,
            dropPosition: 'after', // TODO: Calculate based on cursor position
        }))
    }, [])

    // Handle drag end
    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event

        // Reset drag state
        setDragState({
            activeId: null,
            activeType: null,
            overId: null,
            dropPosition: null,
        })

        if (!over) return

        const data = active.data.current

        // Handle new block from toolbar → canvas
        if (data?.type === 'new-block') {
            const blockType = data.blockType as ProposalSectionType
            // Add section with proper position based on drop target
            addSection(blockType)
            return
        }

        // Handle section reordering
        if (data?.type === 'section' && active.id !== over.id) {
            const oldIndex = sections.findIndex(s => s.id === active.id)
            const newIndex = sections.findIndex(s => s.id === over.id)

            if (oldIndex !== -1 && newIndex !== -1) {
                const newOrder = arrayMove(sections.map(s => s.id), oldIndex, newIndex)
                reorderSections(newOrder)
            }
            return
        }

        // Handle item reordering within section
        if (data?.type === 'item') {
            const sectionId = data.sectionId as string
            const section = sections.find(s => s.id === sectionId)

            if (section) {
                const oldIndex = section.items.findIndex(i => i.id === active.id)
                const newIndex = section.items.findIndex(i => i.id === over.id)

                if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
                    const newOrder = arrayMove(
                        section.items.map(i => i.id),
                        oldIndex,
                        newIndex
                    )
                    reorderItems(sectionId, newOrder)
                }
            }
            return
        }
    }, [sections, addSection, reorderSections, reorderItems])

    // Handle drag cancel
    const handleDragCancel = useCallback(() => {
        setDragState({
            activeId: null,
            activeType: null,
            overId: null,
            dropPosition: null,
        })
    }, [])

    return {
        dragState,
        handleDragStart,
        handleDragOver,
        handleDragEnd,
        handleDragCancel,
        getBlockLabel,
    }
}

export default useBlockDragDrop
