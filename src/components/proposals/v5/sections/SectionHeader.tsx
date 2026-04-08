import { useState, useRef, useEffect } from 'react'
import { useProposalBuilder } from '@/hooks/useProposalBuilder'
import { cn } from '@/lib/utils'
import {
    GripVertical,
    ChevronDown,
    Trash2,
    MoreHorizontal,
    Building2,
    Plane,
    Car,
    Sparkles,
    Type,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'

const SECTION_ICONS: Record<string, React.ElementType> = {
    hotels: Building2,
    flights: Plane,
    transfers: Car,
    experiences: Sparkles,
    custom: Type,
}

const SECTION_COLORS: Record<string, string> = {
    flights: 'text-sky-600 bg-sky-50',
    hotels: 'text-blue-600 bg-blue-50',
    experiences: 'text-orange-600 bg-orange-50',
    transfers: 'text-teal-600 bg-teal-50',
    custom: 'text-violet-600 bg-violet-50',
}

interface SectionHeaderProps {
    sectionId: string
    sectionType: string
    title: string
    isExpanded: boolean
    onToggleExpand: () => void
    dragHandleProps: Record<string, unknown>
}

export function SectionHeader({ sectionId, sectionType, title, isExpanded, onToggleExpand, dragHandleProps }: SectionHeaderProps) {
    const { updateSection, removeSection } = useProposalBuilder()
    const [isEditing, setIsEditing] = useState(false)
    const [editValue, setEditValue] = useState(title)
    const [showMenu, setShowMenu] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)

    const Icon = SECTION_ICONS[sectionType] || Type
    const colorClass = SECTION_COLORS[sectionType] || SECTION_COLORS.custom

    useEffect(() => {
        if (isEditing) inputRef.current?.focus()
    }, [isEditing])

    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false)
        }
        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [])

    const handleSaveTitle = () => {
        setIsEditing(false)
        if (editValue.trim() !== title) {
            updateSection(sectionId, { title: editValue.trim() })
        }
    }

    return (
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50/80 border-b border-slate-100 group">
            {/* Drag handle */}
            <button {...dragHandleProps} className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-slate-200 transition-colors opacity-0 group-hover:opacity-100">
                <GripVertical className="h-4 w-4 text-slate-400" />
            </button>

            {/* Icon */}
            <div className={cn('w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0', colorClass)}>
                <Icon className="h-3.5 w-3.5" />
            </div>

            {/* Title (inline editable) */}
            {isEditing ? (
                <input
                    ref={inputRef}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={handleSaveTitle}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTitle(); if (e.key === 'Escape') { setEditValue(title); setIsEditing(false) } }}
                    className="flex-1 text-sm font-medium text-slate-900 bg-white border border-indigo-300 rounded px-2 py-0.5 outline-none focus:ring-2 focus:ring-indigo-200"
                />
            ) : (
                <button
                    onClick={() => { setEditValue(title); setIsEditing(true) }}
                    className="flex-1 text-left text-sm font-medium text-slate-700 hover:text-slate-900 truncate"
                >
                    {title || 'Sem titulo'}
                </button>
            )}

            {/* Expand/Collapse */}
            <Button variant="ghost" size="icon" onClick={onToggleExpand} className="h-7 w-7">
                <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', !isExpanded && '-rotate-90')} />
            </Button>

            {/* More menu */}
            <div className="relative" ref={menuRef}>
                <Button variant="ghost" size="icon" onClick={() => setShowMenu(!showMenu)} className="h-7 w-7 opacity-0 group-hover:opacity-100">
                    <MoreHorizontal className="h-4 w-4 text-slate-400" />
                </Button>
                {showMenu && (
                    <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg border border-slate-200 shadow-lg z-50 overflow-hidden">
                        <button onClick={() => { setShowMenu(false); removeSection(sectionId) }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                            <Trash2 className="h-3.5 w-3.5" />
                            Excluir secao
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
