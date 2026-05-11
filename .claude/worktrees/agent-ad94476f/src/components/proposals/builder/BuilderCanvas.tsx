import { useState } from 'react'
import { useProposalBuilder } from '@/hooks/useProposalBuilder'
import { useDroppable } from '@dnd-kit/core'
import {
    SortableContext,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import {
    GripVertical,
    Trash2,
    Copy,
    Plus,
    ChevronDown,
    Plane,
    Building2,
    Sparkles,
    Car,
    FileText,
    Image as ImageIcon,
    Minus,
    Table,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ItemCard } from './blocks/ItemCard'
import type { ProposalSectionWithItems } from '@/types/proposals'

// ============================================
// Section Icon Map
// ============================================
const SECTION_ICONS: Record<string, React.ElementType> = {
    flights: Plane,
    hotels: Building2,
    experiences: Sparkles,
    transfers: Car,
    text: FileText,
    image: ImageIcon,
    divider: Minus,
    table: Table,
    custom: Plus,
}

const SECTION_COLORS: Record<string, string> = {
    flights: 'blue',
    hotels: 'emerald',
    experiences: 'amber',
    transfers: 'purple',
    text: 'slate',
    image: 'pink',
    divider: 'gray',
    table: 'cyan',
    custom: 'slate',
}

// ============================================
// Sortable Section Component
// ============================================
interface SortableSectionProps {
    section: ProposalSectionWithItems
    isPreview?: boolean
}

function SortableSection({ section, isPreview }: SortableSectionProps) {
    const [isExpanded, setIsExpanded] = useState(true)
    const { removeSection, updateSection, updateItem, removeItem, duplicateItem } = useProposalBuilder()

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

    const Icon = SECTION_ICONS[section.section_type] || Plus
    const color = SECTION_COLORS[section.section_type] || 'slate'

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                'bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden',
                'transition-all duration-200',
                isDragging && 'opacity-50 shadow-lg ring-2 ring-blue-500',
            )}
        >
            {/* Section Header */}
            <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
                {!isPreview && (
                    <button
                        {...attributes}
                        {...listeners}
                        className="cursor-grab active:cursor-grabbing p-1 -ml-1 rounded hover:bg-slate-200 transition-colors"
                    >
                        <GripVertical className="h-4 w-4 text-slate-400" />
                    </button>
                )}

                <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center',
                    `bg-${color}-100 text-${color}-600`
                )}>
                    <Icon className="h-4 w-4" />
                </div>

                <input
                    type="text"
                    value={section.title}
                    onChange={(e) => updateSection(section.id, { title: e.target.value })}
                    disabled={isPreview}
                    className={cn(
                        'flex-1 text-sm font-semibold text-slate-900 bg-transparent',
                        'border-none outline-none focus:ring-0 p-0',
                        isPreview && 'cursor-default'
                    )}
                />

                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="p-1 rounded hover:bg-slate-200 transition-colors"
                >
                    <ChevronDown className={cn(
                        'h-4 w-4 text-slate-400 transition-transform',
                        !isExpanded && '-rotate-90'
                    )} />
                </button>

                {!isPreview && (
                    <div className="flex items-center gap-1 ml-2">
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {/* TODO: duplicate section */ }}
                            className="h-7 w-7 p-0"
                        >
                            <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeSection(section.id)}
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                )}
            </div>

            {/* Section Content */}
            {isExpanded && (
                <div className="p-4">
                    {section.items.length === 0 ? (
                        <div className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center">
                            <p className="text-sm text-slate-500">
                                Arraste itens da biblioteca ou clique para adicionar
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {section.items.map((item) => (
                                <ItemCard
                                    key={item.id}
                                    item={item}
                                    sectionType={section.section_type}
                                    isPreview={isPreview}
                                    onUpdate={(updates) => updateItem(item.id, updates)}
                                    onDuplicate={() => duplicateItem(item.id)}
                                    onDelete={() => removeItem(item.id)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// ============================================
// Drop Zone Component
// ============================================
interface DropZoneProps {
    id: string
}

function DropZone({ id }: DropZoneProps) {
    const { isOver, setNodeRef } = useDroppable({ id })

    return (
        <div
            ref={setNodeRef}
            className={cn(
                'border-2 border-dashed rounded-xl p-8 text-center transition-colors',
                isOver
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-slate-200 bg-slate-50/50'
            )}
        >
            <div className={cn(
                'w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center',
                isOver ? 'bg-blue-100' : 'bg-slate-200'
            )}>
                <Plus className={cn(
                    'h-6 w-6',
                    isOver ? 'text-blue-600' : 'text-slate-400'
                )} />
            </div>
            <p className={cn(
                'text-sm font-medium',
                isOver ? 'text-blue-600' : 'text-slate-500'
            )}>
                {isOver ? 'Solte aqui' : 'Arraste um bloco da barra lateral'}
            </p>
        </div>
    )
}

// ============================================
// Main BuilderCanvas Component
// ============================================
interface BuilderCanvasProps {
    isPreview?: boolean
    className?: string
}

export function BuilderCanvas({ isPreview, className }: BuilderCanvasProps) {
    const { sections } = useProposalBuilder()

    const sectionIds = sections.map(s => s.id)

    return (
        <div className={cn('flex-1 overflow-y-auto bg-slate-50', className)}>
            <div className="max-w-3xl mx-auto py-8 px-6 space-y-6">
                <SortableContext
                    items={sectionIds}
                    strategy={verticalListSortingStrategy}
                >
                    {sections.map((section) => (
                        <SortableSection
                            key={section.id}
                            section={section}
                            isPreview={isPreview}
                        />
                    ))}
                </SortableContext>

                {/* Drop Zone for new sections */}
                {!isPreview && <DropZone id="canvas-drop-zone" />}
            </div>
        </div>
    )
}

export default BuilderCanvas
