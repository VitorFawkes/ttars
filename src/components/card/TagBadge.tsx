import { X } from 'lucide-react'
import type { CardTag } from '../../hooks/useCardTags'

interface TagBadgeProps {
    tag: Pick<CardTag, 'id' | 'name' | 'color'>
    onRemove?: () => void
    size?: 'sm' | 'md'
}

export function TagBadge({ tag, onRemove, size = 'md' }: TagBadgeProps) {
    const hex = tag.color

    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full font-medium border ${
                size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-xs px-2 py-1'
            }`}
            style={{
                backgroundColor: hex + '18',
                color: hex,
                borderColor: hex + '30',
            }}
        >
            {tag.name}
            {onRemove && (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onRemove() }}
                    className="rounded-full hover:opacity-70 transition-opacity"
                    aria-label={`Remover tag ${tag.name}`}
                >
                    <X className="w-2.5 h-2.5" />
                </button>
            )}
        </span>
    )
}
