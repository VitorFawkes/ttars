/**
 * BlockPalette — Paleta de blocos arrastáveis para o editor de portal.
 */

import { useDraggable } from '@dnd-kit/core'
import { type BlockType, BLOCK_TYPE_CONFIG } from '@/hooks/useTripPlanEditor'
import { cn } from '@/lib/utils'
import {
    CalendarDays,
    MapPin,
    FileDown,
    Lightbulb,
    Image,
    Video,
    User,
    CheckSquare,
    ClipboardList,
} from 'lucide-react'
import { createElement } from 'react'

const ICON_MAP: Record<string, React.ElementType> = {
    CalendarDays,
    MapPin,
    FileDown,
    Lightbulb,
    Image,
    Video,
    User,
    CheckSquare,
    ClipboardList,
}

const PALETTE_SECTIONS: Array<{
    title: string
    blocks: BlockType[]
}> = [
    {
        title: 'Estrutura',
        blocks: ['day_header', 'pre_trip_section'],
    },
    {
        title: 'Conteúdo',
        blocks: ['travel_item', 'voucher', 'tip', 'contact'],
    },
    {
        title: 'Mídia',
        blocks: ['photo', 'video'],
    },
    {
        title: 'Utilidades',
        blocks: ['checklist'],
    },
]

export function BlockPalette() {
    return (
        <div className="w-[200px] h-full overflow-y-auto border-r border-slate-200 bg-white px-3 py-4 shrink-0">
            <div className="mb-3">
                <h2 className="text-sm font-bold text-slate-900">Blocos</h2>
                <p className="text-xs text-slate-400">Arraste para o canvas</p>
            </div>

            {PALETTE_SECTIONS.map(section => (
                <div key={section.title} className="mb-4">
                    <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        {section.title}
                    </h3>
                    <div className="space-y-1.5">
                        {section.blocks.map(type => (
                            <DraggableBlock key={type} blockType={type} />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )
}

function DraggableBlock({ blockType }: { blockType: BlockType }) {
    const config = BLOCK_TYPE_CONFIG[blockType]
    const IconComponent = ICON_MAP[config.icon]

    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `palette-${blockType}`,
        data: { blockType },
    })

    return (
        <button
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-left',
                'hover:shadow-sm cursor-grab active:cursor-grabbing',
                config.color.bg,
                config.color.border,
                isDragging && 'opacity-40 scale-95'
            )}
        >
            {IconComponent && createElement(IconComponent, {
                className: cn('h-4 w-4 shrink-0', config.color.text),
            })}
            <span className={cn('text-xs font-medium', config.color.text)}>
                {config.label}
            </span>
        </button>
    )
}
