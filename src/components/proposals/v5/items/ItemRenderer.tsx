import { TitleBlock } from './content/TitleBlock'
import { TextBlock } from './content/TextBlock'
import { ImageBlock } from './content/ImageBlock'
import { VideoBlock } from './content/VideoBlock'
import { DividerBlock } from './content/DividerBlock'
import { TravelItemEditor } from './travel/TravelItemEditor'
import type { ProposalItemWithOptions } from '@/types/proposals'

interface ItemRendererProps {
    item: ProposalItemWithOptions
    sectionType: string
    onUpdate: (updates: Partial<ProposalItemWithOptions>) => void
}

export function ItemRenderer({ item, sectionType, onUpdate }: ItemRendererProps) {
    const rc = (item.rich_content as Record<string, unknown>) || {}

    // Content blocks
    if (rc.is_title_block) return <TitleBlock item={item} onUpdate={onUpdate} />
    if (rc.is_text_block) return <TextBlock item={item} onUpdate={onUpdate} />
    if (rc.is_image_block) return <ImageBlock item={item} onUpdate={onUpdate} />
    if (rc.is_video_block) return <VideoBlock item={item} onUpdate={onUpdate} />
    if (rc.is_divider_block) return <DividerBlock />

    // Travel/regular items — delegate to v4 editors
    return <TravelItemEditor item={item} sectionType={sectionType} onUpdate={onUpdate} />
}
