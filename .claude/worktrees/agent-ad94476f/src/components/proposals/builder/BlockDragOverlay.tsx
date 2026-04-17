import { cn } from '@/lib/utils'
import {
    Plane,
    Building2,
    Sparkles,
    Car,
    FileText,
    Image as ImageIcon,
    Minus,
    Table,
    GripVertical,
} from 'lucide-react'

/**
 * BlockDragOverlay - Visual feedback during drag operations
 * 
 * Shows a styled preview of what's being dragged
 */
interface BlockDragOverlayProps {
    type: 'new-block' | 'section' | 'item' | null
    blockType?: string
    title?: string
}

const BLOCK_ICONS: Record<string, React.ElementType> = {
    flights: Plane,
    hotels: Building2,
    experiences: Sparkles,
    transfers: Car,
    text: FileText,
    image: ImageIcon,
    divider: Minus,
    table: Table,
}

const BLOCK_COLORS: Record<string, string> = {
    flights: 'blue',
    hotels: 'emerald',
    experiences: 'amber',
    transfers: 'purple',
    text: 'slate',
    image: 'pink',
    divider: 'gray',
    table: 'cyan',
}

const BLOCK_LABELS: Record<string, string> = {
    flights: 'Voos',
    hotels: 'Hospedagem',
    experiences: 'Experiências',
    transfers: 'Transfers',
    text: 'Texto',
    image: 'Imagem',
    divider: 'Divisor',
    table: 'Tabela',
}

export function BlockDragOverlay({ type, blockType, title }: BlockDragOverlayProps) {
    if (type === 'new-block' && blockType) {
        const Icon = BLOCK_ICONS[blockType] || FileText
        const color = BLOCK_COLORS[blockType] || 'slate'
        const label = BLOCK_LABELS[blockType] || 'Bloco'

        return (
            <div
                className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-xl',
                    'bg-white border-2 border-blue-500 shadow-xl',
                    'transform rotate-2'
                )}
                style={{ width: '200px' }}
            >
                <div className={cn(
                    'w-10 h-10 rounded-lg flex items-center justify-center',
                    `bg-${color}-100 text-${color}-600`
                )}>
                    <Icon className="h-5 w-5" />
                </div>
                <div>
                    <p className="text-sm font-semibold text-slate-900">{label}</p>
                    <p className="text-xs text-slate-500">Solte para adicionar</p>
                </div>
            </div>
        )
    }

    if (type === 'section') {
        return (
            <div
                className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-xl',
                    'bg-white border-2 border-blue-500 shadow-xl',
                    'transform rotate-1'
                )}
                style={{ width: '280px' }}
            >
                <GripVertical className="h-5 w-5 text-slate-400" />
                <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                        {title || 'Seção'}
                    </p>
                </div>
            </div>
        )
    }

    if (type === 'item') {
        return (
            <div
                className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-xl',
                    'bg-white border-2 border-blue-500 shadow-xl',
                    'transform -rotate-1'
                )}
                style={{ width: '240px' }}
            >
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                    <GripVertical className="h-4 w-4 text-slate-400" />
                </div>
                <p className="text-sm font-medium text-slate-900 truncate flex-1">
                    {title || 'Item'}
                </p>
            </div>
        )
    }

    // Fallback
    return (
        <div className="bg-white border border-slate-300 rounded-lg p-3 shadow-lg opacity-90">
            <p className="text-sm text-slate-600">Arrastando...</p>
        </div>
    )
}

export default BlockDragOverlay
