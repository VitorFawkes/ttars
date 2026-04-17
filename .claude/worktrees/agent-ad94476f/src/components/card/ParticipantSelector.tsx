import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { X, User, Mail } from 'lucide-react'
import { cn } from '../../lib/utils'

interface Profile {
    id: string
    nome: string
    email: string
    role: string
}

export interface Participant {
    type: 'internal' | 'external'
    id?: string // for internal
    email: string
    name?: string // for internal or if provided for external
}

interface ParticipantSelectorProps {
    value: Participant[]
    onChange: (participants: Participant[]) => void
    label?: string
    disabled?: boolean
}

export default function ParticipantSelector({ value, onChange, label, disabled = false }: ParticipantSelectorProps) {
    const [profiles, setProfiles] = useState<Profile[]>([])
    const [inputValue, setInputValue] = useState('')
    const [showSuggestions, setShowSuggestions] = useState(false)
    const wrapperRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const fetchProfiles = async () => {
            try {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('id, nome, email, role')
                    .eq('active', true)
                    .order('nome')

                if (error) throw error
                setProfiles((data || []) as Profile[])
            } catch (error) {
                console.error('Error fetching profiles:', error)
            }
        }

        fetchProfiles()
    }, [])

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setShowSuggestions(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [wrapperRef])

    const handleAddInternal = (profile: Profile) => {
        if (!value.some(p => p.type === 'internal' && p.id === profile.id)) {
            onChange([...value, { type: 'internal', id: profile.id, email: profile.email, name: profile.nome }])
        }
        setInputValue('')
        setShowSuggestions(false)
    }

    const handleAddExternal = () => {
        if (inputValue && inputValue.includes('@')) {
            if (!value.some(p => p.email === inputValue)) {
                onChange([...value, { type: 'external', email: inputValue, name: inputValue.split('@')[0] }])
            }
            setInputValue('')
            setShowSuggestions(false)
        }
    }

    const handleRemove = (email: string) => {
        onChange(value.filter(p => p.email !== email))
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            handleAddExternal()
        }
    }

    const filteredProfiles = profiles.filter(p =>
        (p.nome.toLowerCase().includes(inputValue.toLowerCase()) ||
            p.email.toLowerCase().includes(inputValue.toLowerCase())) &&
        !value.some(selected => selected.email === p.email)
    )

    return (
        <div className="space-y-2" ref={wrapperRef}>
            {label && <label className="text-sm font-medium text-gray-700 block">{label}</label>}

            <div className="relative">
                <div className="flex items-center gap-3 px-3 py-2.5 border border-gray-300 rounded-lg bg-white focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all">
                    <Mail className="h-4 w-4 text-gray-400" />
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => {
                            setInputValue(e.target.value)
                            setShowSuggestions(true)
                        }}
                        onKeyDown={handleKeyDown}
                        onFocus={() => setShowSuggestions(true)}
                        disabled={disabled}
                        placeholder="Nome ou email do convidado..."
                        className="flex-1 border-none p-0 text-sm focus:ring-0 placeholder:text-gray-400"
                    />
                    {inputValue && inputValue.includes('@') && filteredProfiles.length === 0 && (
                        <button
                            onClick={handleAddExternal}
                            className="text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded hover:bg-indigo-100"
                        >
                            Adicionar Email
                        </button>
                    )}
                </div>

                {/* Suggestions Dropdown */}
                {showSuggestions && inputValue && (
                    <div className="absolute z-10 w-full mt-1 bg-white rounded-md shadow-lg border border-gray-200 max-h-60 overflow-auto">
                        {filteredProfiles.length > 0 ? (
                            <ul className="py-1">
                                {filteredProfiles.map(profile => (
                                    <li
                                        key={profile.id}
                                        onClick={() => handleAddInternal(profile)}
                                        className="px-3 py-2 hover:bg-gray-50 cursor-pointer flex items-center gap-2"
                                    >
                                        <div className="h-6 w-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-medium">
                                            {profile.nome.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-gray-900">{profile.nome}</p>
                                            <p className="text-xs text-gray-500">{profile.email}</p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            inputValue.includes('@') ? (
                                <div
                                    className="px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm text-gray-600"
                                    onClick={handleAddExternal}
                                >
                                    Adicionar email: <span className="font-medium text-indigo-600">{inputValue}</span>
                                </div>
                            ) : (
                                <div className="px-3 py-2 text-sm text-gray-500">
                                    Nenhum usuário encontrado. Digite um email para convidar externamente.
                                </div>
                            )
                        )}
                    </div>
                )}
            </div>

            {/* Selected Participants Chips */}
            {value.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {value.map(p => (
                        <span
                            key={p.email}
                            className={cn(
                                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
                                p.type === 'internal'
                                    ? "bg-indigo-50 text-indigo-700 border-indigo-100"
                                    : "bg-green-50 text-green-700 border-green-100"
                            )}
                        >
                            {p.type === 'internal' ? <User className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
                            {p.name || p.email}
                            <button
                                type="button"
                                onClick={() => handleRemove(p.email)}
                                className="hover:opacity-75 focus:outline-none"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </span>
                    ))}
                </div>
            )}
        </div>
    )
}
