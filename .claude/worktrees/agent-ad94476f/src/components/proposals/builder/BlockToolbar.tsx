import { useState } from 'react'
import { Input } from '@/components/ui/Input'
import { useLibrarySearch } from '@/hooks/useLibrary'
import { useProposalBuilder } from '@/hooks/useProposalBuilder'
import type { ProposalSectionType } from '@/types/proposals'
import {
    Search,
    Plane,
    Building2,
    Sparkles,
    Car,
    FileText,
    Image,
    Images,
    Video,
    Minus,
    Table,
    GripVertical,
    ChevronDown,
    ChevronRight,
    Plus,
    Loader2,
} from 'lucide-react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'

// ============================================
// Block Type Definition
// ============================================
// Extended block types (includes new types not yet in DB enum)
type ExtendedBlockType = ProposalSectionType | 'text' | 'image' | 'gallery' | 'video' | 'divider' | 'table'

interface BlockDefinition {
    type: ExtendedBlockType
    label: string
    icon: React.ElementType
    color: string
    description: string
}

const BLOCK_DEFINITIONS: BlockDefinition[] = [
    { type: 'flights', label: 'Voos', icon: Plane, color: 'blue', description: 'Adicione opções de voo' },
    { type: 'hotels', label: 'Hospedagem', icon: Building2, color: 'emerald', description: 'Hotéis e acomodações' },
    { type: 'experiences', label: 'Experiências', icon: Sparkles, color: 'amber', description: 'Passeios e atividades' },
    { type: 'transfers', label: 'Transfers', icon: Car, color: 'purple', description: 'Transporte terrestre' },
    { type: 'text', label: 'Texto', icon: FileText, color: 'slate', description: 'Bloco de texto livre' },
    { type: 'image', label: 'Imagem', icon: Image, color: 'pink', description: 'Imagem standalone' },
    { type: 'gallery', label: 'Galeria', icon: Images, color: 'rose', description: 'Múltiplas imagens' },
    { type: 'video', label: 'Vídeo', icon: Video, color: 'red', description: 'YouTube ou Vimeo' },
    { type: 'divider', label: 'Divisor', icon: Minus, color: 'gray', description: 'Separador visual' },
    { type: 'table', label: 'Tabela', icon: Table, color: 'cyan', description: 'Tabela editável' },
]

const ITEM_BLOCKS = BLOCK_DEFINITIONS.slice(0, 4)
const CONTENT_BLOCKS = BLOCK_DEFINITIONS.slice(4)

// ============================================
// Draggable Block Item
// ============================================
interface DraggableBlockProps {
    block: BlockDefinition
}

function DraggableBlock({ block }: DraggableBlockProps) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `new-block-${block.type}`,
        data: { type: 'new-block', blockType: block.type },
    })

    const style = {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : 1,
    }

    const Icon = block.icon

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            className={cn(
                'flex items-center gap-3 p-3 rounded-lg border border-slate-200',
                'bg-white hover:bg-slate-50 cursor-grab active:cursor-grabbing',
                'transition-all duration-150',
                isDragging && 'ring-2 ring-blue-500 shadow-lg'
            )}
        >
            <div className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                `bg-${block.color}-100 text-${block.color}-600`
            )}>
                <Icon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900">{block.label}</p>
            </div>
            <GripVertical className="h-4 w-4 text-slate-400" />
        </div>
    )
}

// ============================================
// Library Section
// ============================================
interface LibrarySectionProps {
    category: 'hotel' | 'flight' | 'experience' | 'transfer'
    label: string
    icon: React.ElementType
    color: string
}

function LibrarySection({ category, label, icon: Icon, color }: LibrarySectionProps) {
    const [isExpanded, setIsExpanded] = useState(false)
    const { data: items, isLoading } = useLibrarySearch({ category })
    const { sections, addItemFromLibrary } = useProposalBuilder()

    // Find section for this category
    const sectionTypeMap: Record<string, ProposalSectionType> = {
        hotel: 'hotels',
        flight: 'flights',
        experience: 'experiences',
        transfer: 'transfers',
    }
    const targetSection = sections.find(s => s.section_type === sectionTypeMap[category])

    return (
        <div className="border-b border-slate-100 last:border-b-0">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center gap-2 p-3 text-left hover:bg-slate-50 transition-colors"
            >
                <div className={cn(
                    'w-6 h-6 rounded flex items-center justify-center',
                    `bg-${color}-100 text-${color}-600`
                )}>
                    <Icon className="h-3.5 w-3.5" />
                </div>
                <span className="text-sm font-medium text-slate-700 flex-1">{label}</span>
                {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                ) : (
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                )}
            </button>

            {isExpanded && (
                <div className="pb-2 px-2 space-y-1">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                        </div>
                    ) : items && items.length > 0 ? (
                        items.map((item) => (
                            <button
                                key={item.id}
                                onClick={() => {
                                    if (targetSection) {
                                        addItemFromLibrary(targetSection.id, item)
                                    }
                                }}
                                disabled={!targetSection}
                                className={cn(
                                    'w-full flex items-center gap-2 p-2 rounded-lg text-left',
                                    'hover:bg-slate-100 transition-colors',
                                    'disabled:opacity-50 disabled:cursor-not-allowed'
                                )}
                            >
                                {(item as any).thumbnail_url ? (
                                    <img
                                        src={(item as any).thumbnail_url}
                                        alt={item.name}
                                        className="w-8 h-8 rounded object-cover"
                                    />
                                ) : (
                                    <div className={cn(
                                        'w-8 h-8 rounded flex items-center justify-center',
                                        `bg-${color}-50`
                                    )}>
                                        <Icon className="h-4 w-4 text-slate-400" />
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-slate-700 truncate">
                                        {item.name}
                                    </p>
                                    {item.base_price && (
                                        <p className="text-xs text-slate-500">
                                            R$ {item.base_price.toLocaleString('pt-BR')}
                                        </p>
                                    )}
                                </div>
                                <Plus className="h-3.5 w-3.5 text-slate-400" />
                            </button>
                        ))
                    ) : (
                        <p className="text-xs text-slate-400 text-center py-3">
                            Nenhum item na biblioteca
                        </p>
                    )}
                </div>
            )}
        </div>
    )
}

// ============================================
// Main BlockToolbar Component
// ============================================
interface BlockToolbarProps {
    className?: string
}

export function BlockToolbar({ className }: BlockToolbarProps) {
    const [searchQuery, setSearchQuery] = useState('')

    return (
        <div className={cn('flex flex-col h-full bg-white border-r border-slate-200', className)}>
            {/* Search */}
            <div className="p-3 border-b border-slate-200">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Buscar..."
                        className="pl-9 h-9"
                    />
                </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto">
                {/* Library Section */}
                <div className="p-3 border-b border-slate-200">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        Biblioteca
                    </h3>
                    <LibrarySection category="hotel" label="Hotéis" icon={Building2} color="emerald" />
                    <LibrarySection category="flight" label="Voos" icon={Plane} color="blue" />
                    <LibrarySection category="experience" label="Experiências" icon={Sparkles} color="amber" />
                    <LibrarySection category="transfer" label="Transfers" icon={Car} color="purple" />
                </div>

                {/* Item Blocks */}
                <div className="p-3 border-b border-slate-200">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        Seções de Itens
                    </h3>
                    <div className="space-y-2">
                        {ITEM_BLOCKS.map((block) => (
                            <DraggableBlock key={block.type} block={block} />
                        ))}
                    </div>
                </div>

                {/* Content Blocks */}
                <div className="p-3">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        Blocos de Conteúdo
                    </h3>
                    <div className="space-y-2">
                        {CONTENT_BLOCKS.map((block) => (
                            <DraggableBlock key={block.type} block={block} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default BlockToolbar
