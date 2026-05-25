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
    Check,
    ListChecks,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import type { SectionSelectionMode } from '@/types/proposals'
import {
    SELECTION_MODE_LABELS,
    SELECTION_MODE_DESCRIPTIONS,
} from '@/components/proposals/public/shared/sectionMode'

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
    itemCount?: number
    isExpanded: boolean
    onToggleExpand: () => void
    dragHandleProps: Record<string, unknown>
    selectionMode?: SectionSelectionMode
}

const SELECTION_MODES: SectionSelectionMode[] = [
    'auto',
    'pick_one_required',
    'pick_one_or_more',
    'pick_any_optional',
    'all_included',
]

export function SectionHeader({
    sectionId,
    sectionType,
    title,
    itemCount,
    isExpanded,
    onToggleExpand,
    dragHandleProps,
    selectionMode = 'auto',
}: SectionHeaderProps) {
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

    const handleChangeSelectionMode = (mode: SectionSelectionMode) => {
        updateSection(sectionId, {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            config: { selection_mode: mode } as any,
        })
    }

    const modeLabel = selectionMode === 'auto'
        ? 'Modo: automático'
        : SELECTION_MODE_LABELS[selectionMode]

    return (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-white border-b border-slate-200 group">
            {/* Drag handle */}
            <button {...dragHandleProps} className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-slate-200 transition-colors opacity-0 group-hover:opacity-100">
                <GripVertical className="h-4 w-4 text-slate-400" />
            </button>

            {/* Icon */}
            <div className={cn('w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0', colorClass)}>
                <Icon className="h-3.5 w-3.5" />
            </div>

            {/* Title (inline editable) + item count */}
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
                <div className="flex-1 flex items-baseline gap-2 min-w-0">
                    <button
                        onClick={() => { setEditValue(title); setIsEditing(true) }}
                        className="text-left text-sm font-medium text-slate-700 hover:text-slate-900 truncate"
                    >
                        {title || 'Sem titulo'}
                    </button>
                    {itemCount !== undefined && itemCount > 0 && (
                        <span className="text-xs text-slate-400 font-normal flex-shrink-0">
                            · {itemCount} {itemCount === 1 ? 'item' : 'itens'}
                        </span>
                    )}
                </div>
            )}

            {/* Modo de seleção do cliente — popover */}
            <Popover>
                <PopoverTrigger asChild>
                    <button
                        className={cn(
                            "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition opacity-60 hover:opacity-100",
                            selectionMode === 'auto'
                                ? "text-slate-500 hover:bg-slate-100"
                                : "text-indigo-700 bg-indigo-50 hover:bg-indigo-100"
                        )}
                        title="Como o cliente escolhe nesta seção"
                    >
                        <ListChecks className="h-3 w-3" />
                        {modeLabel}
                    </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 p-0">
                    <div className="border-b border-slate-100 px-4 py-2.5">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Como o cliente escolhe nesta seção
                        </h4>
                    </div>
                    <div className="py-1">
                        {SELECTION_MODES.map((mode) => {
                            const selected = mode === selectionMode
                            return (
                                <button
                                    key={mode}
                                    onClick={() => handleChangeSelectionMode(mode)}
                                    className={cn(
                                        "block w-full px-4 py-2 text-left transition",
                                        selected ? "bg-indigo-50" : "hover:bg-slate-50"
                                    )}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className={cn(
                                            "text-sm font-medium",
                                            selected ? "text-indigo-700" : "text-slate-900"
                                        )}>
                                            {SELECTION_MODE_LABELS[mode]}
                                        </span>
                                        {selected && <Check className="h-4 w-4 text-indigo-600" />}
                                    </div>
                                    <p className="mt-0.5 text-xs text-slate-500 leading-snug">
                                        {SELECTION_MODE_DESCRIPTIONS[mode]}
                                    </p>
                                </button>
                            )
                        })}
                    </div>
                </PopoverContent>
            </Popover>

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
