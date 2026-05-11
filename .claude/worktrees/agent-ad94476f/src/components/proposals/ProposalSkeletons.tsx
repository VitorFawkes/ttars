import { Skeleton } from '@/components/ui/Skeleton'

// Skeleton for proposal cards in grid
export function ProposalCardSkeleton() {
    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
            <div className="flex items-start justify-between">
                <div className="space-y-2 flex-1">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                </div>
                <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <div className="flex items-center gap-4">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-24" />
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-5 w-24" />
            </div>
        </div>
    )
}

// Skeleton for the grid
export function ProposalGridSkeleton({ count = 6 }: { count?: number }) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: count }).map((_, i) => (
                <ProposalCardSkeleton key={i} />
            ))}
        </div>
    )
}

// Skeleton for analytics widget
export function AnalyticsWidgetSkeleton() {
    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <div className="space-y-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-16" />
                </div>
            </div>
            <div className="grid grid-cols-4 divide-x divide-slate-100 border-b border-slate-100">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="p-4 flex flex-col items-center gap-1">
                        <Skeleton className="h-8 w-12" />
                        <Skeleton className="h-3 w-10" />
                    </div>
                ))}
            </div>
            <div className="divide-y divide-slate-50">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-5 py-3">
                        <Skeleton className="h-4 w-4 rounded-full" />
                        <div className="flex-1 space-y-1">
                            <Skeleton className="h-4 w-3/4" />
                            <Skeleton className="h-3 w-1/2" />
                        </div>
                        <div className="text-right space-y-1">
                            <Skeleton className="h-4 w-16" />
                            <Skeleton className="h-3 w-8" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

// Skeleton for section list in builder
export function SectionListSkeleton({ count = 3 }: { count?: number }) {
    return (
        <div className="space-y-4">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Skeleton className="h-5 w-5 rounded" />
                            <Skeleton className="h-5 w-32" />
                        </div>
                        <Skeleton className="h-4 w-4" />
                    </div>
                    <div className="space-y-2 pl-7">
                        <Skeleton className="h-10 w-full rounded-md" />
                        <Skeleton className="h-10 w-full rounded-md" />
                    </div>
                </div>
            ))}
        </div>
    )
}
