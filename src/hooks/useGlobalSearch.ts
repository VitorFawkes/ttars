import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useNavigate } from 'react-router-dom'
import { useProductContext } from '@/hooks/useProductContext'
import { buildContactSearchFilter, normalizePhone } from '@/lib/utils'

export interface SearchResult {
    id: string
    type: 'card' | 'contact' | 'proposal'
    title: string
    subtitle?: string
    icon: string
    href: string
}

export function useGlobalSearch() {
    const [query, setQuery] = useState('')
    const [isOpen, setIsOpen] = useState(false)
    const navigate = useNavigate()
    const { currentProduct } = useProductContext()

    const { data: results = [], isLoading } = useQuery({
        queryKey: ['global-search', query, currentProduct],
        queryFn: async () => {
            if (!query || query.length < 2) return []

            const searchTerm = `%${query}%`
            const allResults: SearchResult[] = []

            // Search Cards (filtered by current product) — by title + Monde number
            const cardIds = new Set<string>()

            const [{ data: cardsByTitle }, { data: cardsByMonde }] = await Promise.all([
                supabase
                    .from('cards')
                    .select('id, titulo, produto, status_comercial')
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .eq('produto', currentProduct as any)
                    .is('deleted_at', null)
                    .ilike('titulo', searchTerm)
                    .limit(5),
                supabase
                    .from('cards')
                    .select('id, titulo, produto, status_comercial')
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .eq('produto', currentProduct as any)
                    .is('deleted_at', null)
                    .ilike('produto_data->>numero_venda_monde', searchTerm)
                    .limit(5),
            ])

            const allCards = [...(cardsByTitle || []), ...(cardsByMonde || [])]

            for (const card of allCards) {
                if (cardIds.has(card.id)) continue
                cardIds.add(card.id)
                allResults.push({
                    id: card.id,
                    type: 'card',
                    title: card.titulo || 'Sem título',
                    subtitle: `${card.produto || 'Viagem'} • ${card.status_comercial || 'Em aberto'}`,
                    icon: '📋',
                    href: `/cards/${card.id}`,
                })
            }

            // Search Contacts (primary phone + contato_meios for secondary phones)
            const contactFilter = buildContactSearchFilter(query)

            const [{ data: contacts }, meiosContactIds] = await Promise.all([
                supabase
                    .from('contatos')
                    .select('id, nome, sobrenome, email, telefone')
                    .is('deleted_at', null)
                    .or(contactFilter)
                    .limit(5),
                // Search secondary phones in contato_meios
                (async () => {
                    const normalized = normalizePhone(query)
                    if (normalized.length < 4) return [] as string[]
                    const { data } = await supabase
                        .from('contato_meios')
                        .select('contato_id')
                        .in('tipo', ['telefone', 'whatsapp'])
                        .ilike('valor_normalizado', `%${normalized}%`)
                        .limit(10)
                    return (data || []).map(m => m.contato_id)
                })()
            ])

            // Fetch extra contacts found via contato_meios but not in primary results
            const primaryIds = new Set((contacts || []).map(c => c.id))
            const extraIds = meiosContactIds.filter(id => !primaryIds.has(id))
            let allContacts = contacts || []

            if (extraIds.length > 0) {
                const { data: extraContacts } = await supabase
                    .from('contatos')
                    .select('id, nome, sobrenome, email, telefone')
                    .in('id', extraIds)
                    .is('deleted_at', null)
                    .limit(5)
                if (extraContacts) allContacts = [...allContacts, ...extraContacts]
            }

            if (allContacts.length > 0) {
                allContacts.forEach(contact => {
                    const fullName = [contact.nome, contact.sobrenome].filter(Boolean).join(' ')
                    allResults.push({
                        id: contact.id,
                        type: 'contact',
                        title: fullName || 'Sem nome',
                        subtitle: contact.email || contact.telefone || '',
                        icon: '👤',
                        href: `/pessoas?search=${encodeURIComponent(fullName)}`,
                    })
                })
            }

            // Search Proposals (filtered by card's product)
            const { data: proposals } = await supabase
                .from('proposals')
                .select(`
                    id,
                    status,
                    active_version:proposal_versions!active_version_id(title),
                    card:cards!proposals_card_id_fkey(produto)
                `)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .eq('cards.produto', currentProduct as any)
                .limit(5)

            if (proposals) {
                proposals.forEach(proposal => {
                    const version = proposal.active_version as { title: string } | null
                    const title = version?.title
                    if (title && title.toLowerCase().includes(query.toLowerCase())) {
                        allResults.push({
                            id: proposal.id,
                            type: 'proposal',
                            title: title,
                            subtitle: `Proposta • ${proposal.status}`,
                            icon: '📄',
                            href: `/proposals/${proposal.id}/edit`,
                        })
                    }
                })
            }

            return allResults
        },
        enabled: query.length >= 2,
        staleTime: 1000 * 30,
    })

    const open = useCallback(() => setIsOpen(true), [])
    const close = useCallback(() => {
        setIsOpen(false)
        setQuery('')
    }, [])

    const navigateTo = useCallback((href: string) => {
        close()
        navigate(href)
    }, [close, navigate])

    return {
        query,
        setQuery,
        results,
        isLoading,
        isOpen,
        open,
        close,
        navigateTo,
    }
}
