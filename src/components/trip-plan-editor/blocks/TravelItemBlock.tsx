/**
 * TravelItemBlock — Item da viagem extraído da proposta aceita.
 * Read-only: mostra os dados do proposal_item vinculado.
 */

import { Building2, Plane, Car, Sparkles, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
    hotel: { icon: Building2, color: 'text-emerald-600' },
    flight: { icon: Plane, color: 'text-sky-600' },
    transfer: { icon: Car, color: 'text-teal-600' },
    experience: { icon: Sparkles, color: 'text-orange-600' },
    insurance: { icon: Shield, color: 'text-rose-600' },
}

interface TravelItemBlockProps {
    data: Record<string, unknown>
    onChange: (data: Record<string, unknown>) => void
}

export function TravelItemBlock({ data }: TravelItemBlockProps) {
    const itemType = String(data.item_type || 'custom')
    const title = String(data.title || 'Item da viagem')
    const description = String(data.description || '')
    const imageUrl = String(data.image_url || '')

    const config = TYPE_CONFIG[itemType] || { icon: Sparkles, color: 'text-slate-500' }
    const Icon = config.icon

    return (
        <div className="flex items-start gap-3">
            {imageUrl && (
                <img
                    src={imageUrl}
                    alt={title}
                    className="w-16 h-16 rounded-lg object-cover shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
            )}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                    <Icon className={cn('h-3.5 w-3.5 shrink-0', config.color)} />
                    <span className="text-xs font-semibold text-slate-900 truncate">{title}</span>
                </div>
                {description && (
                    <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{description}</p>
                )}
                <p className="text-[10px] text-slate-400 mt-1">
                    Importado da proposta aceita
                </p>
            </div>
        </div>
    )
}
