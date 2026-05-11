import { useCallback } from 'react'
import { Textarea } from '@/components/ui/textarea'
import type { ProposalItemWithOptions } from '@/types/proposals'
import type { Json } from '@/database.types'

interface TextBlockProps {
    item: ProposalItemWithOptions
    onUpdate: (updates: Partial<ProposalItemWithOptions>) => void
}

export function TextBlock({ item, onUpdate }: TextBlockProps) {
    const rc = (item.rich_content as Record<string, unknown>) || {}
    const content = (rc.content as string) || ''

    const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onUpdate({ rich_content: { ...rc, content: e.target.value, is_text_block: true } as unknown as Json })
    }, [rc, onUpdate])

    return (
        <div className="p-4">
            <Textarea
                value={content}
                onChange={handleChange}
                placeholder="Digite seu texto aqui..."
                className="min-h-[120px] resize-y border-0 shadow-none focus:ring-0 p-0 text-sm text-slate-700 placeholder:text-slate-300"
            />
            <div className="flex justify-end mt-1">
                <span className="text-[10px] text-slate-300">{content.length} caracteres</span>
            </div>
        </div>
    )
}
