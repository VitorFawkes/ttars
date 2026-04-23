import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Search, User, Loader2, Globe } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useMondeSearch, useMondeImportPerson } from '@/hooks/useMondeSearch'

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
    const dropdownRef = useRef<HTMLDivElement>(null)
    const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null)

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
    const mondeSearch = useMondeSearch()
    const mondeImport = useMondeImportPerson()
    const [showMonde, setShowMonde] = useState(false)

    // Recalcula posição do dropdown (em viewport-fixed) baseado no input
    useEffect(() => {
        if (!isOpen || !containerRef.current) return
        const updatePos = () => {
            const rect = containerRef.current!.getBoundingClientRect()
            setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
        }
        updatePos()
        window.addEventListener('resize', updatePos)
        window.addEventListener('scroll', updatePos, true)
        return () => {
            window.removeEventListener('resize', updatePos)
            window.removeEventListener('scroll', updatePos, true)
        }
    }, [isOpen])

    // Close on outside click (considera o dropdown via portal também)
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            const target = e.target as Node
            const inContainer = containerRef.current?.contains(target)
            const inDropdown = dropdownRef.current?.contains(target)
            if (!inContainer && !inDropdown) {
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

    const dropdownContent = isOpen && search.length >= 2 && dropdownPos ? (
        <div
            ref={dropdownRef}
            style={{
                position: 'fixed',
                top: dropdownPos.top,
                left: dropdownPos.left,
                width: dropdownPos.width,
                maxHeight: 'min(420px, calc(100vh - ' + (dropdownPos.top + 16) + 'px))',
                zIndex: 60,
            }}
            className="bg-white border border-slate-200 rounded-xl shadow-2xl overflow-y-auto"
        >
            {filtered.length === 0 && !isLoading && !showMonde && (
                <div className="px-4 py-4 text-base text-slate-600 space-y-3">
                    <p>Nenhum contato encontrado</p>
                    <button
                        onClick={() => { setShowMonde(true); mondeSearch.search(search) }}
                        className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                    >
                        <Globe className="h-4 w-4" />
                        Buscar no Monde
                    </button>
                </div>
            )}
            {showMonde && mondeSearch.isSearching && (
                <div className="px-4 py-4 flex items-center gap-2 text-base text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Buscando no Monde...
                </div>
            )}
            {showMonde && !mondeSearch.isSearching && mondeSearch.results.filter(r => !r.already_in_crm).length === 0 && mondeSearch.results.length > 0 && (
                <div className="px-4 py-3 text-sm text-slate-400">
                    Todos os resultados do Monde já estão no CRM
                </div>
            )}
            {showMonde && mondeSearch.results.filter(r => !r.already_in_crm).map(person => (
                <button
                    key={person.monde_person_id}
                    onClick={async () => {
                        const result = await mondeImport.mutateAsync({ mondePersonId: person.monde_person_id })
                        const { data } = await supabase.from('contatos').select('id, nome, sobrenome, email, telefone').eq('id', result.id).single()
                        if (data) { handleSelect(data); setShowMonde(false); mondeSearch.clear() }
                    }}
                    disabled={mondeImport.isPending}
                    className="w-full text-left px-4 py-3 hover:bg-indigo-50 flex items-center gap-3 transition-colors border-b border-slate-100 last:border-0"
                >
                    <div className="h-11 w-11 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                        <Globe className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-base font-medium text-slate-900 truncate">{person.name}</p>
                        <p className="text-sm text-slate-500 truncate">
                            {[person.email, person.phone].filter(Boolean).join(' · ')} • Monde
                        </p>
                    </div>
                </button>
            ))}
            {filtered.map(contact => (
                <button
                    key={contact.id}
                    onClick={() => handleSelect(contact)}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center gap-3 transition-colors border-b border-slate-100 last:border-0"
                >
                    <div className="h-11 w-11 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                        <span className="text-sm font-semibold text-indigo-700">
                            {`${contact.nome[0] ?? ''}${contact.sobrenome?.[0] ?? ''}`.toUpperCase() || <User className="h-5 w-5 text-indigo-600" />}
                        </span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-base font-medium text-slate-900 truncate">{displayName(contact)}</p>
                        <p className="text-sm text-slate-500 truncate">
                            {[contact.email, contact.telefone].filter(Boolean).join(' · ') || 'Sem contato'}
                        </p>
                    </div>
                </button>
            ))}
        </div>
    ) : null

    return (
        <div ref={containerRef} className="relative">
            <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                    ref={inputRef}
                    type="text"
                    value={search}
                    onChange={e => { setSearch(e.target.value); setIsOpen(true) }}
                    onFocus={() => search.length >= 2 && setIsOpen(true)}
                    placeholder={placeholder}
                    className="w-full pl-11 pr-11 py-3 text-base border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                />
                {isLoading && (
                    <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 animate-spin" />
                )}
            </div>

            {dropdownContent && createPortal(dropdownContent, document.body)}
        </div>
    )
}
