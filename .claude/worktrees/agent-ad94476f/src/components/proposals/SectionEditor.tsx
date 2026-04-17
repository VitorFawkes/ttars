import { useState } from 'react'
import { useProposalBuilder } from '@/hooks/useProposalBuilder'
import { ItemCard } from './ItemCard'
import { AddItemMenu } from './AddItemMenu'
import { SECTION_TYPE_CONFIG } from '@/types/proposals'
import type { ProposalSectionWithItems } from '@/types/proposals'
import {
    ChevronDown,
    ChevronUp,
    GripVertical,
    Eye,
    EyeOff,
    Trash2,
} from 'lucide-react'
import * as LucideIcons from 'lucide-react'

interface SectionEditorProps {
    section: ProposalSectionWithItems
}

export function SectionEditor({ section }: SectionEditorProps) {
    const [isExpanded, setIsExpanded] = useState(true)
    const { updateSection, removeSection, selectSection, selectedSectionId } = useProposalBuilder()

    const config = SECTION_TYPE_CONFIG[section.section_type]
    const IconComponent = ((LucideIcons as any)[config.icon] || LucideIcons.FileText) as React.ElementType
    const isSelected = selectedSectionId === section.id

    const handleToggleVisibility = () => {
        updateSection(section.id, { visible: !section.visible })
    }

    const handleDelete = () => {
        if (confirm('Tem certeza que deseja remover esta seção?')) {
            removeSection(section.id)
        }
    }

    return (
        <div
            className={`bg-white rounded-xl border shadow-sm transition-all ${isSelected ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-200'
                } ${!section.visible ? 'opacity-60' : ''}`}
            onClick={() => selectSection(section.id)}
        >
            {/* Section Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
                {/* Drag Handle */}
                <button className="p-1 text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing">
                    <GripVertical className="h-4 w-4" />
                </button>

                {/* Icon & Title */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${section.visible ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-400'
                        }`}>
                        <IconComponent className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-slate-900 text-sm truncate">
                            {section.title}
                        </h3>
                        <p className="text-xs text-slate-500">
                            {section.items.length} {section.items.length === 1 ? 'item' : 'itens'}
                        </p>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                    <button
                        onClick={(e) => { e.stopPropagation(); handleToggleVisibility() }}
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                        title={section.visible ? 'Ocultar seção' : 'Mostrar seção'}
                    >
                        {section.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); handleDelete() }}
                        className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                        title="Remover seção"
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded) }}
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                </div>
            </div>

            {/* Section Content */}
            {isExpanded && (
                <div className="p-4 space-y-3">
                    {section.items.length === 0 ? (
                        <div className="text-center py-6 text-slate-400">
                            <p className="text-sm mb-3">Nenhum item nesta seção</p>
                            <AddItemMenu sectionId={section.id} />
                        </div>
                    ) : (
                        <>
                            {section.items.map((item) => (
                                <ItemCard key={item.id} item={item} />
                            ))}
                            <div className="pt-2">
                                <AddItemMenu sectionId={section.id} />
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}
