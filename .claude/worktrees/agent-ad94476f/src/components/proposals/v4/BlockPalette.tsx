import { useDraggable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import {
    Building2,
    Plane,
    Ship,
    Car,
    Bus,
    Star,
    Shield,
    FolderPlus,
    Type,
    FileText,
    Image as ImageIcon,
    Video,
    Minus,
    Table,
    GripVertical,
} from 'lucide-react'
import type { BlockType } from '@/pages/ProposalBuilderV4'

/**
 * BlockPalette - Left sidebar with draggable blocks
 * 
 * Sections:
 * - Viagem: Hotel, Voo, Cruzeiro, Carro
 * - Extras: Transfer, Experiência, Seguro, Outros
 * - Conteúdo: Título, Texto, Imagem, Vídeo
 * - Layout: Divisor, Tabela
 */

// Block configuration
interface BlockConfig {
    type: BlockType
    label: string
    icon: React.ElementType
    color: string
}

const TRAVEL_BLOCKS: BlockConfig[] = [
    { type: 'hotel', label: 'Hotel', icon: Building2, color: 'text-blue-600 bg-blue-50' },
    { type: 'flight', label: 'Voo', icon: Plane, color: 'text-sky-600 bg-sky-50' },
    { type: 'cruise', label: 'Cruzeiro', icon: Ship, color: 'text-indigo-600 bg-indigo-50' },
    { type: 'car', label: 'Carro', icon: Car, color: 'text-emerald-600 bg-emerald-50' },
]

const EXTRAS_BLOCKS: BlockConfig[] = [
    { type: 'transfer', label: 'Transfer', icon: Bus, color: 'text-teal-600 bg-teal-50' },
    { type: 'experience', label: 'Experiência', icon: Star, color: 'text-orange-600 bg-orange-50' },
    { type: 'insurance', label: 'Seguro', icon: Shield, color: 'text-rose-600 bg-rose-50' },
    { type: 'custom', label: 'Outros', icon: FolderPlus, color: 'text-amber-600 bg-amber-50' },
]

const CONTENT_BLOCKS: BlockConfig[] = [
    { type: 'title', label: 'Título', icon: Type, color: 'text-slate-600 bg-slate-100' },
    { type: 'text', label: 'Texto', icon: FileText, color: 'text-slate-600 bg-slate-100' },
    { type: 'image', label: 'Imagem', icon: ImageIcon, color: 'text-pink-600 bg-pink-50' },
    { type: 'video', label: 'Vídeo', icon: Video, color: 'text-purple-600 bg-purple-50' },
]

const LAYOUT_BLOCKS: BlockConfig[] = [
    { type: 'divider', label: 'Divisor', icon: Minus, color: 'text-slate-400 bg-slate-100' },
    { type: 'table', label: 'Tabela', icon: Table, color: 'text-cyan-600 bg-cyan-50' },
]

// Draggable Block Item
interface DraggableBlockProps {
    block: BlockConfig
}

function DraggableBlock({ block }: DraggableBlockProps) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `palette-${block.type}`,
        data: { blockType: block.type },
    })

    const Icon = block.icon

    return (
        <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-grab',
                'bg-white border border-slate-200 shadow-sm',
                'hover:border-slate-300 hover:shadow-md',
                'active:cursor-grabbing active:scale-[0.98]',
                'transition-all duration-200',
                isDragging && 'opacity-50 ring-2 ring-blue-500'
            )}
        >
            <div className="flex-shrink-0 text-slate-300">
                <GripVertical className="h-4 w-4" />
            </div>
            <div className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                block.color
            )}>
                <Icon className="h-4 w-4" />
            </div>
            <span className="text-sm font-medium text-slate-700">
                {block.label}
            </span>
        </div>
    )
}

// Block Section
interface BlockSectionProps {
    title: string
    blocks: BlockConfig[]
}

function BlockSection({ title, blocks }: BlockSectionProps) {
    return (
        <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
                {title}
            </h3>
            <div className="space-y-1.5">
                {blocks.map((block) => (
                    <DraggableBlock key={block.type} block={block} />
                ))}
            </div>
        </div>
    )
}

// Main Component
export function BlockPalette() {
    return (
        <div className="w-[200px] flex-shrink-0 bg-slate-50 border-r border-slate-200 overflow-y-auto">
            <div className="p-4 space-y-6">
                {/* Header */}
                <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                        Blocos
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Arraste para o canvas
                    </p>
                </div>

                {/* Block Sections */}
                <BlockSection title="Viagem" blocks={TRAVEL_BLOCKS} />
                <BlockSection title="Extras" blocks={EXTRAS_BLOCKS} />
                <BlockSection title="Conteúdo" blocks={CONTENT_BLOCKS} />
                <BlockSection title="Layout" blocks={LAYOUT_BLOCKS} />
            </div>
        </div>
    )
}

export default BlockPalette

