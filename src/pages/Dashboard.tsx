import { useState } from 'react'
import StatsCards from '../components/dashboard/StatsCards'
import FunnelChart from '../components/dashboard/FunnelChart'
import RecentActivity from '../components/dashboard/RecentActivity'
import { ProposalAnalyticsWidget } from '../components/proposals/ProposalAnalyticsWidget'
import { TodayMeetingsWidget } from '../components/dashboard/TodayMeetingsWidget'
import { ErrorBoundary } from '../components/ui/ErrorBoundary'
import { QueryErrorState } from '../components/ui/QueryErrorState'
import type { Database } from '../database.types'

type Product = Database['public']['Enums']['app_product'] | 'ALL'

const sectionFallback = <QueryErrorState compact />

export default function Dashboard() {
    const [productFilter, setProductFilter] = useState<Product>('ALL')

    return (
        <div className="h-full overflow-y-auto p-8 space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
                <div className="flex items-center gap-2">
                    <label htmlFor="product-filter" className="text-sm font-medium text-gray-700">
                        Produto:
                    </label>
                    <select
                        id="product-filter"
                        value={productFilter}
                        onChange={(e) => setProductFilter(e.target.value as Product)}
                        className="rounded-md border-gray-300 py-1.5 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                    >
                        <option value="ALL">Todos</option>
                        <option value="TRIPS">Trips</option>
                        <option value="WEDDING">Wedding</option>
                        <option value="CORP">Corp</option>
                    </select>
                </div>
            </div>

            <ErrorBoundary fallback={sectionFallback}>
                <StatsCards productFilter={productFilter} />
            </ErrorBoundary>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <ErrorBoundary fallback={sectionFallback}>
                    <FunnelChart productFilter={productFilter} />
                </ErrorBoundary>
                <ErrorBoundary fallback={sectionFallback}>
                    <ProposalAnalyticsWidget />
                </ErrorBoundary>
                <ErrorBoundary fallback={sectionFallback}>
                    <TodayMeetingsWidget />
                </ErrorBoundary>
            </div>

            <div className="grid grid-cols-1 gap-6">
                <ErrorBoundary fallback={sectionFallback}>
                    <RecentActivity />
                </ErrorBoundary>
            </div>
        </div>
    )
}
