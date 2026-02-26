import type { LucideIcon } from 'lucide-react'
import { Construction } from 'lucide-react'

interface PlaceholderViewProps {
    title: string
    description: string
    icon: LucideIcon
}

export default function PlaceholderView({ title, description, icon: Icon }: PlaceholderViewProps) {
    return (
        <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <Icon className="w-8 h-8 text-slate-400" />
            </div>
            <h2 className="text-lg font-semibold text-slate-800 mb-1">{title}</h2>
            <p className="text-sm text-slate-500 max-w-md">{description}</p>
            <div className="flex items-center gap-2 mt-4 text-xs text-slate-400">
                <Construction className="w-3.5 h-3.5" />
                <span>Em construcao — Fase 2/3</span>
            </div>
        </div>
    )
}
