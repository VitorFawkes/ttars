import { useState } from 'react'
import { Search } from 'lucide-react'
import { cn } from '../../../lib/utils'

interface PersonOption {
    id: string
    full_name: string | null
    email: string | null
}

interface PersonFilterListProps {
    label: string
    placeholder: string
    profiles: PersonOption[]
    selected: string[]
    onToggle: (id: string) => void
    accentColor?: {
        checkbox: string
        avatar: string
        avatarText: string
        avatarBorder: string
        selectedBg: string
        selectedText: string
    }
}

const DEFAULT_ACCENT = {
    checkbox: 'text-primary focus:ring-primary',
    avatar: 'bg-primary/10',
    avatarText: 'text-primary',
    avatarBorder: 'border-primary/20',
    selectedBg: 'bg-primary/5',
    selectedText: 'font-medium text-primary-dark',
}

export function PersonFilterList({
    label, placeholder, profiles, selected, onToggle,
    accentColor = DEFAULT_ACCENT,
}: PersonFilterListProps) {
    const [search, setSearch] = useState('')

    const filtered = profiles.filter(p => {
        if (!search) return true
        const q = search.toLowerCase()
        return (p.full_name?.toLowerCase() || '').includes(q) || (p.email?.toLowerCase() || '').includes(q)
    })

    return (
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
            <label className="text-sm font-semibold text-gray-700 block">{label}</label>
            <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input
                    type="text"
                    placeholder={placeholder}
                    className="w-full pl-9 h-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all mb-2"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>
            <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-lg p-1 space-y-0.5 bg-gray-50/30 custom-scrollbar">
                {filtered.map(profile => {
                    const isSelected = selected.includes(profile.id)
                    const displayName = profile.full_name || profile.email || '?'
                    return (
                        <label key={profile.id} className={cn(
                            "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                            isSelected ? accentColor.selectedBg : "hover:bg-white"
                        )}>
                            <input
                                type="checkbox"
                                className={cn("rounded border-gray-300", accentColor.checkbox)}
                                checked={isSelected}
                                onChange={() => onToggle(profile.id)}
                            />
                            <div className="flex items-center gap-2">
                                <div className={cn(
                                    "h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold border",
                                    accentColor.avatar, accentColor.avatarText, accentColor.avatarBorder
                                )}>
                                    {displayName.substring(0, 2).toUpperCase()}
                                </div>
                                <span className={cn("text-sm", isSelected ? accentColor.selectedText : "text-gray-700")}>
                                    {displayName}
                                </span>
                            </div>
                        </label>
                    )
                })}
                {filtered.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-3">Nenhum resultado</p>
                )}
            </div>
        </div>
    )
}
