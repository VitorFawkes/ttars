import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Database } from '../database.types'

// Temporary interface until database.types.ts is regenerated
interface ContactStats {
    contact_id: string
    total_spend: number
    total_trips: number
    last_trip_date: string | null
    next_trip_date: string | null
    top_destinations: string[] | null
    is_group_leader: boolean
    updated_at: string
}

export type Person = Database['public']['Tables']['contatos']['Row'] & {
    stats?: ContactStats
}

export interface PeopleFilters {
    search: string
    type: 'all' | 'adulto' | 'crianca'
    minSpend?: number
    maxSpend?: number
    destination?: string
    lastTripAfter?: string
    lastTripBefore?: string
    isGroupLeader?: boolean
    createdByIds?: string[]
    createdAtStart?: string
    createdAtEnd?: string
}

export interface PeopleSort {
    column: 'nome' | 'total_spend' | 'last_trip_date' | 'total_trips'
    direction: 'asc' | 'desc'
}

const PAGE_SIZE = 50

export function usePeopleIntelligence() {
    const [people, setPeople] = useState<Person[]>([])
    const [loading, setLoading] = useState(true)
    const [totalCount, setTotalCount] = useState(0)
    const [page, setPage] = useState(0)
    const [filters, setFilters] = useState<PeopleFilters>({
        search: '',
        type: 'all'
    })
    const [sort, setSort] = useState<PeopleSort>({
        column: 'nome',
        direction: 'asc'
    })

    // Reset page to 0 when filters or sort change
    useEffect(() => {
        setPage(0)
    }, [filters, sort])

    const fetchPeople = useCallback(async () => {
        setLoading(true)
        try {
            // Start building the query
            let query = supabase
                .from('contatos')
                .select('*, stats:contact_stats(*)', { count: 'exact' })
                .is('deleted_at', null)

            // Apply Filters
            if (filters.search) {
                const term = `%${filters.search}%`
                const words = filters.search.trim().split(/\s+/)
                let searchFilter = `nome.ilike.${term},sobrenome.ilike.${term},email.ilike.${term},cpf.ilike.${term}`
                if (words.length >= 2) {
                    searchFilter += `,and(nome.ilike.%${words[0]}%,sobrenome.ilike.%${words.slice(1).join(' ')}%)`
                }
                query = query.or(searchFilter)
            }

            if (filters.type !== 'all') {
                query = query.eq('tipo_pessoa', filters.type)
            }


            // Created By
            if (filters.createdByIds && filters.createdByIds.length > 0) {
                query = query.in('created_by', filters.createdByIds)
            }

            // Created At Range
            if (filters.createdAtStart) {
                query = query.gte('created_at', filters.createdAtStart)
            }
            if (filters.createdAtEnd) {
                // Add time to end of day if needed, or just use the date
                // Assuming date string YYYY-MM-DD, we might want to include the whole day
                query = query.lte('created_at', `${filters.createdAtEnd}T23:59:59`)
            }

            // Advanced Filters (using inner join logic via !inner if needed, but stats is 1:1)
            if (filters.minSpend !== undefined) {
                query = query.gte('contact_stats.total_spend', filters.minSpend)
            }
            if (filters.maxSpend !== undefined) {
                query = query.lte('contact_stats.total_spend', filters.maxSpend)
            }

            // Last Trip Date Range
            if (filters.lastTripAfter) {
                query = query.gte('contact_stats.last_trip_date', filters.lastTripAfter)
            }
            if (filters.lastTripBefore) {
                query = query.lte('contact_stats.last_trip_date', filters.lastTripBefore)
            }

            if (filters.isGroupLeader) {
                query = query.eq('contact_stats.is_group_leader', true)
            }

            // Sorting
            if (sort.column === 'nome') {
                query = query.order('nome', { ascending: sort.direction === 'asc' })
            } else {
                query = query.order(sort.column, {
                    foreignTable: 'contact_stats',
                    ascending: sort.direction === 'asc'
                })
            }

            // Pagination
            const from = page * PAGE_SIZE
            const to = from + PAGE_SIZE - 1
            query = query.range(from, to)

            const { data, error, count } = await query

            if (error) throw error

            if (data) {
                // Manual casting to handle the joined stats
                setPeople(data as unknown as Person[])
                setTotalCount(count || 0)
            }
        } catch (error) {
            console.error('Error fetching people intelligence:', error)
        } finally {
            setLoading(false)
        }
    }, [filters, sort, page])

    // Fetch Summary Stats
    const [summaryStats, setSummaryStats] = useState({
        totalPeople: 0,
        totalSpend: 0,
        totalTrips: 0,
        totalLeaders: 0
    })

    const fetchStats = useCallback(async () => {
        // Fetch total count directly from contatos for accuracy
        const { count: realTotalCount } = await supabase
            .from('contatos')
            .select('*', { count: 'exact', head: true })
            .is('deleted_at', null)

        const { data } = await supabase
            .from('contact_stats')
            .select('total_spend, total_trips, is_group_leader')

        if (data) {
            const statsData = data as { total_spend: number | null; total_trips: number | null; is_group_leader: boolean | null }[]
            const stats = statsData.reduce((acc, curr) => ({
                totalPeople: acc.totalPeople, // Keep the real count
                totalSpend: acc.totalSpend + (curr.total_spend || 0),
                totalTrips: acc.totalTrips + (curr.total_trips || 0),
                totalLeaders: acc.totalLeaders + (curr.is_group_leader ? 1 : 0)
            }), { totalPeople: realTotalCount || 0, totalSpend: 0, totalTrips: 0, totalLeaders: 0 })
            setSummaryStats(stats)
        } else {
            setSummaryStats(prev => ({ ...prev, totalPeople: realTotalCount || 0 }))
        }
    }, [])

    useEffect(() => {
        fetchStats()
    }, [fetchStats])

    useEffect(() => {
        fetchPeople()
    }, [fetchPeople])

    const refresh = useCallback(async () => {
        await Promise.all([fetchPeople(), fetchStats()])
    }, [fetchPeople, fetchStats])

    // Set up real-time listener for contatos table
    useEffect(() => {
        const channel = supabase
            .channel('contatos-realtime')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'contatos'
                },
                () => {
                    refresh()
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [refresh])

    return {
        people,
        loading,
        totalCount,
        page,
        setPage,
        filters,
        setFilters,
        sort,
        setSort,
        refresh,
        summaryStats
    }
}
