import { cn } from '@/lib/utils'
import {
    Building2,
    Plane,
    Ship,
    Car,
    FolderPlus,
    Type,
    FileText,
    Image as ImageIcon,
    Video,
    Minus,
    Table,
} from 'lucide-react'
import type { BlockType } from '@/pages/ProposalBuilderV4'

/**
 * BlockDragOverlay - Visual overlay shown while dragging a block
 */

interface BlockDragOverlayProps {
    blockType: BlockType
}

// Block configurations
const BLOCK_CONFIG: Record<BlockType, {
    label: string
    icon: React.ElementType
    color: string
}> = {
    hotel: { label: 'Hotel', icon: Building2, color: 'bg-blue-500' },
    flight: { label: 'Voo', icon: Plane, color: 'bg-sky-500' },
    cruise: { label: 'Cruzeiro', icon: Ship, color: 'bg-indigo-500' },
    car: { label: 'Carro', icon: Car, color: 'bg-emerald-500' },
    transfer: { label: 'Transfer', icon: Car, color: 'bg-teal-500' },
    experience: { label: 'Experiência', icon: FolderPlus, color: 'bg-orange-500' },
    insurance: { label: 'Seguro', icon: FolderPlus, color: 'bg-rose-500' },
    custom: { label: 'Outros', icon: FolderPlus, color: 'bg-amber-500' },
    title: { label: 'Título', icon: Type, color: 'bg-slate-500' },
    text: { label: 'Texto', icon: FileText, color: 'bg-slate-500' },
    image: { label: 'Imagem', icon: ImageIcon, color: 'bg-pink-500' },
    video: { label: 'Vídeo', icon: Video, color: 'bg-purple-500' },
    divider: { label: 'Divisor', icon: Minus, color: 'bg-slate-400' },
    table: { label: 'Tabela', icon: Table, color: 'bg-cyan-500' },
}

export function BlockDragOverlay({ blockType }: BlockDragOverlayProps) {
    const config = BLOCK_CONFIG[blockType]
    const Icon = config.icon

    return (
        <div
            className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl',
                'bg-white shadow-2xl border-2 border-blue-500',
                'ring-4 ring-blue-500/20',
                'cursor-grabbing'
            )}
        >
            <div className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center text-white',
                config.color
            )}>
                <Icon className="h-5 w-5" />
            </div>
            <span className="text-sm font-semibold text-slate-900">
                {config.label}
            </span>
        </div>
    )
}

export default BlockDragOverlay
