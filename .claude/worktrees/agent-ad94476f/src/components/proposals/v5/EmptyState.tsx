import { Building2, Plane, Bus, Star, Type, FileText, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { ProposalSectionType, ProposalItemType } from '@/types/proposals'

interface QuickAction {
    label: string
    icon: React.ElementType
    sectionType: ProposalSectionType
    itemType?: ProposalItemType
    blockType: string
    color: string
}

const QUICK_ACTIONS: QuickAction[] = [
    { label: 'Hospedagem', icon: Building2, sectionType: 'hotels', itemType: 'hotel', blockType: 'hotel', color: 'text-blue-600 bg-blue-50 hover:bg-blue-100' },
    { label: 'Voo', icon: Plane, sectionType: 'flights', itemType: 'flight', blockType: 'flight', color: 'text-sky-600 bg-sky-50 hover:bg-sky-100' },
    { label: 'Transfer', icon: Bus, sectionType: 'transfers', itemType: 'transfer', blockType: 'transfer', color: 'text-teal-600 bg-teal-50 hover:bg-teal-100' },
    { label: 'Experiencia', icon: Star, sectionType: 'custom', itemType: 'experience', blockType: 'experience', color: 'text-orange-600 bg-orange-50 hover:bg-orange-100' },
    { label: 'Titulo', icon: Type, sectionType: 'custom', blockType: 'title', color: 'text-slate-600 bg-slate-100 hover:bg-slate-200' },
    { label: 'Texto', icon: FileText, sectionType: 'custom', blockType: 'text', color: 'text-slate-600 bg-slate-100 hover:bg-slate-200' },
]

interface EmptyStateProps {
    onAddSection: (sectionType: ProposalSectionType, label: string, blockType: string) => void
}

export function EmptyState({ onAddSection }: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center py-24 px-8">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-6">
                <Sparkles className="h-8 w-8 text-indigo-500" />
            </div>

            <h2 className="text-xl font-semibold text-slate-900 tracking-tight mb-2">
                Comece a montar sua proposta
            </h2>
            <p className="text-sm text-slate-500 mb-8 max-w-md text-center">
                Adicione seções para criar uma proposta profissional. Use os botões abaixo ou a sidebar para começar.
            </p>

            <div className="grid grid-cols-3 gap-3 max-w-lg">
                {QUICK_ACTIONS.map((action) => {
                    const Icon = action.icon
                    return (
                        <Button
                            key={action.label}
                            variant="ghost"
                            onClick={() => onAddSection(action.sectionType, action.label, action.blockType)}
                            className={`flex flex-col items-center gap-2 h-auto py-4 px-3 rounded-xl border border-slate-200 ${action.color} transition-all`}
                        >
                            <Icon className="h-5 w-5" />
                            <span className="text-xs font-medium">{action.label}</span>
                        </Button>
                    )
                })}
            </div>

            <p className="text-xs text-slate-400 mt-6">
                Dica: Use <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-mono">⌘/</kbd> para buscar ações rapidamente
            </p>
        </div>
    )
}
