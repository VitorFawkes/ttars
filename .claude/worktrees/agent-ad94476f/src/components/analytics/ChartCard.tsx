import { cn } from '@/lib/utils'

interface ChartCardProps {
    title: string
    description?: string
    children: React.ReactNode
    actions?: React.ReactNode
    className?: string
    isLoading?: boolean
    colSpan?: 1 | 2
}

export default function ChartCard({
    title,
    description,
    children,
    actions,
    className,
    isLoading,
    colSpan = 1,
}: ChartCardProps) {
    return (
        <div className={cn(
            'bg-white border border-slate-200 shadow-sm rounded-xl',
            colSpan === 2 && 'col-span-2',
            className
        )}>
            <div className="flex items-center justify-between px-6 pt-5 pb-2">
                <div>
                    <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
                    {description && (
                        <p className="text-xs text-slate-400 mt-0.5">{description}</p>
                    )}
                </div>
                {actions && <div className="flex items-center gap-2">{actions}</div>}
            </div>
            <div className="px-2 pb-4">
                {isLoading ? (
                    <div className="h-[280px] flex items-center justify-center">
                        <div className="w-8 h-8 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
                    </div>
                ) : (
                    children
                )}
            </div>
        </div>
    )
}
