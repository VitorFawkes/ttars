import { useProposalBuilder } from '@/hooks/useProposalBuilder'
import { Button } from '@/components/ui/Button'
import {
    GripVertical,
    Trash2,
    Copy,
} from 'lucide-react'
import { ItemRenderer } from './ItemRenderer'
import type { ProposalItemWithOptions } from '@/types/proposals'

interface ItemContainerProps {
    item: ProposalItemWithOptions
    sectionType: string
    sectionDragHandleProps?: Record<string, unknown>
}

export function ItemContainer({ item, sectionType, sectionDragHandleProps }: ItemContainerProps) {
    const { updateItem, removeItem, duplicateItem } = useProposalBuilder()

    const handleUpdate = (updates: Partial<ProposalItemWithOptions>) => {
        updateItem(item.id, updates)
    }

    const isContentBlock = (() => {
        const rc = (item.rich_content as Record<string, unknown>) || {}
        return rc.is_text_block || rc.is_title_block || rc.is_divider_block || rc.is_image_block || rc.is_video_block
    })()

    // Content blocks have minimal chrome
    if (isContentBlock) {
        return (
            <div className="group relative bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden transition-all duration-200 hover:border-slate-300">
                {/* Floating toolbar on hover */}
                <div className="absolute right-2 top-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    {sectionDragHandleProps && (
                        <button {...(sectionDragHandleProps as Record<string, unknown>)} className="p-1 rounded hover:bg-slate-100 cursor-grab active:cursor-grabbing">
                            <GripVertical className="h-3.5 w-3.5 text-slate-400" />
                        </button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => duplicateItem(item.id)} className="h-6 w-6">
                        <Copy className="h-3 w-3 text-slate-400" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => removeItem(item.id)} className="h-6 w-6 hover:text-red-500">
                        <Trash2 className="h-3 w-3 text-slate-400" />
                    </Button>
                </div>

                <ItemRenderer item={item} sectionType={sectionType} onUpdate={handleUpdate} />
            </div>
        )
    }

    // Travel/regular items have full chrome
    return (
        <div className="group relative rounded-lg border border-slate-100 hover:border-slate-200 bg-white transition-all duration-150">
            {/* Hover toolbar */}
            <div className="absolute -right-1 top-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <Button variant="ghost" size="icon" onClick={() => duplicateItem(item.id)} className="h-6 w-6 bg-white shadow-sm border border-slate-200">
                    <Copy className="h-3 w-3 text-slate-400" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => removeItem(item.id)} className="h-6 w-6 bg-white shadow-sm border border-slate-200 hover:text-red-500">
                    <Trash2 className="h-3 w-3 text-slate-400" />
                </Button>
            </div>

            <ItemRenderer item={item} sectionType={sectionType} onUpdate={handleUpdate} />
        </div>
    )
}
