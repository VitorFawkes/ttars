import { cn } from '@/lib/utils'
import {
    GripVertical,
    Trash2,
} from 'lucide-react'

/**
 * DividerBlock - Visual separator between content blocks
 * 
 * Features:
 * - Multiple styles (line, dots, space)
 * - Customizable spacing
 */
interface DividerBlockProps {
    id: string
    style?: 'line' | 'dots' | 'space' | 'gradient'
    spacing?: 'small' | 'medium' | 'large'
    isPreview?: boolean
    onUpdate?: (data: { style?: string; spacing?: string }) => void
    onDelete?: () => void
}

export function DividerBlock({
    style = 'line',
    spacing = 'medium',
    isPreview,
    onUpdate,
    onDelete,
}: DividerBlockProps) {
    const spacingClasses = {
        small: 'py-4',
        medium: 'py-8',
        large: 'py-12',
    }

    const renderDivider = () => {
        switch (style) {
            case 'line':
                return <hr className="border-t border-slate-200" />
            case 'dots':
                return (
                    <div className="flex items-center justify-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                    </div>
                )
            case 'space':
                return null
            case 'gradient':
                return (
                    <div className="h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
                )
            default:
                return <hr className="border-t border-slate-200" />
        }
    }

    // Preview mode
    if (isPreview) {
        return (
            <div className={cn(spacingClasses[spacing])}>
                {renderDivider()}
            </div>
        )
    }

    return (
        <div
            className={cn(
                'group relative',
                spacingClasses[spacing]
            )}
        >
            {/* Drag Handle + Actions */}
            <div className={cn(
                'absolute -left-10 top-1/2 -translate-y-1/2 flex flex-col gap-1',
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

            {/* Style Toggle */}
            <div className={cn(
                'absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2',
                'flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 shadow-sm',
                'opacity-0 group-hover:opacity-100 transition-opacity'
            )}>
                <button
                    onClick={() => onUpdate?.({ style: 'line' })}
                    className={cn(
                        'px-2 py-1 text-xs rounded hover:bg-slate-100',
                        style === 'line' && 'bg-slate-200 font-medium'
                    )}
                >
                    Linha
                </button>
                <button
                    onClick={() => onUpdate?.({ style: 'dots' })}
                    className={cn(
                        'px-2 py-1 text-xs rounded hover:bg-slate-100',
                        style === 'dots' && 'bg-slate-200 font-medium'
                    )}
                >
                    Pontos
                </button>
                <button
                    onClick={() => onUpdate?.({ style: 'gradient' })}
                    className={cn(
                        'px-2 py-1 text-xs rounded hover:bg-slate-100',
                        style === 'gradient' && 'bg-slate-200 font-medium'
                    )}
                >
                    Gradiente
                </button>
                <button
                    onClick={() => onUpdate?.({ style: 'space' })}
                    className={cn(
                        'px-2 py-1 text-xs rounded hover:bg-slate-100',
                        style === 'space' && 'bg-slate-200 font-medium'
                    )}
                >
                    Espaço
                </button>
            </div>

            {/* Divider Content */}
            {renderDivider()}
        </div>
    )
}

export default DividerBlock
