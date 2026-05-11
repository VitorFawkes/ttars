import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

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
    last_lost_reason_id: string | null
    last_lost_reason_name: string | null
    last_responsavel_id: string | null
    recent_interaction_warning: boolean
    has_sibling_open_card: boolean
    calculated_at: string
    contato?: {
        id: string
        nome: string | null
        sobrenome: string | null
        email: string | null
        telefone: string | null
        data_nascimento: string | null
    }
    responsavel?: {
        id: string
        nome: string | null
        email: string | null
        avatar_url: string | null
    } | null
}

export type DaysSinceContactRange = 'any' | 'lt30' | '30_90' | '90_180' | '180_365' | 'gt365'
export type LastTripRange = 'any' | 'lt1y' | '1_2y' | '2_3y' | 'gt3y'
export type BirthdayWindow = 'any' | 'this_month' | 'next30' | 'next60'

export interface ReactivationFilters {
    minScore: number
    search: string
    urgency: 'all' | 'overdue' | 'soon' | 'planned'
    isHighValue?: boolean
    destinations?: string[]
    ticketMin?: number | null
    ticketMax?: number | null
    daysSinceContact?: DaysSinceContactRange
    lastTripRange?: LastTripRange
    birthdayWindow?: BirthdayWindow
    lastLossReasonId?: string | null
    responsavelId?: string | null
    unassignedOnly?: boolean
    excludeRecentInteraction?: boolean
}

export interface ReactivationSort {
    column: 'reactivation_score' | 'ideal_contact_date' | 'avg_trip_value' | 'days_until_ideal_contact' | 'days_since_last_trip' | 'days_since_interaction'
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
                .select(
                    '*, contato:contatos!contact_id(id, nome, sobrenome, email, telefone, data_nascimento), responsavel:profiles!last_responsavel_id(id, nome, email, avatar_url)',
                    { count: 'exact' }
                )

            if (filters.minScore > 0) query = query.gte('reactivation_score', filters.minScore)

            if (filters.search) {
                const term = `%${filters.search}%`
                query = query.or(`nome.ilike.${term},sobrenome.ilike.${term}`, { foreignTable: 'contatos' })
            }

            if (filters.urgency === 'overdue') query = query.lt('days_until_ideal_contact', 0)
            else if (filters.urgency === 'soon') query = query.gte('days_until_ideal_contact', 0).lte('days_until_ideal_contact', 30)
            else if (filters.urgency === 'planned') query = query.gt('days_until_ideal_contact', 30)

            if (filters.isHighValue) query = query.eq('is_high_value', true)

            if (filters.destinations && filters.destinations.length > 0) {
                query = query.overlaps('last_destinations', filters.destinations)
            }
            if (filters.ticketMin !== null && filters.ticketMin !== undefined) query = query.gte('avg_trip_value', filters.ticketMin)
            if (filters.ticketMax !== null && filters.ticketMax !== undefined) query = query.lte('avg_trip_value', filters.ticketMax)

            switch (filters.daysSinceContact) {
                case 'lt30': query = query.lt('days_since_interaction', 30); break
                case '30_90': query = query.gte('days_since_interaction', 30).lte('days_since_interaction', 90); break
                case '90_180': query = query.gte('days_since_interaction', 90).lte('days_since_interaction', 180); break
                case '180_365': query = query.gte('days_since_interaction', 180).lte('days_since_interaction', 365); break
                case 'gt365': query = query.gt('days_since_interaction', 365); break
            }

            switch (filters.lastTripRange) {
                case 'lt1y': query = query.lt('days_since_last_trip', 365); break
                case '1_2y': query = query.gte('days_since_last_trip', 365).lte('days_since_last_trip', 730); break
                case '2_3y': query = query.gte('days_since_last_trip', 730).lte('days_since_last_trip', 1095); break
                case 'gt3y': query = query.gt('days_since_last_trip', 1095); break
            }

            if (filters.birthdayWindow === 'this_month') query = query.gte('days_until_birthday', 0).lte('days_until_birthday', 31)
            else if (filters.birthdayWindow === 'next30') query = query.gte('days_until_birthday', 0).lte('days_until_birthday', 30)
            else if (filters.birthdayWindow === 'next60') query = query.gte('days_until_birthday', 0).lte('days_until_birthday', 60)

            if (filters.lastLossReasonId) query = query.eq('last_lost_reason_id', filters.lastLossReasonId)

            if (filters.unassignedOnly) query = query.is('last_responsavel_id', null)
            else if (filters.responsavelId) query = query.eq('last_responsavel_id', filters.responsavelId)

            if (filters.excludeRecentInteraction) {
                query = query.or('recent_interaction_warning.is.false,recent_interaction_warning.is.null')
            }

            query = query.order(sort.column, { ascending: sort.direction === 'asc', nullsFirst: false })

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

    const [kpis, setKpis] = useState({
        totalPriority: 0,
        totalOverdue: 0,
        totalSoon: 0,
        estimatedRevenue: 0,
        totalBirthdayMonth: 0,
        totalSuppressed: 0,
    })

    const fetchKpis = useCallback(async () => {
        const [
            { count: priority },
            { count: overdue },
            { count: soon },
            { data: revenueData },
            { count: birthdayMonth },
            { count: suppressed },
        ] = await Promise.all([
            db.from('reactivation_patterns').select('*', { count: 'exact', head: true }).gte('reactivation_score', 70),
            db.from('reactivation_patterns').select('*', { count: 'exact', head: true }).lt('days_until_ideal_contact', 0),
            db.from('reactivation_patterns').select('*', { count: 'exact', head: true }).gte('days_until_ideal_contact', 0).lte('days_until_ideal_contact', 30),
            db.from('reactivation_patterns').select('avg_trip_value').gte('reactivation_score', 50),
            db.from('reactivation_patterns').select('*', { count: 'exact', head: true }).gte('days_until_birthday', 0).lte('days_until_birthday', 30),
            db.from('reactivation_suppressions').select('*', { count: 'exact', head: true }).or('suppressed_until.is.null,suppressed_until.gt.' + new Date().toISOString()),
        ])

        const estimatedRevenue = ((revenueData as { avg_trip_value: number | null }[]) ?? []).reduce(
            (sum, r) => sum + (r.avg_trip_value ?? 0), 0
        )

        setKpis({
            totalPriority: priority ?? 0,
            totalOverdue: overdue ?? 0,
            totalSoon: soon ?? 0,
            estimatedRevenue,
            totalBirthdayMonth: birthdayMonth ?? 0,
            totalSuppressed: suppressed ?? 0,
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
