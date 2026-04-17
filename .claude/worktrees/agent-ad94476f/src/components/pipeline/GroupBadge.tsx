import { useQuery } from '@tanstack/react-query'
import { Link } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export function GroupBadge({ card }: { card: any }) {
    // If we already have the title, use it
    if (card.parent_card_title) {
        return (
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-blue-600 bg-blue-50/50 px-2 py-1 rounded border border-blue-200/50 w-fit shadow-sm">
                <Link className="h-3 w-3" />
                <span className="truncate max-w-[150px]">{card.parent_card_title}</span>
            </div>
        )
    }

    // Otherwise fetch it
    const { data: parentTitle } = useQuery({
        queryKey: ['parent-card-title', card.parent_card_id],
        queryFn: async () => {
            if (!card.parent_card_id) return null
            const { data, error } = await supabase
                .from('cards')
                .select('titulo')
                .eq('id', card.parent_card_id)
                .single()

            if (error) return null
            return data?.titulo
        },
        enabled: !!card.parent_card_id,
        staleTime: 1000 * 60 * 30 // 30 mins
    })

    if (!parentTitle) return null

    return (
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-blue-600 bg-blue-50/50 px-2 py-1 rounded border border-blue-200/50 w-fit shadow-sm">
            <Link className="h-3 w-3" />
            <span className="truncate max-w-[150px]">{parentTitle}</span>
        </div>
    )
}
