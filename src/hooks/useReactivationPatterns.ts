import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Cast para tabela ainda não tipada no database.types.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export interface ReactivationPattern {
    contact_id: string
    org_id: string
    travel_frequency_per_year: number | null
    avg_days_between_trips: number | null
    total_completed_trips: number
    peak_months: number[] | null
    peak_months_confidence: number | null
    typical_booking_lead_days: number | null
    predicted_next_trip_start: string | null
    predicted_next_trip_end: string | null
    ideal_contact_date: string | null
    prediction_confidence: number | null
    avg_trip_value: number | null
    total_revenue: number | null
    is_high_value: boolean
    reactivation_score: number | null
    score_breakdown: {
        frequency: number
        recency: number
        value: number
        seasonality: number
        timing: number
        interest: number
        engagement: number
    } | null
    last_destinations: string[] | null
    preferred_duration_days: number | null
    days_since_last_trip: number | null
    days_until_ideal_contact: number | null
    // Novas dimensões v3
    birthday_date: string | null
    days_until_birthday: number | null
    companion_names: string[] | null
    companion_count: number
    last_interaction_date: string | null
    last_interaction_type: string | null
    days_since_interaction: number | null
    referral_count: number
    is_referrer: boolean
    last_gift_date: string | null
    gifts_sent_count: number
    calculated_at: string
    // Joined from contatos
    contato?: {
        id: string
        nome: string | null
        sobrenome: string | null
        email: string | null
        telefone: string | null
    }
}

export interface ReactivationFilters {
    minScore: number
    search: string
    urgency: 'all' | 'overdue' | 'soon' | 'planned'
    isHighValue?: boolean
}

export interface ReactivationSort {
    column: 'reactivation_score' | 'ideal_contact_date' | 'avg_trip_value' | 'days_until_ideal_contact'
    direction: 'asc' | 'desc'
}

const PAGE_SIZE = 25

export function useReactivationPatterns() {
    const [data, setData] = useState<ReactivationPattern[]>([])
    const [loading, setLoading] = useState(true)
    const [totalCount, setTotalCount] = useState(0)
    const [page, setPage] = useState(0)
    const [filters, setFilters] = useState<ReactivationFilters>({
        minScore: 0,
        search: '',
        urgency: 'all',
    })
    const [sort, setSort] = useState<ReactivationSort>({
        column: 'reactivation_score',
        direction: 'desc',
    })

    useEffect(() => { setPage(0) }, [filters, sort])

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            let query = db
                .from('reactivation_patterns')
                .select('*, contato:contatos!contact_id(id, nome, sobrenome, email, telefone)', { count: 'exact' })

            // Filtro de score mínimo
            if (filters.minScore > 0) {
                query = query.gte('reactivation_score', filters.minScore)
            }

            // Filtro de busca (nome do contato)
            if (filters.search) {
                const term = `%${filters.search}%`
                query = query.or(`nome.ilike.${term},sobrenome.ilike.${term}`, { foreignTable: 'contatos' })
            }

            // Filtro de urgência
            if (filters.urgency === 'overdue') {
                query = query.lt('days_until_ideal_contact', 0)
            } else if (filters.urgency === 'soon') {
                query = query.gte('days_until_ideal_contact', 0).lte('days_until_ideal_contact', 30)
            } else if (filters.urgency === 'planned') {
                query = query.gt('days_until_ideal_contact', 30)
            }

            // High value
            if (filters.isHighValue) {
                query = query.eq('is_high_value', true)
            }

            // Sorting
            query = query.order(sort.column, {
                ascending: sort.direction === 'asc',
                nullsFirst: false,
            })

            // Paginação
            const from = page * PAGE_SIZE
            const to = from + PAGE_SIZE - 1
            query = query.range(from, to)

            const { data: rows, error, count } = await query

            if (error) throw error

            setData((rows as unknown as ReactivationPattern[]) ?? [])
            setTotalCount(count ?? 0)
        } catch (error) {
            console.error('Error fetching reactivation patterns:', error)
        } finally {
            setLoading(false)
        }
    }, [filters, sort, page])

    // Summary KPIs
    const [kpis, setKpis] = useState({
        totalPriority: 0,
        totalOverdue: 0,
        totalSoon: 0,
        estimatedRevenue: 0,
    })

    const fetchKpis = useCallback(async () => {
        const [
            { count: priority },
            { count: overdue },
            { count: soon },
            { data: revenueData },
        ] = await Promise.all([
            db.from('reactivation_patterns').select('*', { count: 'exact', head: true }).gte('reactivation_score', 70),
            db.from('reactivation_patterns').select('*', { count: 'exact', head: true }).lt('days_until_ideal_contact', 0),
            db.from('reactivation_patterns').select('*', { count: 'exact', head: true }).gte('days_until_ideal_contact', 0).lte('days_until_ideal_contact', 30),
            db.from('reactivation_patterns').select('avg_trip_value').gte('reactivation_score', 50),
        ])

        const estimatedRevenue = ((revenueData as { avg_trip_value: number | null }[]) ?? []).reduce(
            (sum, r) => sum + (r.avg_trip_value ?? 0), 0
        )

        setKpis({
            totalPriority: priority ?? 0,
            totalOverdue: overdue ?? 0,
            totalSoon: soon ?? 0,
            estimatedRevenue,
        })
    }, [])

    useEffect(() => { fetchData() }, [fetchData])
    useEffect(() => { fetchKpis() }, [fetchKpis])

    const refresh = useCallback(async () => {
        await Promise.all([fetchData(), fetchKpis()])
    }, [fetchData, fetchKpis])

    const recalculate = useCallback(async () => {
        setLoading(true)
        try {
            const { error } = await db.rpc('calculate_reactivation_patterns')
            if (error) throw error
            await refresh()
        } catch (error) {
            console.error('Error recalculating patterns:', error)
            throw error
        } finally {
            setLoading(false)
        }
    }, [refresh])

    return {
        data,
        loading,
        totalCount,
        page,
        setPage,
        pageSize: PAGE_SIZE,
        filters,
        setFilters,
        sort,
        setSort,
        kpis,
        refresh,
        recalculate,
    }
}
