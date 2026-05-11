import type { ProposalSectionWithItems } from '@/types/proposals'
import { SelectableItemCard } from './SelectableItemCard'
import { SECTION_TYPE_CONFIG } from '@/types/proposals'
import * as LucideIcons from 'lucide-react'

interface ContentSectionProps {
    section: ProposalSectionWithItems
    selections: Record<string, { selected: boolean; optionId?: string }>
    onToggleItem: (itemId: string) => void
    onSelectOption: (itemId: string, optionId: string) => void
}

export function ContentSection({
    section,
    selections,
    onToggleItem,
    onSelectOption
}: ContentSectionProps) {
    const config = SECTION_TYPE_CONFIG[section.section_type]
    const IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[config.icon] || LucideIcons.FileText

    if (section.items.length === 0) return null

    return (
        <section className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            {/* Section Header */}
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                    <IconComponent className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                    <h2 className="font-semibold text-slate-900">{section.title}</h2>
                    <p className="text-xs text-slate-500">
                        {section.items.length} {section.items.length === 1 ? 'item' : 'itens'}
                    </p>
                </div>
            </div>

            {/* Items */}
            <div className="divide-y divide-slate-100">
                {section.items.map(item => (
                    <SelectableItemCard
                        key={item.id}
                        item={item}
                        isSelected={selections[item.id]?.selected ?? true}
                        selectedOptionId={selections[item.id]?.optionId}
                        onToggle={() => onToggleItem(item.id)}
                        onSelectOption={(optionId) => onSelectOption(item.id, optionId)}
                    />
                ))}
            </div>
        </section>
    )
}
