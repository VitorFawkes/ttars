import { useState, useCallback } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import { useProposalBuilder } from '@/hooks/useProposalBuilder'
import { SectionHeader } from './SectionHeader'
import { SectionItems } from './SectionItems'
import { AddItemButton } from './AddItemButton'
import type { ProposalSectionWithItems } from '@/types/proposals'

// Check content block types
function isContentBlock(section: ProposalSectionWithItems): boolean {
    if (section.section_type !== 'custom' || section.items.length !== 1) return false
    const rc = (section.items[0].rich_content as Record<string, unknown>) || {}
    return !!(rc.is_text_block || rc.is_title_block || rc.is_divider_block || rc.is_image_block || rc.is_video_block)
}

interface SectionContainerProps {
    section: ProposalSectionWithItems
}

export function SectionContainer({ section }: SectionContainerProps) {
    const { addItem } = useProposalBuilder()
    const [isExpanded, setIsExpanded] = useState(true)
    const contentBlock = isContentBlock(section)

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: section.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    }

    const handleAddItem = useCallback(() => {
        const typeMap: Record<string, string> = {
            flights: 'flight', hotels: 'hotel', transfers: 'transfer',
            experiences: 'experience', custom: 'custom',
        }
        const titleMap: Record<string, string> = {
            flight: 'Novo Voo', hotel: 'Novo Hotel', transfer: 'Novo Transfer',
            experience: 'Nova Experiencia', custom: 'Novo Item',
        }
        const itemType = typeMap[section.section_type] || 'custom'
        addItem(section.id, itemType as import('@/types/proposals').ProposalItemType, titleMap[itemType] || 'Novo Item')
    }, [section.id, section.section_type, addItem])

    // Content blocks render without section chrome
    if (contentBlock) {
        return (
            <div
                ref={setNodeRef}
                style={style}
                className={cn(
                    'transition-all duration-200',
                    isDragging && 'opacity-50 shadow-lg ring-2 ring-indigo-500 rounded-xl',
                )}
            >
                <SectionItems section={section} dragHandleProps={{ ...attributes, ...listeners }} isContentBlock />
            </div>
        )
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                'bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden',
                'transition-all duration-200',
                isDragging && 'opacity-50 shadow-lg ring-2 ring-indigo-500',
            )}
        >
            <SectionHeader
                sectionId={section.id}
                sectionType={section.section_type}
                title={section.title || ''}
                isExpanded={isExpanded}
                onToggleExpand={() => setIsExpanded(!isExpanded)}
                dragHandleProps={{ ...attributes, ...listeners }}
            />

            {isExpanded && (
                <div className="p-3 space-y-2">
                    <SectionItems section={section} />
                    {section.items.length < 20 && (
                        <AddItemButton onAdd={handleAddItem} />
                    )}
                </div>
            )}
        </div>
    )
}
