import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useGlobalSearchContext } from './GlobalSearchProvider'
import { Search, Loader2, FileText, Users, LayoutGrid, X } from 'lucide-react'
import { cn, buildContactSearchFilter } from '@/lib/utils'

interface SearchResult {
    id: string
    type: 'card' | 'contact' | 'proposal'
    title: string
    subtitle?: string
    href: string
}

export function GlobalSearchModal() {
    const { isOpen, close } = useGlobalSearchContext()
    const navigate = useNavigate()
    const inputRef = useRef<HTMLInputElement>(null)
    const [query, setQuery] = useState('')
    const [selectedIndex, setSelectedIndex] = useState(0)

    const { data: results = [], isLoading } = useQuery({
        queryKey: ['global-search', query],
        queryFn: async () => {
            if (!query || query.length < 2) return []

            const searchTerm = `%${query}%`
            const allResults: SearchResult[] = []

            // Search Cards
            const { data: cards } = await supabase
                .from('cards')
                .select('id, titulo, produto, status_comercial')
                .ilike('titulo', searchTerm)
                .limit(5)

            if (cards) {
                cards.forEach(card => {
                    allResults.push({
                        id: card.id,
                        type: 'card',
                        title: card.titulo || 'Sem título',
                        subtitle: `${card.produto || 'Viagem'} • ${card.status_comercial || 'Em aberto'}`,
                        href: `/cards/${card.id}`,
                    })
                })
            }

            // Search Contacts
            const contactFilter = buildContactSearchFilter(query)

            const { data: contacts } = await supabase
                .from('contatos')
                .select('id, nome, sobrenome, email, telefone')
                .is('deleted_at', null)
                .or(contactFilter)
                .limit(5)

            if (contacts) {
                contacts.forEach(contact => {
                    const fullName = [contact.nome, contact.sobrenome].filter(Boolean).join(' ')
                    allResults.push({
                        id: contact.id,
                        type: 'contact',
                        title: fullName || 'Sem nome',
                        subtitle: contact.email || contact.telefone || '',
                        href: `/pessoas?search=${encodeURIComponent(fullName)}`,
                    })
                })
            }

            // Search Proposals by title
            const { data: proposals } = await supabase
                .from('proposal_versions')
                .select('id, title, proposal_id')
                .ilike('title', searchTerm)
                .limit(5)

            if (proposals) {
                proposals.forEach(version => {
                    if (version.title) {
                        allResults.push({
                            id: version.proposal_id,
                            type: 'proposal',
                            title: version.title,
                            subtitle: 'Proposta',
                            href: `/proposals/${version.proposal_id}/edit`,
                        })
                    }
                })
            }

            return allResults
        },
        enabled: query.length >= 2 && isOpen,
        staleTime: 1000 * 30,
    })

    // Focus input when modal opens
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => {
                inputRef.current?.focus()
                setSelectedIndex(0)
                setQuery('')
            }, 50)
        }
    }, [isOpen])

    // Reset selected index when results change
    useEffect(() => {
        const timer = setTimeout(() => setSelectedIndex(0), 0)
        return () => clearTimeout(timer)
    }, [results])

    const navigateTo = (href: string) => {
        close()
        setQuery('')
        navigate(href)
    }

    // Handle keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setSelectedIndex(prev => Math.min(prev + 1, results.length - 1))
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setSelectedIndex(prev => Math.max(prev - 1, 0))
        } else if (e.key === 'Enter' && results[selectedIndex]) {
            e.preventDefault()
            navigateTo(results[selectedIndex].href)
        } else if (e.key === 'Escape') {
            close()
        }
    }

    const getIcon = (type: SearchResult['type']) => {
        switch (type) {
            case 'card':
                return <LayoutGrid className="h-4 w-4 text-blue-500" />
            case 'contact':
                return <Users className="h-4 w-4 text-green-500" />
            case 'proposal':
                return <FileText className="h-4 w-4 text-purple-500" />
        }
    }

    if (!isOpen) return null

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={close}
            />

            {/* Modal */}
            <div className="relative w-full max-w-xl mx-4 bg-white rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Search Input */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
                    <Search className="h-5 w-5 text-slate-400" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Buscar cards, contatos, propostas..."
                        className="flex-1 bg-transparent text-slate-900 placeholder-slate-400 focus:outline-none text-base"
                    />
                    {isLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                    <button
                        onClick={close}
                        className="p-1 hover:bg-slate-100 rounded transition-colors"
                    >
                        <X className="h-4 w-4 text-slate-400" />
                    </button>
                </div>

                {/* Results */}
                <div className="max-h-[60vh] overflow-y-auto">
                    {query.length < 2 ? (
                        <div className="p-6 text-center text-slate-400 text-sm">
                            <p>Digite pelo menos 2 caracteres para buscar</p>
                            <div className="mt-3 flex items-center justify-center gap-4 text-xs">
                                <span className="flex items-center gap-1">
                                    <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-mono">↑↓</kbd>
                                    navegar
                                </span>
                                <span className="flex items-center gap-1">
                                    <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-mono">Enter</kbd>
                                    selecionar
                                </span>
                                <span className="flex items-center gap-1">
                                    <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-mono">Esc</kbd>
                                    fechar
                                </span>
                            </div>
                        </div>
                    ) : results.length === 0 && !isLoading ? (
                        <div className="p-6 text-center text-slate-400 text-sm">
                            Nenhum resultado para "{query}"
                        </div>
                    ) : (
                        <div className="py-2">
                            {results.map((result, index) => (
                                <button
                                    key={`${result.type}-${result.id}`}
                                    onClick={() => navigateTo(result.href)}
                                    onMouseEnter={() => setSelectedIndex(index)}
                                    className={cn(
                                        'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                                        index === selectedIndex
                                            ? 'bg-blue-50'
                                            : 'hover:bg-slate-50'
                                    )}
                                >
                                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                                        {getIcon(result.type)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-slate-900 truncate">
                                            {result.title}
                                        </p>
                                        {result.subtitle && (
                                            <p className="text-xs text-slate-400 truncate">
                                                {result.subtitle}
                                            </p>
                                        )}
                                    </div>
                                    <span className={cn(
                                        'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                                        result.type === 'card' && 'bg-blue-100 text-blue-700',
                                        result.type === 'contact' && 'bg-green-100 text-green-700',
                                        result.type === 'proposal' && 'bg-purple-100 text-purple-700',
                                    )}>
                                        {result.type === 'card' ? 'Card' :
                                            result.type === 'contact' ? 'Contato' : 'Proposta'}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-400">
                    <span>Busca Global</span>
                    <span>
                        <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono">⌘</kbd>
                        +
                        <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono ml-0.5">K</kbd>
                    </span>
                </div>
            </div>
        </div>,
        document.body
    )
}
