import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import type { ProposalItemWithOptions } from '@/types/proposals'
import type { Json } from '@/database.types'

type TitleSize = 'h1' | 'h2' | 'h3'
type TitleAlign = 'left' | 'center' | 'right'

const TITLE_CLASSES: Record<TitleSize, string> = {
    h1: 'text-3xl font-bold',
    h2: 'text-2xl font-bold',
    h3: 'text-xl font-semibold',
}

interface TitleBlockProps {
    item: ProposalItemWithOptions
    onUpdate: (updates: Partial<ProposalItemWithOptions>) => void
}

export function TitleBlock({ item, onUpdate }: TitleBlockProps) {
    const rc = (item.rich_content as Record<string, unknown>) || {}
    const size = (rc.title_size as TitleSize) || 'h2'
    const align = (rc.title_align as TitleAlign) || 'left'
    const [isEditing, setIsEditing] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (isEditing) inputRef.current?.focus()
    }, [isEditing])

    const handleSave = () => {
        setIsEditing(false)
    }

    const handleSizeChange = (newSize: TitleSize) => {
        onUpdate({ rich_content: { ...rc, title_size: newSize, is_title_block: true } as unknown as Json })
    }

    const handleAlignChange = (newAlign: TitleAlign) => {
        onUpdate({ rich_content: { ...rc, title_align: newAlign, is_title_block: true } as unknown as Json })
    }

    return (
        <div className="p-4">
            {/* Controls bar — visible on hover */}
            <div className="flex items-center gap-1 mb-2 opacity-0 group-hover:opacity-100 transition-opacity">
                {(['h1', 'h2', 'h3'] as TitleSize[]).map((s) => (
                    <button
                        key={s}
                        onClick={() => handleSizeChange(s)}
                        className={cn(
                            'px-2 py-0.5 text-xs rounded transition-colors',
                            size === s ? 'bg-indigo-100 text-indigo-700 font-medium' : 'text-slate-400 hover:bg-slate-100',
                        )}
                    >
                        {s.toUpperCase()}
                    </button>
                ))}
                <div className="w-px h-4 bg-slate-200 mx-1" />
                {(['left', 'center', 'right'] as TitleAlign[]).map((a) => (
                    <button
                        key={a}
                        onClick={() => handleAlignChange(a)}
                        className={cn(
                            'p-1 rounded transition-colors',
                            align === a ? 'bg-indigo-100 text-indigo-700' : 'text-slate-400 hover:bg-slate-100',
                        )}
                        title={a}
                    >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            {a === 'left' && <path strokeLinecap="round" d="M4 6h16M4 12h10M4 18h14" />}
                            {a === 'center' && <path strokeLinecap="round" d="M4 6h16M7 12h10M5 18h14" />}
                            {a === 'right' && <path strokeLinecap="round" d="M4 6h16M10 12h10M6 18h14" />}
                        </svg>
                    </button>
                ))}
            </div>

            {/* Title input */}
            <input
                ref={inputRef}
                type="text"
                value={item.title || ''}
                onChange={(e) => onUpdate({ title: e.target.value })}
                onFocus={() => setIsEditing(true)}
                onBlur={handleSave}
                placeholder="Digite o titulo..."
                className={cn(
                    'w-full text-slate-900 bg-transparent border-none outline-none focus:ring-0 p-0 placeholder:text-slate-300',
                    TITLE_CLASSES[size],
                    align === 'center' && 'text-center',
                    align === 'right' && 'text-right',
                )}
            />
        </div>
    )
}
