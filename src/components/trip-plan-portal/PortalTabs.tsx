/**
 * PortalTabs — Abas do portal do cliente.
 *
 * 3 abas:
 * - "Proposta": itens aceitos (view existente)
 * - "Minha Viagem": cronograma dia-a-dia com blocos publicados
 * - "Pendente": itens para aprovação (com badge de count)
 */


import { cn } from '@/lib/utils'
import { FileText, MapPin, Bell } from 'lucide-react'

export type PortalTab = 'proposal' | 'travel' | 'pending'

interface PortalTabsProps {
    activeTab: PortalTab
    onTabChange: (tab: PortalTab) => void
    pendingCount: number
    hasTravelGuide: boolean
}

export function PortalTabs({ activeTab, onTabChange, pendingCount, hasTravelGuide }: PortalTabsProps) {
    const tabs: Array<{
        key: PortalTab
        label: string
        icon: React.ElementType
        badge?: number
        hidden?: boolean
    }> = [
        { key: 'proposal', label: 'Proposta', icon: FileText },
        { key: 'travel', label: 'Minha Viagem', icon: MapPin, hidden: !hasTravelGuide },
        { key: 'pending', label: 'Pendente', icon: Bell, badge: pendingCount, hidden: pendingCount === 0 },
    ]

    return (
        <div className="flex bg-white border-b border-slate-200 sticky top-0 z-20">
            {tabs.filter(t => !t.hidden).map(tab => {
                const Icon = tab.icon
                const isActive = activeTab === tab.key
                return (
                    <button
                        key={tab.key}
                        onClick={() => onTabChange(tab.key)}
                        className={cn(
                            'flex-1 flex items-center justify-center gap-2 py-3 px-4 text-sm font-medium transition-colors relative',
                            isActive
                                ? 'text-indigo-600 border-b-2 border-indigo-600'
                                : 'text-slate-500 hover:text-slate-700'
                        )}
                    >
                        <Icon className="h-4 w-4" />
                        <span>{tab.label}</span>
                        {tab.badge && tab.badge > 0 && (
                            <span className="absolute top-2 right-4 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                                {tab.badge}
                            </span>
                        )}
                    </button>
                )
            })}
        </div>
    )
}
