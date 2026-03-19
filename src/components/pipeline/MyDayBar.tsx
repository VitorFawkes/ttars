import { useState } from 'react'
import { CalendarCheck, ChevronDown, ChevronRight, CheckCircle2, TrendingUp } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '../../lib/utils'
import { startOfDay, endOfDay } from 'date-fns'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { usePipelineFilters } from '../../hooks/usePipelineFilters'
import { useMyDayTasks } from '../../hooks/useMyDayTasks'
import { useMyDayOpportunities } from '../../hooks/useMyDayOpportunities'
import { MyDayTaskCard } from './MyDayTaskCard'
import { MyDayOpportunityCard } from './MyDayOpportunityCard'

import type { Database } from '../../database.types'
import type { MyDayOpportunity } from '../../hooks/useMyDayOpportunities'

type Product = Database['public']['Enums']['app_product']

interface MyDayBarProps {
    productFilter: Product
}

type SectionKey = string | null

const COLLAPSED_KEY = 'myday_collapsed'

export function MyDayBar({ productFilter }: MyDayBarProps) {
    const { profile } = useAuth()
    const { viewMode, subView, filters } = usePipelineFilters()

    // --- Derive who to show based on Pipeline state ---
    // Collect ALL person IDs from Pipeline filters (ownerIds, sdrIds, plannerIds, posIds)
    const personFilterIds = [
        ...(filters.ownerIds || []),
        ...(filters.sdrIds || []),
        ...(filters.plannerIds || []),
        ...(filters.posIds || []),
    ]
    // Deduplicate
    const uniquePersonFilterIds = [...new Set(personFilterIds)]
    const hasPersonFilter = uniquePersonFilterIds.length > 0

    // Fetch team member IDs when in TEAM_VIEW (and no person filter overriding)
    const needsTeam = viewMode === 'MANAGER' && subView === 'TEAM_VIEW' && !hasPersonFilter
    const { data: teamMemberIds } = useQuery({
        queryKey: ['my-team-members', profile?.team_id],
        enabled: !!profile?.team_id && needsTeam,
        queryFn: async () => {
            if (!profile?.team_id) return []
            const { data, error } = await supabase
                .from('profiles')
                .select('id')
                .eq('team_id', profile.team_id)
                .eq('active', true)
            if (error) throw error
            return data.map(p => p.id)
        },
    })

    // Build the effective responsavelIds list
    // Person filter takes priority > TEAM_VIEW > ALL > MY_QUEUE
    let effectiveIds: string[] | undefined // undefined = no filter (show all)
    let showOwner = false

    if (hasPersonFilter) {
        // Person filter from drawer overrides everything
        effectiveIds = uniquePersonFilterIds
        showOwner = true
    } else if (viewMode === 'MANAGER' && subView === 'ALL') {
        effectiveIds = undefined // no filter — show all
        showOwner = true
    } else if (viewMode === 'MANAGER' && subView === 'TEAM_VIEW') {
        effectiveIds = teamMemberIds || []
        showOwner = true
    } else {
        // MY_QUEUE, FORECAST, ATTENTION → only my tasks
        effectiveIds = profile?.id ? [profile.id] : []
        showOwner = false
    }

    const [isCollapsed, setIsCollapsed] = useState(() =>
        localStorage.getItem(COLLAPSED_KEY) === 'true'
    )
    const [expandedSection, setExpandedSection] = useState<SectionKey>(null)

    // Reset expanded section when effective filter changes
    const filterKey = effectiveIds ? effectiveIds.join(',') : '__all__'
    const [prevFilterKey, setPrevFilterKey] = useState(filterKey)
    if (prevFilterKey !== filterKey) {
        setPrevFilterKey(filterKey)
        setExpandedSection(null)
    }

    const {
        buckets,
        overdue,
        today,
        total,
        isLoading: tasksLoading,
        completeTask,
        isCompleting,
    } = useMyDayTasks({ productFilter, responsavelIds: effectiveIds })

    const {
        opportunities,
        count: opportunitiesCount,
        isLoading: oppsLoading,
    } = useMyDayOpportunities({ productFilter, responsavelIds: effectiveIds })

    const isLoading = tasksLoading || oppsLoading

    const toggleCollapsed = () => {
        const next = !isCollapsed
        setIsCollapsed(next)
        localStorage.setItem(COLLAPSED_KEY, String(next))
        if (next) setExpandedSection(null)
    }

    const toggleSection = (key: string) => {
        setExpandedSection(prev => prev === key ? null : key)
    }

    // Match opportunities to day buckets by scheduled_date
    const getOpportunitiesForBucket = (bucketKey: string): MyDayOpportunity[] => {
        if (bucketKey === 'overdue') return []
        const bucket = buckets.find(b => b.key === bucketKey)
        if (!bucket?.date) return []
        const dayStart = startOfDay(bucket.date)
        const dayEnd = endOfDay(bucket.date)
        return opportunities.filter(o => {
            const d = new Date(o.scheduled_date + 'T12:00:00')
            return d >= dayStart && d <= dayEnd
        })
    }

    const expandedBucket = buckets.find(b => b.key === expandedSection)
    const showFutureOpportunities = expandedSection === 'future-opportunities'

    const expandedOpps = expandedSection && expandedSection !== 'future-opportunities'
        ? getOpportunitiesForBucket(expandedSection)
        : []
    const hasExpandedContent = (expandedBucket?.tasks.length || 0) + expandedOpps.length > 0 || showFutureOpportunities

    const getPillCount = (bucketKey: string, taskCount: number): number => {
        return taskCount + getOpportunitiesForBucket(bucketKey).length
    }

    const isEmpty = total === 0 && opportunitiesCount === 0
    const urgentCount = overdue + today

    return (
        <div className="flex-shrink-0 border-b border-slate-200/80 bg-white/80 backdrop-blur-sm">
            {/* Collapsed state */}
            {isCollapsed ? (
                <button
                    onClick={toggleCollapsed}
                    className="w-full px-6 py-1.5 flex items-center gap-2 hover:bg-slate-50 transition-colors"
                >
                    <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                    <CalendarCheck className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-xs font-medium text-slate-500">Meu Dia</span>
                    {!isLoading && urgentCount > 0 && (
                        <span className={cn(
                            "text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full",
                            overdue > 0 ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                        )}>
                            {urgentCount}
                        </span>
                    )}
                    {!isLoading && opportunitiesCount > 0 && (
                        <span className="text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-amber-100 text-amber-700">
                            {opportunitiesCount}
                        </span>
                    )}
                </button>
            ) : (
                <>
                    {/* Pills bar */}
                    <div className="px-6 py-2 flex items-center gap-3 overflow-x-auto scrollbar-hide">
                        {/* Collapse toggle + label */}
                        <button
                            onClick={toggleCollapsed}
                            className="flex items-center gap-1.5 flex-shrink-0 hover:opacity-70 transition-opacity"
                        >
                            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                            <CalendarCheck className="h-4 w-4 text-slate-400" />
                        </button>

                        <span className="text-xs font-medium text-slate-500 whitespace-nowrap flex-shrink-0">Meu Dia</span>

                        {/* Separator */}
                        <div className="w-px h-5 bg-slate-200 flex-shrink-0" />

                        {isLoading ? (
                            <div className="flex gap-2">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="h-7 w-20 bg-slate-100 rounded-full animate-pulse" />
                                ))}
                            </div>
                        ) : isEmpty ? (
                            <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span>Nenhuma tarefa pendente</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
                                <Pill
                                    label="Atrasadas"
                                    count={overdue}
                                    variant="overdue"
                                    isActive={expandedSection === 'overdue'}
                                    onClick={() => toggleSection('overdue')}
                                />
                                <Pill
                                    label="Hoje"
                                    count={getPillCount('today', today)}
                                    variant="today"
                                    isActive={expandedSection === 'today'}
                                    onClick={() => toggleSection('today')}
                                />
                                {buckets.slice(2).map(bucket => (
                                    <Pill
                                        key={bucket.key}
                                        label={bucket.label}
                                        count={getPillCount(bucket.key, bucket.tasks.length)}
                                        variant="future"
                                        isActive={expandedSection === bucket.key}
                                        onClick={() => toggleSection(bucket.key)}
                                    />
                                ))}
                                {opportunitiesCount > 0 && (
                                    <>
                                        <div className="w-px h-5 bg-slate-200 flex-shrink-0 mx-0.5" />
                                        <Pill
                                            label="Oport. Futuras"
                                            count={opportunitiesCount}
                                            variant="opportunity"
                                            isActive={expandedSection === 'future-opportunities'}
                                            onClick={() => toggleSection('future-opportunities')}
                                            icon={<TrendingUp className="h-3 w-3" />}
                                        />
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Expanded section */}
                    {expandedSection && hasExpandedContent && (
                        <div className="border-t border-slate-100 bg-slate-50/50 px-6 py-3 animate-in slide-in-from-top-2 duration-200">
                            <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
                                {showFutureOpportunities ? (
                                    opportunities.map(opp => (
                                        <MyDayOpportunityCard key={opp.id} opportunity={opp} showOwner={showOwner} />
                                    ))
                                ) : (
                                    <>
                                        {expandedBucket?.tasks.map(task => (
                                            <MyDayTaskCard
                                                key={task.id}
                                                task={task}
                                                isOverdue={expandedSection === 'overdue'}
                                                showOwner={showOwner}
                                                onComplete={completeTask}
                                                isCompleting={isCompleting}
                                            />
                                        ))}
                                        {expandedOpps.map(opp => (
                                            <MyDayOpportunityCard key={opp.id} opportunity={opp} showOwner={showOwner} />
                                        ))}
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

// --- Pill component ---

interface PillProps {
    label: string
    count: number
    variant: 'overdue' | 'today' | 'future' | 'opportunity'
    isActive: boolean
    onClick: () => void
    icon?: React.ReactNode
}

const PILL_STYLES = {
    overdue: {
        base: 'border-red-200 text-red-700',
        active: 'bg-red-100 border-red-300 shadow-sm',
        badge: 'bg-red-100 text-red-700',
        empty: 'opacity-40',
    },
    today: {
        base: 'border-blue-200 text-blue-700',
        active: 'bg-blue-100 border-blue-300 shadow-sm',
        badge: 'bg-blue-100 text-blue-700',
        empty: 'opacity-40',
    },
    future: {
        base: 'border-slate-200 text-slate-600',
        active: 'bg-slate-100 border-slate-300 shadow-sm',
        badge: 'bg-slate-100 text-slate-600',
        empty: 'opacity-40',
    },
    opportunity: {
        base: 'border-amber-200 text-amber-700',
        active: 'bg-amber-100 border-amber-300 shadow-sm',
        badge: 'bg-amber-100 text-amber-700',
        empty: 'opacity-40',
    },
}

function Pill({ label, count, variant, isActive, onClick, icon }: PillProps) {
    const styles = PILL_STYLES[variant]
    const isEmpty = count === 0

    return (
        <button
            onClick={onClick}
            disabled={isEmpty}
            className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border transition-all whitespace-nowrap flex-shrink-0",
                styles.base,
                isActive && styles.active,
                isEmpty && styles.empty,
                !isEmpty && !isActive && "bg-white hover:shadow-sm",
            )}
        >
            {icon}
            <span>{label}</span>
            {count > 0 && (
                <span className={cn(
                    "text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full",
                    styles.badge,
                )}>
                    {count}
                </span>
            )}
            {isActive && <ChevronDown className="h-3 w-3 ml-0.5" />}
        </button>
    )
}
