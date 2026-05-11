import { useState, useCallback } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
    GripVertical,
    Trash2,
    Bold,
    Italic,
    List,
    AlignLeft,
    AlignCenter,
    Type,
} from 'lucide-react'

/**
 * TextBlock - Rich text block for free-form content
 * 
 * Features:
 * - Inline editing with simple formatting toolbar
 * - Variable interpolation support ({cliente}, {destino})
 * - Auto-height expansion
 */
interface TextBlockProps {
    id: string
    content: string
    isPreview?: boolean
    onUpdate?: (content: string) => void
    onDelete?: () => void
}

export function TextBlock({ content, isPreview, onUpdate, onDelete }: TextBlockProps) {
    const [isEditing, setIsEditing] = useState(false)
    const [localContent, setLocalContent] = useState(content)
    const [isBold, setIsBold] = useState(false)
    const [isItalic, setIsItalic] = useState(false)

    const handleSave = useCallback(() => {
        if (onUpdate && localContent !== content) {
            onUpdate(localContent)
        }
        setIsEditing(false)
    }, [localContent, content, onUpdate])

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            setLocalContent(content)
            setIsEditing(false)
        }
        if (e.key === 'Enter' && e.metaKey) {
            handleSave()
        }
    }

    // Preview mode - just render text
    if (isPreview) {
        return (
            <div className="prose prose-slate max-w-none">
                <p className="text-slate-700 whitespace-pre-wrap">{content}</p>
            </div>
        )
    }

    return (
        <div
            className={cn(
                'group relative bg-white border border-slate-200 rounded-xl',
                'transition-all duration-200',
                isEditing && 'ring-2 ring-blue-500 border-transparent'
            )}
        >
            {/* Drag Handle + Actions */}
            <div className={cn(
                'absolute -left-10 top-3 flex flex-col gap-1',
                'opacity-0 group-hover:opacity-100 transition-opacity'
            )}>
                <button className="p-1 rounded hover:bg-slate-100 cursor-grab active:cursor-grabbing">
                    <GripVertical className="h-4 w-4 text-slate-400" />
                </button>
                <button
                    onClick={onDelete}
                    className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"
                >
                    <Trash2 className="h-4 w-4" />
                </button>
            </div>

            {/* Formatting Toolbar (when editing) */}
            {isEditing && (
                <div className="flex items-center gap-1 px-4 py-2 border-b border-slate-100 bg-slate-50 rounded-t-xl">
                    <button
                        onClick={() => setIsBold(!isBold)}
                        className={cn(
                            'p-1.5 rounded hover:bg-slate-200 transition-colors',
                            isBold && 'bg-slate-200 text-blue-600'
                        )}
                    >
                        <Bold className="h-4 w-4" />
                    </button>
                    <button
                        onClick={() => setIsItalic(!isItalic)}
                        className={cn(
                            'p-1.5 rounded hover:bg-slate-200 transition-colors',
                            isItalic && 'bg-slate-200 text-blue-600'
                        )}
                    >
                        <Italic className="h-4 w-4" />
                    </button>
                    <div className="w-px h-4 bg-slate-200 mx-1" />
                    <button className="p-1.5 rounded hover:bg-slate-200 transition-colors">
                        <List className="h-4 w-4" />
                    </button>
                    <button className="p-1.5 rounded hover:bg-slate-200 transition-colors">
                        <AlignLeft className="h-4 w-4" />
                    </button>
                    <button className="p-1.5 rounded hover:bg-slate-200 transition-colors">
                        <AlignCenter className="h-4 w-4" />
                    </button>
                    <div className="flex-1" />
                    <span className="text-xs text-slate-400">⌘ + Enter para salvar</span>
                </div>
            )}

            {/* Content Area */}
            <div className="p-4">
                {isEditing ? (
                    <Textarea
                        value={localContent}
                        onChange={(e) => setLocalContent(e.target.value)}
                        onBlur={handleSave}
                        onKeyDown={handleKeyDown}
                        placeholder="Digite seu texto aqui..."
                        className={cn(
                            'w-full min-h-[100px] resize-none border-0 p-0 focus:ring-0',
                            'text-slate-700 placeholder:text-slate-400',
                            isBold && 'font-bold',
                            isItalic && 'italic'
                        )}
                        autoFocus
                    />
                ) : (
                    <div
                        onClick={() => setIsEditing(true)}
                        className="cursor-text min-h-[60px]"
                    >
                        {localContent ? (
                            <p className="text-slate-700 whitespace-pre-wrap">{localContent}</p>
                        ) : (
                            <p className="text-slate-400 flex items-center gap-2">
                                <Type className="h-4 w-4" />
                                Clique para adicionar texto...
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

export default TextBlock
