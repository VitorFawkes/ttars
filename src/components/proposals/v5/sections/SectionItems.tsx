import { ItemContainer } from '../items/ItemContainer'
import type { ProposalSectionWithItems } from '@/types/proposals'

interface SectionItemsProps {
    section: ProposalSectionWithItems
    dragHandleProps?: Record<string, unknown>
    isContentBlock?: boolean
}

export function SectionItems({ section, dragHandleProps, isContentBlock }: SectionItemsProps) {
    if (section.items.length === 0) {
        return (
            <div className="py-6 text-center text-sm text-slate-400">
                Nenhum item nesta secao
            </div>
        )
    }

    return (
        <div className="space-y-2">
            {section.items.map((item) => (
                <ItemContainer
                    key={item.id}
                    item={item}
                    sectionType={section.section_type}
                    sectionDragHandleProps={isContentBlock ? dragHandleProps : undefined}
                />
            ))}
        </div>
    )
}
