import StatsCards from '../components/dashboard/StatsCards'
import FunnelChart from '../components/dashboard/FunnelChart'
import RecentActivity from '../components/dashboard/RecentActivity'
import { ProposalAnalyticsWidget } from '../components/proposals/ProposalAnalyticsWidget'
import { TodayMeetingsWidget } from '../components/dashboard/TodayMeetingsWidget'
import { AssistantStatsWidget } from '../components/dashboard/AssistantStatsWidget'
import { ErrorBoundary } from '../components/ui/ErrorBoundary'
import { QueryErrorState } from '../components/ui/QueryErrorState'
import { useProductContext } from '../hooks/useProductContext'

const sectionFallback = <QueryErrorState compact />

export default function Dashboard() {
    const { currentProduct: productFilter } = useProductContext()

    return (
        <div className="h-full overflow-y-auto p-8 space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            </div>

            <ErrorBoundary fallback={sectionFallback}>
                <StatsCards productFilter={productFilter} />
            </ErrorBoundary>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <ErrorBoundary fallback={sectionFallback}>
                    <FunnelChart productFilter={productFilter} />
                </ErrorBoundary>
                <ErrorBoundary fallback={sectionFallback}>
                    <ProposalAnalyticsWidget productFilter={productFilter} />
                </ErrorBoundary>
                <div className="space-y-6">
                    <ErrorBoundary fallback={sectionFallback}>
                        <TodayMeetingsWidget productFilter={productFilter} />
                    </ErrorBoundary>
                    <ErrorBoundary fallback={sectionFallback}>
                        <AssistantStatsWidget productFilter={productFilter} />
                    </ErrorBoundary>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
                <ErrorBoundary fallback={sectionFallback}>
                    <RecentActivity productFilter={productFilter} />
                </ErrorBoundary>
            </div>
        </div>
    )
}
