import { useState, useRef, useEffect } from 'react'
import { X, Plus, Tag } from 'lucide-react'
import { cn } from '../../lib/utils'

interface TagsInputProps {
    value: string[]
    onChange: (tags: string[]) => void
    suggestions?: string[]
    placeholder?: string
    className?: string
}

const DEFAULT_SUGGESTIONS = [
    'VIP',
    'Família',
    'Corporativo',
    'Lua de Mel',
    'Aniversário',
    'Primeira Viagem',
    'Frequente',
    'Indicação'
]

export default function TagsInput({
    value = [],
    onChange,
    suggestions = DEFAULT_SUGGESTIONS,
    placeholder = 'Adicionar tag...',
    className
}: TagsInputProps) {
    const [inputValue, setInputValue] = useState('')
    const [showSuggestions, setShowSuggestions] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    // Filter suggestions that haven't been added yet
    const availableSuggestions = suggestions.filter(
        s => !value.includes(s) && s.toLowerCase().includes(inputValue.toLowerCase())
    )

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setShowSuggestions(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const addTag = (tag: string) => {
        const trimmed = tag.trim()
        if (trimmed && !value.includes(trimmed)) {
            onChange([...value, trimmed])
        }
        setInputValue('')
        setShowSuggestions(false)
        inputRef.current?.focus()
    }

    const removeTag = (tagToRemove: string) => {
        onChange(value.filter(t => t !== tagToRemove))
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            if (inputValue.trim()) {
                addTag(inputValue)
            }
        } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
            removeTag(value[value.length - 1])
        }
    }

    const getTagColor = (tag: string) => {
        const colors = [
            'bg-blue-100 text-blue-700 border-blue-200',
            'bg-purple-100 text-purple-700 border-purple-200',
            'bg-green-100 text-green-700 border-green-200',
            'bg-orange-100 text-orange-700 border-orange-200',
            'bg-pink-100 text-pink-700 border-pink-200',
            'bg-indigo-100 text-indigo-700 border-indigo-200'
        ]
        // Simple hash based on tag content for consistent colors
        const hash = tag.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
        return colors[hash % colors.length]
    }

    return (
        <div ref={containerRef} className={cn('relative', className)}>
            {/* Tags container */}
            <div
                className={cn(
                    'min-h-[44px] px-3 py-2 border border-slate-200 rounded-lg bg-white',
                    'flex flex-wrap gap-2 items-center cursor-text',
                    'focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500',
                    'transition-all'
                )}
                onClick={() => inputRef.current?.focus()}
            >
                {value.map(tag => (
                    <span
                        key={tag}
                        className={cn(
                            'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border',
                            getTagColor(tag)
                        )}
                    >
                        <Tag className="h-3 w-3" />
                        {tag}
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation()
                                removeTag(tag)
                            }}
                            className="ml-0.5 p-0.5 rounded-full hover:bg-black/10 transition-colors"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    </span>
                ))}

                <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => {
                        setInputValue(e.target.value)
                        setShowSuggestions(true)
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    onKeyDown={handleKeyDown}
                    placeholder={value.length === 0 ? placeholder : ''}
                    className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-sm text-slate-900 placeholder:text-slate-400"
                />
            </div>

            {/* Suggestions dropdown */}
            {showSuggestions && availableSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {availableSuggestions.map(suggestion => (
                        <button
                            key={suggestion}
                            type="button"
                            onClick={() => addTag(suggestion)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                            <Plus className="h-3.5 w-3.5 text-slate-400" />
                            {suggestion}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
