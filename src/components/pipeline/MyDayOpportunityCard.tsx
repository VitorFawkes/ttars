import { TrendingUp, Calendar } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { MyDayOpportunity } from '../../hooks/useMyDayOpportunities'

interface MyDayOpportunityCardProps {
    opportunity: MyDayOpportunity
}

export function MyDayOpportunityCard({ opportunity }: MyDayOpportunityCardProps) {
    const isUpsell = opportunity.source_type === 'won_upsell'
    const typeLabel = isUpsell ? 'Sub-card' : 'Novo card'

    const parts = opportunity.scheduled_date.split('-')
    const dateStr = `${parts[2]}/${parts[1]}`

    const daysText = opportunity.days_until === 0
        ? 'Hoje'
        : opportunity.days_until === 1
            ? 'Amanhã'
            : `${opportunity.days_until} dias`

    const cardUrl = `/cards/${opportunity.source_card_id}`

    return (
        <a
            href={cardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
                "flex-shrink-0 w-[220px] bg-white border rounded-lg p-3 flex flex-col gap-2 transition-all hover:shadow-md cursor-pointer no-underline",
                "border-amber-200 bg-amber-50/30"
            )}
        >
            {/* Type badge */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
                    <TrendingUp className="h-3.5 w-3.5" />
                    <span>{typeLabel}</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-amber-500">
                    <Calendar className="h-3 w-3" />
                    <span>{dateStr}</span>
                </div>
            </div>

            {/* Title */}
            <p className="text-sm font-medium text-slate-900 line-clamp-2 leading-tight">
                {opportunity.titulo}
            </p>

            {/* Source card */}
            <p className="text-xs text-slate-500 truncate">
                Origem: {opportunity.source_card_titulo}
            </p>

            {/* Countdown */}
            <div className="flex items-center mt-auto pt-1 border-t border-amber-100">
                <span className={cn(
                    "text-xs font-medium px-2 py-0.5 rounded-full",
                    opportunity.days_until <= 3
                        ? "bg-amber-100 text-amber-700"
                        : "bg-slate-100 text-slate-600"
                )}>
                    {daysText}
                </span>
            </div>
        </a>
    )
}
