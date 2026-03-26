import { useState, useRef, useEffect } from 'react'
import { Search, User, Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

interface ContactResult {
    id: string
    nome: string
    sobrenome: string | null
    email: string | null
    telefone: string | null
}

interface ContactSearchInputProps {
    onSelect: (contact: ContactResult) => void
    placeholder?: string
    excludeIds?: string[]
}

export default function ContactSearchInput({ onSelect, placeholder = 'Buscar contato por nome, email ou telefone...', excludeIds = [] }: ContactSearchInputProps) {
    const [search, setSearch] = useState('')
    const [isOpen, setIsOpen] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    const { data: contacts = [], isLoading } = useQuery({
        queryKey: ['contact-search', search],
        queryFn: async () => {
            if (search.length < 2) return []
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).from('contatos')
                .select('id, nome, sobrenome, email, telefone')
                .or(`nome.ilike.%${search}%,sobrenome.ilike.%${search}%,email.ilike.%${search}%,telefone.ilike.%${search}%`)
                .limit(15)
            if (error) throw error
            return (data || []) as ContactResult[]
        },
        enabled: search.length >= 2,
        staleTime: 1000 * 10,
    })

    const filtered = contacts.filter(c => !excludeIds.includes(c.id))

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    const handleSelect = (contact: ContactResult) => {
        onSelect(contact)
        setSearch('')
        setIsOpen(false)
    }

    const displayName = (c: ContactResult) =>
        c.sobrenome ? `${c.nome} ${c.sobrenome}` : c.nome

    return (
        <div ref={containerRef} className="relative">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                    ref={inputRef}
                    type="text"
                    value={search}
                    onChange={e => { setSearch(e.target.value); setIsOpen(true) }}
                    onFocus={() => search.length >= 2 && setIsOpen(true)}
                    placeholder={placeholder}
                    className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                />
                {isLoading && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 animate-spin" />
                )}
            </div>

            {isOpen && search.length >= 2 && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                    {filtered.length === 0 && !isLoading && (
                        <div className="px-4 py-3 text-sm text-slate-500">
                            Nenhum contato encontrado
                        </div>
                    )}
                    {filtered.map(contact => (
                        <button
                            key={contact.id}
                            onClick={() => handleSelect(contact)}
                            className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center gap-3 text-sm transition-colors"
                        >
                            <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                                <User className="h-4 w-4 text-indigo-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-slate-900 truncate">{displayName(contact)}</p>
                                <p className="text-xs text-slate-400 truncate">
                                    {[contact.email, contact.telefone].filter(Boolean).join(' · ')}
                                </p>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
